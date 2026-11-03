import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pool} from './src/db.ts';
import {transaction} from './src/platform/database.ts';
import {WorkspaceRepository} from './src/workspace/repository.ts';
const [snapshot,backupPath,owner,operationId]=process.argv.slice(2);
if(!snapshot||!backupPath||!owner||!operationId)throw new Error('Provide local snapshot, pre-link backup, owner, and operation ID.');
const db=new DatabaseSync(snapshot,{readOnly:true});
const row=db.prepare('SELECT value FROM catalystLocalStorage WHERE key=?').get(`lifeos.workspace.${owner}`) as {value:string}|undefined;
db.close();
const write=JSON.parse(row?.value??'{}').queue?.find((item:any)=>item.operationId===operationId);
if(write?.kind!=='update_task'||write.state!=='conflict')throw new Error('Expected saved task edit conflict.');
const backup=JSON.parse(await readFile(backupPath,'utf8'));
const baseline=backup.before.find((item:any)=>item.id===write.entityId&&item.owner_id===owner);
if(!baseline||baseline.revision!==write.payload.revision)throw new Error('No matching baseline for saved edit.');
const hash=createHash('sha256').update(JSON.stringify({kind:write.kind,entityId:write.entityId,payload:write.payload})).digest('hex');
try{
  const item=await transaction(pool,async client=>{
    await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
    const receipt=(await client.query('SELECT * FROM public.sync_operations WHERE owner_id=$1 AND operation_id=$2',[owner,operationId])).rows[0];
    if(receipt){if(receipt.request_hash!==hash)throw new Error('Receipt mismatch.');return receipt.result.item;}
    const current=(await client.query('SELECT * FROM public.tasks WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE',[write.entityId,owner])).rows[0];
    const fields=['instruction','description','project_id','planned_minutes','deadline','priority','category','status','actual_minutes'];
    const normalized=(value:any)=>value instanceof Date?value.toISOString():value;
    if(!current||current.revision!==baseline.revision+1||current.parent_task_id!==backup.parentId||fields.some(key=>normalized(current[key])!==baseline[key]))throw new Error('Task has additional edits; automatic repair stopped.');
    const saved=await new WorkspaceRepository(pool).saveTask(owner,{...write.payload,revision:current.revision},current.id,client);
    await client.query('INSERT INTO public.sync_operations(owner_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4)',[owner,operationId,hash,JSON.stringify({item:saved})]);
    return saved;
  },'recover_reviewed_offline_edit');
  console.log(JSON.stringify({id:item.id,status:item.status,deadline:item.deadline,revision:item.revision}));
}finally{await pool.end();}
