import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const f=r=>path.join(r,'creator-runs.json');function read(r){try{return JSON.parse(fs.readFileSync(f(r),'utf8'))}catch{return {runs:[]}}}function write(r,x){fs.mkdirSync(r,{recursive:true});const t=f(r)+'.tmp';fs.writeFileSync(t,JSON.stringify(x,null,2),{mode:0o600});fs.renameSync(t,f(r))}
export function listRuns(r){return read(r).runs||[]}
export function createRun(r,plan){const run={id:crypto.randomUUID(),goal:plan.goal,status:'running',costPolicy:'free-only',approvalRequired:true,createdAt:new Date().toISOString(),steps:plan.steps.map((s,i)=>({...s,index:i,status:'pending'})),artifacts:[]};const x=read(r);x.runs=[run,...(x.runs||[])].slice(0,100);write(r,x);return run}
export function updateRun(r,id,patch){const x=read(r),i=x.runs.findIndex(v=>v.id===id);if(i<0)return null;x.runs[i]={...x.runs[i],...patch,updatedAt:new Date().toISOString()};write(r,x);return x.runs[i]}

export function syncRunWithProjects(r,run,projectLookup){
  const videos=(run.artifacts||[]).filter(a=>a.type==='video'&&a.id).map(a=>projectLookup(a.id)).filter(Boolean);
  if(!videos.length)return run;
  const failed=videos.find(v=>v.status==='failed');
  const active=videos.find(v=>!['complete','failed'].includes(v.status));
  let status=run.status,checkpoint=run.checkpoint||null;
  if(failed){status='needs-attention';checkpoint={stage:'video-failed',projectId:failed.id,error:String(failed.error||'render failed').slice(0,240)};}
  else if(active){status='producing';checkpoint={stage:'video-production',projectId:active.id,progress:Number(active.progress||0)};}
  else if(videos.every(v=>v.status==='complete')){const ready=videos.every(v=>v.qa?.launchReady===true);status=ready?'awaiting-approval':'needs-attention';checkpoint={stage:ready?'approval':'qa-review',projectIds:videos.map(v=>v.id),launchReady:ready};}
  if(status===run.status&&JSON.stringify(checkpoint)===JSON.stringify(run.checkpoint||null))return run;
  return updateRun(r,run.id,{status,checkpoint});
}
