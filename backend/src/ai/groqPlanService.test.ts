import test from 'node:test';
import assert from 'node:assert/strict';
import {generateProposedPlan} from './groqPlanService.ts';

test('plan retries a structured-output failure once, preserving its deadline',async()=>{
  const originalFetch=globalThis.fetch,key=process.env.GROQ_API_KEY,model=process.env.GROQ_MODEL;
  process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';
  let calls=0;const signals:unknown[]=[];
  const plan={summary:'Learn the basics.',days:Array.from({length:7},(_,i)=>({day:i+1,title:'Practice',actions:[{instruction:'Practice one exercise.',minutes:20}]}))};
  globalThis.fetch=async(_url,init)=>{signals.push(init?.signal);calls++;return calls===1?new Response(JSON.stringify({error:{code:'json_validate_failed'}}),{status:400}):new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}]}));};
  try{assert.deepEqual(await generateProposedPlan({goal:'Learn Java',reason:'Practice',minutesPerDay:30}),plan);assert.equal(calls,2);assert.equal(signals[0],signals[1]);}
  finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;if(model===undefined)delete process.env.GROQ_MODEL;else process.env.GROQ_MODEL=model;}
});

test('plan does not retry quota errors',async()=>{
  const originalFetch=globalThis.fetch,key=process.env.GROQ_API_KEY,model=process.env.GROQ_MODEL;
  process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429});};
  try{await assert.rejects(()=>generateProposedPlan({goal:'Learn Java',reason:'Practice',minutesPerDay:30}));assert.equal(calls,1);}
  finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;if(model===undefined)delete process.env.GROQ_MODEL;else process.env.GROQ_MODEL=model;}
});
