export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new ApiError(400,'invalid_input','Expected a JSON object.');
  return value as Record<string,unknown>;
}
export function text(value: unknown, name: string, max=200, min=1): string {
  if(typeof value!=='string'||value.trim().length<min||value.length>max) throw new ApiError(400,'invalid_input',`${name} must contain ${min}–${max} characters.`);
  return value.trim();
}
export function id(value: unknown): string {
  const result=text(value,'ID',36);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new ApiError(400,'invalid_id','Invalid ID.');
  return result;
}
export function integer(value: unknown,name:string,min:number,max:number):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max) throw new ApiError(400,'invalid_input',`${name} must be an integer from ${min} to ${max}.`);
  return value;
}
export function choice<const T extends string>(value:unknown, values:readonly T[], name:string):T {
  if(typeof value!=='string'||!values.includes(value as T)) throw new ApiError(400,'invalid_input',`Invalid ${name}.`);
  return value as T;
}
export function timestamp(value:unknown):string {
  const result=text(value,'Timestamp',40);
  if(!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(result)||!Number.isFinite(Date.parse(result))) throw new ApiError(400,'invalid_input','Provide an ISO timestamp with timezone.');
  return new Date(result).toISOString();
}
export function keys(value:Record<string,unknown>, allowed:readonly string[]) {
  if(Object.keys(value).some(k=>!allowed.includes(k))) throw new ApiError(400,'invalid_input','Unexpected input field.');
}
