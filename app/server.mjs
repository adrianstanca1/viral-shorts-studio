import { providerInventory } from './free-router.mjs';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { produceProject, mediaProviderStatus } from './pipeline.mjs';
import { textProviderStatus } from './text-router.mjs';
import { generativeStatus } from './generative-router.mjs';
import { buildAiGenerationPlan, summarizeAiPlan } from './ai-generation-manager.mjs';
import { registerAiCandidate, registerLocalAiCandidate, listAiCandidates, aiCandidateStatus, deleteAiCandidatesForProject } from './ai-candidate-router.mjs';
import { createProviderJob, getProviderJob, resolveProviderJob, failProviderJob, providerJobStatus, listProviderJobs, providerJobsSnapshot, claimProviderJobs, releaseProviderJob, reconcileProviderJobs, maintainProviderJobs, deleteProviderJobsForProject } from './provider-job-router.mjs';
import { providerWorkerInventory } from './provider-adapters.mjs';
import { refreshOpenRouterFreeCatalog, readOpenRouterFreeCatalog } from './openrouter-catalog.mjs';
import { chooseFreeProvider, freeProviderSummary, canQueueFreeProvider } from './provider-selector.mjs';
import { readVerification, verifyProviders, recordFreeEvidence } from './provider-verifier.mjs';
import { authConfigured, assertLaunchSecurity, isOwner, securityHeaders, createRateLimiter, loginPage, setOwnerCookie, clearOwnerCookie, safeEqual } from './security.mjs';
import { recoverProjectState, prepareProjectRetry, inferFailureStage, failureIsRecent, classifyRecoverability } from './recovery.mjs';
import { ensurePublishApproval, decidePublishApproval, invalidatePublishApproval } from './publish-approval.mjs';
import { buildDistributionPackage, createPublishJob, listPublishJobs, publishQueueSummary, deletePublishJobsForProject, getPublishJob, updatePublishJob } from './publishing.mjs';
import { youtubePublisherStatus, uploadYouTubeVideo } from './youtube-publisher.mjs';
import { googleOAuthStatus, beginGoogleOAuth, finishGoogleOAuth, googleLoginAuthorized, pairGoogleOwner, saveYouTubeGrant, youtubeCredentialEnv } from './google-oauth.mjs';
import { saveGoogleOAuthClientAuthenticated, googleSetupPage, googleSetupSuccessPage } from './google-setup.mjs';
import { verifyOwnerPassword, createOwnerRecovery, ownerRecoveryStatus, completeOwnerRecovery } from './owner-auth.mjs';
import { recoveryPage, recoveryCookie, setRecoveryCookie, clearRecoveryCookie } from './owner-recovery-page.mjs';
import { imageKinds, listCreatorAssets, createImageBrief, createCharacter, getCharacter, getImageAsset, resolveImageAsset, failImageAsset } from './creator-assets.mjs';
import { readBrandBrain, saveBrandBrain, brandPrompt } from './brand-brain.mjs';
import { runResearch, listResearch, researchPrompt } from './research-studio.mjs';
import { listProducts, getProduct, createProduct } from './product-studio.mjs';
import { listSites, getSite, createSite } from './website-studio.mjs';
import { creatorTools, planCreatorGoal } from './creator-agent.mjs';
import { listRuns, createRun, updateRun, syncRunWithProjects } from './creator-runs.mjs';
import { buildCreatorAnalytics, recordAnalyticsSnapshot, readAnalytics, listExperiments, createExperiment, updateExperiment } from './creator-analytics.mjs';

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'16kb'}));
const AUTH_SECRET=process.env.APP_AUTH_SECRET||'';
const PUBLIC_LAUNCH=['1','true','yes','on'].includes(String(process.env.PUBLIC_LAUNCH||'').toLowerCase());
assertLaunchSecurity({publicLaunch:PUBLIC_LAUNCH,secret:AUTH_SECRET});
const WORKER_TOKEN=process.env.PROVIDER_WORKER_TOKEN||'';
const DATA = process.env.DATA_DIR || '/app/data';
function googleRedirectUri(req){const explicit=String(process.env.GOOGLE_OAUTH_REDIRECT_URI||'').trim();if(explicit)return explicit;const proto=String(req.get('x-forwarded-proto')||req.protocol||'https').split(',')[0].trim();return `${proto}://${req.get('host')}/api/oauth/google/callback`;}
app.get('/login',(req,res)=>{if(!authConfigured(AUTH_SECRET))return res.redirect('/');const gs=googleOAuthStatus(DATA);res.type('html').send(loginPage(req.query.error==='1',{googleEnabled:gs.loginEnabled,googleError:req.query.google_error==='1',recoveryEnabled:true}));});
app.post('/api/session',createRateLimiter({windowMs:15*60_000,max:10}),(req,res)=>{if(!authConfigured(AUTH_SECRET))return res.status(409).json({error:'Owner authentication is not configured'});if(!verifyOwnerPassword(DATA,req.body?.password,{legacySecret:AUTH_SECRET}))return res.redirect('/login?error=1');setOwnerCookie(req,res,AUTH_SECRET);res.redirect('/');});
app.post('/api/logout',(req,res)=>{clearOwnerCookie(res);res.redirect('/login');});
app.get('/api/oauth/google/login',(req,res)=>{const gs=googleOAuthStatus(DATA);if(!gs.loginEnabled)return res.redirect('/login?google_error=1');try{return res.redirect(beginGoogleOAuth({flow:'login',redirectUri:googleRedirectUri(req),root:DATA}))}catch{return res.redirect('/login?google_error=1')}});
app.get('/api/oauth/google/callback',async(req,res)=>{if(req.query.error||!req.query.code||!req.query.state)return res.redirect('/login?google_error=1');try{const result=await finishGoogleOAuth({code:req.query.code,state:req.query.state,root:DATA});if(result.flow==='login'){if(!googleLoginAuthorized(result.profile,DATA))return res.redirect('/login?google_error=1');pairGoogleOwner(result.profile,DATA);setOwnerCookie(req,res,AUTH_SECRET);return res.redirect('/');}if(result.flow==='youtube'){saveYouTubeGrant(result.profile,result.tokens,DATA);pairGoogleOwner(result.profile,DATA);return res.redirect('/?youtube=connected');}return res.redirect('/login?google_error=1')}catch(e){console.error('google oauth callback failed:',String(e.message||e).replace(/[A-Za-z0-9_\-.]{24,}/g,'[redacted]'));return res.redirect('/login?google_error=1')}});
app.get('/recover-owner',(req,res)=>{res.setHeader('Cache-Control','no-store');const st=ownerRecoveryStatus(DATA,recoveryCookie(req));return res.type('html').send(recoveryPage({state:st.state,code:st.item?.code||''}))});
app.post('/recover-owner/request',createRateLimiter({windowMs:15*60_000,max:5}),(req,res)=>{res.setHeader('Cache-Control','no-store');const item=createOwnerRecovery(DATA);setRecoveryCookie(req,res,item.id);return res.type('html').send(recoveryPage({state:'pending',code:item.code}))});
app.post('/recover-owner/complete',createRateLimiter({windowMs:15*60_000,max:5}),(req,res)=>{res.setHeader('Cache-Control','no-store');const id=recoveryCookie(req),st=ownerRecoveryStatus(DATA,id);if(st.state!=='approved')return res.status(403).type('html').send(recoveryPage({state:st.state,code:st.item?.code||''}));if(String(req.body?.password||'')!==String(req.body?.confirm||''))return res.status(400).type('html').send(recoveryPage({state:'approved',error:'Passwords do not match'}));try{completeOwnerRecovery(DATA,id,req.body?.password);clearRecoveryCookie(res);return res.type('html').send(recoveryPage({state:'done'}))}catch(e){return res.status(400).type('html').send(recoveryPage({state:'approved',error:String(e.message||e).slice(0,180)}))}});
app.use((req,res,next)=>{if(req.path==='/api/health'||req.path==='/login'||req.path==='/api/session'||req.path==='/recover-owner'||req.path==='/recover-owner/request'||req.path==='/recover-owner/complete')return next();if(WORKER_TOKEN&&safeEqual(req.get('x-provider-worker-token'),WORKER_TOKEN))return next();if(isOwner(req,AUTH_SECRET))return next();if(req.path.startsWith('/api/'))return res.status(401).json({error:'authentication required'});return res.redirect('/login');});
app.use(createRateLimiter({windowMs:5*60_000,max:Number(process.env.WRITE_RATE_LIMIT||120)}));
app.get('/setup/google',(req,res)=>{res.setHeader('Cache-Control','no-store');return res.type('html').send(googleSetupPage())});
app.post('/setup/google',(req,res)=>{res.setHeader('Cache-Control','no-store');try{saveGoogleOAuthClientAuthenticated(DATA,{clientId:req.body?.clientId,clientSecret:req.body?.clientSecret,ownerEmail:req.body?.ownerEmail});return res.type('html').send(googleSetupSuccessPage())}catch(e){return res.status(400).type('html').send(googleSetupPage({error:String(e.message||e).slice(0,180)}))}});
app.get('/api/oauth/google/youtube/connect',(req,res)=>{const gs=googleOAuthStatus(DATA);if(!gs.configured)return res.status(503).json({error:'Google OAuth client is not configured'});try{return res.redirect(beginGoogleOAuth({flow:'youtube',redirectUri:googleRedirectUri(req),root:DATA}))}catch(e){return res.status(503).json({error:String(e.message||e)})}});
app.use(express.static(new URL('./public', import.meta.url).pathname));
const PORT = Number(process.env.PORT || 3010);
const REQUIRE_PUBLISH_APPROVAL=!['0','false','no','off'].includes(String(process.env.REQUIRE_APPROVAL_BEFORE_PUBLISH??'true').toLowerCase());
const niches = ['true-crime','history','storytelling','fact-check'];
const styles = ['documentary','cinematic','hybrid','whiteboard','animated','motivational','finance','history-ancient','space-sci-fi'];
const videoModes=['multi-scene','single-scene','whiteboard'];
const languages=['en','fr','es','it','de'];
const aspects=['9:16','16:9','1:1'];
const voices=['auto','narrator'];
const captionStyles=['bold','documentary','minimal'];
const jobs = new Map();
const enabledFlag=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
let active=false;
let shuttingDown=false;
let lastProviderMaintenance=null;
function kick(){
  if(active)return;
  const job=[...jobs.values()].find(j=>j.status==='queued');if(!job)return;
  active=true;
  produceProject(job,DATA,save).catch(()=>{}).finally(()=>{active=false;kick();});
}

