import type { PlanningTask } from '../adaptivePlanning/types.ts';

export type SourceState='AVAILABLE'|'UNAVAILABLE'|'STALE';
export type CalendarCommitment={title:string;startsAt:string;endsAt:string;durationMinutes:number;minutesUntilStart:number};
export type CalendarContext={state:SourceState;source:'ICAL';observedAt:string;freshUntil:string|null;nextCommitment:CalendarCommitment|null;freeMinutesBeforeNext:number|null};
export type WeatherWindow={startsAt:string;endsAt:string;temperatureC:number;precipitationProbability:number};
export type WeatherContext={state:SourceState;source:'OPEN_METEO';observedAt:string;freshUntil:string|null;location:string|null;window:WeatherWindow|null;relevantToTaskIds:string[]};
export type ExternalPlanningContext={calendar:CalendarContext;weather:WeatherContext};
export type ExternalContextReader={forPlanning(ownerId:string,timeZone:string,tasks:PlanningTask[],now?:Date):Promise<ExternalPlanningContext>};
