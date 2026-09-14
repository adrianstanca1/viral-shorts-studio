import { providerInventory } from './free-router.mjs';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { produceProject, mediaProviderStatus } from './pipeline.mjs';
import { textProviderStatus } from './text-router.mjs';
import { generativeStatus } from './generative-router.mjs';
import { buildAiGenerationPlan, summarizeAiPlan } from './ai-generation-manager.mjs';
import { registerAiCandidate, registerLocalAiCandidate, listAiCandidates, aiCandidateStatus } from './ai-candidate-router.mjs';
import { createProviderJob, getProviderJob, resolveProviderJob, failProviderJob, providerJobStatus, listProviderJobs, claimProviderJobs, releaseProviderJob, reconcileProviderJobs } from './provider-job-router.mjs';
import { providerWorkerInventory } from './provider-adapters.mjs';

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(express.static(new URL('./public', import.meta.url).pathname));
const PORT = Number(process.env.PORT || 3010);
const DATA = process.env.DATA_DIR || '/app/data';
const niches = ['true-crime','history','storytelling','fact-check'];
const styles = ['documentary','cinematic','hybrid','whiteboard'];
const jobs = new Map();
let active=false;
function kick(){
  if(active)return;
  const job=[...jobs.values()].find(j=>j.status==='queued');if(!job)return;
  active=true;
  produceProject(job,DATA,save).catch(()=>{}).finally(()=>{active=false;kick();});
}

function projectDir(id){ return path.join(DATA,'projects',id); }
function projectFile(id){ return path.join(projectDir(id),'project.json'); }
function save(job){ fs.mkdirSync(projectDir(job.id),{recursive:true}); fs.writeFileSync(projectFile(job.id),JSON.stringify(job,null,2)); jobs.set(job.id,job); }
function load(id){ if(jobs.has(id)) return jobs.get(id); const p=projectFile(id); if(!fs.existsSync(p)) return null; const j=JSON.parse(fs.readFileSync(p,'utf8')); jobs.set(id,j); return j; }
function list(){ const d=path.join(DATA,'projects'); fs.mkdirSync(d,{recursive:true}); return fs.readdirSync(d).map(id=>load(id)).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); }

app.get('/api/health',(req,res)=>res.json({status:'ok',service:'viral-shorts-studio',mode:'autonomous-production',niches}));
app.get('/api/providers',async(req,res)=>res.json({...providerInventory(),media:mediaProviderStatus(),generative:generativeStatus(),text:await textProviderStatus(),providerJobs:providerJobStatus(DATA),workerProviders:providerWorkerInventory()}));
app.get('/api/stats',(req,res)=>{
  const all=list(), completed=all.filter(x=>x.status==='complete'), failed=all.filter(x=>x.status==='failed');
  const timed=a=>a.filter(x=>Number(x.metrics?.totalSeconds)>0); const avg=a=>{const t=timed(a);return t.length?Number((t.reduce((n,x)=>n+Number(x.metrics.totalSeconds),0)/t.length).toFixed(2)):0;};
  res.json({projects:all.length,completed:completed.length,failed:failed.length,queued:all.filter(x=>x.status==='queued').length,successRate:all.length?Number((100*completed.length/all.length).toFixed(1)):0,averageProductionSeconds:avg(completed),researchCacheHits:completed.filter(x=>x.researchCacheHit).length,mediaCacheHits:completed.filter(x=>x.mediaCacheHit).length,averageViralityScore:completed.length?Number((completed.reduce((n,x)=>n+Number(x.qa?.viralityScore||0),0)/completed.length).toFixed(1)):0});
});
app.get('/api/capabilities',(req,res)=>res.json({
  niches,
  stages:['research','source-check','hook','script','storyboard','shot-direction','visual-prompts','archive-candidates','whiteboard-candidates','verified-free-ai-candidates','free-allowance-planning','provider-job-harvesting','candidate-scoring','auto-selection','motion-clips','voice','captions','render','credits','qa'],
  formats:['9:16','30s / 8 scenes','60s / 14 scenes','90s / 20 scenes'],
  styles,
  currentProviders:['Wikipedia research','Wikimedia Commons licensed imagery','FFmpeg motion-video','FFmpeg Flite narration'],
  optionalProviders:['Pexels','Pixabay','OpenRouter','Tavily','fal.ai','future image-to-video adapters'],
  policy:['cite sources','preserve asset credits','approval before publishing','do not fabricate real-crime claims']
}));


