/** Present older decision records without repeated generated metadata. Storage stays intact. */
export function knowledgePreview(item:{title:string;content:string;kind:string}){
  if(item.kind!=='decision')return item.content.trim()===item.title.trim()?'':item.content.trim();
  const seen=new Set([item.title.trim().toLocaleLowerCase()]);
  return item.content.split('\n').flatMap(line=>{
    const match=/^(Context|Options|Recorded reasoning):\s*(.*)$/.exec(line.trim());
    const value=(match?match[2]:line).trim(),key=value.toLocaleLowerCase();
    if(!value||seen.has(key))return [];
    seen.add(key);
    const label=match?({Context:'Background',Options:'Alternatives','Recorded reasoning':'Why'}[match[1]]):'';
    return [label?`${label}: ${value}`:value];
  }).join('\n');
}
