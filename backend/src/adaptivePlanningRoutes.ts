import { Router } from 'express';
import { pool } from './db.ts';
import { parseReviewDate, validateTimeZone } from './dailyReview/date.ts';
import { AdaptiveConflictError, AdaptivePlanningRepository, requestHash } from './adaptivePlanning/adaptivePlanningRepository.ts';
import { generateAdaptiveExplanation } from './adaptivePlanning/groqExplanationService.ts';
import { evaluateDailyPlan, validateEditedSelection } from './adaptivePlanning/planner.ts';
import { LOCAL_OWNER_ID } from './adaptivePlanning/types.ts';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern=/^[A-Za-z0-9._:-]{8,200}$/;
function object(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function idempotencyKey(req:{get(name:string):string|undefined}){const key=req.get('Idempotency-Key');return key&&keyPattern.test(key)?key:null;}
function requestDate(req:{params:Record<string,string|undefined>;query:Record<string,unknown>},now:()=>Date){const timeZone=validateTimeZone(req.query.timeZone);return {timeZone,date:timeZone?parseReviewDate(req.params.date,timeZone,now()):null};}

export function createAdaptivePlanningRouter(
  repository=new AdaptivePlanningRepository(pool),
  explain=generateAdaptiveExplanation,
  now=()=>new Date(),
){
  const router=Router();

  router.get('/daily-contexts/:date',async(req,res)=>{
    const {timeZone,date}=requestDate(req,now);
    if(!timeZone||!date){res.status(400).json({error:'Provide a valid non-future date and IANA timeZone.'});return;}
    try{res.status(200).json({context:await repository.getContext(LOCAL_OWNER_ID,date.isoDate,timeZone)});}
    catch{res.status(500).json({error:'Could not load daily context.'});}
  });

  router.put('/daily-contexts/:date',async(req,res)=>{
    const {timeZone,date}=requestDate(req,now);
    if(!timeZone||!date){res.status(400).json({error:'Provide a valid non-future date and IANA timeZone.'});return;}
    const body=req.body;
    if(!object(body)||Object.keys(body).some((key)=>!['availableMinutes','priorityTaskId','blocker','note'].includes(key))||
      !Number.isInteger(body.availableMinutes)||(body.availableMinutes as number)<0||(body.availableMinutes as number)>1440||
      !(body.priorityTaskId===null||body.priorityTaskId===undefined||(typeof body.priorityTaskId==='string'&&uuidPattern.test(body.priorityTaskId)))||
      !(body.blocker===undefined||(typeof body.blocker==='string'&&body.blocker.trim().length<=500))||
      !(body.note===undefined||(typeof body.note==='string'&&body.note.trim().length<=1000))){res.status(400).json({error:'Invalid daily context.'});return;}
    try{const context=await repository.putContext(LOCAL_OWNER_ID,date.isoDate,timeZone,{availableMinutes:body.availableMinutes as number,priorityTaskId:typeof body.priorityTaskId==='string'?body.priorityTaskId:null,blocker:typeof body.blocker==='string'?body.blocker.trim():'',note:typeof body.note==='string'?body.note.trim():''});res.status(200).json({context});}
    catch(error){if(error instanceof AdaptiveConflictError)res.status(400).json({error:'Priority task is not an owned accepted-plan task.',code:error.code});else res.status(500).json({error:'Could not save daily context.'});}
  });

  router.post('/daily-plans/:date/proposals',async(req,res)=>{
    const {timeZone,date}=requestDate(req,now);const key=idempotencyKey(req);
    if(!timeZone||!date){res.status(400).json({error:'Provide a valid non-future date and IANA timeZone.'});return;}
    if(!key){res.status(400).json({error:'Provide a valid Idempotency-Key header.'});return;}
    if(req.body!==undefined&&(!object(req.body)||Object.keys(req.body).some((field)=>field!=='includeExplanation')||(req.body.includeExplanation!==undefined&&typeof req.body.includeExplanation!=='boolean'))){res.status(400).json({error:'Invalid proposal request.'});return;}
    const includeExplanation=!object(req.body)||req.body.includeExplanation!==false;
    const hash=requestHash({date:date.isoDate,timeZone,includeExplanation});
    try{
      const context=await repository.getContext(LOCAL_OWNER_ID,date.isoDate,timeZone);
      if(!context){res.status(409).json({error:'Save available time before requesting a proposal.',code:'context_required'});return;}
      const tasks=await repository.tasksForDate(LOCAL_OWNER_ID,date,timeZone);
      const evaluation=evaluateDailyPlan(tasks,context.availableMinutes,context.priorityTaskId);
      if(evaluation.currentPlanFits){res.status(200).json({kind:'no_change',evaluation,tasks});return;}
      let explanation=null;let aiFallback=false;
      if(includeExplanation&&process.env.GROQ_API_KEY&&process.env.GROQ_MODEL){try{explanation=await explain(evaluation,tasks);}catch(error){aiFallback=true;console.error('Adaptive explanation unavailable:',error instanceof Error?error.name:'Unknown');}}
      else if(includeExplanation)aiFallback=true;
      const result=await repository.createProposal(LOCAL_OWNER_ID,date.isoDate,timeZone,context,tasks,evaluation,explanation,key,hash);
      res.status(result.reused?200:201).json({kind:'proposal',...result,aiFallback});
    }catch(error){if(error instanceof AdaptiveConflictError)res.status(409).json({error:'Idempotency key was already used for a different request.',code:error.code});else{console.error('Adaptive proposal creation failed.');res.status(500).json({error:'Could not create an adaptive proposal.'});}}
  });

  router.get('/plan-proposals/:id',async(req,res)=>{
    if(typeof req.params.id!=='string'||!uuidPattern.test(req.params.id)){res.status(400).json({error:'Invalid proposal ID.'});return;}
    try{const proposal=await repository.getProposal(LOCAL_OWNER_ID,req.params.id);if(!proposal){res.status(404).json({error:'Proposal not found.'});return;}res.status(200).json({proposal});}
    catch{res.status(500).json({error:'Could not load the proposal.'});}
  });

  router.put('/plan-proposals/:id',async(req,res)=>{
    const id=req.params.id;if(typeof id!=='string'||!uuidPattern.test(id)){res.status(400).json({error:'Invalid proposal ID.'});return;}
    if(!object(req.body)||Object.keys(req.body).length!==1||!Array.isArray(req.body.selected)){res.status(400).json({error:'Provide selected task allocations.'});return;}
    const selected=[] as {taskId:string;allocationMinutes:number}[];
    for(const item of req.body.selected){if(!object(item)||Object.keys(item).length!==2||typeof item.taskId!=='string'||!uuidPattern.test(item.taskId)||!Number.isInteger(item.allocationMinutes)){res.status(400).json({error:'Invalid selected task allocation.'});return;}selected.push({taskId:item.taskId,allocationMinutes:item.allocationMinutes as number});}
    try{const current=await repository.getProposal(LOCAL_OWNER_ID,id);if(!current){res.status(404).json({error:'Proposal not found.'});return;}const evaluation=validateEditedSelection(current.eligibleTasks,current.availableMinutes,selected);const proposal=await repository.editProposal(LOCAL_OWNER_ID,id,evaluation);res.status(200).json({proposal});}
    catch(error){if(error instanceof AdaptiveConflictError)res.status(409).json({error:'This proposal can no longer be edited.',code:error.code});else if(error instanceof Error)res.status(400).json({error:error.message,code:'invalid_selection'});else res.status(500).json({error:'Could not edit the proposal.'});}
  });

  router.post('/plan-proposals/:id/reject',async(req,res)=>{
    const id=req.params.id;if(typeof id!=='string'||!uuidPattern.test(id)||hasBody(req.body)){res.status(400).json({error:'Invalid rejection request.'});return;}
    try{const proposal=await repository.rejectProposal(LOCAL_OWNER_ID,id);if(!proposal){res.status(404).json({error:'Proposal not found.'});return;}res.status(200).json({proposal});}catch{res.status(500).json({error:'Could not reject the proposal.'});}
  });

  router.post('/plan-proposals/:id/accept',async(req,res)=>{
    const id=req.params.id;const key=idempotencyKey(req);if(typeof id!=='string'||!uuidPattern.test(id)||!key||hasBody(req.body)){res.status(400).json({error:'Invalid acceptance request.'});return;}
    try{const result=await repository.acceptProposal(LOCAL_OWNER_ID,id,key,requestHash({proposalId:id,action:'accept'}));if(!result){res.status(404).json({error:'Proposal not found.'});return;}res.status(200).json(result);}
    catch(error){if(error instanceof AdaptiveConflictError){const stale=error.code==='stale';if(stale)await repository.markStale(LOCAL_OWNER_ID,id).catch(()=>console.error('Could not persist stale proposal status.'));res.status(409).json({error:stale?'The proposal is stale. Create a fresh proposal.':'The proposal decision conflicts with current state.',code:error.code});}else{console.error('Adaptive proposal acceptance failed.');res.status(500).json({error:'Could not accept the proposal.'});}}
  });

  router.post('/plan-changes/:id/undo',async(req,res)=>{
    const id=req.params.id;if(typeof id!=='string'||!uuidPattern.test(id)||hasBody(req.body)){res.status(400).json({error:'Invalid undo request.'});return;}
    try{const result=await repository.undoChange(LOCAL_OWNER_ID,id);if(!result){res.status(404).json({error:'Plan change not found.'});return;}res.status(200).json(result);}
    catch(error){if(error instanceof AdaptiveConflictError)res.status(409).json({error:'The daily plan changed again and cannot be safely undone.',code:error.code});else res.status(500).json({error:'Could not undo the plan change.'});}
  });
  return router;
}

function hasBody(body:unknown){return body!==undefined&&(!object(body)||Object.keys(body).length>0);}
export const adaptivePlanningRouter=createAdaptivePlanningRouter();
