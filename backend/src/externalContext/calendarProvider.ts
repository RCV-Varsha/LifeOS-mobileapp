import type { CalendarContext } from './types.ts';

type CalendarConfig={ownerId:string;url:string};
const unavailable=(now:Date):CalendarContext=>({state:'UNAVAILABLE',source:'ICAL',observedAt:now.toISOString(),freshUntil:null,nextCommitment:null,freeMinutesBeforeNext:null});
export function parseCalendar(text:string,now:Date,observedAt=now):CalendarContext{
  const unfolded=text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/);const events:{title:string;start:Date;end:Date}[]=[];let event:Record<string,string>|null=null;
  for(const line of unfolded.slice(0,5000)){if(line==='BEGIN:VEVENT'){event={};continue;}if(line==='END:VEVENT'&&event){const start=parseIcal(event.DTSTART);const end=parseIcal(event.DTEND);if(start&&end&&end>start&&end>now&&end.getTime()-start.getTime()<=86_400_000)events.push({title:safeTitle(event.SUMMARY),start,end});event=null;continue;}if(event){const separator=line.indexOf(':');if(separator>0){const key=line.slice(0,separator).split(';')[0]!;if(['DTSTART','DTEND','SUMMARY'].includes(key))event[key]=line.slice(separator+1);}}}
  const next=events.sort((a,b)=>a.start.getTime()-b.start.getTime())[0]??null;const age=now.getTime()-observedAt.getTime();const fresh=age<=15*60_000;
  return{state:fresh?'AVAILABLE':'STALE',source:'ICAL',observedAt:observedAt.toISOString(),freshUntil:new Date(observedAt.getTime()+15*60_000).toISOString(),nextCommitment:next?{title:next.title,startsAt:next.start.toISOString(),endsAt:next.end.toISOString(),durationMinutes:Math.round((next.end.getTime()-next.start.getTime())/60_000),minutesUntilStart:Math.max(0,Math.floor((next.start.getTime()-now.getTime())/60_000))}:null,freeMinutesBeforeNext:next?Math.max(0,Math.floor((next.start.getTime()-now.getTime())/60_000)):null};
}
export class CalendarProvider{
  private readonly config:CalendarConfig|null;private readonly request:typeof fetch;
  constructor(config:CalendarConfig|null,request:typeof fetch=fetch){this.config=config;this.request=request;}
  async load(ownerId:string,now:Date):Promise<CalendarContext>{if(!this.config||ownerId!==this.config.ownerId)return unavailable(now);try{const response=await this.request(this.config.url,{headers:{Accept:'text/calendar'},signal:AbortSignal.timeout(5000)});if(!response.ok)return unavailable(now);const text=await response.text();if(text.length>1_000_000||!text.includes('BEGIN:VCALENDAR'))return unavailable(now);return parseCalendar(text,now);}catch{return unavailable(now);}}
}
export function calendarConfigFromEnv():CalendarConfig|null{const ownerId=process.env.DEV_USER_ID;const url=process.env.CALENDAR_ICS_URL;if(!ownerId||!url)return null;try{const parsed=new URL(url);return parsed.protocol==='https:'?{ownerId,url}:null;}catch{return null;}}
function parseIcal(value:string|undefined){if(!value||!/^\d{8}T\d{6}Z$/.test(value))return null;const match=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)!;const date=new Date(Date.UTC(+match[1]!,+match[2]!-1,+match[3]!,+match[4]!,+match[5]!,+match[6]!));return Number.isNaN(date.getTime())?null:date;}
function safeTitle(value:string|undefined){const title=(value??'Busy').replace(/[\r\n]/g,' ').trim().slice(0,120);return title||'Busy';}
