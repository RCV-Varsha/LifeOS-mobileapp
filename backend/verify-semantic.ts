import { pool } from './src/db.ts';
import { RetrievalService } from './src/workspace/retrieval.ts';
const owner=process.argv[2];
if(!owner)throw new Error('Provide the authorized workspace owner ID.');
try{
  const service=new RetrievalService(pool);
  for(const query of ['well paid employment after university','prepare for recruitment assessments']){
    const started=Date.now();const results=await service.search(owner,query,'semantic');
    console.log(JSON.stringify({query,elapsedMs:Date.now()-started,results:results.slice(0,3).map(item=>({title:item.title,kind:item.kind,score:Number(item.score.toFixed(3))}))}));
  }
}finally{await pool.end();}
