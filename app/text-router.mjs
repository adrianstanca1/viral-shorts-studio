import { freeRouter } from './free-router.mjs';

const now=()=>Date.now();
let cache={};
async function jsonFetch(url,options={},timeout=45000){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});
  const text=await r.text(); let data={}; try{data=JSON.parse(text)}catch{}
  if(!r.ok) throw new Error(`HTTP ${r.status}`); return data;
}
async function ollamaComplete({messages,target=500,validate}){
  const url=(process.env.OLLAMA_URL||'http://ollama:11434').replace(/\/$/,'');
  const model=process.env.OLLAMA_MODEL_FAST||process.env.OLLAMA_MODEL||'qwen3:1.7b';
  const data=await jsonFetch(url+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages,stream:false,think:false,keep_alive:'30m',options:{temperature:0.25,num_predict:Math.max(128,Math.min(2048,target*2))}})},120000);
  let text=String(data.message?.content||'').trim(); if(!text)throw new Error('empty response');
  if(validate&&!validate(text)){
    const a=text.indexOf('['),b=text.lastIndexOf(']'); if(a>=0&&b>a&&validate(text.slice(a,b+1)))text=text.slice(a,b+1); else throw new Error('validation failed');
  }
  return {text,provider:'ollama',model};
}
async function nvidiaComplete({messages,target=500,validate}){
  const key=process.env.NVIDIA_API_KEY; if(!key||process.env.NVIDIA_ENABLED!=='true')throw new Error('disabled');
  const model=process.env.NVIDIA_MODEL||'nvidia/llama-3.1-nemotron-70b-instruct';
  const data=await jsonFetch('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages,max_tokens:Math.max(128,Math.min(2048,target*2)),temperature:.25})},60000);
  const text=String(data.choices?.[0]?.message?.content||'').trim(); if(!text)throw new Error('empty response'); if(validate&&!validate(text))throw new Error('validation failed'); return {text,provider:'nvidia',model};
}
export async function completeText(req){
  const order=String(process.env.TEXT_PROVIDER_ORDER||'ollama,openrouter,nvidia').split(',').map(x=>x.trim()).filter(Boolean), failures=[];
  for(const id of order){try{
    if(id==='ollama'&&process.env.OLLAMA_ENABLED!=='false'){
      try{return await ollamaComplete(req)}catch(first){await new Promise(r=>setTimeout(r,500));return await ollamaComplete(req)}
    }
    if(id==='openrouter'&&freeRouter.status().enabled)return {text:await freeRouter.complete(req),provider:'openrouter',model:freeRouter.status().models?.[0]};
    if(id==='nvidia')return await nvidiaComplete(req);
  }catch(e){failures.push({id,error:String(e.message||e).slice(0,120)})}}
  throw Object.assign(new Error('No verified free text provider available'),{failures});
}
export async function textProviderStatus(){
  const out={freeOnly:true,paidFallback:false,providers:[]};
  const ollamaUrl=(process.env.OLLAMA_URL||'http://ollama:11434').replace(/\/$/,'');
  try{const d=await jsonFetch(ollamaUrl+'/api/tags',{},3000);out.providers.push({id:'ollama',enabled:process.env.OLLAMA_ENABLED!=='false',status:'available',model:process.env.OLLAMA_MODEL_FAST||process.env.OLLAMA_MODEL||'qwen3:1.7b',strongModel:process.env.OLLAMA_MODEL||'qwen3:4b',models:(d.models||[]).map(x=>x.name).slice(0,8)});}catch{out.providers.push({id:'ollama',enabled:false,status:'unavailable',model:process.env.OLLAMA_MODEL_FAST||process.env.OLLAMA_MODEL||'qwen3:1.7b'});}
  const or=freeRouter.status();out.providers.push({id:'openrouter',enabled:!!or.enabled,status:or.status||'disabled',models:or.models||[],freeOnly:true});
  out.providers.push({id:'nvidia',enabled:process.env.NVIDIA_ENABLED==='true',configured:!!process.env.NVIDIA_API_KEY,status:process.env.NVIDIA_ENABLED==='true'?'enabled':'disabled-unverified-generation',model:process.env.NVIDIA_MODEL||'nvidia/llama-3.1-nemotron-70b-instruct'});
  out.providers.push({id:'higgsfield',enabled:false,status:'connector-handoff',note:'ChatGPT connector/account available; VPS bridge intentionally disabled until a no-charge API path is verified.'});
  return out;
}
