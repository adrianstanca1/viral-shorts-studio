import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const file=root=>path.join(root,'integration-keys.json');
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,keys:[]}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const tmp=file(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,file(root));return state};
const digest=raw=>crypto.createHash('sha256').update(String(raw)).digest('hex');
const cleanScopes=scopes=>[...new Set((Array.isArray(scopes)?scopes:['read']).map(String).filter(x=>['read','create'].includes(x)))];
export function listApiKeys(root){return read(root).keys.map(({digest,...x})=>x)}
export function createApiKey(root,input={}){const raw=`cos_${crypto.randomBytes(32).toString('base64url')}`,now=new Date().toISOString(),ttlDays=Math.max(1,Math.min(3650,Number(input.ttlDays||365)));const item={id:crypto.randomUUID(),name:String(input.name||'Integration').trim().slice(0,80)||'Integration',prefix:raw.slice(0,12),digest:digest(raw),scopes:cleanScopes(input.scopes),createdAt:now,expiresAt:new Date(Date.now()+ttlDays*86400000).toISOString(),revokedAt:null};const state=read(root);state.keys=[item,...state.keys].slice(0,100);write(root,state);return {key:raw,item:Object.fromEntries(Object.entries(item).filter(([k])=>k!=='digest'))}}
export function revokeApiKey(root,id){const state=read(root),item=state.keys.find(x=>x.id===id);if(!item)throw Error('integration key not found');item.revokedAt=new Date().toISOString();write(root,state);return Object.fromEntries(Object.entries(item).filter(([k])=>k!=='digest'))}
export function verifyApiKey(root,raw,scope='read'){if(!raw)return null;const now=Date.now(),hash=digest(raw);for(const item of read(root).keys){if(item.revokedAt||Date.parse(item.expiresAt)<=now||!item.scopes?.includes(scope))continue;const a=Buffer.from(item.digest),b=Buffer.from(hash);if(a.length===b.length&&crypto.timingSafeEqual(a,b))return {id:item.id,name:item.name,scopes:item.scopes,prefix:item.prefix}}return null}