app.get('/api/provider-worker/status',(req,res)=>{const f=path.join(DATA,'provider-worker-status.json');if(!fs.existsSync(f))return res.json({state:'offline'});try{res.json(JSON.parse(fs.readFileSync(f,'utf8')))}catch{res.json({state:'invalid'})}});
app.get('/api/provider-jobs',(req,res)=>{const status=String(req.query.status||'').trim(),provider=String(req.query.provider||'').trim().toLowerCase(),projectId=String(req.query.projectId||'').trim();res.json({...providerJobStatus(DATA),jobs:listProviderJobs(DATA,{status,provider,projectId}).slice(0,100)});});
app.get('/api/provider-jobs/:id',(req,res)=>{const j=getProviderJob(DATA,req.params.id);if(!j)return res.status(404).json({error:'not found'});res.json(j)});
app.post('/api/provider-jobs/claim',(req,res)=>{try{res.json({jobs:claimProviderJobs(DATA,req.body||{})})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/provider-jobs/:id/release',(req,res)=>{try{res.json(releaseProviderJob(DATA,req.params.id,req.body?.error))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/provider-jobs',(req,res)=>{try{const body=req.body||{};if(!load(String(body.projectId||'')))return res.status(404).json({error:'project not found'});res.status(201).json(createProviderJob(DATA,body))}catch(e){res.status(400).json({error:String(e.message||e)})}});

app.get('/api/projects/:id/ai-generation-plan',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  const plan=buildAiGenerationPlan(j,{provider:req.query.provider||'higgsfield',allowance:Number(req.query.allowance||j.aiFreeAllowance||0),maxScenes:Number(req.query.maxScenes||4),minScore:Number(req.query.minScore||82)});
  res.json(plan);
});
app.post('/api/projects/:id/ai-generation-plan',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project must finish before cloud scene planning'});
  const body=req.body||{},plan=buildAiGenerationPlan(j,body);j.aiGenerationPlan=plan;j.aiFreeAllowance=plan.allowance;save(j);
  const jobsCreated=[];if(body.createJobs===true){for(const item of plan.selected){jobsCreated.push(createProviderJob(DATA,{provider:plan.provider,projectId:j.id,sceneIndex:item.index,kind:item.kind,prompt:[item.visualPrompt,item.motionPrompt].filter(Boolean).join(' | '),verifiedFree:true,priority:item.priority}))}}
  res.status(201).json({plan,summary:summarizeAiPlan(plan),jobs:jobsCreated});
});

