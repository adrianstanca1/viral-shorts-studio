import fs from 'node:fs';
import path from 'node:path';
import { freeRouter } from './free-router.mjs';
import { cloudModels, pickCloudModel, textModelCatalog } from './text-model-policy.mjs';

const truthy=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
const DATA=process.env.DATA_DIR||'/app/data';
const failuresUntil=new Map();
const telemetry=new Map();
const learningFile=()=>path.join(DATA,'text-router-learning.json');
let learning={version:2,providers:{},models:{}};try{learning=JSON.parse(fs.readFileSync(learningFile(),'utf8'))}catch{};learning.version=2;learning.providers??={};learning.models??={};
const saveLearning=()=>{try{fs.mkdirSync(DATA,{recursive:true});const f=learningFile(),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(learning,null,2),{mode:0o600});fs.renameSync(tmp,f);}catch{}};
const taskBucket=req=>String(req.task||'general').toLowerCase();
export function learnedProviderScore(stats={},now=Date.now()){const attempts=Number(stats.attempts||0),successes=Number(stats.successes||0),latency=Math.max(0,Number(stats.latencyMs||0)),stamp=Date.parse(stats.lastAttemptAt||'');const ageDays=Number.isFinite(stamp)?Math.max(0,(now-stamp)/86400000):0,ageWeight=Math.pow(.5,ageDays/14),effectiveAttempts=attempts*ageWeight,effectiveSuccesses=successes*ageWeight;const successRate=(effectiveSuccesses+3)/(effectiveAttempts+4),latencyScore=Math.max(0,1-Math.min(120000,latency)/120000),confidence=Math.min(1,effectiveAttempts/10);return Number(((successRate*.78+latencyScore*.22)*(0.65+confidence*.35)*100).toFixed(2));}
export const learnedEligible=(stats={},min=3)=>Number(stats.attempts||0)>=Math.max(1,Number(min||3));
const learnedStats=(id,req)=>learning.providers?.[id]?.[taskBucket(req)]||{};
const learnedModelStats=(id,model,req)=>learning.models?.[id]?.[model]?.[taskBucket(req)]||{};
const rememberModel=(id,model,req,ok,ms,error='')=>{if(!model)return;learning.models??={};learning.models[id]??={};learning.models[id][model]??={};const key=taskBucket(req),x=learning.models[id][model][key]||{attempts:0,successes:0,failures:0,latencyMs:0};x.attempts++;if(ok)x.successes++;else x.failures++;x.latencyMs=Math.round(Number(x.latencyMs||0)*.75+ms*.25);x.lastError=ok?null:String(error||'').slice(0,120);x.lastAttemptAt=new Date().toISOString();learning.models[id][model][key]=x;saveLearning();};
const modelPrior=(m,req)=>Number(m.tasks?.includes(req.task))*10+Number(req.quality==='strong'&&m.role==='strong')*7+Number(req.quality!=='strong'&&m.role==='balanced')*5;
export function rankedCloudModels(provider,req={}){const id=provider==='ollama-cloud'?'ollama':provider==='huggingface'?'huggingface':provider;return cloudModels(id).map((m,i)=>{const stats=learnedModelStats(provider,m.id,req),learnedScore=learnedProviderScore(stats),learnedBonus=learnedEligible(stats)?learnedScore:0;return {...m,_i:i,learnedScore,rankScore:modelPrior(m,req)+learnedBonus};}).sort((a,b)=>b.rankScore-a.rankScore||a._i-b._i).map(({_i,...m})=>m);};

