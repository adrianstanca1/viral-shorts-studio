import fs from 'node:fs';
import path from 'node:path';

const truthy=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
const now=()=>new Date().toISOString();
const stateFile=root=>path.join(root,'provider-verification.json');
const empty=()=>({version:1,updatedAt:now(),providers:{}});

export function readVerification(root){
  try{return JSON.parse(fs.readFileSync(stateFile(root),'utf8'))}catch{return empty()}
}
export function writeVerification(root,state){
  state.updatedAt=now();fs.writeFileSync(stateFile(root),JSON.stringify(state,null,2));return state;
}
export function providerEvidence(root,id){return readVerification(root).providers?.[id]||null}

function base(id){return {id,checkedAt:now(),authenticated:false,zeroCostVerified:false,active:false,reason:'not checked'}}
async function checkHf(){
  const out=base('huggingface'),token=process.env.HF_TOKEN||'';if(!token){out.reason='credential unavailable';return out}
  try{const r=await fetch('https://huggingface.co/api/whoami-v2',{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});out.authenticated=r.ok;out.httpStatus=r.status;out.reason=r.ok?'authentication verified; zero-cost generation not proven':'authentication rejected'}catch(e){out.reason=String(e.message||e)}
  return out;
}
async function checkNvidia(){
  const out=base('nvidia'),token=process.env.NVIDIA_API_KEY||'';if(!token){out.reason='credential unavailable';return out}
  try{const r=await fetch('https://integrate.api.nvidia.com/v1/models',{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});out.authenticated=r.ok;out.httpStatus=r.status;out.reason=r.ok?'authentication verified; zero-cost generation not proven':'authentication rejected'}catch(e){out.reason=String(e.message||e)}
  return out;
}
export async function verifyProviders(root){
  const previous=readVerification(root),providers={...(previous.providers||{})};
  for(const result of await Promise.all([checkHf(),checkNvidia()])){
    const prior=providers[result.id]||{};
    providers[result.id]={...prior,...result,zeroCostVerified:prior.zeroCostVerified===true&&Number(prior.remaining||0)>0,active:false};
  }
  for(const id of ['huggingface','nvidia']){
    const p=providers[id];p.active=!!(p.authenticated&&p.zeroCostVerified&&Number(p.remaining||0)>0&&truthy(process.env[`${id==='huggingface'?'HF':'NVIDIA'}_GENERATION_ENABLED`]));
  }
  return writeVerification(root,{version:1,providers});
}
export function recordFreeEvidence(root,input={}){
  const id=String(input.provider||'').toLowerCase();if(!['higgsfield','huggingface','nvidia','fal','external'].includes(id))throw new Error('unsupported provider');
  const remaining=Math.max(0,Number(input.remaining||0)),zeroCost=input.zeroCost===true;
  const state=readVerification(root),prior=state.providers[id]||base(id);
  state.providers[id]={...prior,id,checkedAt:now(),source:String(input.source||'trusted-evidence').slice(0,120),evidence:String(input.evidence||'').slice(0,500),remaining,zeroCostVerified:zeroCost&&remaining>0,active:false};
  return writeVerification(root,state).providers[id];
}
