import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const platforms=new Set(['youtube-shorts','tiktok','instagram-reels']);
const queueFile=root=>path.join(root,'publish-jobs.json');
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const tag=s=>'#'+String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,28);
const read=root=>{try{return JSON.parse(fs.readFileSync(queueFile(root),'utf8'))}catch{return {version:1,jobs:[]}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const f=queueFile(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,f);return state};

export function buildDistributionPackage(project,platform='youtube-shorts'){
  if(!platforms.has(platform))throw new Error('unsupported publishing platform');
  const base=project.publish||{},topic=clean(project.topic),niche=clean(project.niche).replace(/-/g,' ');
  const hashtags=[...(base.hashtags||[]),tag(niche),tag(topic.split(' ').slice(0,3).join(''))].filter(x=>x&&x!=='#');
  const unique=[...new Set(hashtags)].slice(0,platform==='instagram-reels'?12:8);
  const title=clean(base.title||topic).slice(0,platform==='youtube-shorts'?100:150);
  const description=clean(base.description||`Source-backed short about ${topic}.`).slice(0,platform==='youtube-shorts'?4800:1800);
  return {platform,title,caption:`${description}\n\n${unique.join(' ')}`.trim(),description,hashtags:unique,visibility:'private',video:`/api/projects/${project.id}/video`,thumbnail:`/api/projects/${project.id}/thumbnail`,credits:`/api/projects/${project.id}/credits`,approval:project.publishApproval||null,qa:{launchReady:project.qa?.launchReady===true,viralityScore:project.qa?.viralityScore??null}};
}
export function createPublishJob(root,project,{platform='youtube-shorts',scheduledAt=null}={}){
  if(project?.status!=='complete'||project?.qa?.launchReady!==true)throw new Error('project is not launch-ready');
  if(project?.publishApproval?.status!=='approved')throw new Error('project is not approved for publishing');
  if(!platforms.has(platform))throw new Error('unsupported publishing platform');
  const when=scheduledAt?Date.parse(scheduledAt):NaN;if(scheduledAt&&!Number.isFinite(when))throw new Error('invalid scheduledAt');
  const state=read(root),now=new Date().toISOString();
  const job={id:crypto.randomUUID(),projectId:project.id,platform,status:Number.isFinite(when)&&when>Date.now()?'scheduled':'ready',scheduledAt:Number.isFinite(when)?new Date(when).toISOString():null,createdAt:now,package:buildDistributionPackage(project,platform),delivery:{mode:'manual-export',externalPostingEnabled:false}};
  state.jobs=[job,...state.jobs].slice(0,500);write(root,state);return job;
}

export function listPublishJobs(root,{projectId='',status=''}={}){
  return read(root).jobs.filter(x=>(!projectId||x.projectId===projectId)&&(!status||x.status===status));
}
export function publishQueueSummary(root){
  const jobs=read(root).jobs,counts={};for(const j of jobs)counts[j.status]=(counts[j.status]||0)+1;
  return {total:jobs.length,counts,externalPostingEnabled:false,mode:'approval-gated-manual-export'};
}
export function deletePublishJobsForProject(root,projectId){const state=read(root),before=state.jobs.length;state.jobs=state.jobs.filter(x=>x.projectId!==projectId);if(state.jobs.length!==before)write(root,state);return before-state.jobs.length;}
