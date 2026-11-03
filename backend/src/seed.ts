import { randomUUID } from 'node:crypto';
import { pool } from './db.ts';
import { transaction } from './platform/database.ts';
import { id } from './platform/validation.ts';

const owner=id(process.env.SEED_USER_ID);
try {
  const counts=await transaction(pool,async client=>{
    const user=await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
    if(!user.rowCount)throw new Error('Create an account before seeding it.');
    const prior=await client.query("SELECT id FROM public.projects WHERE owner_id=$1 AND description LIKE '[Synthetic demo]%'",[owner]);
    if(prior.rowCount)throw new Error('This account already contains the synthetic demo.');
    const goalIds:string[]=[],projectIds:string[]=[],taskIds:string[]=[],knowledgeIds:string[]=[];
    for(const [goalTitle,projectTitle] of [['Launch V1','Backend Rewrite'],['Build a sustainable learning practice','Knowledge Library']]){
      const goalId=randomUUID(),objectiveId=randomUUID(),projectId=randomUUID(),outcomeId=randomUUID(),milestoneId=randomUUID();goalIds.push(goalId);projectIds.push(projectId);
      await client.query('INSERT INTO public.goals(id,owner_id,title,reason,minutes_per_day) VALUES($1,$2,$3,$4,60)',[goalId,owner,goalTitle,'[Synthetic demo] Demonstrate connected planning.']);
      await client.query('INSERT INTO public.objectives(id,owner_id,goal_id,title) VALUES($1,$2,$3,$4)',[objectiveId,owner,goalId,'Deliver a reviewable first release']);
      await client.query(`INSERT INTO public.projects(id,owner_id,goal_id,objective_id,title,description,deadline) VALUES($1,$2,$3,$4,$5,'[Synthetic demo] Connected project with evidence, dependencies and historical durations.',now()+interval '7 days')`,[projectId,owner,goalId,objectiveId,projectTitle]);
      await client.query("INSERT INTO public.goal_outcomes(id,goal_id,owner_id,title,outcome_type) VALUES($1,$2,$3,'Demonstrate the complete flow','qualitative')",[outcomeId,goalId,owner]);
      await client.query("INSERT INTO public.goal_milestones(id,goal_id,outcome_id,owner_id,project_id,title,sequence) VALUES($1,$2,$3,$4,$5,'Ready for review',1)",[milestoneId,goalId,outcomeId,owner,projectId]);
      for(const [index,title] of ['Implement authentication','Document session rotation','Prepare the demo','Review previous implementation'].entries()){
        const taskId=randomUUID();taskIds.push(taskId);const complete=index===3;
        await client.query(`INSERT INTO public.tasks(id,owner_id,project_id,milestone_id,instruction,description,planned_minutes,actual_minutes,status,completed_at,priority,category,deadline)
          VALUES($1,$2,$3,$4,$5,'[Synthetic demo] Record actual duration when completing.',30,$6,$7,CASE WHEN $7='completed' THEN now()-interval '2 days' ELSE NULL END,$8,'backend',now()+interval '3 days')`,[taskId,owner,projectId,milestoneId,title,complete?45:null,complete?'completed':'pending',3-index]);
      }
      const offset=taskIds.length-4;await client.query('INSERT INTO public.task_dependencies(owner_id,task_id,depends_on_id) VALUES($1,$2,$3)',[owner,taskIds[offset+1],taskIds[offset]]);
      for(const [kind,title,content] of [['note','Authentication implementation notes','Short-lived sessions are stored as hashes. Rotating refresh credentials invalidate old access immediately.'],['concept','Ownership boundary','Each record is scoped to its authenticated owner. Composite foreign keys prevent cross-user references.'],['decision','Why use opaque authentication sessions?','We chose opaque sessions because immediate revocation and explicit ownership are required. This is synthetic demonstration evidence.']]){
        const knowledgeId=randomUUID();knowledgeIds.push(knowledgeId);
        await client.query('INSERT INTO public.knowledge_items(id,owner_id,project_id,kind,title,content) VALUES($1,$2,$3,$4,$5,$6)',[knowledgeId,owner,projectId,kind,title,content]);
        if(kind==='decision')await client.query(`INSERT INTO public.decisions(knowledge_id,owner_id,context,options,reasoning) VALUES($1,$2,'[Synthetic demo] Authentication architecture',ARRAY['Opaque sessions','Long-lived bearer tokens'],'Immediate revocation is required.')`,[knowledgeId,owner]);
        await client.query("INSERT INTO public.relationships(owner_id,source_id,target_id,type,confidence,created_by) VALUES($1,$2,$3,'informs',1,'user')",[owner,knowledgeId,taskIds[offset]]);
      }
      const memoryId=randomUUID();await client.query("INSERT INTO public.user_memories(id,user_id,key,category) VALUES($1,$2,$3,'DECISION')",[memoryId,owner,`evidence.${memoryId}`]);
      await client.query("INSERT INTO public.user_memory_versions(memory_id,user_id,text_value,source_knowledge_id,source,status,revision) VALUES($1,$2,'Authentication should support immediate revocation.',$3,'USER_EXPLICIT','ACTIVE',1)",[memoryId,owner,knowledgeIds[knowledgeIds.length-1]]);
    }
    await client.query(`INSERT INTO public.calendar_events(owner_id,title,starts_at,ends_at) VALUES($1,'[Synthetic demo] Product review',date_trunc('day',now())+interval '1 day 10 hours',date_trunc('day',now())+interval '1 day 11 hours')`,[owner]);
    return {goals:goalIds.length,projects:projectIds.length,tasks:taskIds.length,knowledge:knowledgeIds.length};
  },'synthetic_demo_seed');
  console.log(JSON.stringify({seeded:counts,ownerId:owner,ai:'No fabricated AI output was seeded; insights derive from stored data.'}));
} finally {await pool.end();}
