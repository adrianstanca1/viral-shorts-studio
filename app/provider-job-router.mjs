import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const allowedProviders=new Set(['higgsfield','nvidia','huggingface','fal','external']);
function dir(root){const d=path.join(root,'provider-jobs');fs.mkdirSync(d,{recursive:true});return d}
function file(root,id){return path.join(dir(root),`${id}.json`)}
export function createProviderJob(root,input={}){
  const provider=String(input.provider||'external').toLowerCase();
  if(!allowedProviders.has(provider))throw new Error('unsupported provider');
  const projectId=String(input.projectId||'').trim(),sceneIndex=Number(input.sceneIndex);
  if(!projectId||!Number.isInteger(sceneIndex)||sceneIndex<1)throw new Error('projectId and sceneIndex required');
  const id=String(input.jobId||crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
  const record={id,provider,projectId,sceneIndex,kind:String(input.kind||'video'),prompt:String(input.prompt||'').slice(0,4000),verifiedFree:input.verifiedFree===true,status:'pending',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(!record.verifiedFree)throw new Error('job must be verified free/no-charge');
  fs.writeFileSync(file(root,id),JSON.stringify(record,null,2));return record;
}
export function getProviderJob(root,id){try{return JSON.parse(fs.readFileSync(file(root,id),'utf8'))}catch{return null}}
export function resolveProviderJob(root,id,input={}){
  const record=getProviderJob(root,id);if(!record)throw new Error('provider job not found');
  const url=String(input.url||'').trim();if(!/^https:\/\//i.test(url))throw new Error('result url must be HTTPS');
  record.status='ready';record.url=url;record.resultKind=String(input.kind||record.kind||'video');record.updatedAt=new Date().toISOString();
  fs.writeFileSync(file(root,id),JSON.stringify(record,null,2));return record;
}
export function failProviderJob(root,id,error='provider generation failed'){
  const record=getProviderJob(root,id);if(!record)throw new Error('provider job not found');
  record.status='failed';record.error=String(error).slice(0,500);record.updatedAt=new Date().toISOString();fs.writeFileSync(file(root,id),JSON.stringify(record,null,2));return record;
}
export function providerJobStatus(root){
  const d=dir(root),items=fs.readdirSync(d).filter(x=>x.endsWith('.json')).flatMap(x=>{try{return [JSON.parse(fs.readFileSync(path.join(d,x),'utf8'))]}catch{return []}});
  const counts={pending:0,ready:0,failed:0};for(const x of items)counts[x.status]=(counts[x.status]||0)+1;
  return {counts,total:items.length,providers:[...new Set(items.map(x=>x.provider))]};
}
