import { providerInventory } from './free-router.mjs';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { produceProject, mediaProviderStatus } from './pipeline.mjs';
import { textProviderStatus } from './text-router.mjs';
import { generativeStatus } from './generative-router.mjs';
import { buildAiGenerationPlan, summarizeAiPlan } from './ai-generation-manager.mjs';
import { registerAiCandidate, registerLocalAiCandidate, listAiCandidates, aiCandidateStatus, deleteAiCandidatesForProject } from './ai-candidate-router.mjs';
import { createProviderJob, getProviderJob, resolveProviderJob, failProviderJob, providerJobStatus, listProviderJobs, claimProviderJobs, releaseProviderJob, reconcileProviderJobs, deleteProviderJobsForProject } from './provider-job-router.mjs';
import { providerWorkerInventory } from './provider-adapters.mjs';
import { refreshOpenRouterFreeCatalog, readOpenRouterFreeCatalog } from './openrouter-catalog.mjs';
import { chooseFreeProvider, freeProviderSummary, canQueueFreeProvider } from './provider-selector.mjs';
import { readVerification, verifyProviders, recordFreeEvidence } from './provider-verifier.mjs';
import { authConfigured, assertLaunchSecurity, isOwner, securityHeaders, createRateLimiter, loginPage, setOwnerCookie, clearOwnerCookie, safeEqual } from './security.mjs';
import { recoverProjectState } from './recovery.mjs';

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'16kb'}));
const AUTH_SECRET=process.env.APP_AUTH_SECRET||'';
const PUBLIC_LAUNCH=['1','true','yes','on'].includes(String(process.env.PUBLIC_LAUNCH||'').toLowerCase());
assertLaunchSecurity({publicLaunch:PUBLIC_LAUNCH,secret:AUTH_SECRET});
const WORKER_TOKEN=process.env.PROVIDER_WORKER_TOKEN||'';
app.get('/login',(req,res)=>{if(!authConfigured(AUTH_SECRET))return res.redirect('/');res.type('html').send(loginPage(req.query.error==='1'));});
app.post('/api/session',createRateLimiter({windowMs:15*60_000,max:10}),(req,res)=>{if(!authConfigured(AUTH_SECRET))return res.status(409).json({error:'Owner authentication is not configured'});if(!safeEqual(req.body?.password,AUTH_SECRET))return res.redirect('/login?error=1');setOwnerCookie(req,res,AUTH_SECRET);res.redirect('/');});
app.post('/api/logout',(req,res)=>{clearOwnerCookie(res);res.redirect('/login');});
app.use((req,res,next)=>{if(req.path==='/api/health'||req.path==='/login'||req.path==='/api/session')return next();if(WORKER_TOKEN&&safeEqual(req.get('x-provider-worker-token'),WORKER_TOKEN))return next();if(isOwner(req,AUTH_SECRET))return next();if(req.path.startsWith('/api/'))return res.status(401).json({error:'authentication required'});return res.redirect('/login');});
app.use(createRateLimiter({windowMs:5*60_000,max:Number(process.env.WRITE_RATE_LIMIT||120)}));
app.use(express.static(new URL('./public', import.meta.url).pathname));
const PORT = Number(process.env.PORT || 3010);
const DATA = process.env.DATA_DIR || '/app/data';
const niches = ['true-crime','history','storytelling','fact-check'];
const styles = ['documentary','cinematic','hybrid','whiteboard'];
const jobs = new Map();
const enabledFlag=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
let active=false;
let shuttingDown=false;
function kick(){
  if(active)return;
  const job=[...jobs.values()].find(j=>j.status==='queued');if(!job)return;
  active=true;
  produceProject(job,DATA,save).catch(()=>{}).finally(()=>{active=false;kick();});
}

function projectDir(id){ return path.join(DATA,'projects',id); }
function projectFile(id){ return path.join(projectDir(id),'project.json'); }
function save(job){ fs.mkdirSync(projectDir(job.id),{recursive:true}); fs.writeFileSync(projectFile(job.id),JSON.stringify(job,null,2)); jobs.set(job.id,job); if(job.status==='complete'&&enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))setImmediate(()=>maybeAutoCloudPlan(job.id)); }
function load(id){ if(jobs.has(id)) return jobs.get(id); const p=projectFile(id); if(!fs.existsSync(p)) return null; const j=JSON.parse(fs.readFileSync(p,'utf8')); jobs.set(id,j); return j; }
function list(){ const d=path.join(DATA,'projects'); fs.mkdirSync(d,{recursive:true}); return fs.readdirSync(d).map(id=>load(id)).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); }
function projectSummary(j){ const variants=Object.values(j.sceneVariants||{}).reduce((n,v)=>n+(Array.isArray(v)?v.length:0),0); return {id:j.id,topic:j.topic,niche:j.niche,style:j.style||'documentary',duration:j.duration,status:j.status,progress:Number(j.progress||0),createdAt:j.createdAt,completedAt:j.completedAt||null,error:j.error?String(j.error).slice(0,240):null,sceneCount:j.scenes?.length||0,variantCount:variants,score:j.qa?.viralityScore??null,actualDuration:j.render?.actualDuration??null,hasVideo:!!j.render?.file}; }