app.get('/api/projects/:id/ai-candidates',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  const out={status:aiCandidateStatus(DATA,j.id),scenes:{}};
  for(const scene of j.storyboard||[])out.scenes[String(scene.index)]=listAiCandidates(DATA,j.id,scene.index);
  res.json(out);
});
app.post('/api/projects/:id/scenes/:index/ai-candidates',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  try{const item=registerAiCandidate(DATA,j.id,Number(req.params.index),req.body||{});res.status(201).json(item);}catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.post('/api/projects',(req,res)=>{
  const body=req.body||{};
  const topic=String(body.topic||'').trim();
  if(topic.length<3 || topic.length>300) return res.status(400).json({error:'topic is required'});
  if([...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length>=5)return res.status(429).json({error:'Queue full; retry after a project finishes'});
  if(body.duration!==undefined && (![30,60,90].includes(Number(body.duration))))return res.status(400).json({error:'Choose 30 seconds, 1 minute, or 1 minute 30 seconds'});
  const niche=niches.includes(body.niche)?body.niche:'storytelling';
  const style=styles.includes(body.style)?body.style:'documentary';
  const job={id:crypto.randomUUID(),status:'queued',progress:0,createdAt:new Date().toISOString(),niche,style,topic,duration:Number(body.duration||60),autonomous:true,autoCandidates:body.autoCandidates!==false,candidateCount:Math.max(1,Math.min(4,Number(body.candidateCount||3)))};
  save(job); res.status(202).json(job);
  setImmediate(kick);
});

app.post('/api/projects/:id/retry',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  if(j.status!=='failed')return res.status(409).json({error:'Only failed projects can be retried'});
  if([...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length>=5)return res.status(429).json({error:'Queue full'});
  j.status='queued';delete j.error;save(j);setImmediate(kick);res.status(202).json(j);
});

function archiveSceneVariant(j,index){
  const current=j.scenes?.find(s=>s.index===index);
  if(!current?.file||!fs.existsSync(current.file))return null;
  j.sceneVariants ||= {}; const key=String(index); j.sceneVariants[key] ||= [];
  const existing=j.sceneVariants[key].find(v=>v.sourceFile===current.file); if(existing)return existing;
  const dir=path.join(projectDir(j.id),'variants',`scene-${String(index).padStart(2,'0')}`); fs.mkdirSync(dir,{recursive:true});
  const id=crypto.randomUUID(), file=path.join(dir,`${id}.mp4`); fs.copyFileSync(current.file,file);
  let captions=null; if(current.captions&&fs.existsSync(current.captions)){captions=path.join(dir,`${id}.srt`);fs.copyFileSync(current.captions,captions);}
  const story=j.storyboard?.find(s=>s.index===index);
  const variant={id,index,createdAt:new Date().toISOString(),variantSeed:Number(story?.variantSeed||0),duration:current.duration,assets:current.assets||[],hasRealVideo:!!current.hasRealVideo,visualType:current.visualType||'unknown',candidateScore:current.candidateScore,aiProvider:current.aiProvider,aiJobId:current.aiJobId,file,captions,sourceFile:current.file};
  j.sceneVariants[key].push(variant); return variant;
}


app.post('/api/provider-jobs/:id/resolve-local',(req,res)=>{
  try{
    if(!process.env.PROVIDER_WORKER_TOKEN||req.get('x-provider-worker-token')!==process.env.PROVIDER_WORKER_TOKEN)return res.status(403).json({error:'forbidden'});
    const existing=getProviderJob(DATA,req.params.id);if(!existing)return res.status(404).json({error:'provider job not found'});
    if(existing.status==='ready')return res.json({job:existing,alreadyResolved:true});
    if(existing.status!=='leased')return res.status(409).json({error:'provider job must be leased by a worker'});
    const localFile=String(req.body?.localFile||''),kind=String(req.body?.kind||existing.kind||'image').toLowerCase();
    const item=registerLocalAiCandidate(DATA,existing.projectId,existing.sceneIndex,{provider:existing.provider,kind,localFile,prompt:existing.prompt,jobId:existing.id,verifiedFree:true});
    existing.status='ready';existing.resultKind=kind;existing.localFile=localFile;existing.model=String(req.body?.model||'').slice(0,200);delete existing.workerId;delete existing.leaseUntil;existing.updatedAt=new Date().toISOString();
    fs.writeFileSync(path.join(DATA,'provider-jobs',`${existing.id}.json`),JSON.stringify(existing,null,2));
    const j=load(existing.projectId);if(!j)return res.status(404).json({error:'project not found'});
    if(['complete','failed'].includes(j.status)){
      archiveSceneVariant(j,existing.sceneIndex);const scene=j.storyboard?.find(s=>s.index===existing.sceneIndex);if(scene)scene.variantSeed=Number(scene.variantSeed||0)+1;
      try{fs.rmSync(path.join(projectDir(j.id),`scene-${String(existing.sceneIndex).padStart(2,'0')}`),{recursive:true,force:true})}catch{}
      j.scenes=(j.scenes||[]).filter(s=>s.index!==existing.sceneIndex);j.status='queued';j.progress=25;delete j.error;delete j.render;save(j);setImmediate(kick);
    }
    res.json({job:existing,item,projectStatus:j.status});
  }catch(e){res.status(400).json({error:String(e.message||e)})}
});
app.post('/api/provider-jobs/:id/resolve',(req,res)=>{
  try{
    const existing=getProviderJob(DATA,req.params.id);if(!existing)return res.status(404).json({error:'provider job not found'});if(existing.status==='ready')return res.json({job:existing,alreadyResolved:true});
    const job=resolveProviderJob(DATA,req.params.id,req.body||{});const j=load(job.projectId);if(!j)return res.status(404).json({error:'project not found'});
    const item=registerAiCandidate(DATA,job.projectId,job.sceneIndex,{provider:job.provider,kind:job.resultKind,url:job.url,prompt:job.prompt,jobId:job.id,verifiedFree:true});
    if(['complete','failed'].includes(j.status)){
      archiveSceneVariant(j,job.sceneIndex);const scene=j.storyboard?.find(s=>s.index===job.sceneIndex);if(scene)scene.variantSeed=Number(scene.variantSeed||0)+1;
      try{fs.rmSync(path.join(projectDir(j.id),`scene-${String(job.sceneIndex).padStart(2,'0')}`),{recursive:true,force:true})}catch{}
      j.scenes=(j.scenes||[]).filter(s=>s.index!==job.sceneIndex);j.status='queued';j.progress=25;delete j.error;delete j.render;save(j);setImmediate(kick);
    }
    res.json({job,item,projectStatus:j.status});
  }catch(e){res.status(400).json({error:String(e.message||e)})}
});
app.post('/api/provider-jobs/:id/fail',(req,res)=>{try{res.json(failProviderJob(DATA,req.params.id,req.body?.error))}catch(e){res.status(400).json({error:String(e.message||e)})}});

app.post('/api/projects/:id/scenes/:index/regenerate',(req,res)=>{
  const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'});
  if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});
  const index=Number(req.params.index); const scene=j.storyboard?.find(s=>s.index===index);
  if(!scene)return res.status(404).json({error:'scene not found'});
  archiveSceneVariant(j,index); scene.variantSeed=Number(scene.variantSeed||0)+1;
  const dir=path.join(projectDir(j.id),`scene-${String(index).padStart(2,'0')}`);
  try{fs.rmSync(dir,{recursive:true,force:true});}catch{}
  j.scenes=(j.scenes||[]).filter(s=>s.index!==index); j.status='queued'; j.progress=25; delete j.error; delete j.render;
  save(j); setImmediate(kick); res.status(202).json({id:j.id,scene:index,variantSeed:scene.variantSeed,status:j.status});
});
app.get('/api/projects/:id/scenes/:index/variants',(req,res)=>{
  const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'});
  const index=Number(req.params.index), variants=j.sceneVariants?.[String(index)]||[];
  res.json(variants.map(({file,captions,sourceFile,...v})=>v));
});
app.get('/api/projects/:id/scenes/:index/variants/:variantId/video',(req,res)=>{
  const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'});
  const v=(j.sceneVariants?.[String(Number(req.params.index))]||[]).find(x=>x.id===req.params.variantId);
  if(!v?.file||!fs.existsSync(v.file))return res.status(404).json({error:'variant video not ready'});
  res.sendFile(v.file);
});
app.post('/api/projects/:id/scenes/:index/variants/:variantId/select',(req,res)=>{
  const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'});
  if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});
  const index=Number(req.params.index), variants=j.sceneVariants?.[String(index)]||[], v=variants.find(x=>x.id===req.params.variantId);
  if(!v?.file||!fs.existsSync(v.file))return res.status(404).json({error:'variant not found'});
  archiveSceneVariant(j,index);
  const selected={index,duration:v.duration,assets:v.assets||[],hasRealVideo:!!v.hasRealVideo,visualType:v.visualType||'unknown',candidateScore:v.candidateScore,aiProvider:v.aiProvider,aiJobId:v.aiJobId,file:v.file,captions:v.captions,variantId:v.id,narration:j.storyboard?.find(s=>s.index===index)?.narration||''};
  j.scenes=[...(j.scenes||[]).filter(s=>s.index!==index),selected].sort((a,b)=>a.index-b.index); j.status='queued'; j.progress=85; delete j.error; delete j.render;
  save(j); setImmediate(kick); res.status(202).json({id:j.id,scene:index,variantId:v.id,status:j.status});
});
app.get('/api/projects/:id/scenes/:index/video',(req,res)=>{
  const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'});
  const scene=j.scenes?.find(s=>s.index===Number(req.params.index));
  if(!scene?.file||!fs.existsSync(scene.file))return res.status(404).json({error:'scene video not ready'});
  res.sendFile(scene.file);
});