function projectDir(id){ return path.join(DATA,'projects',id); }
function projectFile(id){ return path.join(projectDir(id),'project.json'); }
function writeJsonAtomic(file,value){const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}
function save(job){ if(job.status==='complete')ensurePublishApproval(job,{required:REQUIRE_PUBLISH_APPROVAL}); fs.mkdirSync(projectDir(job.id),{recursive:true}); writeJsonAtomic(projectFile(job.id),job); jobs.set(job.id,job); if(job.status==='complete'&&enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))setImmediate(()=>maybeAutoCloudPlan(job.id)); }
function load(id){ if(jobs.has(id)) return jobs.get(id); const p=projectFile(id); if(!fs.existsSync(p)) return null; const j=JSON.parse(fs.readFileSync(p,'utf8')); const hadApproval=!!j.publishApproval?.status;if(j.status==='complete')ensurePublishApproval(j,{required:REQUIRE_PUBLISH_APPROVAL});if(!hadApproval&&j.publishApproval?.status)writeJsonAtomic(p,j);jobs.set(id,j); return j; }
function list(){ const d=path.join(DATA,'projects'); fs.mkdirSync(d,{recursive:true}); return fs.readdirSync(d).map(id=>load(id)).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); }
function projectSummary(j){ const variants=Object.values(j.sceneVariants||{}).reduce((n,v)=>n+(Array.isArray(v)?v.length:0),0),publishJobs=listPublishJobs(DATA,{projectId:j.id}); return {id:j.id,topic:j.topic,niche:j.niche,style:j.style||'documentary',mode:j.mode||'multi-scene',language:j.language||'en',aspect:j.aspect||'9:16',voice:j.voice||'auto',captionStyle:j.captionStyle||'bold',duration:j.duration,status:j.status,progress:Number(j.progress||0),createdAt:j.createdAt,completedAt:j.completedAt||null,error:j.error?String(j.error).slice(0,240):null,failedStage:j.failedStage||null,retryCount:Number(j.retryCount||0),recoverability:j.status==='failed'?classifyRecoverability(j):null,publishApproval:j.publishApproval||null,launchReady:j.qa?.launchReady===true,sceneCount:j.scenes?.length||0,variantCount:variants,score:j.qa?.viralityScore??null,actualDuration:j.render?.actualDuration??null,hasVideo:!!j.render?.file,publishJobs:publishJobs.length}; }

