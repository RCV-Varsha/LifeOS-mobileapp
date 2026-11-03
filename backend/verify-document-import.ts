import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000';
const accounts:{accessToken:string;password:string}[]=[];
async function call(path:string,token:string,body?:unknown){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:r.status===204?null:await r.json()};}
function pdf(){
  const stream='BT /F1 16 Tf 50 740 Td (Placement syllabus) Tj 0 -30 Td (Topics: percentages, ratios, reading comprehension.) Tj 0 -30 Td (Practice ten percentage problems and five ratio problems.) Tj 0 -30 Td (Read one passage and answer comprehension questions.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let result='%PDF-1.4\n';const offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(result));result+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(result);result+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(result);
}
try{
  for(let i=0;i<2;i++){const password=`QA-${crypto.randomUUID()}!`,r=await call('/auth/register','',{email:`file-${crypto.randomUUID()}@example.test`,password});assert.equal(r.status,201);accounts.push({...r.body,password});}
  const token=accounts[0].accessToken;
  const upload=await fetch(base+'/documents/upload?filename=placement-syllabus.pdf',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/pdf'},body:pdf()});assert.equal(upload.status,201);const file=(await upload.json()).item;
  assert.equal((await call(`/documents/${file.id}/analyze`,accounts[1].accessToken,{})).status,404);
  const analysis=await call(`/documents/${file.id}/analyze`,token,{});assert.equal(analysis.status,200,JSON.stringify(analysis.body));assert.match(analysis.body.summary,/percentage|ratio|comprehension/i);assert.ok(analysis.body.proposal?.changes.length>0);assert.equal(analysis.body.proposal.status,'pending');
  assert.equal((await call('/workspace/tasks',token)).body.items.length,0);
  const retry=await call(`/documents/${file.id}/analyze`,token,{});assert.equal(retry.body.proposal.id,analysis.body.proposal.id);
  const knowledge=await call(`/knowledge/${file.knowledge_id}`,token);assert.match(JSON.stringify(knowledge.body),/AI summary/);
  const applied=await call(`/ai/actions/${analysis.body.proposal.id}/apply`,token,{confirmed:true});assert.equal(applied.status,200);
  const tasks=(await call('/workspace/tasks',token)).body.items;assert.equal(tasks.length,analysis.body.proposal.changes.length);
  assert.equal((await call(`/documents/${file.id}/analyze`,token,{})).body.proposal.status,'applied');
  console.log(JSON.stringify({pdfSummary:analysis.body.summary,suggestedTasks:tasks.map((task:any)=>task.instruction),reviewRequired:true,retryDeduplicated:true,foreignAccountDenied:true}));
}finally{
  for(const account of accounts){const r=await call('/privacy/delete-account',account.accessToken,{confirmation:'DELETE MY ACCOUNT',password:account.password});assert.equal(r.status,204);}console.log('Synthetic document test accounts removed.');
}
