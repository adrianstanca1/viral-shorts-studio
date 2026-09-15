import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const file=root=>path.join(root,'agent-handoffs.json');
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,handoffs:[]}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const f=file(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,f);return state};
export function listAgentHandoffs(root,{runId=''}={}){return (read(root).handoffs||[]).filter(x=>!runId||x.runId===runId)}
export function createAgentHandoff(root,input={}){const runId=String(input.runId||'').trim(),from=String(input.from||'').trim(),to=String(input.to||'').trim();if(!runId||!from||!to)throw Error('runId, from and to are required');const state=read(root),item={id:crypto.randomUUID(),runId,from,to,status:'pending',summary:String(input.summary||'').slice(0,1200),evidence:input.evidence||null,createdAt:new Date().toISOString()};state.handoffs=[item,...state.handoffs].slice(0,1000);write(root,state);return item}
export function completeAgentHandoff(root,id,patch={}){const state=read(root),item=(state.handoffs||[]).find(x=>x.id===id);if(!item)throw Error('handoff not found');item.status='complete';item.summary=String(patch.summary??item.summary??'').slice(0,1200);if(patch.evidence!==undefined)item.evidence=patch.evidence;item.completedAt=new Date().toISOString();write(root,state);return item}
export function ensureAgentHandoffs(root,runId,plan={}){const existing=listAgentHandoffs(root,{runId});if(existing.length)return existing;return (plan.handoffs||[]).map(h=>createAgentHandoff(root,{runId,...h,summary:`${h.from} -> ${h.to}`}))}

export function syncAgentHandoffs(root,run={}){
  const rows=listAgentHandoffs(root,{runId:run.id});if(!rows.length)return rows;
  const completeTo=new Set(['growth','creative','production']);
  if(['awaiting-approval'].includes(run.status)){completeTo.add('qa');completeTo.add('publishing')}
  else if(['needs-attention'].includes(run.status)){completeTo.add('qa')}
  for(const h of rows){if(completeTo.has(h.to)&&h.status!=='complete')completeAgentHandoff(root,h.id,{summary:`${h.from} handed context to ${h.to}`})}
  return listAgentHandoffs(root,{runId:run.id});
}
