import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isPublicHttps } from './url-safety.mjs';

const allowedProviders=new Set(['higgsfield','nvidia','huggingface','fal','external']);
const finalStates=new Set(['ready','failed','expired']);
const nowIso=()=>new Date().toISOString();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function dir(root){const d=path.join(root,'provider-jobs');fs.mkdirSync(d,{recursive:true});return d}
function file(root,id){return path.join(dir(root),`${id}.json`)}
function write(root,record){record.updatedAt=nowIso();fs.writeFileSync(file(root,record.id),JSON.stringify(record,null,2));return record}
function readAll(root){return fs.readdirSync(dir(root)).filter(x=>x.endsWith('.json')).flatMap(x=>{try{return [JSON.parse(fs.readFileSync(path.join(dir(root),x),'utf8'))]}catch{return []}})}
export function createProviderJob(root,input={}){
  const provider=String(input.provider||'external').toLowerCase();
  if(!allowedProviders.has(provider))throw new Error('unsupported provider');
  const projectId=String(input.projectId||'').trim(),sceneIndex=Number(input.sceneIndex);
  if(!projectId||!Number.isInteger(sceneIndex)||sceneIndex<1)throw new Error('projectId and sceneIndex required');
  if(!input.jobId){const existing=readAll(root).find(x=>x.projectId===projectId&&x.sceneIndex===sceneIndex&&x.provider===provider&&!finalStates.has(x.status));if(existing)return existing;}
  const id=String(input.jobId||crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
  const kind=String(input.kind||'video').toLowerCase();if(!['image','video'].includes(kind))throw new Error('unsupported job kind');
  const ttlSeconds=clamp(Number(input.ttlSeconds||7200),300,86400),createdAt=nowIso();
  const record={id,provider,projectId,sceneIndex,kind,prompt:String(input.prompt||'').slice(0,4000),verifiedFree:input.verifiedFree===true,status:'pending',priority:clamp(Number(input.priority||0),0,100),attempts:0,createdAt,updatedAt:createdAt,expiresAt:new Date(Date.now()+ttlSeconds*1000).toISOString()};
  if(!record.verifiedFree)throw new Error('job must be verified free/no-charge');
  return write(root,record);
}
export function getProviderJob(root,id){try{return JSON.parse(fs.readFileSync(file(root,id),'utf8'))}catch{return null}}
export function claimProviderJobs(root,input={}){
  reconcileProviderJobs(root);
  const provider=String(input.provider||'').toLowerCase(),limit=clamp(Number(input.limit||1),1,8),leaseSeconds=clamp(Number(input.leaseSeconds||120),30,900),workerId=String(input.workerId||'worker').slice(0,80);
  const jobs=readAll(root).filter(x=>x.status==='pending'&&(!provider||x.provider===provider)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(a.createdAt).localeCompare(String(b.createdAt))).slice(0,limit);
  return jobs.map(record=>{record.status='leased';record.workerId=workerId;record.attempts=Number(record.attempts||0)+1;record.leaseUntil=new Date(Date.now()+leaseSeconds*1000).toISOString();return write(root,record)});
}
export function releaseProviderJob(root,id,error=''){
  const record=getProviderJob(root,id);if(!record)throw new Error('provider job not found');
  if(record.status!=='leased')throw new Error('only leased jobs can be released');
  record.status='pending';delete record.workerId;delete record.leaseUntil;if(error)record.lastError=String(error).slice(0,500);return write(root,record);
}
export function resolveProviderJob(root,id,input={}){
  const record=getProviderJob(root,id);if(!record)throw new Error('provider job not found');
  if(record.status==='failed'||record.status==='expired')throw new Error(`${record.status} provider job cannot be resolved; create a new job`);
  const url=String(input.url||'').trim();if(!isPublicHttps(url))throw new Error('result url must be public HTTPS');
  const resultKind=String(input.kind||record.kind||'video').toLowerCase();if(!['image','video'].includes(resultKind))throw new Error('unsupported result kind');
  record.status='ready';record.url=url;record.resultKind=resultKind;delete record.workerId;delete record.leaseUntil;return write(root,record);
}
export function failProviderJob(root,id,error='provider generation failed'){
  const record=getProviderJob(root,id);if(!record)throw new Error('provider job not found');
  record.status='failed';record.error=String(error).slice(0,500);delete record.workerId;delete record.leaseUntil;return write(root,record);
}
export function reconcileProviderJobs(root){
  const now=Date.now(),changed=[];
  for(const record of readAll(root)){
    let migrated=false;if(record.priority===undefined){record.priority=0;migrated=true;}if(record.attempts===undefined){record.attempts=0;migrated=true;}if(!record.expiresAt&&!finalStates.has(record.status)){const base=Date.parse(record.createdAt)||now;record.expiresAt=new Date(base+6*60*60*1000).toISOString();migrated=true;}if(migrated)write(root,record);
    if(finalStates.has(record.status))continue;
    if(record.expiresAt&&Date.parse(record.expiresAt)<=now){record.status='expired';record.error='provider job expired before completion';delete record.workerId;delete record.leaseUntil;write(root,record);changed.push(record);continue;}
    if(record.status==='leased'&&record.leaseUntil&&Date.parse(record.leaseUntil)<=now){record.status='pending';record.lastError='worker lease expired; returned to queue';delete record.workerId;delete record.leaseUntil;write(root,record);changed.push(record);}
  }
  return changed;
}
export function listProviderJobs(root,filter={}){
  reconcileProviderJobs(root);
  return readAll(root).filter(x=>(!filter.status||x.status===filter.status)&&(!filter.provider||x.provider===filter.provider)&&(!filter.projectId||x.projectId===filter.projectId)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(b.createdAt).localeCompare(String(a.createdAt)));
}
export function providerJobStatus(root){
  reconcileProviderJobs(root);
  const items=readAll(root),counts={pending:0,leased:0,ready:0,failed:0,expired:0};for(const x of items)counts[x.status]=(counts[x.status]||0)+1;
  return {counts,total:items.length,providers:[...new Set(items.map(x=>x.provider))]};
}
