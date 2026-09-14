import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preferredOpenRouterFreeModels } from './openrouter-catalog.mjs';

export class FreeRouter {
  constructor({env=process.env,fetcher=fetch,now=Date.now,stateFile=env.ROUTER_STATE_FILE}={}) {
    this.env=env; this.fetcher=fetcher; this.now=now; this.stateFile=stateFile;
    this.state={}; this.cache=new Map(); this.active=0;
    try { this.state=JSON.parse(fs.readFileSync(stateFile,'utf8')); } catch {}
  }
  save(){if(!this.stateFile)return;fs.mkdirSync(path.dirname(this.stateFile),{recursive:true});fs.writeFileSync(this.stateFile+'.tmp',JSON.stringify(this.state),{mode:0o600});fs.renameSync(this.stateFile+'.tmp',this.stateFile);}
  models(){
    const dynamic=preferredOpenRouterFreeModels(12);
    return [...new Set([this.env.OPENROUTER_MODEL,...(this.env.OPENROUTER_FALLBACK_MODELS||'').split(','),...dynamic,'openrouter/free'].filter(m=>m && (m==='openrouter/free'||/^[\w.-]+\/[\w.-]+:free$/.test(m))))].slice(0,12);
  }
  status(){
    const key=this.env.OPENROUTER_API_KEY||this.env.OPENROUTER_KEY;
    const current=this.state.openrouter||{};
    const fingerprint=key?crypto.createHash('sha256').update(key).digest('hex'):null;
    const state=current.fingerprint===fingerprint?current:{};
    return {configured:!!key,enabled:!!key&&this.env.OPENROUTER_ENABLED==='true',models:this.models(),freeOnly:true,paidFallback:false,status:state.status||'not-verified',lastCheckedAt:state.lastCheckedAt||null,nextRetryAt:state.until?new Date(state.until).toISOString():null,active:this.active};
  }
  async complete({messages,target=100,signal,validate}){
    signal?.throwIfAborted();
    const key=this.env.OPENROUTER_API_KEY||this.env.OPENROUTER_KEY;
    if(!this.status().enabled)throw new Error('Free cloud routing is disabled');
    const fingerprint=crypto.createHash('sha256').update(key).digest('hex');
    if(this.state.openrouter?.fingerprint!==fingerprint)this.state.openrouter={fingerprint};
    if((this.state.openrouter.until||0)>this.now())throw new Error('Free cloud provider cooling down; retry later');
    if(this.active>=2)throw new Error('Free cloud concurrency limit reached; retry later');
    const cacheKey=crypto.createHash('sha256').update(JSON.stringify({messages,target})).digest('hex');
    const hit=this.cache.get(cacheKey);
    if(hit&&hit.until>this.now()&&(!validate||validate(hit.text)))return hit.text;
    this.active++;
    const deadline=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(90000)]);
    try {
      for(const model of this.models()){
        signal?.throwIfAborted();
        try{
          const r=await this.fetcher('https://openrouter.ai/api/v1/chat/completions',{
            method:'POST',redirect:'error',signal:AbortSignal.any([deadline,AbortSignal.timeout(30000)]),
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
            body:JSON.stringify({model,messages,stream:false,max_tokens:Math.min(4096,Math.max(128,Math.ceil(target*3))),
              provider:{allow_fallbacks:true,max_price:{prompt:0,completion:0}}})
          });
          if(!r.ok){
            await r.body?.cancel();
            if([401,403,402,429].includes(r.status)){
              const retry=r.headers.get('retry-after');const seconds=Number(retry);
              const retryMs=retry?(Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-this.now()):0;
              this.state.openrouter={fingerprint,status:r.status===429?'rate-limited':r.status===402?'quota-exhausted':'authentication-rejected',lastCheckedAt:new Date(this.now()).toISOString(),until:this.now()+Math.max(60000,Number.isFinite(retryMs)?retryMs:0,r.status===429?60000:3600000)};this.save();
              throw new Error('PROVIDER_BLOCKED');
            }
            throw new Error('MODEL_UNAVAILABLE');
          }
          let bytes=0;const chunks=[];
          for await(const chunk of r.body){bytes+=chunk.length;if(bytes>262144)throw new Error('OVERSIZED');chunks.push(chunk);}
          const d=JSON.parse(Buffer.concat(chunks).toString('utf8')),c=d.choices?.[0],text=c?.message?.content?.trim();
          if(d.error||c?.finish_reason!=='stop'||!text||text.length>20000||text.split(/\s+/).length<target*.6||(validate&&!validate(text)))throw new Error('INVALID_OUTPUT');
          this.state.openrouter={fingerprint,status:'generation-verified',lastCheckedAt:new Date(this.now()).toISOString(),until:0,model};this.save();
          if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value);
          this.cache.set(cacheKey,{text,until:this.now()+300000});
          return text;
        }catch(e){
          if(signal?.aborted)throw new Error('Cancelled');
          if(e.message==='PROVIDER_BLOCKED')throw new Error('Free cloud authentication or quota unavailable; no paid fallback');
          if(deadline.aborted)break;
        }
      }
      this.state.openrouter={fingerprint,status:'temporarily-unavailable',lastCheckedAt:new Date(this.now()).toISOString(),until:this.now()+60000};this.save();
      throw new Error('No free cloud model returned a valid result; job can be retried');
    }finally{this.active--;}
  }
}
export const freeRouter=new FreeRouter();
export function providerInventory(){
  let providers=[];try{providers=JSON.parse(fs.readFileSync(process.env.PROVIDER_REGISTRY_FILE||'/app/provider-registry.json','utf8'));}catch{}
  return {freeOnly:true,paidFallback:false,providers,router:freeRouter.status()};
}
