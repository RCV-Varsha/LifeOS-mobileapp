export type Project={id:string;title:string;description:string;goal_id:string|null;status:'active'|'paused'|'completed'|'archived';deadline:string|null;revision:number;updated_at:string};
export type WorkspaceTask={id:string;instruction:string;description:string;project_id:string|null;parent_task_id?:string|null;subtask_progress?:{completed:number;total:number};planned_minutes:number;actual_minutes:number|null;status:'pending'|'completed';priority:number;category:string;deadline:string|null;revision:number;updated_at:string;dependencies:string[]};
export type KnowledgeItem={id:string;title:string;content:string;kind:'note'|'document'|'idea'|'resource'|'concept'|'decision';project_id:string|null;source_url:string|null;revision:number;updated_at:string};
export type Change=
 | {kind:'create_task';title:string;description:string;projectId:string|null;parentTaskId?:string|null;minutes:number;deadline:string|null}
 | {kind:'schedule_task';taskId:string;revision:number;startsAt:string;endsAt:string}
 | {kind:'link';sourceId:string;targetId:string;type:'related_to'|'supports'|'informs'|'contradicts'|'references'};
export type Proposal={id:string;source:string;summary:string;changes:Change[];status:'pending'|'applied'|'rejected'|'undone';created_at:string;result:unknown};
export type Source={id:string;kind:string;title:string;excerpt:string;reason:string;score:number};
export type AssistantAnswer={answer:string;sources:Source[];proposal:Proposal|null;intent:string};
