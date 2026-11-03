import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { transaction } from '../platform/database.ts';
import { chunks,cosine,validateVectors,type EmbeddingProvider } from './retrieval.ts';
import type { Source } from './contracts.ts';

type RecordSource={id:string;kind:string;title:string;body:string;project_id:string|null};
type Indexed={entity_id:string;content_hash:string;position:number;content:string;embedding:number[]};
function fingerprint(source:RecordSource){return createHash('sha256').update(JSON.stringify([source.kind,source.title,source.body])).digest('hex');}
async function corpus(pool:Pool,owner:string,projectId:string|null):Promise<RecordSource[]>{
  return (await pool.query<RecordSource>(`WITH corpus AS (
    SELECT id,kind,title,content AS body,project_id FROM public.knowledge_items WHERE owner_id=$1 AND deleted_at IS NULL
    UNION ALL SELECT id,'task',instruction,description,project_id FROM public.tasks WHERE owner_id=$1 AND deleted_at IS NULL
    UNION ALL SELECT id,'project',title,description,id FROM public.projects WHERE owner_id=$1 AND status<>'archived'
    UNION ALL SELECT id,'goal',title,reason,NULL::uuid FROM public.goals WHERE owner_id=$1
  ) SELECT id,kind,title,COALESCE(body,'') AS body,project_id FROM corpus WHERE ($2::uuid IS NULL OR project_id=$2) ORDER BY id`,[owner,projectId])).rows;
}

export async function semanticSearch(pool:Pool,owner:string,query:string,projectId:string|null,provider:EmbeddingProvider):Promise<Source[]>{
  const sources=await corpus(pool,owner,projectId);
  if(!sources.length)return [];
  const existing=(await pool.query<Indexed>('SELECT entity_id,content_hash,position,content,embedding FROM public.search_embeddings WHERE owner_id=$1 AND embedding_model=$2',[owner,provider.model])).rows;
  for(const source of sources){
    const hash=fingerprint(source),pieces=chunks(`${source.title}\n${source.body}`);
    const cached=existing.filter(row=>row.entity_id===source.id&&row.content_hash===hash);
    if(cached.length===pieces.length&&cached.every((row,index)=>cached.some(item=>item.position===index)))continue;
    const vectors:number[][]=[];
    for(let offset=0;offset<pieces.length;offset+=16){
      const batch=pieces.slice(offset,offset+16);
      vectors.push(...validateVectors(await provider.embed(batch,'document'),batch.length));
    }
    validateVectors(vectors,pieces.length);
    await transaction(pool,async client=>{
      const entity=await client.query('SELECT id FROM public.entity_nodes WHERE id=$1 AND owner_id=$2 FOR UPDATE',[source.id,owner]);
      if(!entity.rowCount)return;
      await client.query('DELETE FROM public.search_embeddings WHERE owner_id=$1 AND entity_id=$2 AND embedding_model=$3',[owner,source.id,provider.model]);
      for(let i=0;i<pieces.length;i++)await client.query(`INSERT INTO public.search_embeddings(owner_id,entity_id,embedding_model,content_hash,position,content,embedding) VALUES($1,$2,$3,$4,$5,$6,$7)`,[owner,source.id,provider.model,hash,i,pieces[i],vectors[i]]);
    });
  }
  const [vector]=validateVectors(await provider.embed([query],'query'),1);
  // Re-read the authorized corpus: edits, deletes and project moves during indexing
  // must never return stale source text or content outside the requested project.
  const current=new Map((await corpus(pool,owner,projectId)).map(source=>[source.id,source]));
  const indexed=(await pool.query<Indexed>('SELECT entity_id,content_hash,position,content,embedding FROM public.search_embeddings WHERE owner_id=$1 AND embedding_model=$2',[owner,provider.model])).rows;
  const best=new Map<string,Source>();
  for(const row of indexed){
    const source=current.get(row.entity_id);
    if(!source||fingerprint(source)!==row.content_hash)continue;
    const score=cosine(vector!,row.embedding);
    if(score<0.35||score<=(best.get(source.id)?.score??-1))continue;
    best.set(source.id,{id:source.id,kind:source.kind,title:source.title,excerpt:row.content,score,reason:'Related meaning in your saved content'});
  }
  return [...best.values()].sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)||a.id.localeCompare(b.id)).slice(0,12);
}
