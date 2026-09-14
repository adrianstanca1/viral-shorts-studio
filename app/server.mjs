import { providerInventory } from './free-router.mjs';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { produceProject, mediaProviderStatus } from './pipeline.mjs';
import { textProviderStatus } from './text-router.mjs';
import { generativeStatus } from './generative-router.mjs';

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(express.static(new URL('./public', import.meta.url).pathname));
const PORT = Number(process.env.PORT || 3010);
const DATA = process.env.DATA_DIR || '/app/data';
const niches = ['true-crime','history','storytelling','fact-check'];
const styles = ['documentary','cinematic','whiteboard'];
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
app.get('/api/providers',async(req,res)=>res.json({...providerInventory(),media:mediaProviderStatus(),generative:generativeStatus(),text:await textProviderStatus()}));
app.get('/api/stats',(req,res)=>{
  const all=list(), completed=all.filter(x=>x.status==='complete'), failed=all.filter(x=>x.status==='failed');
  const timed=a=>a.filter(x=>Number(x.metrics?.totalSeconds)>0); const avg=a=>{const t=timed(a);return t.length?Number((t.reduce((n,x)=>n+Number(x.metrics.totalSeconds),0)/t.length).toFixed(2)):0;};
  res.json({projects:all.length,completed:completed.length,failed:failed.length,queued:all.filter(x=>x.status==='queued').length,successRate:all.length?Number((100*completed.length/all.length).toFixed(1)):0,averageProductionSeconds:avg(completed),researchCacheHits:completed.filter(x=>x.researchCacheHit).length,mediaCacheHits:completed.filter(x=>x.mediaCacheHit).length,averageViralityScore:completed.length?Number((completed.reduce((n,x)=>n+Number(x.qa?.viralityScore||0),0)/completed.length).toFixed(1)):0});
});
app.get('/api/capabilities',(req,res)=>res.json({
  niches,
  stages:['research','source-check','hook','script','storyboard','shot-direction','visual-prompts','candidate-generation','candidate-scoring','auto-selection','motion-clips','voice','captions','render','credits','qa'],
  formats:['9:16','30s / 8 scenes','60s / 14 scenes','90s / 20 scenes'],
  styles,
  currentProviders:['Wikipedia research','Wikimedia Commons licensed imagery','FFmpeg motion-video','FFmpeg Flite narration'],
  optionalProviders:['Pexels','Pixabay','OpenRouter','Tavily','fal.ai','future image-to-video adapters'],
  policy:['cite sources','preserve asset credits','approval before publishing','do not fabricate real-crime claims']
}));

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
  const variant={id,index,createdAt:new Date().toISOString(),variantSeed:Number(story?.variantSeed||0),duration:current.duration,assets:current.assets||[],hasRealVideo:!!current.hasRealVideo,file,captions,sourceFile:current.file};
  j.sceneVariants[key].push(variant); return variant;
}

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
  const selected={index,duration:v.duration,assets:v.assets||[],hasRealVideo:!!v.hasRealVideo,file:v.file,captions:v.captions,variantId:v.id,narration:j.storyboard?.find(s=>s.index===index)?.narration||''};
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
setImmediate(kick);
app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Shorts Studio listening on ${PORT}`));
