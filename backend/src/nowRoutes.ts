import { Router } from 'express';
import { currentUser } from './auth.ts';
import { pool } from './db.ts';
import { calendarDay, validateTimeZone } from './dailyReview/date.ts';
import { NowRepository } from './now/nowRepository.ts';
import { buildNow } from './now/nowService.ts';

type Selector=Pick<NowRepository,'snapshot'>;
export function createNowRouter(repository:Selector=new NowRepository(pool),clock=()=>new Date()){
  const router=Router();router.get('/now',async(req,res)=>{const timeZone=validateTimeZone(req.query.timeZone);if(!timeZone){res.status(400).json({error:'Provide a valid IANA timeZone query parameter.'});return;}
    try{const date=calendarDay(clock(),timeZone);res.set('Cache-Control','no-store');res.status(200).json({now:buildNow(await repository.snapshot(currentUser(req).id,date,timeZone))});}
    catch{console.error('NOW assembly failed.');res.status(500).json({error:'Could not assemble NOW.'});}});return router;
}
export const nowRouter=createNowRouter();
