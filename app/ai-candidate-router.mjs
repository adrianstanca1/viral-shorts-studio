import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const allowedProviders=new Set(['higgsfield','nvidia','huggingface','fal','external']);
const allowedKinds=new Set(['image','video']);
export function aiInboxDir(root,projectId){return path.join(root,'ai-inbox',projectId)}
export function registerAiCandidate(root,projectId,sceneIndex,input={}){
  const provider=String(input.provider||'external').toLowerCase(),kind=String(input.kind||'video').toLowerCase(),url=String(input.url||'').trim();
  if(!allowedProviders.has(provider))throw new Error('unsupported provider');
  if(!allowedKinds.has(kind))throw new Error('unsupported candidate kind');
  if(!/^https:\/\//i.test(url))throw new Error('candidate url must be HTTPS');
  if(input.verifiedFree!==true)throw new Error('candidate must be verified free/no-charge');
  const dir=aiInboxDir(root,projectId);fs.mkdirSync(dir,{recursive:true});
  const id=String(input.jobId||crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
  const record={id,projectId,sceneIndex:Number(sceneIndex),provider,kind,url,prompt:String(input.prompt||'').slice(0,4000),verifiedFree:true,createdAt:new Date().toISOString(),status:'ready'};
  fs.writeFileSync(path.join(dir,`scene-${String(sceneIndex).padStart(2,'0')}-${id}.json`),JSON.stringify(record,null,2));
  return record;
}
export function listAiCandidates(root,projectId,sceneIndex){
  const dir=aiInboxDir(root,projectId);if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(x=>x.startsWith(`scene-${String(sceneIndex).padStart(2,'0')}-`)&&x.endsWith('.json')).flatMap(x=>{try{return [JSON.parse(fs.readFileSync(path.join(dir,x),'utf8'))]}catch{return []}}).filter(x=>x.verifiedFree&&x.status==='ready');
}

export function aiCandidateStatus(root,projectId){
  const dir=aiInboxDir(root,projectId);if(!fs.existsSync(dir))return {ready:0,providers:[]};
  const items=fs.readdirSync(dir).filter(x=>x.endsWith('.json')).flatMap(x=>{try{return [JSON.parse(fs.readFileSync(path.join(dir,x),'utf8'))]}catch{return []}}).filter(x=>x.verifiedFree&&x.status==='ready');
  return {ready:items.length,providers:[...new Set(items.map(x=>x.provider))]};
}
