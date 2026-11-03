import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { transaction } from '../platform/database.ts';
import { ApiError, choice, id, integer, keys, object, text } from '../platform/validation.ts';

export class EvidenceMemoryRepository {
  pool:Pool;
  constructor(pool:Pool){this.pool=pool;}
  async list(owner:string){return (await this.pool.query(`SELECT m.id,m.category,v.text_value AS content,v.source_knowledge_id AS "sourceId",k.title AS "sourceTitle",v.confidence,v.revision,v.status,v.created_at,v.last_used_at
    FROM public.user_memories m JOIN public.user_memory_versions v ON v.memory_id=m.id AND v.user_id=m.user_id
    JOIN public.knowledge_items k ON k.id=v.source_knowledge_id AND k.owner_id=m.user_id
    WHERE m.user_id=$1 AND m.category<>'CONSTRAINT' AND v.status IN ('ACTIVE','ARCHIVED') AND k.deleted_at IS NULL ORDER BY v.created_at DESC LIMIT 100`,[owner])).rows;}
  async save(owner:string,value:unknown,memoryId?:string){
    const b=object(value);keys(b,['content','sourceId','category','confirmed','revision']);
    if(b.confirmed!==true)throw new ApiError(400,'confirmation_required','Confirm this source-backed memory before saving.');
    const content=text(b.content,'Memory',4000),sourceId=id(b.sourceId),category=choice(b.category,['PREFERENCE','FACT','DECISION','PATTERN','CONTEXT'],'memory category');
    return transaction(this.pool,async client=>{
      const source=(await client.query('SELECT id FROM public.knowledge_items WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR SHARE',[sourceId,owner])).rows[0];
      if(!source)throw new ApiError(404,'not_found','Memory source not found.');
      let revision=1;const entityId=memoryId??randomUUID();
      if(memoryId){
        const prior=(await client.query(`SELECT v.id,v.revision,m.category FROM public.user_memory_versions v JOIN public.user_memories m ON m.id=v.memory_id AND m.user_id=v.user_id WHERE m.id=$1 AND m.user_id=$2 AND m.category<>'CONSTRAINT' AND v.status='ACTIVE' FOR UPDATE OF m,v`,[memoryId,owner])).rows[0];
        if(!prior||prior.revision!==integer(b.revision,'Revision',1,2147483647))throw new ApiError(409,'conflict','Memory changed. Reload before correcting.');
        if(prior.category!==category)throw new ApiError(400,'invalid_input','Preserve the memory category when correcting.');
        revision=prior.revision+1;await client.query("UPDATE public.user_memory_versions SET status='SUPERSEDED',updated_at=now() WHERE id=$1",[prior.id]);
      } else await client.query('INSERT INTO public.user_memories(id,user_id,key,category) VALUES($1,$2,$3,$4)',[entityId,owner,`evidence.${entityId}`,category]);
      const record=(await client.query(`INSERT INTO public.user_memory_versions(memory_id,user_id,text_value,source_knowledge_id,source,confidence,status,revision) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',$7) RETURNING *`,[entityId,owner,content,sourceId,memoryId?'USER_CORRECTION':'USER_EXPLICIT',memoryId?'CORRECTED':'CONFIRMED',revision])).rows[0];
      await client.query(`INSERT INTO public.audit_logs(owner_id,entity_id,entity_type,operation,actor,after_value) VALUES($1,$2,'memory',$3,'user',$4)`,[owner,entityId,memoryId?'CORRECT':'CREATE',JSON.stringify(record)]);
      return {id:entityId,revision};
    });
  }
  async archive(owner:string,memoryId:string,revision:number){return transaction(this.pool,async client=>{
    const result=await client.query(`UPDATE public.user_memory_versions v SET status='ARCHIVED',updated_at=now() FROM public.user_memories m WHERE v.memory_id=m.id AND v.user_id=m.user_id AND m.id=$1 AND m.user_id=$2 AND m.category<>'CONSTRAINT' AND v.status='ACTIVE' AND v.revision=$3 RETURNING v.id`,[memoryId,owner,revision]);
    if(!result.rowCount)throw new ApiError(409,'conflict','Memory changed or is unavailable.');
    await client.query("INSERT INTO public.audit_logs(owner_id,entity_id,entity_type,operation,actor) VALUES($1,$2,'memory','ARCHIVE','user')",[owner,memoryId]);
  });}
}