async function maybeAutoCloudPlan(id){
  const j=load(id);if(!j||j.status!=='complete'||!j.render?.file||!fs.existsSync(j.render.file))return;
  const stamp=String(Math.round(fs.statSync(j.render.file).mtimeMs));if(j.aiAutoPlanRenderStamp===stamp)return;
  const chosen=chooseFreeProvider(DATA,'auto');
  if(!chosen||!canQueueFreeProvider(chosen))return;
  j.aiAutoPlanRenderStamp=stamp;
  const plan=buildAiGenerationPlan(j,{provider:chosen.id,providerKind:chosen.kind,allowance:Math.min(Number(chosen.remaining||0),4),maxScenes:4,minScore:82});
  const created=[];for(const item of plan.selected){created.push(createProviderJob(DATA,{provider:chosen.id,projectId:j.id,sceneIndex:item.index,kind:chosen.kind,prompt:[item.visualPrompt,item.motionPrompt].filter(Boolean).join(' | '),verifiedFree:true,priority:item.priority}))}
  j.aiGenerationPlan={...plan,auto:true,route:{kind:chosen.kind,connectorOnly:!!chosen.connectorOnly,executable:!!chosen.executable}};j.aiFreeAllowance=plan.allowance;j.aiAutoJobs=created.map(x=>x.id);fs.writeFileSync(projectFile(j.id),JSON.stringify(j,null,2));jobs.set(j.id,j);
}

app.get('/api/health',(req,res)=>res.json({status:'ok',service:'viral-shorts-studio',mode:'autonomous-production',niches}));
app.get('/api/providers',async(req,res)=>res.json({...providerInventory(),media:mediaProviderStatus(),generative:generativeStatus(),text:await textProviderStatus(),providerJobs:providerJobStatus(DATA),workerProviders:providerWorkerInventory(DATA),freeProviderRouting:freeProviderSummary(DATA)}));
app.get('/api/diagnostics',async(req,res)=>{
  try{
    const st=fs.statfsSync(DATA),freeBytes=Number(st.bavail)*Number(st.bsize),totalBytes=Number(st.blocks)*Number(st.bsize),freePercent=totalBytes?Number((100*freeBytes/totalBytes).toFixed(1)):0;
    const text=await textProviderStatus(),local=text.providers?.find(p=>p.id==='ollama-local');
    const jobsState=providerJobStatus(DATA),pending=(jobsState.counts?.pending||0)+(jobsState.counts?.leased||0);
    const workerFile=path.join(DATA,'provider-worker-status.json');let workerAgeSeconds=null;try{workerAgeSeconds=Math.max(0,Math.round((Date.now()-fs.statSync(workerFile).mtimeMs)/1000));}catch{}
    const checks=[
      {id:'storage',label:'Storage',ok:freePercent>=10,detail:`${(freeBytes/1073741824).toFixed(1)} GB free`},
      {id:'local-ai',label:'Local AI',ok:local?.status==='available'&&local?.enabled!==false,detail:local?.status||'unavailable'},
      {id:'queue',label:'Generation queue',ok:pending<25,detail:`${pending} pending/leased`},
      {id:'worker',label:'Provider worker',ok:workerAgeSeconds===null||workerAgeSeconds<180,detail:workerAgeSeconds===null?'no heartbeat yet':`${workerAgeSeconds}s since heartbeat`},
      {id:'cost-policy',label:'Cost policy',ok:true,detail:'free-only; paid fallback disabled'},
      {id:'owner-auth',label:'Owner authentication',ok:authConfigured(AUTH_SECRET)||!PUBLIC_LAUNCH,detail:authConfigured(AUTH_SECRET)?'configured':PUBLIC_LAUNCH?'required but missing':'optional for local-only mode'},
      {id:'public-launch',label:'Public launch guard',ok:!PUBLIC_LAUNCH||authConfigured(AUTH_SECRET),detail:PUBLIC_LAUNCH?'public mode enabled':'local-only mode'},
      {id:'rate-limit',label:'Write rate limit',ok:true,detail:`${Number(process.env.WRITE_RATE_LIMIT||120)} requests / 5 min`}
    ];
    const critical=checks.filter(x=>['storage','local-ai','queue'].includes(x.id));
    res.json({status:critical.every(x=>x.ok)?'ready':'degraded',checks,storage:{freeBytes,totalBytes,freePercent},queue:{pending},activeProject:active,shuttingDown,generatedAt:new Date().toISOString()});
  }catch(e){res.status(500).json({status:'degraded',error:'diagnostics unavailable'});}
});

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


