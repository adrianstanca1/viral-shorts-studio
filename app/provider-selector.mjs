import { readVerification } from './provider-verifier.mjs';
import { providerWorkerInventory } from './provider-adapters.mjs';
import { listProviderJobs } from './provider-job-router.mjs';

const kindFor=id=>id==='higgsfield'?'video':'image';
const rank={huggingface:30,nvidia:28,higgsfield:20,fal:10,external:1};

export function canQueueFreeProvider(route={}){
  return !!route?.verifiedFree && !!route?.executable && !route?.connectorOnly && Number(route?.remaining??route?.availableRemaining??0)>0;
}

export function chooseFreeProvider(root,requested='auto'){
  const state=readVerification(root),inv=providerWorkerInventory(root),activeJobs=listProviderJobs(root).filter(x=>['pending','leased'].includes(x.status));
  const rows=inv.map(x=>{const reserved=activeJobs.filter(j=>j.provider===x.id).length;return {...x,evidence:state.providers?.[x.id]||null,kind:kindFor(x.id),reserved,availableRemaining:Math.max(0,Number(x.remaining||0)-reserved)};});
  if(requested&&requested!=='auto'){
    const exact=rows.find(x=>x.id===requested);
    return exact&&exact.verifiedFree&&exact.availableRemaining>0?{...exact,remaining:exact.availableRemaining}:null;
  }
  return rows.filter(x=>x.verifiedFree&&x.availableRemaining>0)
    .sort((a,b)=>(Number(b.executable)-Number(a.executable))*100+(rank[b.id]||0)-(rank[a.id]||0)).map(x=>({...x,remaining:x.availableRemaining}))[0]||null;
}

export function freeProviderSummary(root){
  const rows=providerWorkerInventory(root);
  return {available:rows.map(x=>{const reserved=listProviderJobs(root).filter(j=>['pending','leased'].includes(j.status)&&j.provider===x.id).length;return {...x,reserved,availableRemaining:Math.max(0,Number(x.remaining||0)-reserved)}}).filter(x=>x.verifiedFree&&x.availableRemaining>0).map(x=>({id:x.id,remaining:x.remaining,reserved:x.reserved,availableRemaining:x.availableRemaining,executable:x.executable,connectorOnly:x.connectorOnly})),selected:chooseFreeProvider(root,'auto')?.id||null};
}
