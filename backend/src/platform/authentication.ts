import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { ApiError, keys, object, text } from './validation.ts';
import { developmentAuthentication } from '../auth.ts';

const scrypt=promisify(scryptCallback);
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function hashPassword(password:string):Promise<string> {
  const salt=randomBytes(16).toString('hex');
  const hash=await scrypt(password,salt,64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password:string,stored:string):Promise<boolean> {
  const [algorithm,salt,hash]=stored.split(':');
  if(algorithm!=='scrypt'||!salt||!hash||!/^([a-f0-9]{2}){64}$/.test(hash)) return false;
  return timingSafeEqual(await scrypt(password,salt,64) as Buffer,Buffer.from(hash,'hex'));
}
async function session(client:PoolClient,userId:string) {
  const accessToken=randomBytes(32).toString('base64url');
  const refreshToken=randomBytes(48).toString('base64url');
  await client.query(`INSERT INTO public.auth_sessions(user_id,access_hash,refresh_hash,access_expires_at,refresh_expires_at)
    VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '30 days')`,[userId,tokenHash(accessToken),tokenHash(refreshToken)]);
  return {accessToken,refreshToken,expiresIn:900,user:{id:userId,status:'ACTIVE' as const}};
}
export function authentication(database:Pool):RequestHandler {
  if(process.env.AUTH_MODE==='development') {
    if(process.env.NODE_ENV==='production') throw new Error('Development authentication is forbidden in production.');
    return developmentAuthentication(database);
  }
  return async(req,res,next)=>{
    try {
      const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      if(!token) throw new ApiError(401,'unauthenticated','Sign in to continue.');
      const result=await database.query(`SELECT u.id FROM public.auth_sessions s JOIN public.users u ON u.id=s.user_id
        WHERE s.access_hash=$1 AND s.access_expires_at>now() AND s.revoked_at IS NULL AND u.status='ACTIVE'`,[tokenHash(token)]);
      if(!result.rows[0]) throw new ApiError(401,'unauthenticated','Your session has expired.');
      req.user={id:result.rows[0].id,status:'ACTIVE'};
      res.set('Cache-Control','no-store'); next();
    } catch(error) { next(error); }
  };
}
export function authRouter(database:Pool,rateScope='public') {
  const router=Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.use(async(req,_res,next)=>{
    try {
      const key=tokenHash(`${rateScope}:${req.ip??'unknown'}`);
      const attempt=await database.query(`INSERT INTO public.auth_attempts(key) VALUES($1)
        ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END,
        window_start=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE auth_attempts.window_start END RETURNING attempts`,[key]);
      if(attempt.rows[0].attempts>60) throw new ApiError(429,'rate_limited','Too many authentication requests. Try again in 15 minutes.');
      next();
    } catch(error) {next(error);}
  });
  for(const mode of ['register','login'] as const) router.post(`/${mode}`,async(req,res,next)=>{
    let client:PoolClient|undefined;
    try {
      const body=object(req.body); keys(body,['email','password']);
      const email=text(body.email,'Email',254).toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400,'invalid_email','Enter a valid email.');
      text(body.password,'Password',128,mode==='register'?12:1);
      const password=body.password as string;
      client=await database.connect(); await client.query('BEGIN');
      let userId:string;
      if(mode==='register') {
        userId=randomUUID();
        await client.query('INSERT INTO public.users(id) VALUES($1)',[userId]);
        await client.query('INSERT INTO public.auth_credentials(user_id,email,password_hash) VALUES($1,$2,$3)',[userId,email,await hashPassword(password)]);
      } else {
        const found=await client.query(`SELECT c.user_id,c.password_hash,u.status FROM public.auth_credentials c JOIN public.users u ON u.id=c.user_id WHERE c.email=$1`,[email]);
        const credential=found.rows[0];
        const valid=await verifyPassword(password,credential?.password_hash??`scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
        if(!credential||!valid||credential.status!=='ACTIVE') throw new ApiError(401,'invalid_credentials','Email or password is incorrect.');
        userId=credential.user_id;
      }
      const result=await session(client,userId); await client.query('COMMIT');
      res.status(mode==='register'?201:200).json(result);
    } catch(error) {
      if(client) await client.query('ROLLBACK');
      if((error as {code?:string}).code==='23505') next(new ApiError(409,'account_unavailable','Unable to create this account. Sign in if you already registered.'));
      else next(error);
    } finally {client?.release();}
  });
  router.post('/refresh',async(req,res,next)=>{
    const client=await database.connect();
    try {
      const body=object(req.body);keys(body,['refreshToken']);
      const token=text(body.refreshToken,'Refresh token',128);
      await client.query('BEGIN');
      const found=await client.query(`SELECT s.id,s.user_id FROM public.auth_sessions s JOIN public.users u ON u.id=s.user_id
        WHERE s.refresh_hash=$1 AND s.refresh_expires_at>now() AND s.revoked_at IS NULL AND u.status='ACTIVE' FOR UPDATE OF s`,[tokenHash(token)]);
      if(!found.rows[0]) throw new ApiError(401,'unauthenticated','Sign in again.');
      await client.query('UPDATE public.auth_sessions SET revoked_at=now() WHERE id=$1',[found.rows[0].id]);
      const result=await session(client,found.rows[0].user_id);await client.query('COMMIT');res.json(result);
    } catch(error) {await client.query('ROLLBACK');next(error);} finally {client.release();}
  });
  router.post('/logout',async(req,res,next)=>{
    try {
      const body=object(req.body);keys(body,['refreshToken']);
      await database.query('UPDATE public.auth_sessions SET revoked_at=now() WHERE refresh_hash=$1',[tokenHash(text(body.refreshToken,'Refresh token',128))]);
      res.status(204).end();
    } catch(error) {next(error);}
  });
  return router;
}