app.get('/api/openrouter/free-models',(req,res)=>res.json(readOpenRouterFreeCatalog()));
app.get('/api/provider-worker/status',(req,res)=>{const f=path.join(DATA,'provider-worker-status.json');if(!fs.existsSync(f))return res.json({state:'offline'});try{res.json(JSON.parse(fs.readFileSync(f,'utf8')))}catch{res.json({state:'invalid'})}});
app.get('/api/provider-verification',(req,res)=>res.json({state:readVerification(DATA),worker:providerWorkerInventory(DATA)}));
app.post('/api/provider-verification/check',async(req,res)=>{try{res.json(await verifyProviders(DATA))}catch(e){res.status(500).json({error:String(e.message||e)})}});
app.post('/api/provider-verification/evidence',(req,res)=>{try{if(!process.env.PROVIDER_WORKER_TOKEN||req.get('x-provider-worker-token')!==process.env.PROVIDER_WORKER_TOKEN)return res.status(403).json({error:'forbidden'});res.json(recordFreeEvidence(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/provider-jobs',(req,res)=>{const status=String(req.query.status||'').trim(),provider=String(req.query.provider||'').trim().toLowerCase(),projectId=String(req.query.projectId||'').trim();res.json({...providerJobStatus(DATA),jobs:listProviderJobs(DATA,{status,provider,projectId}).slice(0,100)});});
app.get('/api/provider-jobs/:id',(req,res)=>{const j=getProviderJob(DATA,req.params.id);if(!j)return res.status(404).json({error:'not found'});res.json(j)});
app.post('/api/provider-jobs/claim',(req,res)=>{try{res.json({jobs:claimProviderJobs(DATA,req.body||{})})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/provider-jobs/:id/release',(req,res)=>{try{res.json(releaseProviderJob(DATA,req.params.id,req.body?.error))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/provider-jobs',(req,res)=>{try{const body=req.body||{};if(!load(String(body.projectId||'')))return res.status(404).json({error:'project not found'});res.status(201).json(createProviderJob(DATA,body))}catch(e){res.status(400).json({error:String(e.message||e)})}});

function freePlanOptions(input={},project={}){
  const requested=String(input.provider||'auto').toLowerCase(),chosen=chooseFreeProvider(DATA,requested);
  const allowance=input.allowance!==undefined?Math.max(0,Number(input.allowance||0)):Number(chosen?.remaining||project.aiFreeAllowance||0);
  return {provider:chosen?.id||'none',allowance:chosen?Math.min(allowance,Number(chosen.remaining||0)):0,maxScenes:Number(input.maxScenes||4),minScore:Number(input.minScore||82),providerKind:chosen?.kind||null,connectorOnly:!!chosen?.connectorOnly,executable:!!chosen?.executable};
}
app.get('/api/projects/:id/ai-generation-plan',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  const opt=freePlanOptions(req.query,j),plan=buildAiGenerationPlan(j,opt);res.json({...plan,route:{kind:opt.providerKind,connectorOnly:opt.connectorOnly,executable:opt.executable}});
});
app.post('/api/projects/:id/ai-generation-plan',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project must finish before cloud scene planning'});
  const body=req.body||{},opt=freePlanOptions(body,j),plan=buildAiGenerationPlan(j,opt);j.aiGenerationPlan=plan;j.aiFreeAllowance=plan.allowance;save(j);
  if(body.createJobs===true&&plan.provider==='none')return res.status(409).json({error:'No verified-free provider allowance is currently available',plan});
  if(body.createJobs===true&&!canQueueFreeProvider({...opt,verifiedFree:plan.provider!=='none',remaining:plan.allowance}))return res.status(409).json({error:'Selected free provider is connector-only or not executable by the VPS worker',plan:{...plan,route:{kind:opt.providerKind,connectorOnly:opt.connectorOnly,executable:opt.executable}}});
  const jobsCreated=[];if(body.createJobs===true){for(const item of plan.selected){jobsCreated.push(createProviderJob(DATA,{provider:plan.provider,projectId:j.id,sceneIndex:item.index,kind:opt.providerKind||item.kind,prompt:[item.visualPrompt,item.motionPrompt].filter(Boolean).join(' | '),verifiedFree:true,priority:item.priority}))}}
  res.status(201).json({plan:{...plan,route:{kind:opt.providerKind,connectorOnly:opt.connectorOnly,executable:opt.executable}},summary:summarizeAiPlan(plan),jobs:jobsCreated});
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
  if(shuttingDown)return res.status(503).json({error:'Studio is restarting; retry shortly'});
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

app.get('/api/projects',(req,res)=>res.json(list().map(projectSummary)));
app.get('/api/projects/:id',(req,res)=>{ const j=load(req.params.id); if(!j) return res.status(404).json({error:'not found'}); res.json(j); });
app.get('/api/projects/:id/prompts',(req,res)=>{ const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'}); if(!j.generationPlan)return res.status(404).json({error:'generation plan not ready'}); res.json(j.generationPlan); });
app.get('/api/projects/:id/generative-queue',(req,res)=>{ const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'}); const f=j.generativeQueue?.file; if(!f||!fs.existsSync(f))return res.status(404).json({error:'generative queue not ready'}); res.sendFile(f); });
function downloadName(j,suffix){const base=String(j.topic||'viral-short').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'viral-short';return `${base}-${suffix}`;}
function publicExport(j){
  return {id:j.id,topic:j.topic,niche:j.niche,style:j.style,duration:j.duration,status:j.status,createdAt:j.createdAt,completedAt:j.completedAt||null,publish:j.publish||null,qa:j.qa||null,metrics:j.metrics||null,sources:(j.sources||[]).map(x=>({title:x.title,url:x.url,provider:x.provider})),storyboard:(j.storyboard||[]).map(x=>({index:x.index,beat:x.beat,narration:x.narration,overlay:x.overlay,searchQuery:x.searchQuery})),scenes:(j.scenes||[]).map(x=>({index:x.index,duration:x.duration,visualType:x.visualType,hasRealVideo:!!x.hasRealVideo,candidateScore:x.candidateScore,aiProvider:x.aiProvider||null,assets:(x.assets||[]).map(a=>({title:a.title,source:a.source||a.url||null,license:a.license||null,artist:a.artist||null,type:a.type||null,provider:a.provider||null}))}))};
}
app.get('/api/projects/:id/video',(req,res)=>{ const j=load(req.params.id); if(!j?.render?.file||!fs.existsSync(j.render.file)) return res.status(404).json({error:'video not ready'}); if(req.query.download==='1')return res.download(j.render.file,downloadName(j,'final.mp4')); res.sendFile(j.render.file); });
app.get('/api/projects/:id/credits',(req,res)=>{ const j=load(req.params.id); if(!j?.render?.credits||!fs.existsSync(j.render.credits)) return res.status(404).json({error:'credits not ready'}); if(req.query.download==='1')return res.download(j.render.credits,downloadName(j,'credits.json')); res.sendFile(j.render.credits); });
app.get('/api/projects/:id/export',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});res.setHeader('Content-Disposition',`attachment; filename="${downloadName(j,'project.json')}"`);res.json(publicExport(j));});
app.delete('/api/projects/:id',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});const providerJobsDeleted=deleteProviderJobsForProject(DATA,j.id),aiInboxDeleted=deleteAiCandidatesForProject(DATA,j.id);jobs.delete(j.id);fs.rmSync(projectDir(j.id),{recursive:true,force:true});res.json({deleted:true,id:j.id,providerJobsDeleted,aiInboxDeleted});});

for(const job of list()){const recovered=recoverProjectState(job);if(recovered.changed)save(job);}
reconcileProviderJobs(DATA);verifyProviders(DATA).catch(()=>{});refreshOpenRouterFreeCatalog().catch(()=>{});setInterval(()=>reconcileProviderJobs(DATA),30000).unref();setInterval(()=>verifyProviders(DATA).catch(()=>{}),15*60*1000).unref();setInterval(()=>refreshOpenRouterFreeCatalog().catch(()=>{}),30*60*1000).unref();
setInterval(()=>{if(enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))for(const j of list())if(j.status==='complete')maybeAutoCloudPlan(j.id).catch(()=>{});},60000).unref();
setImmediate(()=>{kick();if(enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))for(const j of list())if(j.status==='complete')maybeAutoCloudPlan(j.id).catch(()=>{});});
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Shorts Studio listening on ${PORT}`));
async function gracefulShutdown(signal){
  if(shuttingDown)return;shuttingDown=true;console.log(`${signal}: draining`);server.close();
  const deadline=Date.now()+35_000;while(active&&Date.now()<deadline)await new Promise(r=>setTimeout(r,500));
  process.exit(active?1:0);
}
process.once('SIGTERM',()=>gracefulShutdown('SIGTERM'));process.once('SIGINT',()=>gracefulShutdown('SIGINT'));