async function maybeAutoCloudPlan(id){
  const j=load(id);if(!j||j.status!=='complete'||!j.render?.file||!fs.existsSync(j.render.file))return;
  const stamp=String(Math.round(fs.statSync(j.render.file).mtimeMs));if(j.aiAutoPlanRenderStamp===stamp)return;
  const chosen=chooseFreeProvider(DATA,'auto');
  if(!chosen||!canQueueFreeProvider(chosen))return;
  j.aiAutoPlanRenderStamp=stamp;
  const plan=buildAiGenerationPlan(j,{provider:chosen.id,providerKind:chosen.kind,allowance:Math.min(Number(chosen.remaining||0),4),maxScenes:4,minScore:82});
  const created=[];for(const item of plan.selected){created.push(createProviderJob(DATA,{provider:chosen.id,projectId:j.id,sceneIndex:item.index,kind:chosen.kind,prompt:[item.visualPrompt,item.motionPrompt].filter(Boolean).join(' | '),verifiedFree:true,priority:item.priority}))}
  j.aiGenerationPlan={...plan,auto:true,route:{kind:chosen.kind,connectorOnly:!!chosen.connectorOnly,executable:!!chosen.executable}};j.aiFreeAllowance=plan.allowance;j.aiAutoJobs=created.map(x=>x.id);writeJsonAtomic(projectFile(j.id),j);jobs.set(j.id,j);
}

