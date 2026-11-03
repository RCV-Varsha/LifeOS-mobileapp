import { Router } from 'express';
import type { Pool } from 'pg';
import { currentUser } from '../auth.ts';
import { transaction } from './database.ts';
import { ApiError, keys, object, text } from './validation.ts';
import { verifyPassword } from './authentication.ts';

export function privacyRouter(pool:Pool){
  const router=Router();
  router.get('/privacy/export',async(req,res)=>{
    const owner=currentUser(req).id;
    const output=await transaction(pool,async client=>{
      const columns=(await client.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('owner_id','user_id') AND table_name NOT IN ('auth_credentials','auth_sessions','auth_attempts')`)).rows;
      const tables:Record<string,unknown>={};
      for(const {table_name,column_name} of columns){
        if(!/^[a-z_]+$/.test(table_name))throw new Error('Unexpected export table.');
        tables[table_name]=(await client.query(`SELECT to_jsonb(t) FROM public."${table_name}" t WHERE "${column_name}"=$1`,[owner])).rows.map(row=>row.to_jsonb);
      }
      return {version:1,exportedAt:new Date().toISOString(),tables};
    },'user','repeatable read');
    res.set('Content-Disposition','attachment; filename="lifeos-export.json"');res.json(output);
  });
  router.post('/privacy/delete-account',async(req,res)=>{
    const body=object(req.body);keys(body,['confirmation','password']);
    if(body.confirmation!=='DELETE MY ACCOUNT')throw new ApiError(400,'confirmation_required','Type DELETE MY ACCOUNT to confirm permanent deletion.');
    text(body.password,'Password',128);
    const owner=currentUser(req).id;
    await transaction(pool,async client=>{
      await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
      const credentials=(await client.query('SELECT password_hash FROM public.auth_credentials WHERE user_id=$1',[owner])).rows[0];
      if(!credentials||!await verifyPassword(body.password as string,credentials.password_hash))throw new ApiError(401,'invalid_credentials','Password is incorrect.');
      const columns=(await client.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('owner_id','user_id')`)).rows;
      const pending=new Map<string,string>(columns.map(c=>[c.table_name,c.column_name]));
      const foreignKeys=(await client.query(`SELECT child.relname AS child,parent.relname AS parent FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace WHERE fk.contype='f' AND ns.nspname='public'`)).rows;
      while(pending.size){
        const candidates=[...pending.keys()].filter(table=>!foreignKeys.some(fk=>fk.parent===table&&fk.child!==table&&pending.has(fk.child)));
        if(!candidates.length)throw new Error('Account deletion dependency cycle.');
        for(const table of candidates){
          if(!/^[a-z_]+$/.test(table))throw new Error('Unexpected deletion table.');
          await client.query(`DELETE FROM public."${table}" WHERE "${pending.get(table)}"=$1`,[owner]);pending.delete(table);
        }
      }
      // Audit triggers may have inserted deletion events during the purge.
      await client.query('DELETE FROM public.audit_logs WHERE owner_id=$1',[owner]);
      await client.query('DELETE FROM public.users WHERE id=$1',[owner]);
    });res.status(204).end();
  });
  return router;
}
