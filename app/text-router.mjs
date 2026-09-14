import fs from 'node:fs';
import path from 'node:path';
import { freeRouter } from './free-router.mjs';
import { pickCloudModel, textModelCatalog } from './text-model-policy.mjs';

const truthy=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
const DATA=process.env.DATA_DIR||'/app/data';
const failuresUntil=new Map();
const cooling=id=>Number(failuresUntil.get(id)||0)>Date.now();
const cool=(id,ms)=>failuresUntil.set(id,Date.now()+ms);
async function jsonFetch(url,options={},timeout=45000){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});
  const text=await r.text(); let data={}; try{data=JSON.parse(text)}catch{}
  if(!r.ok)throw Object.assign(new Error(`HTTP ${r.status}`),{status:r.status,body:text.slice(0,300)});
  return data;
}
function validateOutput(text,validate){
  let out=String(text||'').trim();if(!out)throw new Error('empty response');
  if(validate&&!validate(out)){
    const a=out.indexOf('['),b=out.lastIndexOf(']');
    if(a>=0&&b>a&&validate(out.slice(a,b+1)))out=out.slice(a,b+1);else throw new Error('validation failed');
  }
  return out;
}
function tokens(target){return Math.max(128,Math.min(4096,Number(target||500)*2));}
async function ollamaLocal(req){
  const url=(process.env.OLLAMA_URL||'http://ollama:11434').replace(/\/$/,'');
  const strong=Number(req.target||0)>=900||req.quality==='strong';
  const model=strong?(process.env.OLLAMA_MODEL||'qwen3:4b'):(process.env.OLLAMA_MODEL_FAST||'qwen3:1.7b');
  const data=await jsonFetch(url+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,stream:false,think:false,keep_alive:'30m',options:{temperature:.25,num_predict:tokens(req.target)}})},120000);
  return {text:validateOutput(data.message?.content,req.validate),provider:'ollama-local',model,tier:'local'};
}
async function ollamaCloud(req){
  if(!truthy(process.env.OLLAMA_CLOUD_ENABLED)||!process.env.OLLAMA_API_KEY)throw new Error('disabled');
  const model=process.env.OLLAMA_CLOUD_MODEL||pickCloudModel('ollama',req)||'gpt-oss:20b-cloud';
  const data=await jsonFetch('https://ollama.com/api/chat',{method:'POST',headers:{authorization:`Bearer ${process.env.OLLAMA_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,stream:false,think:false,options:{temperature:.25,num_predict:tokens(req.target)}})},120000);
  return {text:validateOutput(data.message?.content,req.validate),provider:'ollama-cloud',model,tier:'cloud-included'};
}
function usageFile(){return path.join(DATA,'hf-cloud-usage.json')}
function hfAllowance(){
  const day=new Date().toISOString().slice(0,10),limit=Math.max(0,Number(process.env.HF_FREE_DAILY_CALLS||2));
  let state={day,calls:0};try{state=JSON.parse(fs.readFileSync(usageFile(),'utf8'))}catch{}
  if(state.day!==day)state={day,calls:0};return {state,limit,remaining:Math.max(0,limit-Number(state.calls||0))};
}
async function huggingFaceCloud(req){
  if(!truthy(process.env.HF_CLOUD_ENABLED)||!process.env.HF_TOKEN)throw new Error('disabled');
  const allowance=hfAllowance();if(allowance.remaining<=0)throw new Error('daily free-tier guard exhausted');
  const model=process.env.HF_TEXT_MODEL||pickCloudModel('huggingface',req)||'openai/gpt-oss-20b';
  const data=await jsonFetch('https://router.huggingface.co/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${process.env.HF_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,max_tokens:tokens(req.target),temperature:.25})},90000);
  allowance.state.calls=Number(allowance.state.calls||0)+1;fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(usageFile(),JSON.stringify(allowance.state,null,2));
  return {text:validateOutput(data.choices?.[0]?.message?.content,req.validate),provider:'huggingface-cloud',model,tier:'hf-free-credit'};
}
async function nvidiaComplete(req){
  const key=process.env.NVIDIA_API_KEY;if(!key||process.env.NVIDIA_ENABLED!=='true')throw new Error('disabled');
  const model=process.env.NVIDIA_MODEL||'nvidia/llama-3.1-nemotron-70b-instruct';
  const data=await jsonFetch('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,max_tokens:tokens(req.target),temperature:.25})},60000);
  return {text:validateOutput(data.choices?.[0]?.message?.content,req.validate),provider:'nvidia',model};
}
export async function completeText(req){
  const order=String(process.env.TEXT_PROVIDER_ORDER||'ollama,ollama-cloud,huggingface,openrouter,nvidia').split(',').map(x=>x.trim()).filter(Boolean),failures=[];
  for(const id of order){try{
    if(id==='ollama'&&process.env.OLLAMA_ENABLED!=='false')return await ollamaLocal(req);
    if(id==='ollama-cloud'){if(cooling(id))throw new Error('cooldown');try{return await ollamaCloud(req)}catch(e){if([401,403].includes(e.status))cool(id,30*60*1000);throw e}}
    if(id==='huggingface'){if(cooling(id))throw new Error('cooldown');try{return await huggingFaceCloud(req)}catch(e){if([401,402,403,429].includes(e.status))cool(id,30*60*1000);throw e}}
    if(id==='openrouter'&&freeRouter.status().enabled)return {text:await freeRouter.complete(req),provider:'openrouter',model:freeRouter.status().models?.[0]};
    if(id==='nvidia')return await nvidiaComplete(req);
  }catch(e){failures.push({id,error:String(e.message||e).slice(0,140)})}}
  throw Object.assign(new Error('No allowed text provider available'),{failures});
}
export async function textProviderStatus(){
  const out={localFirst:true,paidFallback:false,catalog:textModelCatalog(),providers:[]};
  const ollamaUrl=(process.env.OLLAMA_URL||'http://ollama:11434').replace(/\/$/,'');
  try{const d=await jsonFetch(ollamaUrl+'/api/tags',{},3000);out.providers.push({id:'ollama-local',enabled:process.env.OLLAMA_ENABLED!=='false',status:'available',fastModel:process.env.OLLAMA_MODEL_FAST||'qwen3:1.7b',strongModel:process.env.OLLAMA_MODEL||'qwen3:4b',models:(d.models||[]).map(x=>x.name).slice(0,12)});}catch{out.providers.push({id:'ollama-local',enabled:false,status:'unavailable'});}
  out.providers.push({id:'ollama-cloud',enabled:truthy(process.env.OLLAMA_CLOUD_ENABLED)&&!!process.env.OLLAMA_API_KEY,status:truthy(process.env.OLLAMA_CLOUD_ENABLED)?'configured':'disabled',model:process.env.OLLAMA_CLOUD_MODEL||pickCloudModel('ollama',{task:'storyboard',quality:'strong'}),policy:'included-plan/cloud fallback'});
  const hf=hfAllowance();out.providers.push({id:'huggingface-cloud',enabled:truthy(process.env.HF_CLOUD_ENABLED)&&!!process.env.HF_TOKEN,status:truthy(process.env.HF_CLOUD_ENABLED)?'guarded-free-tier':'disabled',model:process.env.HF_TEXT_MODEL||pickCloudModel('huggingface',{task:'storyboard',quality:'strong'}),dailyCallGuard:hf.limit,remainingToday:hf.remaining});
  const or=freeRouter.status();out.providers.push({id:'openrouter',enabled:!!or.enabled,status:or.status||'disabled',models:or.models||[],freeOnly:true});
  out.providers.push({id:'nvidia',enabled:process.env.NVIDIA_ENABLED==='true',configured:!!process.env.NVIDIA_API_KEY,status:process.env.NVIDIA_ENABLED==='true'?'enabled':'disabled-unverified-generation',model:process.env.NVIDIA_MODEL||'nvidia/llama-3.1-nemotron-70b-instruct'});
  return out;
}
