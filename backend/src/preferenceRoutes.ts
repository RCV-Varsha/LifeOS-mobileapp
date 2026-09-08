import { Router } from 'express';
import { currentUser } from './auth.ts';
import { pool } from './db.ts';
import { generatePreferenceSuggestion } from './preferences/groqPreferenceSuggestionService.ts';
import { PreferenceConflictError, PreferenceRepository } from './preferences/preferenceRepository.ts';
import { validatePreference } from './preferences/registry.ts';
import { parseCorrection, parseCreatePreference, parseExpectedRevision, parsePreferenceChange, parseSuggestionApproval, parseSuggestionRequest } from './preferences/validation.ts';
import { GroqRequestError } from './ai/groqPlanService.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function conflict(res: { status(code: number): { json(value: unknown): unknown } }, error: unknown) {
  if (!(error instanceof PreferenceConflictError)) return false;
  const message = error.code === 'duplicate_key' ? 'An active or archived preference already uses this key.'
    : error.code === 'stale_revision' ? 'This preference changed. Reload before saving.'
    : 'This preference cannot make that lifecycle transition.';
  res.status(409).json({ error: message, code: error.code });
  return true;
}

export function createPreferenceRouter(
  repository = new PreferenceRepository(pool),
  suggest = generatePreferenceSuggestion,
) {
  const router = Router();
  router.get('/preferences', async (req, res) => {
    try { res.status(200).json({ preferences: await repository.list(currentUser(req).id) }); }
    catch { res.status(500).json({ error: 'Could not load preferences.' }); }
  });
  router.post('/preferences', async (req, res) => {
    try { const input=parseCreatePreference(req.body);res.status(201).json({preference:await repository.create(currentUser(req).id,input.key,input.value)}); }
    catch(error){if(conflict(res,error))return;res.status(error instanceof Error?400:500).json({error:error instanceof Error?error.message:'Could not create preference.'});}
  });
  router.put('/preferences/:id', async (req,res) => {
    if(typeof req.params.id!=='string'||!uuid.test(req.params.id)){res.status(400).json({error:'Invalid preference ID.'});return;}
    try{const ownerId=currentUser(req).id;const current=await repository.get(ownerId,req.params.id);if(!current){res.status(404).json({error:'Preference not found.'});return;}const input=parsePreferenceChange(req.body);const value=validatePreference(current.key,current.category,input.value).value;const preference=await repository.update(ownerId,current.id,value,input.expectedRevision);if(!preference){res.status(404).json({error:'Preference not found.'});return;}res.status(200).json({preference});}
    catch(error){if(conflict(res,error))return;res.status(400).json({error:error instanceof Error?error.message:'Invalid preference.'});}
  });
  router.delete('/preferences/:id',async(req,res)=>{
    if(typeof req.params.id!=='string'||!uuid.test(req.params.id)){res.status(400).json({error:'Invalid preference ID.'});return;}
    try{const preference=await repository.archive(currentUser(req).id,req.params.id,parseExpectedRevision(req.body));if(!preference){res.status(404).json({error:'Preference not found.'});return;}res.status(200).json({preference});}
    catch(error){if(conflict(res,error))return;res.status(400).json({error:error instanceof Error?error.message:'Invalid archive request.'});}
  });
  router.post('/preferences/:id/reactivate',async(req,res)=>{
    if(typeof req.params.id!=='string'||!uuid.test(req.params.id)){res.status(400).json({error:'Invalid preference ID.'});return;}
    try{const preference=await repository.reactivate(currentUser(req).id,req.params.id,parseExpectedRevision(req.body));if(!preference){res.status(404).json({error:'Preference not found.'});return;}res.status(200).json({preference});}
    catch(error){if(conflict(res,error))return;res.status(400).json({error:error instanceof Error?error.message:'Invalid reactivation request.'});}
  });
  router.post('/preferences/:id/correct',async(req,res)=>{
    if(typeof req.params.id!=='string'||!uuid.test(req.params.id)){res.status(400).json({error:'Invalid preference ID.'});return;}
    try{const ownerId=currentUser(req).id;const current=await repository.get(ownerId,req.params.id);if(!current){res.status(404).json({error:'Preference not found.'});return;}const input=parseCorrection(req.body);const value=validatePreference(current.key,current.category,input.value).value;const preference=await repository.correct(ownerId,current.id,value,input.expectedRevision,input.note);if(!preference){res.status(404).json({error:'Preference not found.'});return;}res.status(200).json({preference});}
    catch(error){if(conflict(res,error))return;res.status(400).json({error:error instanceof Error?error.message:'Invalid correction.'});}
  });
  router.get('/preferences/:id/history',async(req,res)=>{
    if(typeof req.params.id!=='string'||!uuid.test(req.params.id)){res.status(400).json({error:'Invalid preference ID.'});return;}
    try{const history=await repository.history(currentUser(req).id,req.params.id);if(!history){res.status(404).json({error:'Preference not found.'});return;}res.status(200).json({history});}
    catch{res.status(500).json({error:'Could not load preference history.'});}
  });
  router.post('/preference-suggestions',async(req,res)=>{
    let statement:string;try{statement=parseSuggestionRequest(req.body);}catch(error){res.status(400).json({error:error instanceof Error?error.message:'Invalid suggestion request.'});return;}
    if(!process.env.GROQ_API_KEY||!process.env.GROQ_MODEL){res.status(503).json({error:'AI service is not configured.',code:'ai_not_configured'});return;}
    try{res.status(200).json({suggestion:await suggest(statement),persisted:false});}
    catch(error){if(error instanceof GroqRequestError&&error.status===429){res.status(429).json({error:'AI request limit reached.',code:'ai_rate_limited'});return;}res.status(502).json({error:'AI could not produce a valid preference suggestion.',code:'ai_unavailable'});}
  });
  router.post('/preference-suggestions/accept',async(req,res)=>{
    try{const input=parseSuggestionApproval(req.body);res.status(201).json({preference:await repository.create(currentUser(req).id,input.key,input.value,'USER_EXPLICIT')});}
    catch(error){if(conflict(res,error))return;res.status(400).json({error:error instanceof Error?error.message:'Invalid suggestion approval.'});}
  });
  return router;
}

export const preferenceRouter=createPreferenceRouter();
