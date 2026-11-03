import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type Tokens={accessToken:string;refreshToken:string;user:{id:string;status:'ACTIVE'}};
const key='lifeos.session.v1';
let current:Tokens|null=null;
const listeners = new Set<() => void>();
export function onSessionCleared(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export async function readTokens():Promise<Tokens|null> {
  if(current)return current;
  const raw=Platform.OS==='web'?sessionStorage.getItem(key):await SecureStore.getItemAsync(key);
  if(!raw)return null;
  const parsed=JSON.parse(raw) as Tokens;
  if(!parsed.accessToken||!parsed.refreshToken||!parsed.user?.id)throw new Error('Stored session is invalid. Sign in again.');
  current=parsed;return current;
}
export async function saveTokens(tokens:Tokens|null) {
  const raw=tokens?JSON.stringify(tokens):null;
  if(Platform.OS==='web'){if(raw)sessionStorage.setItem(key,raw);else sessionStorage.removeItem(key);}
  else if(raw)await SecureStore.setItemAsync(key,raw);else await SecureStore.deleteItemAsync(key);
  current=tokens;
  if (!tokens) listeners.forEach(listener => listener());
}
