import fs from 'node:fs';import path from 'node:path';
const file=root=>path.join(root,'provider-smoke.json');
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {providers:{}}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const tmp=file(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,file(root));return state};
export function getProviderSmoke(root,id){return read(root).providers?.[String(id||'').toLowerCase()]||null}
export function smokeFresh(item,maxAgeMs=6*60*60*1000){const t=Date.parse(item?.checkedAt||'');return item?.success===true&&Number.isFinite(t)&&Date.now()-t<=maxAgeMs}
export function recordProviderSmoke(root,id,input={}){const key=String(id||'').toLowerCase(),state=read(root);state.providers ||= {};state.providers[key]={id:key,success:input.success===true,checkedAt:new Date().toISOString(),model:String(input.model||'').slice(0,200),kind:String(input.kind||'').slice(0,40),detail:String(input.detail||'').slice(0,500)};write(root,state);return state.providers[key]}
export function providerSmokeSummary(root){const providers=read(root).providers||{};return Object.fromEntries(Object.entries(providers).map(([k,v])=>[k,{...v,fresh:smokeFresh(v)}]))}
