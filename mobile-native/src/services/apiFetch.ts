import { API_URL } from '../config/api';
import { readTokens, saveTokens, type Tokens } from './authStorage';
import { request } from './request';

let refreshing:Promise<Tokens>|null=null;
async function refresh():Promise<Tokens> {
  const tokens=await readTokens();if(!tokens)throw new Error('Sign in to continue.');
  const response=await request(`${API_URL}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:tokens.refreshToken})});
  // A delayed refresh must not restore an account after sign-out or account switching.
  if((await readTokens())?.refreshToken!==tokens.refreshToken)throw new Error('Your session changed. Sign in again.');
  if(!response.ok){if(response.status===401)await saveTokens(null);throw new Error('Your session expired. Sign in again.');}
  const value=await response.json() as Tokens;await saveTokens(value);return value;
}
export async function apiFetch(input:string,init:RequestInit={}):Promise<Response> {
  // Older feature services already own their deadlines (AI generation needs 70s).
  const timeoutMs=init.signal?null:input.endsWith('/analyze')?110000:input.includes('mode=semantic')?120000:input.includes('/ai/')||input.endsWith('/index')?75000:15000;
  const tokens=await readTokens();
  const headers=new Headers(init.headers);if(tokens)headers.set('Authorization',`Bearer ${tokens.accessToken}`);
  const response=await request(input,{...init,headers},timeoutMs);
  if(response.status!==401||!tokens)return response;
  if(!refreshing)refreshing=refresh().finally(()=>{refreshing=null;});
  const renewed=await refreshing;headers.set('Authorization',`Bearer ${renewed.accessToken}`);
  return request(input,{...init,headers},timeoutMs);
}
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await apiFetch(`${API_URL}${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok){const value=await response.json().catch(()=>null);const error=new Error(value?.error??`Request failed (${response.status}).`) as Error&{status:number};error.status=response.status;throw error;}
  return response.status===204?undefined as T:response.json() as Promise<T>;
}
