export type CalendarEntry={id:string;title:string;starts_at:string;ends_at:string};
export function calendarDayKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function calendarMonth(date:Date){
  const start=new Date(date.getFullYear(),date.getMonth(),1);
  const end=new Date(date.getFullYear(),date.getMonth()+1,1);
  const offset=(start.getDay()+6)%7;
  const count=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  const cells=Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{
    const day=index-offset+1;
    return day<1||day>count?null:new Date(date.getFullYear(),date.getMonth(),day);
  });
  return {start,end,cells};
}
export function eventsOnDay(entries:CalendarEntry[],date:Date){
  const start=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();
  const end=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
  return entries.filter(event=>Date.parse(event.starts_at)<end&&Date.parse(event.ends_at)>start).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||a.id.localeCompare(b.id));
}
