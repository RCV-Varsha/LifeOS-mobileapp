import type { Pool } from 'pg';
import { ApiError, object, text } from '../platform/validation.ts';
import { transaction } from '../platform/database.ts';
import type { Source } from './contracts.ts';
import { semanticSearch } from './semanticSearch.ts';

export interface EmbeddingProvider {model:string;embed(texts:string[],purpose?:'query'|'document'):Promise<number[][]>}
export function validateVectors(value:unknown,count:number):number[][] {
  if(!Array.isArray(value)||value.length!==count)throw new ApiError(502,'invalid_embedding','Embedding provider returned the wrong number of vectors.');
  const result=value.map(v=>{
    if(!Array.isArray(v)||v.length<1||v.length>4096||!v.every(n=>typeof n==='number'&&Number.isFinite(n))||v.every(n=>n===0))throw new ApiError(502,'invalid_embedding','Embedding provider returned an invalid vector.');
    return v as number[];
  });
  if(result.some(v=>v.length!==result[0]!.length))throw new ApiError(502,'invalid_embedding','Embedding dimensions do not match.');
  return result;
}
export function embeddingProvider():EmbeddingProvider {
  const url=process.env.EMBEDDING_API_URL,key=process.env.EMBEDDING_API_KEY,model=process.env.EMBEDDING_MODEL;
  if(!url&&!key&&!model&&process.env.GEMINI_API_KEY){
    const geminiKey=process.env.GEMINI_API_KEY;
    const modelName='gemini-embedding-001';
    return {model:`google:${modelName}:768:retrieval`,async embed(input,purpose='document'){
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:batchEmbedContents`,{
        method:'POST',headers:{'x-goog-api-key':geminiKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),
        body:JSON.stringify({requests:input.map(content=>({model:`models/${modelName}`,content:{parts:[{text:content}]},taskType:purpose==='query'?'RETRIEVAL_QUERY':'RETRIEVAL_DOCUMENT',outputDimensionality:768}))}),
      });
      if(!response.ok)throw new ApiError(response.status===429?429:502,'embedding_failure',response.status===429?'Semantic search is temporarily rate limited. Try again shortly.':`Semantic search provider returned HTTP ${response.status}.`);
      const body=object(await response.json());
      if(!Array.isArray(body.embeddings))throw new ApiError(502,'invalid_embedding','Missing embedding results.');
      return validateVectors(body.embeddings.map(item=>object(item).values),input.length);
    }};
  }
  if(!url||!key||!model)throw new ApiError(503,'embeddings_unavailable','Configure an embedding provider to use semantic search. Keyword search remains available.');
  return {model,async embed(input){
    const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({model,input})});
    if(!response.ok)throw new ApiError(502,'embedding_failure',`Embedding provider returned HTTP ${response.status}.`);
    const body=object(await response.json());
    if(!Array.isArray(body.data))throw new ApiError(502,'invalid_embedding','Missing embedding results.');
    const ordered=body.data.map(object).sort((a,b)=>Number(a.index)-Number(b.index));
    if(ordered.some((x,i)=>x.index!==i))throw new ApiError(502,'invalid_embedding','Embedding indexes are invalid.');
    return validateVectors(ordered.map(x=>x.embedding),input.length);
  }};
}
export function chunks(content:string,size=1600,overlap=200):string[] {
  if(size<1||overlap<0||overlap>=size)throw new Error('Invalid chunk settings.');
  const result=[];for(let i=0;i<content.length;i+=size-overlap){result.push(content.slice(i,i+size));if(i+size>=content.length)break;}
  return result;
}
export function cosine(a:number[],b:number[]) {
  if(a.length!==b.length||!a.length)return -1;
  let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]!*b[i]!;aa+=a[i]!**2;bb+=b[i]!**2;}
  return aa&&bb?dot/Math.sqrt(aa*bb):-1;
}
export class RetrievalService {
  pool:Pool;
  constructor(pool:Pool){this.pool=pool;}
  async index(owner:string,knowledgeId:string,provider=embeddingProvider()) {
    const record=(await this.pool.query('SELECT * FROM public.knowledge_items WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[knowledgeId,owner])).rows[0];
    if(!record)throw new ApiError(404,'not_found','Knowledge item not found.');
    const pieces=chunks(`${record.title}\n${record.content}`);
    const vectors:number[][]=[];
    for(let offset=0;offset<pieces.length;offset+=16)vectors.push(...await provider.embed(pieces.slice(offset,offset+16)));
    validateVectors(vectors,pieces.length);
    return transaction(this.pool,async client=>{
      const locked=await client.query('SELECT revision FROM public.knowledge_items WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE',[knowledgeId,owner]);
      if(locked.rows[0]?.revision!==record.revision)throw new ApiError(409,'conflict','The source changed during indexing. Retry with the current version.');
      await client.query('DELETE FROM public.knowledge_chunks WHERE knowledge_id=$1 AND owner_id=$2',[knowledgeId,owner]);
      for(let i=0;i<pieces.length;i++)await client.query(`INSERT INTO public.knowledge_chunks(owner_id,knowledge_id,revision,position,content,embedding,embedding_model) VALUES($1,$2,$3,$4,$5,$6,$7)`,[owner,knowledgeId,record.revision,i,pieces[i],vectors[i],provider.model]);
      return {knowledgeId,chunks:pieces.length,revision:record.revision,model:provider.model};
    });
  }
  async search(owner:string,query:string,mode:'keyword'|'semantic'='keyword',projectId:string|null=null,providerOverride?:EmbeddingProvider):Promise<Source[]> {
    const q=text(query,'Search',500);
    if(mode==='semantic') {
      return semanticSearch(this.pool,owner,q,projectId,providerOverride??embeddingProvider());
    }
    const rows=(await this.pool.query(`WITH corpus AS (
      SELECT id,kind,title,content AS body,project_id FROM public.knowledge_items WHERE owner_id=$1 AND deleted_at IS NULL
      UNION ALL SELECT id,'task',instruction,description,project_id FROM public.tasks WHERE owner_id=$1 AND deleted_at IS NULL
      UNION ALL SELECT id,'project',title,description,id FROM public.projects WHERE owner_id=$1 AND status<>'archived'
      UNION ALL SELECT id,'goal',title,reason,NULL::uuid FROM public.goals WHERE owner_id=$1
    ) SELECT id,kind,title,left(body,1600) AS excerpt,
      ts_rank_cd(to_tsvector('english',title||' '||body),websearch_to_tsquery('english',$2)) AS score
      FROM corpus WHERE ($3::uuid IS NULL OR project_id=$3) AND
      (to_tsvector('english',title||' '||body)@@websearch_to_tsquery('english',$2) OR title ILIKE '%'||$2||'%')
      ORDER BY score DESC,title,id LIMIT 12`,[owner,q,projectId])).rows;
    return rows.map(row=>({...row,score:Number(row.score),reason:'Keyword match in title or recorded content'}));
  }
}
