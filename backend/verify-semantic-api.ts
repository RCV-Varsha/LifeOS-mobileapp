import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:3000',password=`QA-${randomUUID()}!`;
let token='';
async function call(path:string,method='GET',body?:unknown){return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
try{
  const registration=await call('/auth/register','POST',{email:`semantic-${randomUUID()}@example.test`,password});
  if(registration.status!==201)throw new Error('QA registration failed');
  token=(await registration.json()).accessToken;
  const saved=await call('/knowledge','POST',{title:'Interview readiness',content:'Practice answering questions from recruiters and demonstrate professional skills to obtain employment.',kind:'note'});
  if(saved.status!==201)throw new Error('QA note failed');
  const note=(await saved.json()).item;
  const keyword=await call('/search?q=getting%20hired&mode=keyword');
  const semantic=await call('/search?q=getting%20hired&mode=semantic');
  const keywords=await keyword.json(),result=await semantic.json();
  if(semantic.status!==200||result.items[0]?.id!==note.id)throw new Error('Live semantic result did not match the synthetic note');
  console.log(JSON.stringify({httpStatus:semantic.status,query:'getting hired',keywordMatches:keywords.items.length,semanticTopMatch:result.items[0].title}));
}finally{
  if(token){const deleted=await call('/privacy/delete-account','POST',{confirmation:'DELETE MY ACCOUNT',password});if(deleted.status!==204)throw new Error('QA account cleanup failed');console.log('Synthetic QA account removed.');}
}
