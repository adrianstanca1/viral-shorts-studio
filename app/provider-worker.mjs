import fs from 'node:fs';
import path from 'node:path';
import { claimProviderJobs, releaseProviderJob, failProviderJob } from './provider-job-router.mjs';
import { executeProviderJob, providerWorkerInventory } from './provider-adapters.mjs';

const DATA=process.env.DATA_DIR||'/app/data';
const API=process.env.STUDIO_INTERNAL_URL||'http://viral-shorts:3010';
const TOKEN=process.env.PROVIDER_WORKER_TOKEN||'';
const workerId=`worker-${process.pid}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const heartbeat=extra=>fs.writeFileSync(path.join(DATA,'provider-worker-status.json'),JSON.stringify({workerId,updatedAt:new Date().toISOString(),inventory:providerWorkerInventory(),...extra},null,2));

async function resolveLocal(job,result){
  const r=await fetch(`${API}/api/provider-jobs/${job.id}/resolve-local`,{method:'POST',headers:{'content-type':'application/json','x-provider-worker-token':TOKEN},body:JSON.stringify({localFile:result.file,kind:result.kind,model:result.model}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`studio resolve-local HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
  return r.json();
}

async function runOne(provider){
  const [job]=claimProviderJobs(DATA,{provider,limit:1,workerId,leaseSeconds:300});
  if(!job)return false;
  try{
    const result=await executeProviderJob(job,path.join(DATA,'provider-assets',provider));
    await resolveLocal(job,result); heartbeat({lastJob:{id:job.id,provider,status:'completed'}});
  }catch(error){
    const msg=String(error?.message||error).slice(0,500);
    if(error?.retryable===false)failProviderJob(DATA,job.id,msg); else releaseProviderJob(DATA,job.id,msg);
    heartbeat({lastJob:{id:job.id,provider,status:error?.retryable===false?'failed':'released',error:msg}});
  }
  return true;
}
async function cycle(){
  const inv=providerWorkerInventory(); heartbeat({state:'idle'});
  for(const p of inv.filter(x=>x.executable)){
    const did=await runOne(p.id); if(did)return;
  }
}

console.log('provider worker starting',workerId);
while(true){
  try{await cycle();}catch(error){heartbeat({state:'error',error:String(error?.message||error).slice(0,500)});}
  await sleep(15000);
}
