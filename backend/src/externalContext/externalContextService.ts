import type { PlanningTask } from '../adaptivePlanning/types.ts';
import { CalendarProvider, calendarConfigFromEnv } from './calendarProvider.ts';
import type { ExternalContextReader, ExternalPlanningContext } from './types.ts';
import { WeatherProvider, weatherConfigFromEnv } from './weatherProvider.ts';

export class ExternalContextService implements ExternalContextReader{
  private readonly calendar:CalendarProvider;private readonly weather:WeatherProvider;
  constructor(calendar=new CalendarProvider(calendarConfigFromEnv()),weather=new WeatherProvider(weatherConfigFromEnv())){this.calendar=calendar;this.weather=weather;}
  async forPlanning(ownerId:string,_timeZone:string,tasks:PlanningTask[],now=new Date()):Promise<ExternalPlanningContext>{const [calendar,weather]=await Promise.all([this.calendar.load(ownerId,now),this.weather.load(ownerId,now)]);const explicitOutdoor=tasks.filter((task)=>task.status==='pending'&&/\b(outdoor|outside|open-air)\b/i.test(task.instruction)).map((task)=>task.id);return{calendar,weather:{...weather,relevantToTaskIds:weather.state==='AVAILABLE'?explicitOutdoor:[]}};}
}