app.get('/api/projects',(req,res)=>res.json(list()));
app.get('/api/projects/:id',(req,res)=>{ const j=load(req.params.id); if(!j) return res.status(404).json({error:'not found'}); res.json(j); });
app.get('/api/projects/:id/prompts',(req,res)=>{ const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'}); if(!j.generationPlan)return res.status(404).json({error:'generation plan not ready'}); res.json(j.generationPlan); });
app.get('/api/projects/:id/generative-queue',(req,res)=>{ const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'}); const f=j.generativeQueue?.file; if(!f||!fs.existsSync(f))return res.status(404).json({error:'generative queue not ready'}); res.sendFile(f); });
app.get('/api/projects/:id/video',(req,res)=>{ const j=load(req.params.id); if(!j?.render?.file||!fs.existsSync(j.render.file)) return res.status(404).json({error:'video not ready'}); res.sendFile(j.render.file); });
app.get('/api/projects/:id/credits',(req,res)=>{ const j=load(req.params.id); if(!j?.render?.credits||!fs.existsSync(j.render.credits)) return res.status(404).json({error:'credits not ready'}); res.sendFile(j.render.credits); });

for(const job of list()){if(!['complete','failed','queued'].includes(job.status)){job.status='failed';job.error='Interrupted by restart; retry resumes completed scenes';save(job);}}
reconcileProviderJobs(DATA);setInterval(()=>reconcileProviderJobs(DATA),30000).unref();
setImmediate(kick);
app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Shorts Studio listening on ${PORT}`));