app.get('/api/health',(req,res)=>res.json({status:'ok',service:'viral-shorts-studio',mode:'autonomous-production',niches}));
app.get('/api/providers',async(req,res)=>res.json({...providerInventory(),media:mediaProviderStatus(),generative:generativeStatus(),text:await textProviderStatus(),providerJobs:providerJobStatus(DATA),workerProviders:providerWorkerInventory(DATA),freeProviderRouting:freeProviderSummary(DATA)}));
function statsSnapshot(all=list()){
  const completed=all.filter(x=>x.status==='complete'),failed=all.filter(x=>x.status==='failed');
  const timed=a=>a.filter(x=>Number(x.metrics?.totalSeconds)>0),avg=a=>{const t=timed(a);return t.length?Number((t.reduce((n,x)=>n+Number(x.metrics.totalSeconds),0)/t.length).toFixed(2)):0;};
  const stageAvg=name=>{const xs=completed.map(x=>Number(x.metrics?.[name]||0)).filter(x=>x>0);return xs.length?Number((xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(2)):0;}; return {projects:all.length,completed:completed.length,failed:failed.length,queued:all.filter(x=>x.status==='queued').length,pendingApproval:completed.filter(x=>x.publishApproval?.status==='pending').length,launchReadyPending:completed.filter(x=>x.publishApproval?.status==='pending'&&x.qa?.launchReady===true).length,approved:completed.filter(x=>x.publishApproval?.status==='approved').length,rejected:completed.filter(x=>x.publishApproval?.status==='rejected').length,successRate:all.length?Number((100*completed.length/all.length).toFixed(1)):0,averageProductionSeconds:avg(completed),averageStageSeconds:{research:stageAvg('researchSeconds'),script:stageAvg('scriptSeconds'),storyboard:stageAvg('storyboardSeconds'),media:stageAvg('mediaDiscoverySeconds'),scenes:stageAvg('sceneRenderSeconds')},researchCacheHits:completed.filter(x=>x.researchCacheHit).length,mediaCacheHits:completed.filter(x=>x.mediaCacheHit).length,averageViralityScore:completed.length?Number((completed.reduce((n,x)=>n+Number(x.qa?.viralityScore||0),0)/completed.length).toFixed(1)):0};
}
async function diagnosticsSnapshot(allProjects=list(),providerSnapshot=providerJobsSnapshot(DATA)){
  const st=fs.statfsSync(DATA),freeBytes=Number(st.bavail)*Number(st.bsize),totalBytes=Number(st.blocks)*Number(st.bsize),freePercent=totalBytes?Number((100*freeBytes/totalBytes).toFixed(1)):0;
  const text=await textProviderStatus(),local=text.providers?.find(p=>p.id==='ollama-local'),pending=(providerSnapshot.counts?.pending||0)+(providerSnapshot.counts?.leased||0),providerFailures=(providerSnapshot.counts?.failed||0)+(providerSnapshot.counts?.expired||0);
  const projectById=new Map(allProjects.map(x=>[x.id,x])),allProviderFailures=providerSnapshot.jobs.filter(x=>['failed','expired'].includes(x.status)),recentProviderFailures=allProviderFailures.filter(x=>failureIsRecent(x,2)&&projectById.has(x.projectId)&&projectById.get(x.projectId)?.status!=='complete').length;
  const failedProjects=allProjects.filter(x=>x.status==='failed'),recentProjectFailures=failedProjects.filter(x=>failureIsRecent(x,2)).slice(0,5).map(x=>({id:x.id,topic:x.topic,stage:x.failedStage||inferFailureStage(x),error:String(x.error||'').slice(0,240),failedAt:x.failedAt||null,retryCount:Number(x.retryCount||0)}));
  const approvalSummary={pending:allProjects.filter(x=>x.status==='complete'&&x.publishApproval?.status==='pending').length,launchReadyPending:allProjects.filter(x=>x.status==='complete'&&x.publishApproval?.status==='pending'&&x.qa?.launchReady===true).length,approved:allProjects.filter(x=>x.status==='complete'&&x.publishApproval?.status==='approved').length,rejected:allProjects.filter(x=>x.status==='complete'&&x.publishApproval?.status==='rejected').length};
  const workerFile=path.join(DATA,'provider-worker-status.json');let workerAgeSeconds=null;try{workerAgeSeconds=Math.max(0,Math.round((Date.now()-fs.statSync(workerFile).mtimeMs)/1000));}catch{}
  const checks=[{id:'storage',label:'Storage',ok:freePercent>=10,detail:`${(freeBytes/1073741824).toFixed(1)} GB free`},{id:'local-ai',label:'Local AI',ok:local?.status==='available'&&local?.enabled!==false,detail:local?.status||'unavailable'},{id:'queue',label:'Generation queue',ok:pending<25,detail:`${pending} pending/leased`},{id:'worker',label:'Provider worker',ok:workerAgeSeconds===null||workerAgeSeconds<180,detail:workerAgeSeconds===null?'no heartbeat yet':`${workerAgeSeconds}s since heartbeat`},{id:'cost-policy',label:'Cost policy',ok:true,detail:'free-only; paid fallback disabled'},{id:'owner-auth',label:'Owner authentication',ok:authConfigured(AUTH_SECRET)||!PUBLIC_LAUNCH,detail:authConfigured(AUTH_SECRET)?'configured':PUBLIC_LAUNCH?'required but missing':'optional for local-only mode'},{id:'public-launch',label:'Public launch guard',ok:!PUBLIC_LAUNCH||authConfigured(AUTH_SECRET),detail:PUBLIC_LAUNCH?'public mode enabled':'local-only mode'},{id:'rate-limit',label:'Write rate limit',ok:true,detail:`${Number(process.env.WRITE_RATE_LIMIT||120)} requests / 5 min`}];
  const critical=checks.filter(x=>['storage','local-ai','queue'].includes(x.id));
  return {status:critical.every(x=>x.ok)?'ready':'degraded',checks,storage:{freeBytes,totalBytes,freePercent},queue:{pending,recentProviderFailures,historicalProviderFailures:providerFailures},failureSummary:{recentProjects:recentProjectFailures.length,historicalProjects:failedProjects.length},approvalSummary,providerMaintenance:lastProviderMaintenance,textRouting:{policy:text.routing?.policy||null,learning:text.routing?.learning||null,leaderboards:text.routing?.leaderboards||{providers:[],models:[]}},recentProjectFailures,activeProject:active,shuttingDown,generatedAt:new Date().toISOString()};
}
app.get('/api/diagnostics',async(req,res)=>{try{res.json(await diagnosticsSnapshot())}catch{res.status(500).json({status:'degraded',error:'diagnostics unavailable'})}});
app.get('/api/stats',(req,res)=>res.json(statsSnapshot()));
app.get('/api/analytics',(req,res)=>{const snapshot=buildCreatorAnalytics(list(),listPublishJobs(DATA,{}));recordAnalyticsSnapshot(DATA,snapshot);res.json(snapshot)});
app.get('/api/analytics/history',(req,res)=>res.json(readAnalytics(DATA)));
app.get('/api/experiments',(req,res)=>res.json({experiments:listExperiments(DATA)}));
app.post('/api/experiments',(req,res)=>{try{const projectId=String(req.body?.projectId||'');if(!load(projectId))return res.status(404).json({error:'project not found'});res.status(201).json(createExperiment(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.patch('/api/experiments/:id',(req,res)=>{try{res.json(updateExperiment(DATA,req.params.id,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/dashboard',async(req,res)=>{try{const all=list(),providerSnapshot=providerJobsSnapshot(DATA),diagnostics=await diagnosticsSnapshot(all,providerSnapshot);res.json({health:{status:'ok',service:'viral-shorts-studio',mode:'autonomous-production'},projects:all.map(projectSummary),stats:statsSnapshot(all),providerJobs:{counts:providerSnapshot.counts,total:providerSnapshot.total,providers:providerSnapshot.providers,jobs:providerSnapshot.jobs.slice(0,100)},publishQueue:publishQueueSummary(DATA),publishingConnectors:{google:googleOAuthStatus(DATA),youtube:youtubePublisherStatus(youtubeCredentialEnv(DATA))},providerVerification:{state:readVerification(DATA),worker:providerWorkerInventory(DATA)},diagnostics})}catch{res.status(500).json({error:'dashboard unavailable'})}});
app.get('/api/capabilities',(req,res)=>res.json({
  niches,
  stages:['research','source-check','hook','script','storyboard','shot-direction','visual-prompts','archive-candidates','whiteboard-candidates','verified-free-ai-candidates','free-allowance-planning','provider-job-harvesting','candidate-scoring','auto-selection','motion-clips','voice','captions','render','credits','qa','approval','distribution-package','publish-queue'],
  formats:['9:16','16:9','1:1','30s / 8 scenes','60s / 14 scenes','90s / 20 scenes','2–20 min long-form / adaptive scenes'],
  videoModes, languages, aspects, voices, captionStyles, imageKinds:imageKinds(),
  styles,
  currentProviders:['Wikipedia research','Wikimedia Commons licensed imagery','FFmpeg motion-video','FFmpeg Flite narration'],
  optionalProviders:['Pexels','Pixabay','OpenRouter','Tavily','fal.ai','future image-to-video adapters'],
  policy:['cite sources','preserve asset credits','approval before publishing','do not fabricate real-crime claims']
}));


app.get('/api/creator-assets',(req,res)=>res.json({...listCreatorAssets(DATA),imageKinds:imageKinds()}));
app.get('/api/creator-assets/:id',(req,res)=>{const item=getImageAsset(DATA,req.params.id);return item?res.json(item):res.status(404).json({error:'not found'})});
app.post('/api/image-creations',(req,res)=>{try{const item=createImageBrief(DATA,req.body||{}),chosen=chooseFreeProvider(DATA,'auto');let providerJob=null;if(chosen&&canQueueFreeProvider(chosen)){providerJob=createProviderJob(DATA,{provider:chosen.id,projectId:`asset-${item.id}`,assetId:item.id,sceneIndex:1,kind:'image',prompt:item.prompt,verifiedFree:true,priority:55});}res.status(201).json({...item,providerJob,route:chosen?{provider:chosen.id,executable:!!chosen.executable,verifiedFree:!!chosen.verifiedFree}:null})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/characters',(req,res)=>{try{res.status(201).json(createCharacter(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/characters/:id',(req,res)=>{const x=getCharacter(DATA,req.params.id);return x?res.json(x):res.status(404).json({error:'not found'})});
app.get('/api/brand-brain',(req,res)=>res.json(readBrandBrain(DATA)));
app.put('/api/brand-brain',(req,res)=>{try{res.json(saveBrandBrain(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/research',(req,res)=>res.json({reports:listResearch(DATA).slice(0,30)}));
app.post('/api/research',async(req,res)=>{try{const report=await runResearch(DATA,req.body||{});res.status(201).json({...report,videoPrompt:researchPrompt(report)})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/products',(req,res)=>res.json({products:listProducts(DATA)}));
app.post('/api/products',(req,res)=>{try{res.status(201).json(createProduct(DATA,{...(req.body||{}),brand:readBrandBrain(DATA)}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/products/:id',(req,res)=>{const x=getProduct(DATA,req.params.id);return x?res.json(x):res.status(404).json({error:'not found'})});
app.get('/api/products/:id/export/:format',(req,res)=>{const x=getProduct(DATA,req.params.id),file=x?.exports?.[String(req.params.format||'').toLowerCase()];if(!x)return res.status(404).json({error:'not found'});if(!file||!fs.existsSync(file))return res.status(404).json({error:'export not found'});res.download(file,path.basename(file));});
app.get('/api/websites',(req,res)=>res.json({sites:listSites(DATA)}));
app.post('/api/websites',(req,res)=>{try{res.status(201).json(createSite(DATA,{...(req.body||{}),brand:readBrandBrain(DATA)}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/websites/:id',(req,res)=>{const x=getSite(DATA,req.params.id);return x?res.json(x):res.status(404).json({error:'not found'})});
app.get('/api/websites/:id/preview',(req,res)=>{const x=getSite(DATA,req.params.id),file=x?.exports?.html;if(!x)return res.status(404).json({error:'not found'});if(!file||!fs.existsSync(file))return res.status(404).json({error:'preview not found'});res.sendFile(file);});
app.get('/api/websites/:id/bundle',(req,res)=>{const x=getSite(DATA,req.params.id),file=x?.exports?.zip;if(!x)return res.status(404).json({error:'not found'});if(!file||!fs.existsSync(file))return res.status(404).json({error:'bundle not found'});res.download(file,`${String(x.name||'website').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-website.zip`);});
app.get('/api/creator-agent/tools',(req,res)=>res.json({tools:creatorTools,policy:{autonomy:'approval-gated',cost:'free-only'}}));
app.post('/api/creator-agent/plan',(req,res)=>{try{res.status(201).json(planCreatorGoal(req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/creator-agent/runs',(req,res)=>{const runs=listRuns(DATA).slice(0,30).map(run=>syncRunWithProjects(DATA,run,load)).map(run=>({...run,artifacts:(run.artifacts||[]).map(a=>a.type==='video'&&a.id?({...a,projectStatus:load(a.id)?.status||a.status,progress:load(a.id)?.progress??null,launchReady:load(a.id)?.qa?.launchReady===true,approval:load(a.id)?.publishApproval?.status||null}):a)}));res.json({runs})});
app.post('/api/creator-agent/execute',async(req,res)=>{let run;try{const plan=planCreatorGoal(req.body||{});run=createRun(DATA,plan);const artifacts=[];for(const step of run.steps){step.status='running';updateRun(DATA,run.id,{steps:run.steps,artifacts});if(step.tool==='research'){const report=await runResearch(DATA,{query:plan.goal,mode:'topic'});artifacts.push({type:'research',id:report.id,label:report.query});}else if(step.tool==='product-studio'){const item=createProduct(DATA,{title:plan.goal,type:/spreadsheet|tracker/i.test(plan.goal)?'spreadsheet':'ebook',brand:readBrandBrain(DATA)});artifacts.push({type:'product',id:item.id,label:item.title});}else if(step.tool==='website-builder'){const item=createSite(DATA,{name:plan.goal,goal:plan.goal,brand:readBrandBrain(DATA)});artifacts.push({type:'website',id:item.id,label:item.name});}else if(step.tool==='video-maker'){if([...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length>=5)throw Error('Video queue full');const brand=readBrandBrain(DATA),job={id:crypto.randomUUID(),status:'queued',progress:0,createdAt:new Date().toISOString(),niche:'storytelling',style:brand.visualStyle||'documentary',mode:'multi-scene',language:brand.language||'en',aspect:'9:16',voice:brand.voice||'auto',captionStyle:'bold',characterId:null,character:null,brand:{name:brand.name,version:brand.version},creatorContext:brandPrompt(brand,null),topic:plan.goal,duration:60,autonomous:true,autoCandidates:true,candidateCount:3,creatorRunId:run.id};save(job);artifacts.push({type:'video',id:job.id,topic:job.topic,status:'queued'});setImmediate(kick);}else if(step.tool==='image-maker'){const item=createImageBrief(DATA,{kind:'youtube-thumbnail',title:plan.goal,prompt:`High-retention thumbnail for ${plan.goal}`});artifacts.push({type:'image',id:item.id,label:item.title});}else if(step.tool==='publishing'){artifacts.push({type:'publishing',status:'blocked-until-video-approved'});}step.status='complete';}run=updateRun(DATA,run.id,{status:artifacts.some(a=>a.type==='video')?'producing':'awaiting-approval',steps:run.steps,artifacts,checkpoint:artifacts.some(a=>a.type==='video')?{stage:'video-production',projectId:artifacts.find(a=>a.type==='video').id,progress:0}:{stage:'approval'},completedAt:new Date().toISOString()});res.status(202).json(run)}catch(e){if(run)updateRun(DATA,run.id,{status:'failed',error:String(e.message||e).slice(0,240)});res.status(400).json({error:String(e.message||e)})}});


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
  const duration=Number(body.duration||60);
  if(!Number.isFinite(duration)||duration<30||duration>1200)return res.status(400).json({error:'Choose a duration from 30 seconds to 20 minutes'});
  const niche=niches.includes(body.niche)?body.niche:'storytelling';
  const requestedMode=videoModes.includes(body.mode)?body.mode:'multi-scene';
  const mode=body.style==='whiteboard'?'whiteboard':requestedMode;
  const style=mode==='whiteboard'?'whiteboard':styles.includes(body.style)?body.style:'documentary';
  const language=languages.includes(body.language)?body.language:'en';
  const aspect=aspects.includes(body.aspect)?body.aspect:'9:16';
  const voice=voices.includes(body.voice)?body.voice:'auto';
  const captionStyle=captionStyles.includes(body.captionStyle)?body.captionStyle:'bold';
  const character=body.characterId?getCharacter(DATA,String(body.characterId)):null;
  const brand=readBrandBrain(DATA);
  const creatorContext=brandPrompt(brand,character);
  const job={id:crypto.randomUUID(),status:'queued',progress:0,createdAt:new Date().toISOString(),niche,style,mode,language,aspect,voice,captionStyle,characterId:character?.id||null,character:character?{id:character.id,name:character.name}:null,brand:{name:brand.name,version:brand.version},creatorContext,topic,duration,autonomous:true,autoCandidates:body.autoCandidates!==false,candidateCount:Math.max(1,Math.min(4,Number(body.candidateCount||3)))};
  save(job); res.status(202).json(job);
  setImmediate(kick);
});

app.post('/api/projects/:id/retry',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  if(j.status!=='failed')return res.status(409).json({error:'Only failed projects can be retried'});
  if([...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length>=5)return res.status(429).json({error:'Queue full'});
  prepareProjectRetry(j);save(j);setImmediate(kick);res.status(202).json(j);
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
    if(existing.assetId){if(kind!=='image')return res.status(409).json({error:'creator asset expects image result'});const asset=resolveImageAsset(DATA,existing.assetId,{kind,localFile,provider:existing.provider,jobId:existing.id,model:req.body?.model});existing.status='ready';existing.resultKind=kind;existing.localFile=localFile;existing.model=String(req.body?.model||'').slice(0,200);delete existing.workerId;delete existing.leaseUntil;existing.updatedAt=new Date().toISOString();fs.writeFileSync(path.join(DATA,'provider-jobs',`${existing.id}.json`),JSON.stringify(existing,null,2));return res.json({job:existing,asset});}
    const item=registerLocalAiCandidate(DATA,existing.projectId,existing.sceneIndex,{provider:existing.provider,kind,localFile,prompt:existing.prompt,jobId:existing.id,verifiedFree:true});
    existing.status='ready';existing.resultKind=kind;existing.localFile=localFile;existing.model=String(req.body?.model||'').slice(0,200);delete existing.workerId;delete existing.leaseUntil;existing.updatedAt=new Date().toISOString();
    fs.writeFileSync(path.join(DATA,'provider-jobs',`${existing.id}.json`),JSON.stringify(existing,null,2));
    const j=load(existing.projectId);if(!j)return res.status(404).json({error:'project not found'});
    if(['complete','failed'].includes(j.status)){
      archiveSceneVariant(j,existing.sceneIndex);const scene=j.storyboard?.find(s=>s.index===existing.sceneIndex);if(scene)scene.variantSeed=Number(scene.variantSeed||0)+1;
      try{fs.rmSync(path.join(projectDir(j.id),`scene-${String(existing.sceneIndex).padStart(2,'0')}`),{recursive:true,force:true})}catch{}
      j.scenes=(j.scenes||[]).filter(s=>s.index!==existing.sceneIndex);j.status='queued';j.progress=25;delete j.error;delete j.render;invalidatePublishApproval(j,'provider-candidate-applied',{required:REQUIRE_PUBLISH_APPROVAL});save(j);setImmediate(kick);
    }
    res.json({job:existing,item,projectStatus:j.status});
  }catch(e){res.status(400).json({error:String(e.message||e)})}
});
app.post('/api/provider-jobs/:id/resolve',(req,res)=>{
  try{
    const existing=getProviderJob(DATA,req.params.id);if(!existing)return res.status(404).json({error:'provider job not found'});if(existing.status==='ready')return res.json({job:existing,alreadyResolved:true});
    const job=resolveProviderJob(DATA,req.params.id,req.body||{});if(job.assetId){const asset=resolveImageAsset(DATA,job.assetId,{kind:job.resultKind,url:job.url,provider:job.provider,jobId:job.id,model:req.body?.model});return res.json({job,asset});}const j=load(job.projectId);if(!j)return res.status(404).json({error:'project not found'});
    const item=registerAiCandidate(DATA,job.projectId,job.sceneIndex,{provider:job.provider,kind:job.resultKind,url:job.url,prompt:job.prompt,jobId:job.id,verifiedFree:true});
    if(['complete','failed'].includes(j.status)){
      archiveSceneVariant(j,job.sceneIndex);const scene=j.storyboard?.find(s=>s.index===job.sceneIndex);if(scene)scene.variantSeed=Number(scene.variantSeed||0)+1;
      try{fs.rmSync(path.join(projectDir(j.id),`scene-${String(job.sceneIndex).padStart(2,'0')}`),{recursive:true,force:true})}catch{}
      j.scenes=(j.scenes||[]).filter(s=>s.index!==job.sceneIndex);j.status='queued';j.progress=25;delete j.error;delete j.render;invalidatePublishApproval(j,'provider-candidate-applied',{required:REQUIRE_PUBLISH_APPROVAL});save(j);setImmediate(kick);
    }
    res.json({job,item,projectStatus:j.status});
  }catch(e){res.status(400).json({error:String(e.message||e)})}
});
app.post('/api/provider-jobs/:id/fail',(req,res)=>{try{const job=failProviderJob(DATA,req.params.id,req.body?.error);if(job.assetId)failImageAsset(DATA,job.assetId,job.error);res.json(job)}catch(e){res.status(400).json({error:String(e.message||e)})}});

app.post('/api/projects/:id/scenes/:index/regenerate',(req,res)=>{
  const j=load(req.params.id); if(!j)return res.status(404).json({error:'not found'});
  if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});
  const index=Number(req.params.index); const scene=j.storyboard?.find(s=>s.index===index);
  if(!scene)return res.status(404).json({error:'scene not found'});
  archiveSceneVariant(j,index); scene.variantSeed=Number(scene.variantSeed||0)+1;
  const dir=path.join(projectDir(j.id),`scene-${String(index).padStart(2,'0')}`);
  try{fs.rmSync(dir,{recursive:true,force:true});}catch{}
  j.scenes=(j.scenes||[]).filter(s=>s.index!==index); j.status='queued'; j.progress=25; delete j.error; delete j.render; invalidatePublishApproval(j,'scene-regenerated',{required:REQUIRE_PUBLISH_APPROVAL});
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
  j.scenes=[...(j.scenes||[]).filter(s=>s.index!==index),selected].sort((a,b)=>a.index-b.index); j.status='queued'; j.progress=85; delete j.error; delete j.render; invalidatePublishApproval(j,'scene-variant-selected',{required:REQUIRE_PUBLISH_APPROVAL});
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
  return {id:j.id,topic:j.topic,niche:j.niche,style:j.style,duration:j.duration,status:j.status,createdAt:j.createdAt,completedAt:j.completedAt||null,publish:j.publish||null,publishApproval:j.publishApproval||null,qa:j.qa||null,metrics:j.metrics||null,sources:(j.sources||[]).map(x=>({title:x.title,url:x.url,provider:x.provider})),storyboard:(j.storyboard||[]).map(x=>({index:x.index,beat:x.beat,narration:x.narration,overlay:x.overlay,searchQuery:x.searchQuery})),scenes:(j.scenes||[]).map(x=>({index:x.index,duration:x.duration,visualType:x.visualType,hasRealVideo:!!x.hasRealVideo,candidateScore:x.candidateScore,aiProvider:x.aiProvider||null,assets:(x.assets||[]).map(a=>({title:a.title,source:a.source||a.url||null,license:a.license||null,artist:a.artist||null,type:a.type||null,provider:a.provider||null}))}))};
}

app.post('/api/projects/:id/publish-approval',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  try{const approval=decidePublishApproval(j,{decision:req.body?.decision,note:req.body?.note});save(j);res.json({id:j.id,publishApproval:approval});}
  catch(e){res.status(409).json({error:String(e.message||e)});}
});

app.get('/api/projects/:id/video',(req,res)=>{ const j=load(req.params.id); if(!j?.render?.file||!fs.existsSync(j.render.file)) return res.status(404).json({error:'video not ready'}); if(req.query.download==='1')return res.download(j.render.file,downloadName(j,'final.mp4')); res.sendFile(j.render.file); });
app.get('/api/projects/:id/credits',(req,res)=>{ const j=load(req.params.id); if(!j?.render?.credits||!fs.existsSync(j.render.credits)) return res.status(404).json({error:'credits not ready'}); if(req.query.download==='1')return res.download(j.render.credits,downloadName(j,'credits.json')); res.sendFile(j.render.credits); });
app.get('/api/projects/:id/export',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});res.setHeader('Content-Disposition',`attachment; filename="${downloadName(j,'project.json')}"`);res.json(publicExport(j));});
app.get('/api/projects/:id/thumbnail',(req,res)=>{const j=load(req.params.id);if(!j?.render?.file||!fs.existsSync(j.render.file))return res.status(404).json({error:'video not ready'});const out=path.join(projectDir(j.id),'thumbnail.jpg');if(!fs.existsSync(out)){const r=spawnSync('ffmpeg',['-y','-ss','0.8','-i',j.render.file,'-frames:v','1','-vf','scale=720:-2',out],{stdio:'ignore',timeout:20000});if(r.status!==0||!fs.existsSync(out))return res.status(500).json({error:'thumbnail generation failed'});}res.sendFile(out);});
app.get('/api/projects/:id/distribution/:platform',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete'||j.qa?.launchReady!==true)return res.status(409).json({error:'project is not launch-ready'});if(REQUIRE_PUBLISH_APPROVAL&&j.publishApproval?.status!=='approved')return res.status(409).json({error:'project is not approved for publishing'});try{res.json(buildDistributionPackage(j,String(req.params.platform||'')))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/publishing/connectors',(req,res)=>res.json({google:googleOAuthStatus(DATA),youtube:youtubePublisherStatus(youtubeCredentialEnv(DATA))}));
app.get('/api/publish-jobs',(req,res)=>res.json({summary:publishQueueSummary(DATA),jobs:listPublishJobs(DATA,{projectId:String(req.query.projectId||''),status:String(req.query.status||'')}).slice(0,100)}));
app.post('/api/projects/:id/publish-jobs',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});try{res.status(201).json(createPublishJob(DATA,j,req.body||{}))}catch(e){res.status(409).json({error:String(e.message||e)})}});
app.post('/api/publish-jobs/:id/execute',async(req,res)=>{const job=getPublishJob(DATA,req.params.id);if(!job)return res.status(404).json({error:'publish job not found'});if(job.platform!=='youtube-shorts')return res.status(409).json({error:'platform connector not implemented'});const project=load(job.projectId);if(!project||project.status!=='complete'||project.qa?.launchReady!==true||project.publishApproval?.status!=='approved')return res.status(409).json({error:'project approval or readiness changed'});if(job.status==='published')return res.json(job);if(job.status==='scheduled'&&job.scheduledAt&&Date.parse(job.scheduledAt)>Date.now())return res.status(409).json({error:'publish job is scheduled for the future'});try{updatePublishJob(DATA,job.id,{status:'uploading',lastError:null});const result=await uploadYouTubeVideo({videoFile:project.render?.file,pkg:job.package,scheduledAt:job.scheduledAt,env:youtubeCredentialEnv(DATA)});const done=updatePublishJob(DATA,job.id,{status:'published',delivery:{mode:'youtube-api',externalPostingEnabled:true,result},publishedAt:new Date().toISOString()});res.json(done)}catch(e){updatePublishJob(DATA,job.id,{status:'failed',lastError:String(e.message||e).slice(0,240)});res.status(502).json({error:String(e.message||e)})}});
app.get('/api/projects/:id/publish-manifest',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete'||j.qa?.launchReady!==true)return res.status(409).json({error:'project is not launch-ready'});if(REQUIRE_PUBLISH_APPROVAL&&j.publishApproval?.status!=='approved')return res.status(409).json({error:'project is not approved for publishing'});const manifest={id:j.id,topic:j.topic,generatedAt:new Date().toISOString(),video:`/api/projects/${j.id}/video`,credits:`/api/projects/${j.id}/credits`,publish:j.publish||null,approval:j.publishApproval||null,qa:{launchReady:true,viralityScore:j.qa?.viralityScore??null,retentionScore:j.qa?.retention?.score??null,narrativeArcScore:j.qa?.narrativeArc?.score??null,editingScore:j.qa?.editingRhythm?.score??null}};res.setHeader('Content-Disposition',`attachment; filename="${downloadName(j,'publish-manifest.json')}"`);res.json(manifest);});
app.delete('/api/projects/:id',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});const providerJobsDeleted=deleteProviderJobsForProject(DATA,j.id),aiInboxDeleted=deleteAiCandidatesForProject(DATA,j.id),publishJobsDeleted=deletePublishJobsForProject(DATA,j.id);jobs.delete(j.id);fs.rmSync(projectDir(j.id),{recursive:true,force:true});res.json({deleted:true,id:j.id,providerJobsDeleted,aiInboxDeleted,publishJobsDeleted});});

for(const job of list()){let changed=false;if(job.status==='failed'&&!job.failedStage){job.failedStage=inferFailureStage(job);changed=true;}const hadApproval=!!job.publishApproval?.status;if(job.status==='complete')ensurePublishApproval(job,{required:REQUIRE_PUBLISH_APPROVAL});const recovered=recoverProjectState(job);if(recovered.changed||changed||(!hadApproval&&!!job.publishApproval?.status))save(job);}
const maintainProviderState=()=>{const assetIds=(listCreatorAssets(DATA).assets||[]).map(x=>`asset-${x.id}`);const result=maintainProviderJobs(DATA,{projectIds:[...list().map(x=>x.id),...assetIds],retentionDays:Number(process.env.PROVIDER_JOB_RETENTION_DAYS||30)});lastProviderMaintenance={...result,ranAt:new Date().toISOString()};return lastProviderMaintenance;};
maintainProviderState();verifyProviders(DATA).catch(()=>{});refreshOpenRouterFreeCatalog().catch(()=>{});setInterval(()=>{reconcileProviderJobs(DATA);maintainProviderState();},30000).unref();setInterval(()=>verifyProviders(DATA).catch(()=>{}),15*60*1000).unref();setInterval(()=>refreshOpenRouterFreeCatalog().catch(()=>{}),30*60*1000).unref();
setInterval(()=>{if(enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))for(const j of list())if(j.status==='complete')maybeAutoCloudPlan(j.id).catch(()=>{});},60000).unref();
setImmediate(()=>{kick();if(enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))for(const j of list())if(j.status==='complete')maybeAutoCloudPlan(j.id).catch(()=>{});});
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Shorts Studio listening on ${PORT}`));
async function gracefulShutdown(signal){
  if(shuttingDown)return;shuttingDown=true;console.log(`${signal}: draining`);server.close();
  const deadline=Date.now()+35_000;while(active&&Date.now()<deadline)await new Promise(r=>setTimeout(r,500));
  process.exit(active?1:0);
}
process.once('SIGTERM',()=>gracefulShutdown('SIGTERM'));process.once('SIGINT',()=>gracefulShutdown('SIGINT'));
