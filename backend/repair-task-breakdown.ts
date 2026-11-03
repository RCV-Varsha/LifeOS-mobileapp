import { pool } from './src/db.ts';
import { writeFile } from 'node:fs/promises';
const parentId=process.argv[2],proposalIds=process.argv.slice(3);
if(!parentId||!proposalIds.length)throw new Error('Provide parent ID and reviewed proposal IDs.');
const client=await pool.connect();
try{
  await client.query('BEGIN');
  const parent=(await client.query('SELECT * FROM public.tasks WHERE id=$1 AND deleted_at IS NULL AND parent_task_id IS NULL FOR UPDATE',[parentId])).rows[0];
  if(!parent)throw new Error('Parent unavailable');
  const ids:string[]=[];
  for(const proposalId of proposalIds){
    const proposal=(await client.query(`SELECT a.result,i.response FROM public.ai_actions a JOIN public.ai_interactions i ON i.id=a.interaction_id AND i.owner_id=a.owner_id WHERE a.id=$1 AND a.owner_id=$2 AND a.status='applied' FOR UPDATE OF a`,[proposalId,parent.owner_id])).rows[0];
    if(!proposal?.response.sourceIds.includes(parentId))throw new Error('Proposal does not cite the reviewed parent.');
    for(const entry of proposal.result.applied){if(entry.kind!=='create_task')throw new Error('Unexpected action');ids.push(entry.record.id);}
  }
  const before=(await client.query('SELECT * FROM public.tasks WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL FOR UPDATE',[parent.owner_id,ids])).rows;
  if(before.length!==new Set(ids).size||before.some(task=>task.parent_task_id&&task.parent_task_id!==parentId))throw new Error('Task set changed');
  await writeFile(new URL('../app/build/subtask-link-backup.json',import.meta.url),JSON.stringify({parentId,proposalIds,before},null,2));
  await client.query(`UPDATE public.tasks SET parent_task_id=$3,revision=revision+1,updated_at=now() WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND parent_task_id IS NULL`,[parent.owner_id,ids,parentId]);
  await client.query('COMMIT');
  console.log(JSON.stringify({linked:before.length,completed:before.filter(task=>task.status==='completed').length}));
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
