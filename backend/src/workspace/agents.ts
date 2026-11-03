import { Router } from 'express';
import type { Pool } from 'pg';
import { currentUser } from '../auth.ts';
import { ApiError, choice, id, keys, object, text } from '../platform/validation.ts';
import { AssistantService } from './assistant.ts';
import { proposeSchedule } from './planningService.ts';

export const agentRegistry={
  planning:{purpose:'Build a feasible proposal from tasks, estimates and capacity.',confirmation:'required for every proposed change'},
  scheduling:{purpose:'Fit work around existing calendar commitments and dependencies.',confirmation:'required for every proposed change'},
  knowledge:{purpose:'Retrieve evidence and propose explicit knowledge relationships.',confirmation:'required for every proposed relationship'},
  review:{purpose:'Explain recorded work and decisions from bounded source context.',confirmation:'read-only'},
} as const;
export class AgentOrchestrator {
  pool:Pool;
  constructor(pool:Pool){this.pool=pool;}
  async run(owner:string,agent: keyof typeof agentRegistry,input:unknown){
    const b=object(input);
    const result=agent==='planning'||agent==='scheduling'?await proposeSchedule(this.pool,owner,b):await this.contextual(owner,agent,b);
    await this.pool.query(`INSERT INTO public.audit_logs(owner_id,entity_type,operation,actor,after_value) VALUES($1,'agent','PROPOSE',$2,$3)`,[owner,`agent:${agent}`,JSON.stringify({agent,purpose:agentRegistry[agent].purpose,confirmation:agentRegistry[agent].confirmation})]);
    return {agent,policy:agentRegistry[agent],result};
  }
  private async contextual(owner:string,agent:'knowledge'|'review',b:Record<string,unknown>){
    keys(b,['input','projectId','semantic']);
    const input=text(b.input,'Agent request',4000);
    const result=await new AssistantService(this.pool).ask(owner,agent==='review'?`Review only; do not propose mutations. ${input}`:input,b.projectId==null?null:id(b.projectId),b.semantic===true);
    if(agent==='review'&&result.proposal) {
      // A provider that violates the read-only policy must not leave an applicable proposal.
      await this.pool.query("UPDATE public.ai_actions SET status='rejected',decided_at=now() WHERE id=$1 AND owner_id=$2 AND status='pending'",[result.proposal.id,owner]);
      throw new ApiError(502,'agent_policy_violation','The review agent proposed a mutation; its proposal was rejected.');
    }
    return result;
  }
}
export function agentRouter(pool:Pool){
  const router=Router(),orchestrator=new AgentOrchestrator(pool);
  router.get('/agents',(_req,res)=>res.json({agents:agentRegistry}));
  router.post('/agents/:agent',async(req,res)=>res.json(await orchestrator.run(currentUser(req).id,choice(req.params.agent,['planning','scheduling','knowledge','review'],'agent'),req.body)));
  return router;
}
