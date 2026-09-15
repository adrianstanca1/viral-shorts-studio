import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const file=root=>path.join(root,'execution-journal.json');
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,entries:[]}}};
const write=(root,s)=>{fs.mkdirSync(root,{recursive:true});const f=file(root),t=f+'.tmp';fs.writeFileSync(t,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(t,f);return s};
export function recordExecution(root,input={}){const s=read(root),entry={id:crypto.randomUUID(),backlogId:String(input.backlogId||''),type:String(input.type||''),status:String(input.status||'completed'),output:input.output||null,error:input.error?String(input.error).slice(0,400):null,batchId:input.batchId||null,createdAt:new Date().toISOString(),policy:{ownerConfirmed:input.ownerConfirmed===true,autoPublish:false,freeOnly:true}};s.entries=[entry,...s.entries].slice(0,1000);write(root,s);return entry}
export function listExecutions(root,{limit=50}={}){return (read(root).entries||[]).slice(0,Math.max(1,Math.min(200,Number(limit||50))))}

export function completedExecutionForBacklog(root,backlogId){return (read(root).entries||[]).find(x=>x.backlogId===String(backlogId)&&x.status==='completed')||null}
