const invalid = () => new Error('Enter a valid deadline as YYYY-MM-DD or DD/MM/YYYY. You can add a time as YYYY-MM-DD HH:mm, or leave it blank.');

/** Date-only deadlines mean the end of that day in the device's local timezone. */
export function normalizeTaskDeadline(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  const dayFirst = /^(\d{2})\/(\d{2})\/(\d{4})(.*)$/.exec(value);
  if (dayFirst) value = `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}${dayFirst[4]}`;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match) throw invalid();
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const calendar = new Date(0); calendar.setUTCFullYear(year, month - 1, day);
  if (year < 1000 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw invalid();
  const hasTime = match[4] !== undefined;
  const hours = hasTime ? Number(match[4]) : 23, minutes = hasTime ? Number(match[5]) : 59;
  const seconds = hasTime ? Number(match[6] ?? 0) : 59;
  const millis = hasTime ? Number((match[7] ?? '').padEnd(3, '0')) : 999;
  if (hours > 23 || minutes > 59 || seconds > 59) throw invalid();
  if (match[8]) {
    const parsed = new Date(value.replace(' ', 'T'));
    if (!Number.isFinite(parsed.getTime())) throw invalid();
    return parsed.toISOString();
  }
  const local = new Date(year, month - 1, day, hours, minutes, seconds, millis);
  // Reject nonexistent local wall times at daylight-saving transitions.
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day || local.getHours() !== hours || local.getMinutes() !== minutes) throw invalid();
  return local.toISOString();
}

/** Keep storage timestamps out of the editor without changing the saved instant. */
export function formatTaskDeadline(value:string|null|undefined,includeTime=false):string {
  if(!value)return '';
  if(!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(value))return value;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return value;
  const pad=(part:number)=>String(part).padStart(2,'0');
  const day=`${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()}`;
  let display=day;
  if(includeTime||date.getHours()!==23||date.getMinutes()!==59||date.getSeconds()!==59||date.getMilliseconds()!==999){
    display+=` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if(date.getSeconds()||date.getMilliseconds())display+=`:${pad(date.getSeconds())}`;
    if(date.getMilliseconds())display+=`.${String(date.getMilliseconds()).padStart(3,'0')}`;
  }
  // Preserve the offset for ambiguous daylight-saving wall times.
  return normalizeTaskDeadline(display)===date.toISOString()?display:value;
}

export function normalizePlannerWindow(start:string,end:string):{startsAt:string;endsAt:string}{
  if(!/[ T]\d{2}:\d{2}/.test(start)||!/[ T]\d{2}:\d{2}/.test(end))throw new Error('Enter both a date and time, for example 20/09/2026 09:00.');
  const startsAt=normalizeTaskDeadline(start),endsAt=normalizeTaskDeadline(end);
  if(!startsAt||!endsAt)throw new Error('Enter a start and end date with a time.');
  if(Date.parse(endsAt)<=Date.parse(startsAt))throw new Error('End time must be after start time.');
  return {startsAt,endsAt};
}

/** New plans start today or later; historical calendar browsing remains available. */
export function normalizeNewPlannerWindow(start:string,end:string,now=new Date()){
  const window=normalizePlannerWindow(start,end);
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(Date.parse(window.startsAt)<today.getTime())throw new Error('Past dates are unavailable for planning. Choose today or a later date.');
  return window;
}
