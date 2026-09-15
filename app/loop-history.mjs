import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const file=root=>path.join(root,'loop-history.json');
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,cycles:[]}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const f=file(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,f);return state};
export function recordLoopCycle(root,input={}){const s=read(root),item={id:crypto.randomUUID(),createdAt:new Date().toISOString(),actions:(input.actions||[]).slice(0,30),campaignReports:Number(input.campaignReports||0),runsChecked:Number(input.runsChecked||0),recoveries:Number(input.recoveries||0),policy:{autoPublish:false,ownerConfirmed:input.ownerConfirmed===true}};s.cycles=[item,...(s.cycles||[])].slice(0,200);write(root,s);return item}
export function listLoopCycles(root,{limit=30}={}){return (read(root).cycles||[]).slice(0,Math.max(1,Math.min(100,Number(limit||30))))}
