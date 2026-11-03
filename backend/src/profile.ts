import {Router} from 'express';
import type {Pool} from 'pg';
import {currentUser} from './auth.ts';
import {ApiError,object,keys,text,integer} from './platform/validation.ts';

export type PersonalProfile={name:string;role:string;focus:string;routine:string;start:string;end:string;sessionMinutes:number|null};
export const blankProfile:PersonalProfile={name:'',role:'',focus:'',routine:'',start:'',end:'',sessionMinutes:null};
export function validateProfile(value:unknown):PersonalProfile{
  const b=object(value);keys(b,Object.keys(blankProfile));
  const profile={name:text(b.name,'Name',60,0),role:text(b.role,'Current role',120,0),focus:text(b.focus,'Focus',500,0),routine:text(b.routine,'Routine',1000,0),start:text(b.start,'Start time',5,0),end:text(b.end,'End time',5,0),sessionMinutes:b.sessionMinutes===null?null:integer(b.sessionMinutes,'Session minutes',5,240)};
  if(Boolean(profile.start)!==Boolean(profile.end)||[profile.start,profile.end].some(t=>t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||(profile.start&&profile.end<=profile.start))throw new ApiError(400,'invalid_input','Choose a start and later end time on the same day, using HH:mm.');
  return profile;
}
export async function readProfile(pool:Pool,owner:string):Promise<{profile:PersonalProfile;revision:number}>{
  const row=(await pool.query('SELECT data,revision FROM public.personal_profiles WHERE owner_id=$1',[owner])).rows[0];
  return {profile:row?validateProfile(row.data):{...blankProfile},revision:row?.revision??0};
}
export function profileRouter(pool:Pool){
  const router=Router();
  router.get('/profile',async(req,res)=>res.json(await readProfile(pool,currentUser(req).id)));
  router.put('/profile',async(req,res)=>{
    const b=object(req.body);keys(b,['profile','revision']);const profile=validateProfile(b.profile),revision=integer(b.revision,'Revision',0,2147483646),owner=currentUser(req).id;
    const result=revision===0?await pool.query('INSERT INTO public.personal_profiles(owner_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING revision',[owner,profile]):await pool.query('UPDATE public.personal_profiles SET data=$2,revision=revision+1,updated_at=now() WHERE owner_id=$1 AND revision=$3 RETURNING revision',[owner,profile,revision]);
    if(!result.rowCount)throw new ApiError(409,'conflict','Your profile changed elsewhere. Reload it before saving.');
    res.json({profile,revision:result.rows[0].revision});
  });
  return router;
}
