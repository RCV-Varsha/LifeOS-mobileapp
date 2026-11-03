import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
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
    let raw: string | null;
  if (Platform.OS === 'web') {
    raw = sessionStorage.getItem(key);
  } else {
    const credentials = await Keychain.getGenericPassword({ service: key });
    raw = credentials ? credentials.password : null;
  }
  if(!raw)return null;
  const parsed=JSON.parse(raw) as Tokens;
  if(!parsed.accessToken||!parsed.refreshToken||!parsed.user?.id)throw new Error('Stored session is invalid. Sign in again.');
  current=parsed;return current;
}
export async function saveTokens(tokens:Tokens|null) {
  const raw=tokens?JSON.stringify(tokens):null;
  if(Platform.OS==='web'){if(raw)sessionStorage.setItem(key,raw);else sessionStorage.removeItem(key);}
    else if (raw) {
    await Keychain.setGenericPassword('session', raw, { service: key });
  } else {
    await Keychain.resetGenericPassword({ service: key });
  }
  current=tokens;
  if (!tokens) listeners.forEach(listener => listener());
}
