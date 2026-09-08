import { isObject } from './validation.ts';

export type OutcomeSuggestion = { outcome: { title: string; description: string }; milestones: { title: string; description: string; sequence: number }[] };
function boundedText(value:unknown,max:number){if(typeof value!=='string')throw new Error('Expected text');const result=value.trim();if(result.length<3||result.length>max)throw new Error('Invalid suggestion text');return result;}
export function validateOutcomeSuggestion(value:unknown):OutcomeSuggestion{
  if(!isObject(value)||Object.keys(value).length!==2||!isObject(value.outcome)||Object.keys(value.outcome).length!==2||!Array.isArray(value.milestones)||value.milestones.length>8)throw new Error('Invalid outcome suggestion');
  const outcome={title:boundedText(value.outcome.title,200),description:boundedText(value.outcome.description,1000)};
  const milestones=value.milestones.map((item,index)=>{if(!isObject(item)||Object.keys(item).length!==3||item.sequence!==index+1)throw new Error('Invalid milestone suggestion');return{title:boundedText(item.title,200),description:boundedText(item.description,1000),sequence:index+1};});
  return{outcome,milestones};
}
export const outcomeSuggestionJsonSchema={type:'object',additionalProperties:false,required:['outcome','milestones'],properties:{outcome:{type:'object',additionalProperties:false,required:['title','description'],properties:{title:{type:'string'},description:{type:'string'}}},milestones:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['title','description','sequence'],properties:{title:{type:'string'},description:{type:'string'},sequence:{type:'integer',minimum:1,maximum:8}}}}}} as const;