function learnedLeaderboards(){
  const providers=[];for(const [provider,tasks] of Object.entries(learning.providers||{}))for(const [task,stats] of Object.entries(tasks||{}))providers.push({provider,task,attempts:Number(stats.attempts||0),successes:Number(stats.successes||0),failures:Number(stats.failures||0),latencyMs:Number(stats.latencyMs||0),score:learnedProviderScore(stats),lastAttemptAt:stats.lastAttemptAt||null});
  const models=[];for(const [provider,byModel] of Object.entries(learning.models||{}))for(const [model,tasks] of Object.entries(byModel||{}))for(const [task,stats] of Object.entries(tasks||{}))models.push({provider,model,task,attempts:Number(stats.attempts||0),successes:Number(stats.successes||0),failures:Number(stats.failures||0),latencyMs:Number(stats.latencyMs||0),score:learnedProviderScore(stats),lastAttemptAt:stats.lastAttemptAt||null});
  const order=(a,b)=>b.score-a.score||b.attempts-a.attempts;return {providers:providers.sort(order).slice(0,8),models:models.sort(order).slice(0,12)};
}
const remember=(id,req,ok,ms,error='')=>{learning.providers??={};learning.providers[id]??={};const key=taskBucket(req),x=learning.providers[id][key]||{attempts:0,successes:0,failures:0,latencyMs:0};x.attempts++;if(ok)x.successes++;else x.failures++;x.latencyMs=Math.round(Number(x.latencyMs||0)*.75+ms*.25);x.lastError=ok?null:String(error||'').slice(0,120);x.lastAttemptAt=new Date().toISOString();learning.providers[id][key]=x;saveLearning();return x;};
const cooling=id=>Number(failuresUntil.get(id)||0)>Date.now();
const cool=(id,ms)=>failuresUntil.set(id,Date.now()+ms);
const note=(id,req,ok,ms,error='')=>{const x=telemetry.get(id)||{attempts:0,successes:0,failures:0,latencyMs:0};x.attempts++;if(ok)x.successes++;else x.failures++;x.latencyMs=Math.round(x.latencyMs*.7+ms*.3);x.lastError=ok?null:String(error||'').slice(0,120);x.lastAttemptAt=new Date().toISOString();telemetry.set(id,x);remember(id,req,ok,ms,error);};
const cloudTask=req=>req.quality==='strong'||['fact-check','research','reasoning'].includes(req.task);
const eligible=id=>id==='ollama'?process.env.OLLAMA_ENABLED!=='false':id==='ollama-cloud'?truthy(process.env.OLLAMA_CLOUD_ENABLED)&&!!process.env.OLLAMA_API_KEY:id==='huggingface'?truthy(process.env.HF_CLOUD_ENABLED)&&!!process.env.HF_TOKEN:id==='openrouter'?freeRouter.status().enabled:id==='nvidia'?process.env.NVIDIA_ENABLED==='true'&&!!process.env.NVIDIA_API_KEY:false;
export function textRoutingPlan(req={}){const configured=String(process.env.TEXT_PROVIDER_ORDER||'ollama,ollama-cloud,huggingface,openrouter,nvidia').split(',').map(x=>x.trim()).filter(Boolean),available=configured.filter(eligible);if(!cloudTask(req))return {mode:'local-first',configured,order:available,scores:Object.fromEntries(available.map(id=>[id,learnedProviderScore(learnedStats(id,req))]))};const local=available.filter(x=>x==='ollama'),cloud=available.filter(x=>x!=='ollama'&&!cooling(x));const index=new Map(configured.map((id,i)=>[id,i])),rank=id=>learnedEligible(learnedStats(id,req))?learnedProviderScore(learnedStats(id,req)):0;cloud.sort((a,b)=>rank(b)-rank(a)||Number(index.get(a)||0)-Number(index.get(b)||0));const order=[...cloud,...local];return {mode:'quality-first-free-cloud',configured,order,scores:Object.fromEntries(order.map(id=>[id,learnedProviderScore(learnedStats(id,req))])),minimumLearningSamples:3};}
const providerOrder=req=>{
  const configured=String(process.env.TEXT_PROVIDER_ORDER||'openrouter,ollama,huggingface,nvidia,ollama-cloud').split(',').map(x=>x.trim()).filter(Boolean);
  return configured.filter(id=>{
    if(id==='openrouter')return freeRouter.status().enabled;
    if(id==='ollama')return process.env.OLLAMA_ENABLED!=='false';
    if(id==='huggingface')return truthy(process.env.HF_CLOUD_ENABLED)&&!!process.env.HF_TOKEN;
    if(id==='nvidia')return process.env.NVIDIA_ENABLED==='true'&&!!process.env.NVIDIA_API_KEY;
    if(id==='ollama-cloud')return truthy(process.env.OLLAMA_CLOUD_ENABLED)&&!!process.env.OLLAMA_API_KEY;
    return false;
  });
};
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
function localModelFor(req){
  const fast=process.env.OLLAMA_MODEL_FAST||'qwen3:1.7b',strong=process.env.OLLAMA_MODEL||'qwen3:4b';
  if(Number(req.target||0)>=900||req.quality==='strong')return strong;
  const fs=learnedModelStats('ollama',fast,req),ss=learnedModelStats('ollama',strong,req);if(!learnedEligible(fs)||!learnedEligible(ss))return fast;
  return learnedProviderScore(ss)>learnedProviderScore(fs)+5?strong:fast;
}
async function ollamaLocal(req){
  const url=(process.env.OLLAMA_URL||'http://ollama:11434').replace(/\/$/,'');
  const model=localModelFor(req);
  try{const data=await jsonFetch(url+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,stream:false,think:false,keep_alive:'30m',options:{temperature:.25,num_predict:tokens(req.target)}})},120000);return {text:validateOutput(data.message?.content,req.validate),provider:'ollama-local',model,tier:'local'};}catch(e){e.model=model;throw e}
}
async function ollamaCloud(req){
  if(!truthy(process.env.OLLAMA_CLOUD_ENABLED)||!process.env.OLLAMA_API_KEY)throw new Error('disabled');
  const model=process.env.OLLAMA_CLOUD_MODEL||rankedCloudModels('ollama-cloud',req)[0]?.id||pickCloudModel('ollama',req)||'gpt-oss:20b-cloud';
  try{const data=await jsonFetch('https://ollama.com/api/chat',{method:'POST',headers:{authorization:`Bearer ${process.env.OLLAMA_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,stream:false,think:false,options:{temperature:.25,num_predict:tokens(req.target)}})},120000);return {text:validateOutput(data.message?.content,req.validate),provider:'ollama-cloud',model,tier:'cloud-included'};}catch(e){e.model=model;throw e}
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
  const model=process.env.HF_TEXT_MODEL||rankedCloudModels('huggingface',req)[0]?.id||pickCloudModel('huggingface',req)||'openai/gpt-oss-20b';
  try{const data=await jsonFetch('https://router.huggingface.co/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${process.env.HF_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,max_tokens:tokens(req.target),temperature:.25})},90000);allowance.state.calls=Number(allowance.state.calls||0)+1;fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(usageFile(),JSON.stringify(allowance.state,null,2));return {text:validateOutput(data.choices?.[0]?.message?.content,req.validate),provider:'huggingface-cloud',model,tier:'hf-free-credit'};}catch(e){e.model=model;throw e}
}
async function nvidiaComplete(req){
  const key=process.env.NVIDIA_API_KEY;if(!key||process.env.NVIDIA_ENABLED!=='true')throw new Error('disabled');
  const model=process.env.NVIDIA_MODEL||'nvidia/llama-3.1-nemotron-70b-instruct';
  try{const data=await jsonFetch('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages:req.messages,max_tokens:tokens(req.target),temperature:.25})},60000);return {text:validateOutput(data.choices?.[0]?.message?.content,req.validate),provider:'nvidia',model};}catch(e){e.model=model;throw e}
}
export async function completeText(req){
  const order=providerOrder(req),failures=[];
  for(const id of order){const started=Date.now();try{
    let result;
    if(id==='ollama'&&process.env.OLLAMA_ENABLED!=='false')result=await ollamaLocal(req);
    else if(id==='ollama-cloud'){if(cooling(id))throw new Error('cooldown');try{result=await ollamaCloud(req)}catch(e){if([401,403].includes(e.status))cool(id,30*60*1000);throw e}}
    else if(id==='huggingface'){if(cooling(id))throw new Error('cooldown');try{result=await huggingFaceCloud(req)}catch(e){if([401,402,403,429].includes(e.status))cool(id,30*60*1000);throw e}}
    else if(id==='openrouter'&&freeRouter.status().enabled){const text=await freeRouter.complete(req),st=freeRouter.status();result={text,provider:'openrouter',model:st.verifiedModel||st.models?.[0]};}
    else if(id==='nvidia')result=await nvidiaComplete(req);
    else continue;
    const elapsed=Date.now()-started;note(id,req,true,elapsed);rememberModel(id,result.model,req,true,elapsed);return {...result,route:{task:req.task||'general',quality:req.quality||'balanced',order}};
  }catch(e){const elapsed=Date.now()-started;note(id,req,false,elapsed,e.message||e);if(e.model)rememberModel(id,e.model,req,false,elapsed,e.message||e);failures.push({id,error:String(e.message||e).slice(0,140)})}}
  throw Object.assign(new Error('No allowed text provider available'),{failures});
}
export async function textProviderStatus(){
  const out={localFirst:true,adaptiveQualityRouting:true,freeCloudPreferredForStrongTasks:true,paidFallback:false,catalog:textModelCatalog(),providers:[]};
  const ollamaUrl=(process.env.OLLAMA_URL||'http://ollama:11434').replace(/\/$/,'');
  try{const d=await jsonFetch(ollamaUrl+'/api/tags',{},3000);out.providers.push({id:'ollama-local',enabled:process.env.OLLAMA_ENABLED!=='false',status:'available',fastModel:process.env.OLLAMA_MODEL_FAST||'qwen3:1.7b',strongModel:process.env.OLLAMA_MODEL||'qwen3:4b',models:(d.models||[]).map(x=>x.name).slice(0,12)});}catch{out.providers.push({id:'ollama-local',enabled:false,status:'unavailable'});}
  out.providers.push({id:'ollama-cloud',enabled:truthy(process.env.OLLAMA_CLOUD_ENABLED)&&!!process.env.OLLAMA_API_KEY,status:truthy(process.env.OLLAMA_CLOUD_ENABLED)?'configured':'disabled',model:process.env.OLLAMA_CLOUD_MODEL||pickCloudModel('ollama',{task:'storyboard',quality:'strong'}),policy:'included-plan/cloud fallback'});
  const hf=hfAllowance();out.providers.push({id:'huggingface-cloud',enabled:truthy(process.env.HF_CLOUD_ENABLED)&&!!process.env.HF_TOKEN,status:truthy(process.env.HF_CLOUD_ENABLED)?'guarded-free-tier':'disabled',model:process.env.HF_TEXT_MODEL||pickCloudModel('huggingface',{task:'storyboard',quality:'strong'}),dailyCallGuard:hf.limit,remainingToday:hf.remaining});
  const or=freeRouter.status();out.providers.push({id:'openrouter',enabled:!!or.enabled,status:or.status||'disabled',models:or.models||[],freeOnly:true});
  out.providers.push({id:'nvidia',enabled:process.env.NVIDIA_ENABLED==='true',configured:!!process.env.NVIDIA_API_KEY,status:process.env.NVIDIA_ENABLED==='true'?'enabled':'disabled-unverified-generation',model:process.env.NVIDIA_MODEL||'nvidia/llama-3.1-nemotron-70b-instruct'});
  out.routing={policy:'adaptive-free-cloud-first-for-strong-tasks',learning:'persistent-validation-latency-decay-and-failure-tracking',defaultPlan:textRoutingPlan({}),strongPlan:textRoutingPlan({task:'fact-check',quality:'strong'}),telemetry:Object.fromEntries(telemetry),learned:{providers:learning.providers||{},models:learning.models||{}},leaderboards:learnedLeaderboards(),cooldowns:Object.fromEntries([...failuresUntil].map(([id,until])=>[id,new Date(until).toISOString()]))};
  return out;
}
