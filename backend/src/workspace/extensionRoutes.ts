import express, { Router } from 'express';
import type { Pool } from 'pg';
import { currentUser } from '../auth.ts';
import { ApiError, choice, id, integer, keys, object, text } from '../platform/validation.ts';
import { transaction } from '../platform/database.ts';
import { EvidenceMemoryRepository } from './evidenceMemory.ts';
import { WorkspaceRepository } from './repository.ts';
import { projectInsights } from './planning.ts';
import {DocumentAnalysisService} from './documentAnalysis.ts';

export function extensionRouter(pool:Pool){
  const router=Router(),memories=new EvidenceMemoryRepository(pool),workspace=new WorkspaceRepository(pool);
  router.get('/briefing',async(req,res)=>{
    const owner=currentUser(req).id,tasks=await workspace.tasks(owner);
    const pending=tasks.filter(t=>t.status==='pending');
    const focus=pending.find(t=>t.dependencies.every(d=>tasks.find(x=>x.id===d)?.status==='completed'))??null;
    const events=(await pool.query(`SELECT * FROM public.calendar_events WHERE owner_id=$1 AND ends_at>now() AND starts_at<now()+interval '24 hours' ORDER BY starts_at LIMIT 20`,[owner])).rows;
    const projects=await workspace.projects(owner);
    const activity=(await pool.query('SELECT entity_type,operation,created_at FROM public.audit_logs WHERE owner_id=$1 ORDER BY id DESC LIMIT 8',[owner])).rows;
    res.json({focus,focusReason:focus?'Highest priority unblocked pending task, then earliest deadline. System estimate based on recorded work.':'No unblocked pending task is available.',pending:pending.length,completed:tasks.filter(t=>t.status==='completed').length,projects,events,insights:projectInsights(tasks).slice(0,5),activity,capacity:null,capacityExplanation:'Select your available focus window in Planner to calculate capacity against commitments.'});
  });
  router.get('/objectives',async(req,res)=>res.json({items:(await pool.query('SELECT * FROM public.objectives WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100',[currentUser(req).id])).rows}));
  router.post('/objectives',async(req,res)=>{
    const b=object(req.body);keys(b,['title','description','goalId']);
    res.status(201).json({item:(await pool.query('INSERT INTO public.objectives(owner_id,goal_id,title,description) VALUES($1,$2,$3,$4) RETURNING *',[currentUser(req).id,id(b.goalId),text(b.title,'Objective'),text(b.description??'','Description',10000,0)])).rows[0]});
  });
  router.get('/evidence-memories',async(req,res)=>res.json({items:await memories.list(currentUser(req).id)}));
  router.post('/evidence-memories',async(req,res)=>res.status(201).json({item:await memories.save(currentUser(req).id,req.body)}));
  router.put('/evidence-memories/:id',async(req,res)=>res.json({item:await memories.save(currentUser(req).id,req.body,id(req.params.id))}));
  router.post('/evidence-memories/:id/archive',async(req,res)=>{await memories.archive(currentUser(req).id,id(req.params.id),integer(object(req.body).revision,'Revision',1,2147483647));res.status(204).end();});
  router.post('/documents/upload',express.raw({type:()=>true,limit:'10mb'}),async(req,res)=>{
    const owner=currentUser(req).id,knowledgeId=req.query.knowledgeId?id(req.query.knowledgeId):null,filename=text(req.query.filename,'Filename',200);
    const mediaType=choice(req.headers['content-type']?.split(';')[0],['text/plain','text/markdown','application/pdf','image/jpeg','image/png','audio/mpeg','audio/mp4','audio/wav'],'media type');
    if(!Buffer.isBuffer(req.body)||!req.body.length)throw new ApiError(400,'invalid_file','Send a nonempty raw file body.');
    const content=req.body as Buffer;
    const item=await transaction(pool,async client=>{
      const source=knowledgeId?(await client.query('SELECT id FROM public.knowledge_items WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE',[knowledgeId,owner])).rows[0]
        :(await client.query("INSERT INTO public.knowledge_items(owner_id,title,kind) VALUES($1,$2,'document') RETURNING id",[owner,filename])).rows[0];
      if(!source)throw new ApiError(404,'not_found','Knowledge item not found.');
      const file=(await client.query('INSERT INTO public.document_files(owner_id,knowledge_id,filename,media_type,byte_size,content) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,knowledge_id,filename,media_type,byte_size',[owner,source.id,filename,mediaType,content.length,content])).rows[0];
      if(mediaType.startsWith('text/')){
        if(content.length>200000)throw new ApiError(400,'text_too_large','Text documents must be at most 200 KB.');
        await client.query('UPDATE public.knowledge_items SET content=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2',[source.id,owner,content.toString('utf8')]);
        await client.query('DELETE FROM public.knowledge_chunks WHERE knowledge_id=$1 AND owner_id=$2',[source.id,owner]);
      }
      return file;
    });res.status(201).json({item,extraction:mediaType.startsWith('text/')?'text stored; ready for indexing':'File stored. OCR/transcription is not configured; add source text before indexing.'});
  });
  router.post('/documents/:id/analyze',async(req,res)=>res.json(await new DocumentAnalysisService(pool).analyze(currentUser(req).id,id(req.params.id))));
  router.get('/documents/:id',async(req,res)=>{
    const file=(await pool.query('SELECT f.* FROM public.document_files f JOIN public.knowledge_items k ON k.id=f.knowledge_id AND k.owner_id=f.owner_id WHERE f.id=$1 AND f.owner_id=$2 AND k.deleted_at IS NULL',[id(req.params.id),currentUser(req).id])).rows[0];
    if(!file)throw new ApiError(404,'not_found','Document not found.');
    res.set('Content-Type',file.media_type);res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);res.set('X-Content-Type-Options','nosniff');res.send(file.content);
  });
  return router;
}
