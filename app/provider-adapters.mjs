import fs from 'node:fs';
import path from 'node:path';

const truthy=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
const safeName=s=>String(s||'asset').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

function providerConfig(id){
  if(id==='huggingface')return {enabled:truthy(process.env.HF_GENERATION_ENABLED),verifiedFree:truthy(process.env.HF_GENERATION_VERIFIED_FREE),token:process.env.HF_TOKEN||'',kind:'image',model:process.env.HF_IMAGE_MODEL||'black-forest-labs/FLUX.1-schnell'};
  if(id==='nvidia')return {enabled:truthy(process.env.NVIDIA_GENERATION_ENABLED),verifiedFree:truthy(process.env.NVIDIA_GENERATION_VERIFIED_FREE),token:process.env.NVIDIA_API_KEY||'',kind:'image',model:process.env.NVIDIA_IMAGE_MODEL||'',endpoint:process.env.NVIDIA_IMAGE_ENDPOINT||''};
  return {enabled:false,verifiedFree:false,kind:null};
}

export function providerWorkerInventory(){
  return ['huggingface','nvidia','higgsfield','fal','external'].map(id=>{
    const c=providerConfig(id);
    const connectorOnly=id==='higgsfield';
    return {id,enabled:!!c.enabled,verifiedFree:!!c.verifiedFree,executable:!!(c.enabled&&c.verifiedFree&&c.token&&(id!=='nvidia'||c.endpoint)),connectorOnly};
  });
}
async function saveResponse(r,dest){
  if(!r.ok)throw new Error(`provider HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
  const type=(r.headers.get('content-type')||'').toLowerCase();
  if(type.includes('application/json')){
    const j=await r.json(); const b64=j.image||j.data?.[0]?.b64_json;
    if(!b64)throw new Error('provider returned JSON without image bytes');
    fs.writeFileSync(dest,Buffer.from(b64,'base64')); return dest;
  }
  fs.writeFileSync(dest,Buffer.from(await r.arrayBuffer())); return dest;
}

async function huggingface(job,outDir,c){
  const url=`https://router.huggingface.co/hf-inference/models/${encodeURIComponent(c.model).replace(/%2F/g,'/')}`;
  const r=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${c.token}`,'content-type':'application/json'},body:JSON.stringify({inputs:job.prompt,parameters:{width:576,height:1024}}),signal:AbortSignal.timeout(120000)});
  return saveResponse(r,path.join(outDir,`${safeName(job.id)}.jpg`));
}

async function nvidia(job,outDir,c){
  const r=await fetch(c.endpoint,{method:'POST',headers:{authorization:`Bearer ${c.token}`,'content-type':'application/json'},body:JSON.stringify({prompt:job.prompt,model:c.model||undefined,width:576,height:1024}),signal:AbortSignal.timeout(120000)});
  return saveResponse(r,path.join(outDir,`${safeName(job.id)}.jpg`));
}

export async function executeProviderJob(job,outDir){
  const c=providerConfig(job.provider);
  if(!c.enabled||!c.verifiedFree)throw Object.assign(new Error('provider is not verified-free/enabled'),{retryable:false});
  if(!c.token)throw Object.assign(new Error('provider credential unavailable'),{retryable:false});
  fs.mkdirSync(outDir,{recursive:true});
  if(job.provider==='huggingface')return {file:await huggingface(job,outDir,c),kind:'image',provider:job.provider,model:c.model};
  if(job.provider==='nvidia'){
    if(!c.endpoint)throw Object.assign(new Error('NVIDIA image endpoint not configured'),{retryable:false});
    return {file:await nvidia(job,outDir,c),kind:'image',provider:job.provider,model:c.model};
  }
  throw Object.assign(new Error('provider has no direct VPS adapter'),{retryable:false});
}
