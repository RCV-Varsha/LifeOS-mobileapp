import {api} from './apiFetch';
export type PersonalProfile={name:string;role:string;focus:string;routine:string;start:string;end:string;sessionMinutes:number|null};
export type ProfileResponse={profile:PersonalProfile;revision:number};
export const blankProfile:PersonalProfile={name:'',role:'',focus:'',routine:'',start:'',end:'',sessionMinutes:null};
export const getProfile=()=>api<ProfileResponse>('/profile');
export const saveProfile=(profile:PersonalProfile,revision:number)=>api<ProfileResponse>('/profile','PUT',{profile,revision});
export function greeting(name:string){const hour=new Date().getHours();return `${hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'}${name?', '+name:''}.`;}
