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
import { providerWorkerInventory, providerCapabilities, executeProviderJob } from './provider-adapters.mjs';
import { refreshOpenRouterFreeCatalog, readOpenRouterFreeCatalog } from './openrouter-catalog.mjs';
import { chooseFreeProvider, freeProviderSummary, canQueueFreeProvider } from './provider-selector.mjs';
import { readVerification, verifyProviders, recordFreeEvidence, consumeFreeAllowance } from './provider-verifier.mjs';
import { authConfigured, assertLaunchSecurity, isOwner, securityHeaders, createRateLimiter, loginPage, setOwnerCookie, clearOwnerCookie, safeEqual } from './security.mjs';
import { recoverProjectState, prepareProjectRetry, inferFailureStage, failureIsRecent, classifyRecoverability } from './recovery.mjs';
import { ensurePublishApproval, decidePublishApproval, invalidatePublishApproval } from './publish-approval.mjs';
import { buildDistributionPackage, createPublishJob, listPublishJobs, publishQueueSummary, deletePublishJobsForProject, getPublishJob, updatePublishJob, duePublishJobs, publishingCalendar } from './publishing.mjs';
import { youtubePublisherStatus, uploadYouTubeVideo } from './youtube-publisher.mjs';
import { tiktokPublisherStatus, uploadTikTokVideo } from './tiktok-publisher.mjs';
import { instagramPublisherStatus, uploadInstagramReel, verifyInstagramMediaToken } from './instagram-publisher.mjs';
import { googleOAuthStatus, beginGoogleOAuth, finishGoogleOAuth, googleLoginAuthorized, pairGoogleOwner, saveYouTubeGrant, saveYouTubeAnalyticsGrant, youtubeCredentialEnv, youtubeAnalyticsCredentialEnv } from './google-oauth.mjs';
import { saveGoogleOAuthClientAuthenticated, googleSetupPage, googleSetupSuccessPage } from './google-setup.mjs';
import { verifyOwnerPassword, createOwnerRecovery, ownerRecoveryStatus, completeOwnerRecovery } from './owner-auth.mjs';
import { recoveryPage, recoveryCookie, setRecoveryCookie, clearRecoveryCookie } from './owner-recovery-page.mjs';
import { imageKinds, listCreatorAssets, createImageBrief, createCharacter, getCharacter, getImageAsset, resolveImageAsset, failImageAsset } from './creator-assets.mjs';
import { readBrandBrain, saveBrandBrain, brandPrompt } from './brand-brain.mjs';
import { runResearch, listResearch, researchPrompt } from './research-studio.mjs';
import { listProducts, getProduct, createProduct } from './product-studio.mjs';
import { listSites, getSite, createSite } from './website-studio.mjs';
import { creatorTools, planCreatorGoal } from './creator-agent.mjs';
import { listRuns, getRun, findRunByIdempotency, createRun, updateRun, syncRunWithProjects } from './creator-runs.mjs';
import { buildCreatorAnalytics, recordAnalyticsSnapshot, readAnalytics, listExperiments, createExperiment, updateExperiment, experimentInsights, recordExperimentObservation, closeExperimentFromEvidence } from './creator-analytics.mjs';
import { modelRecommendationPolicy } from './model-recommendations.mjs';
import { youtubeAnalyticsStatus, fetchYouTubeAnalytics, fetchYouTubeVideoAnalytics } from './youtube-analytics.mjs';
import { buildCapacityBenchmark, saveCapacityBenchmark } from './capacity-benchmark.mjs';
import { buildRepurposePack } from './repurpose.mjs';
import { scoreContentOpportunities } from './content-opportunities.mjs';
import { clipPlan, ensureAspectVariant, ensureClip } from './repurpose-media.mjs';
import { recordProviderSmoke, providerSmokeSummary } from './provider-smoke.mjs';
import { voiceCatalog, getVoice, setVoiceFavourite, voicePreviewText } from './voice-studio.mjs';
import { ensureThumbnailVariants, thumbnailCreativeBriefs } from './thumbnail-lab.mjs';
import { listCampaigns, getCampaign, createCampaign, updateCampaign, campaignMetrics, campaignSchedule, campaignKpiProgress } from './campaigns.mjs';
import { growthQueue, refreshGrowthQueue, decideGrowthItem, acceptedBriefs } from './growth-autopilot.mjs';
import { buildOpportunityScorecard, saveOpportunityScorecard, listOpportunityScorecards } from './opportunity-lab.mjs';
import { listApiKeys, createApiKey, revokeApiKey, verifyApiKey } from './api-keys.mjs';
import { mcpToolDefinitions, mcpError, mcpResult, mcpText } from './mcp-protocol.mjs';
import { listWorkspaceMembers, createWorkspaceInvite, acceptWorkspaceInvite, revokeWorkspaceMember, verifyWorkspaceMember, memberCanAccess, workspaceMemberTokenFromRequest, setWorkspaceMemberCookie, clearWorkspaceMemberCookie, workspaceJoinPage } from './workspace-members.mjs';
import { recordAudit, readAudit } from './audit-log.mjs';
import { listPlugins, getPlugin, pluginForTool, setPluginEnabled } from './plugin-registry.mjs';
import { buildBackupManifest, validateRecoverableState } from './backup-manifest.mjs';
import { buildBackupBundle, validateBackupBundle, restoreBackupBundle } from './backup-bundle.mjs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { refreshPortfolio, getPortfolio, decidePortfolioSlot, linkPortfolioProject, portfolioAnalytics } from './content-portfolio.mjs';
import { monetizationBrief, experimentAllocation } from './monetization-intelligence.mjs';
import { listAgents, getAgent, configureAgent, agentGoal } from './agent-marketplace.mjs';
import { observeRequest, observabilitySnapshot } from './observability.mjs';
import { recordPlatformPerformance, listPlatformPerformance, performanceSummary, performanceActions, performanceTrend } from './platform-performance.mjs';
import { contentSeriesRecommendations, experimentLifecycleRecommendations, seriesEpisodeBatch } from './content-series.mjs';
import { performanceAwareCreatorPlan } from './performance-agent.mjs';
import { channelGrowthForecast } from './growth-forecast.mjs';
import { crossPlatformLearning } from './cross-platform-learning.mjs';
import { coordinatedAgentPlan } from './agent-orchestrator.mjs';
import { listAgentHandoffs, ensureAgentHandoffs, completeAgentHandoff, syncAgentHandoffs } from './agent-handoffs.mjs';
import { creativeIntelligence } from './creative-intelligence.mjs';
import { refreshCreativeMemory, readCreativeMemory, retrieveCreativeMemory } from './creative-memory.mjs';
import { buildCampaignLearningReport, saveCampaignLearningReport, listCampaignLearningReports } from './campaign-learning.mjs';
import { attributedExperimentObservations } from './experiment-evidence.mjs';
import { tiktokAnalyticsStatus, instagramAnalyticsStatus, fetchTikTokPostStatus, fetchTikTokVideoAnalytics, fetchInstagramMediaAnalytics } from './social-analytics.mjs';

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'16kb'}));
app.use((req,res,next)=>{const started=performance.now();res.on('finish',()=>observeRequest({method:req.method,path:req.path,status:res.statusCode,ms:performance.now()-started}));next();});
const AUTH_SECRET=process.env.APP_AUTH_SECRET||'';
const PUBLIC_LAUNCH=['1','true','yes','on'].includes(String(process.env.PUBLIC_LAUNCH||'').toLowerCase());
assertLaunchSecurity({publicLaunch:PUBLIC_LAUNCH,secret:AUTH_SECRET});
const WORKER_TOKEN=process.env.PROVIDER_WORKER_TOKEN||'';
const DATA = process.env.DATA_DIR || '/app/data';
function googleRedirectUri(req){const explicit=String(process.env.GOOGLE_OAUTH_REDIRECT_URI||'').trim();if(explicit)return explicit;const proto=String(req.get('x-forwarded-proto')||req.protocol||'https').split(',')[0].trim();return `${proto}://${req.get('host')}/api/oauth/google/callback`;}
app.get('/login',(req,res)=>{if(!authConfigured(AUTH_SECRET))return res.redirect('/');const gs=googleOAuthStatus(DATA);res.type('html').send(loginPage(req.query.error==='1',{googleEnabled:gs.loginEnabled,googleError:req.query.google_error==='1',recoveryEnabled:true}));});
app.post('/api/session',createRateLimiter({windowMs:15*60_000,max:10}),(req,res)=>{if(!authConfigured(AUTH_SECRET))return res.status(409).json({error:'Owner authentication is not configured'});if(!verifyOwnerPassword(DATA,req.body?.password,{legacySecret:AUTH_SECRET}))return res.redirect('/login?error=1');setOwnerCookie(req,res,AUTH_SECRET);res.redirect('/');});
app.post('/api/logout',(req,res)=>{clearOwnerCookie(res);clearWorkspaceMemberCookie(res);res.redirect('/login');});
app.get('/api/oauth/google/login',(req,res)=>{const gs=googleOAuthStatus(DATA);if(!gs.loginEnabled)return res.redirect('/login?google_error=1');try{return res.redirect(beginGoogleOAuth({flow:'login',redirectUri:googleRedirectUri(req),root:DATA}))}catch{return res.redirect('/login?google_error=1')}});
app.get('/api/oauth/google/callback',async(req,res)=>{if(req.query.error||!req.query.code||!req.query.state)return res.redirect('/login?google_error=1');try{const result=await finishGoogleOAuth({code:req.query.code,state:req.query.state,root:DATA});if(result.flow==='login'){if(!googleLoginAuthorized(result.profile,DATA))return res.redirect('/login?google_error=1');pairGoogleOwner(result.profile,DATA);setOwnerCookie(req,res,AUTH_SECRET);return res.redirect('/');}if(result.flow==='youtube'){saveYouTubeGrant(result.profile,result.tokens,DATA);pairGoogleOwner(result.profile,DATA);return res.redirect('/?youtube=connected');}if(result.flow==='youtube-analytics'){saveYouTubeAnalyticsGrant(result.profile,result.tokens,DATA);pairGoogleOwner(result.profile,DATA);return res.redirect('/?youtube_analytics=connected');}return res.redirect('/login?google_error=1')}catch(e){console.error('google oauth callback failed:',String(e.message||e).replace(/[A-Za-z0-9_\-.]{24,}/g,'[redacted]'));return res.redirect('/login?google_error=1')}});
app.get('/recover-owner',(req,res)=>{res.setHeader('Cache-Control','no-store');const st=ownerRecoveryStatus(DATA,recoveryCookie(req));return res.type('html').send(recoveryPage({state:st.state,code:st.item?.code||''}))});
app.post('/recover-owner/request',createRateLimiter({windowMs:15*60_000,max:5}),(req,res)=>{res.setHeader('Cache-Control','no-store');const item=createOwnerRecovery(DATA);setRecoveryCookie(req,res,item.id);return res.type('html').send(recoveryPage({state:'pending',code:item.code}))});
app.post('/recover-owner/complete',createRateLimiter({windowMs:15*60_000,max:5}),(req,res)=>{res.setHeader('Cache-Control','no-store');const id=recoveryCookie(req),st=ownerRecoveryStatus(DATA,id);if(st.state!=='approved')return res.status(403).type('html').send(recoveryPage({state:st.state,code:st.item?.code||''}));if(String(req.body?.password||'')!==String(req.body?.confirm||''))return res.status(400).type('html').send(recoveryPage({state:'approved',error:'Passwords do not match'}));try{completeOwnerRecovery(DATA,id,req.body?.password);clearRecoveryCookie(res);return res.type('html').send(recoveryPage({state:'done'}))}catch(e){return res.status(400).type('html').send(recoveryPage({state:'approved',error:String(e.message||e).slice(0,180)}))}});
app.get('/join',(req,res)=>res.type('html').send(workspaceJoinPage()));
app.post('/join',createRateLimiter({windowMs:15*60_000,max:10}),(req,res)=>{try{const accepted=acceptWorkspaceInvite(DATA,req.body?.inviteToken);setWorkspaceMemberCookie(req,res,accepted.memberToken);return res.redirect('/')}catch(e){return res.status(400).type('html').send(workspaceJoinPage(String(e.message||e).slice(0,160)))}});
app.post('/mcp',async(req,res)=>{
  const id=req.body?.id??null,method=String(req.body?.method||''),raw=String(req.get('x-creator-key')||req.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(method==='tools/list'){if(!verifyApiKey(DATA,raw,'read'))return res.status(401).json(mcpError(id,-32001,'authentication required'));return res.json(mcpResult(id,{tools:mcpToolDefinitions}));}
  if(method!=='tools/call')return res.status(400).json(mcpError(id,-32601,'method not found'));
  const name=String(req.body?.params?.name||''),args=req.body?.params?.arguments||{},scope=name==='list_projects'?'read':'create';if(!verifyApiKey(DATA,raw,scope))return res.status(401).json(mcpError(id,-32001,'authentication required'));const plugin=pluginForTool(DATA,name);if(plugin&&plugin.enabled===false)return res.status(409).json(mcpError(id,-32002,'tool plugin is disabled'));
  try{let out;if(name==='list_projects')out=list().slice(0,Math.max(1,Math.min(100,Number(args.limit||20)))).map(projectSummary);else if(name==='research')out=await runResearch(DATA,args);else if(name==='opportunity_scan'){const base=await runResearch(DATA,{query:args.query,mode:'topic'}),reports=[base];for(const mode of ['trend','competitor','faceless'])reports.push(await runResearch(DATA,{query:args.query,mode},base.sources));out=saveOpportunityScorecard(DATA,buildOpportunityScorecard(args.query,reports));}else if(name==='create_product')out=createProduct(DATA,{...args,brand:readBrandBrain(DATA)});else if(name==='create_website')out=createSite(DATA,{...args,brand:readBrandBrain(DATA)});else if(name==='plan_creator_goal')out=planCreatorGoal(args);else if(name==='create_video')out=queueVideoProject(args);else return res.status(404).json(mcpError(id,-32602,'unknown tool'));return res.json(mcpResult(id,mcpText(out)));}catch(e){return res.status(400).json(mcpError(id,-32000,String(e.message||e).slice(0,240)));}
});
app.post('/api/workspace/invites/accept',createRateLimiter({windowMs:15*60_000,max:10}),(req,res)=>{try{const accepted=acceptWorkspaceInvite(DATA,req.body?.inviteToken);setWorkspaceMemberCookie(req,res,accepted.memberToken);res.json(accepted)}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/publish-media/:token',(req,res)=>{const data=verifyInstagramMediaToken(req.params.token,process.env.PUBLISH_MEDIA_SIGNING_SECRET||AUTH_SECRET);if(!data)return res.status(403).end();const project=load(String(data.p));if(!project?.render?.file||!fs.existsSync(project.render.file))return res.status(404).end();res.setHeader('Cache-Control','private, max-age=300');res.type('video/mp4').sendFile(project.render.file);});
app.use((req,res,next)=>{if(req.path==='/api/health'||req.path==='/login'||req.path==='/api/session'||req.path==='/recover-owner'||req.path==='/recover-owner/request'||req.path==='/recover-owner/complete'||req.path==='/join'||req.path==='/api/workspace/invites/accept')return next();if(WORKER_TOKEN&&safeEqual(req.get('x-provider-worker-token'),WORKER_TOKEN)){req.authActor={type:'worker',id:'provider-worker',role:'worker'};return next();}if(isOwner(req,AUTH_SECRET)){req.authActor={type:'owner',id:'owner',role:'owner'};return next();}const raw=workspaceMemberTokenFromRequest(req),member=verifyWorkspaceMember(DATA,raw);if(member){if(!memberCanAccess(member,req.method,req.path))return res.status(403).json({error:'workspace role does not permit this action'});req.workspaceMember=member;req.authActor={type:'member',id:member.id,role:member.role};return next();}if(req.path.startsWith('/api/'))return res.status(401).json({error:'authentication required'});return res.redirect('/login');});
app.use((req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.authActor&&req.authActor.type!=='worker')res.on('finish',()=>{try{recordAudit(DATA,{actorType:req.authActor.type,actorId:req.authActor.id,role:req.authActor.role,method:req.method,path:req.path,status:res.statusCode})}catch{}});next();});
app.use(createRateLimiter({windowMs:5*60_000,max:Number(process.env.WRITE_RATE_LIMIT||120)}));
app.get('/api/backup/manifest',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});res.json(buildBackupManifest(DATA))});
app.get('/api/backup/validate',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});const result=validateRecoverableState(DATA);res.status(result.ok?200:409).json(result)});
app.get('/api/backup/export',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});const bundle=buildBackupBundle(DATA),gz=gzipSync(Buffer.from(JSON.stringify(bundle)));res.setHeader('Content-Type','application/gzip');res.setHeader('Content-Disposition','attachment; filename=creator-os-safe-backup.json.gz');res.setHeader('Cache-Control','no-store');res.send(gz)});
app.post('/api/backup/restore',express.raw({type:'application/gzip',limit:'25mb'}),(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{const bundle=JSON.parse(gunzipSync(req.body).toString('utf8')),preview=validateBackupBundle(bundle);if(!preview.ok)return res.status(400).json(preview);const result=restoreBackupBundle(DATA,bundle,{confirm:String(req.get('x-creator-restore-confirm')||'')});res.json(result)}catch(e){res.status(400).json({error:String(e.message||e).slice(0,240)})}});
app.get('/api/plugins',(req,res)=>res.json({plugins:listPlugins(DATA),policy:{freeOnly:true,ownerControlsEnablement:true}}));
app.patch('/api/plugins/:id',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{res.json(setPluginEnabled(DATA,req.params.id,req.body?.enabled===true))}catch(e){res.status(404).json({error:String(e.message||e)})}});
app.get('/api/workspace',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});res.json(listWorkspaceMembers(DATA))});
app.post('/api/workspace/invites',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{res.status(201).json(createWorkspaceInvite(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/workspace/members/:id/revoke',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{res.json(revokeWorkspaceMember(DATA,req.params.id))}catch(e){res.status(404).json({error:String(e.message||e)})}});
app.get('/api/audit-log',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});res.json({events:readAudit(DATA,Number(req.query.limit||200))})});
app.get('/setup/google',(req,res)=>{res.setHeader('Cache-Control','no-store');return res.type('html').send(googleSetupPage())});
app.post('/setup/google',(req,res)=>{res.setHeader('Cache-Control','no-store');try{saveGoogleOAuthClientAuthenticated(DATA,{clientId:req.body?.clientId,clientSecret:req.body?.clientSecret,ownerEmail:req.body?.ownerEmail});return res.type('html').send(googleSetupSuccessPage())}catch(e){return res.status(400).type('html').send(googleSetupPage({error:String(e.message||e).slice(0,180)}))}});
app.get('/api/oauth/google/youtube/connect',(req,res)=>{const gs=googleOAuthStatus(DATA);if(!gs.configured)return res.status(503).json({error:'Google OAuth client is not configured'});try{return res.redirect(beginGoogleOAuth({flow:'youtube',redirectUri:googleRedirectUri(req),root:DATA}))}catch(e){return res.status(503).json({error:String(e.message||e)})}});
app.get('/api/oauth/google/youtube-analytics/connect',(req,res)=>{const gs=googleOAuthStatus(DATA);if(!gs.configured)return res.status(503).json({error:'Google OAuth client is not configured'});try{return res.redirect(beginGoogleOAuth({flow:'youtube-analytics',redirectUri:googleRedirectUri(req),root:DATA}))}catch(e){return res.status(503).json({error:String(e.message||e)})}});
app.use(express.static(new URL('./public', import.meta.url).pathname));
const PORT = Number(process.env.PORT || 3010);
const REQUIRE_PUBLISH_APPROVAL=!['0','false','no','off'].includes(String(process.env.REQUIRE_APPROVAL_BEFORE_PUBLISH??'true').toLowerCase());
const niches = ['true-crime','history','storytelling','fact-check'];
const styles = ['documentary','cinematic','hybrid','whiteboard','animated','motivational','finance','history-ancient','space-sci-fi'];
const videoModes=['multi-scene','single-scene','whiteboard'];
const languages=['en','fr','es','it','de','ro'];
const aspects=['9:16','16:9','1:1'];
const voices=['auto','narrator','piper-en-lessac','piper-fr-siwis','piper-es-sharvard','piper-it-serena','piper-de-thorsten','piper-ro-mihai','slt','awb','rms','kal','kal16'];
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
app.get('/api/integration-keys',(req,res)=>res.json({keys:listApiKeys(DATA),policy:{storedAsHashes:true,scopes:['read','create'],mcp:'/mcp'}}));
app.post('/api/integration-keys',(req,res)=>{try{res.status(201).json(createApiKey(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.delete('/api/integration-keys/:id',(req,res)=>{try{res.json(revokeApiKey(DATA,req.params.id))}catch(e){res.status(404).json({error:String(e.message||e)})}});
app.get('/api/model-recommendations',(req,res)=>res.json(modelRecommendationPolicy()));
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
  const recovery=validateRecoverableState(DATA);return {status:critical.every(x=>x.ok)&&recovery.ok?'ready':'degraded',checks:[...checks,{id:'state-recovery',label:'State recovery',ok:recovery.ok,detail:recovery.ok?`${recovery.projectsChecked} projects validated`:`${recovery.issues.length} recovery issue(s)`}],storage:{freeBytes,totalBytes,freePercent},recovery,queue:{pending,recentProviderFailures,historicalProviderFailures:providerFailures},failureSummary:{recentProjects:recentProjectFailures.length,historicalProjects:failedProjects.length},approvalSummary,providerMaintenance:lastProviderMaintenance,textRouting:{policy:text.routing?.policy||null,learning:text.routing?.learning||null,leaderboards:text.routing?.leaderboards||{providers:[],models:[]}},recentProjectFailures,activeProject:active,shuttingDown,generatedAt:new Date().toISOString()};
}
app.get('/api/operations',async(req,res)=>{try{const all=list(),providerSnapshot=providerJobsSnapshot(DATA),diagnostics=await diagnosticsSnapshot(all,providerSnapshot);res.json({observability:observabilitySnapshot({windowMinutes:Number(req.query.windowMinutes||60)}),diagnostics,providers:{worker:providerWorkerInventory(DATA),jobs:{counts:providerSnapshot.counts,total:providerSnapshot.total}},publishing:publishQueueSummary(DATA),recovery:validateRecoverableState(DATA)})}catch(e){res.status(500).json({error:'operations snapshot unavailable'})}});
app.get('/api/diagnostics',async(req,res)=>{try{res.json(await diagnosticsSnapshot())}catch{res.status(500).json({status:'degraded',error:'diagnostics unavailable'})}});
app.get('/api/stats',(req,res)=>res.json(statsSnapshot()));
app.get('/api/analytics',(req,res)=>{const snapshot=buildCreatorAnalytics(list(),listPublishJobs(DATA,{}));recordAnalyticsSnapshot(DATA,snapshot);res.json(snapshot)});
app.get('/api/analytics/history',(req,res)=>res.json(readAnalytics(DATA)));
app.get('/api/analytics/youtube/status',(req,res)=>res.json(youtubeAnalyticsStatus(youtubeAnalyticsCredentialEnv(DATA))));
app.get('/api/performance',(req,res)=>res.json({records:listPlatformPerformance(DATA,{platform:String(req.query.platform||''),projectId:String(req.query.projectId||'')}),summary:performanceSummary(DATA,list()),trend:performanceTrend(DATA,{projectIds:req.query.projectId?[String(req.query.projectId)]:[],days:Number(req.query.days||30)}),actions:performanceActions(DATA,list()),connectors:{tiktok:tiktokAnalyticsStatus(),instagram:instagramAnalyticsStatus()}}));
app.get('/api/performance/learning',(req,res)=>{const records=listPlatformPerformance(DATA),trend=performanceTrend(DATA,{days:Number(req.query.days||30)});res.json({crossPlatform:crossPlatformLearning(records,list()),forecast:channelGrowthForecast(trend,{horizonDays:Number(req.query.horizonDays||14)}),trend})});
app.get('/api/creative-intelligence',(req,res)=>{const projects=list(),perf=performanceSummary(DATA,projects),experiments=experimentInsights(DATA);res.json(creativeIntelligence(projects,perf,experiments))});
app.get('/api/creative-memory',(req,res)=>{const projects=list(),perf=performanceSummary(DATA,projects),experiments=experimentInsights(DATA);refreshCreativeMemory(DATA,projects,perf,experiments);res.json(retrieveCreativeMemory(DATA,{niche:String(req.query.niche||''),style:String(req.query.style||''),limit:Number(req.query.limit||8)}))});
app.get('/api/executive-dashboard',(req,res)=>{const projects=list(),perf=performanceSummary(DATA,projects),learning=crossPlatformLearning(listPlatformPerformance(DATA),projects),creative=creativeIntelligence(projects,perf,experimentInsights(DATA)),memory=refreshCreativeMemory(DATA,projects,perf,experimentInsights(DATA)),campaigns=listCampaigns(DATA),reports=listCampaignLearningReports(DATA);res.json({generatedAt:new Date().toISOString(),performance:perf,crossPlatform:learning,creative:{recommendations:creative.recommendations,patterns:creative.patterns.slice(0,5)},memory:{items:(memory.items||[]).slice(0,8),updatedAt:memory.updatedAt},campaigns:{total:campaigns.length,active:campaigns.filter(x=>x.status==='active').length,reports:reports.slice(0,5)},nextActions:[...(learning.recommendations||[]).slice(0,3).map(x=>({type:'platform',message:x.reason,evidence:{niche:x.niche,platform:x.platform}})),...(creative.recommendations||[]).slice(0,3).map(x=>({type:'creative',message:x.message,evidence:x.evidence}))].slice(0,5),policy:{observedMetricsOnly:true,ownerReviewRequired:true,autoPublish:false,guarantee:false}})});
app.post('/api/performance/import',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{if(!load(String(req.body?.projectId||'')))return res.status(404).json({error:'project not found'});res.status(201).json(recordPlatformPerformance(DATA,{...(req.body||{}),source:'owner-import'}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/performance/youtube/sync',async(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});const env=youtubeAnalyticsCredentialEnv(DATA),status=youtubeAnalyticsStatus(env);if(!status.enabled)return res.status(409).json({status,error:'YouTube Analytics is not enabled'});const jobs=listPublishJobs(DATA,{}).filter(j=>j.platform==='youtube-shorts'&&j.status==='published'&&j.delivery?.result?.videoId).slice(0,25),records=[],errors=[];for(const job of jobs){try{const a=await fetchYouTubeVideoAnalytics({videoId:job.delivery.result.videoId,days:Number(req.body?.days||28),env});records.push(recordPlatformPerformance(DATA,{platform:'youtube',projectId:job.projectId,externalId:a.videoId,periodStart:a.startDate,periodEnd:a.endDate,metrics:a.metrics,source:'youtube-analytics',attribution:job.experiment?{experimentId:job.experiment.id,variant:job.experiment.variant}:null}))}catch(e){errors.push({projectId:job.projectId,error:String(e.message||e).slice(0,160)})}}res.json({status,checked:jobs.length,imported:records.length,errors,summary:performanceSummary(DATA,list())})});
app.post('/api/performance/tiktok/sync',async(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});const status=tiktokAnalyticsStatus();if(!status.enabled)return res.status(409).json({status,error:status.configured&&!status.scoped?'TikTok video.list scope is not granted':'TikTok analytics is not enabled'});const jobs=listPublishJobs(DATA,{}).filter(j=>j.platform==='tiktok'&&j.status==='published'&&j.delivery?.result?.publishId).slice(0,20),records=[],errors=[];for(const job of jobs){try{const r=job.delivery.result,st=await fetchTikTokPostStatus(r.publishId),ids=r.postId?[r.postId]:(st.publicaly_available_post_id||st.publicly_available_post_id||[]);if(!ids.length)throw Error('TikTok post id is not publicly available yet');const a=await fetchTikTokVideoAnalytics({videoId:ids[0]});records.push(recordPlatformPerformance(DATA,{platform:'tiktok',projectId:job.projectId,externalId:a.videoId,metrics:a.metrics,source:'tiktok-display-api',attribution:job.experiment?{experimentId:job.experiment.id,variant:job.experiment.variant}:null}))}catch(e){errors.push({projectId:job.projectId,error:String(e.message||e).slice(0,160)})}}res.json({status,checked:jobs.length,imported:records.length,errors,summary:performanceSummary(DATA,list())})});
app.post('/api/performance/instagram/sync',async(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});const status=instagramAnalyticsStatus();if(!status.enabled)return res.status(409).json({status,error:'Instagram analytics is not enabled'});const jobs=listPublishJobs(DATA,{}).filter(j=>j.platform==='instagram-reels'&&j.status==='published'&&j.delivery?.result?.mediaId).slice(0,20),records=[],errors=[];for(const job of jobs){try{const a=await fetchInstagramMediaAnalytics({mediaId:job.delivery.result.mediaId});records.push(recordPlatformPerformance(DATA,{platform:'instagram',projectId:job.projectId,externalId:a.mediaId,metrics:a.metrics,source:'instagram-graph-api',attribution:job.experiment?{experimentId:job.experiment.id,variant:job.experiment.variant}:null}))}catch(e){errors.push({projectId:job.projectId,error:String(e.message||e).slice(0,160)})}}res.json({status,checked:jobs.length,imported:records.length,errors,summary:performanceSummary(DATA,list())})});
app.get('/api/analytics/youtube',async(req,res)=>{const env=youtubeAnalyticsCredentialEnv(DATA),status=youtubeAnalyticsStatus(env);if(!status.enabled)return res.status(409).json({status,error:status.configured&&!status.scoped?'YouTube Analytics scope is not granted':'YouTube Analytics is disabled until explicitly enabled'});try{res.json(await fetchYouTubeAnalytics({days:Number(req.query.days||28),env}))}catch(e){res.status(502).json({status,error:String(e.message||e).slice(0,240)})}});
app.get('/api/capacity-benchmark',(req,res)=>{const result=buildCapacityBenchmark(list());saveCapacityBenchmark(DATA,result);res.json(result)});
app.get('/api/experiments',(req,res)=>res.json({experiments:listExperiments(DATA)}));
app.post('/api/experiments',(req,res)=>{try{const projectId=String(req.body?.projectId||'');if(!load(projectId))return res.status(404).json({error:'project not found'});res.status(201).json(createExperiment(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.patch('/api/experiments/:id',(req,res)=>{try{res.json(updateExperiment(DATA,req.params.id,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/experiments/:id/observations',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{res.status(201).json(recordExperimentObservation(DATA,req.params.id,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/experiments/collect-attributed',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{const rows=attributedExperimentObservations(listExperiments(DATA),listPlatformPerformance(DATA)),updated=[];for(const row of rows)updated.push(recordExperimentObservation(DATA,row.experimentId,row));res.json({collected:rows.length,updated:updated.map(x=>({experimentId:x.experiment.id,status:x.experiment.status,readyToClose:x.evidence.readyToClose,confidence:x.evidence.confidence})),policy:{observedAttributionOnly:true,autoClose:false,autoPromote:false}})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/experiments/:id/close-from-evidence',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{res.json(closeExperimentFromEvidence(DATA,req.params.id))}catch(e){res.status(409).json({error:String(e.message||e)})}});
app.get('/api/experiments/insights',(req,res)=>res.json(experimentInsights(DATA)));
app.get('/api/analytics/opportunities',async(req,res)=>{const env=youtubeAnalyticsCredentialEnv(DATA),status=youtubeAnalyticsStatus(env);let youtube=null,error=null;if(status.enabled){try{youtube=await fetchYouTubeAnalytics({days:Number(req.query.days||28),env})}catch(e){error=String(e.message||e).slice(0,240)}}res.json({...scoreContentOpportunities(list(),youtube,experimentInsights(DATA)),youtubeAnalytics:{status,error}})});
app.get('/api/growth/portfolio',(req,res)=>{const portfolio=getPortfolio(DATA);res.json({portfolio,analytics:portfolioAnalytics(portfolio)})});
app.post('/api/growth/portfolio/refresh',(req,res)=>{const state=growthQueue(DATA),portfolio=refreshPortfolio(DATA,{growthItems:state.items||[],projects:list(),days:Number(req.body?.days||14),slots:Number(req.body?.slots||7)});res.json({portfolio,analytics:portfolioAnalytics(portfolio)})});
app.post('/api/growth/portfolio/:slot/decision',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{res.json(decidePortfolioSlot(DATA,req.params.slot,String(req.body?.decision||'')))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/growth/portfolio/:slot/create',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{const portfolio=getPortfolio(DATA),slot=portfolio?.slots?.find(x=>x.id===req.params.slot);if(!slot)return res.status(404).json({error:'portfolio slot not found'});if(slot.status!=='accepted')return res.status(409).json({error:'portfolio slot must be owner-accepted first'});const project=queueVideoProject({topic:slot.topic,duration:slot.duration,niche:req.body?.niche||'storytelling',style:req.body?.style||'documentary',aspect:req.body?.aspect||'9:16'});res.status(202).json({slot:linkPortfolioProject(DATA,slot.id,project.id),project:projectSummary(project)})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/experiments/allocation',(req,res)=>{const perf=performanceSummary(DATA,list()),lifecycle=experimentLifecycleRecommendations(list(),listExperiments(DATA),perf);res.json({...lifecycle,performance:{records:perf.records,projects:perf.projects}})});
app.get('/api/content-series',(req,res)=>{const perf=performanceSummary(DATA,list());res.json(contentSeriesRecommendations(list(),perf))});
app.post('/api/content-series/:id/create-batch',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});if(req.body?.confirm!==true)return res.status(409).json({error:'explicit confirm=true is required'});try{const perf=performanceSummary(DATA,list()),catalog=contentSeriesRecommendations(list(),perf),series=catalog.series.find(x=>x.id===req.params.id);if(!series)return res.status(404).json({error:'series not found'});const active=[...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length,capacity=Math.max(0,5-active);if(!capacity)return res.status(429).json({error:'Video queue full'});const existing=new Set(list().map(x=>String(x.topic||'').toLowerCase().replace(/\s+/g,' ').trim())),requested=seriesEpisodeBatch(series,{count:Math.min(capacity,Number(req.body?.count||3))}),created=[],skipped=[];for(const episode of requested){const key=episode.topic.toLowerCase().replace(/\s+/g,' ').trim();if(existing.has(key)){skipped.push({topic:episode.topic,reason:'duplicate topic'});continue}const niche=niches.includes(episode.niche)?episode.niche:'storytelling',project=queueVideoProject({...episode,niche,language:req.body?.language||'en',voice:req.body?.voice||'auto'});created.push(projectSummary(project));existing.add(key)}return res.status(202).json({seriesId:series.id,created,skipped,policy:{ownerConfirmed:true,autoPublish:false,freeOnly:true}})}catch(e){const msg=String(e.message||e);res.status(/Queue full/.test(msg)?429:400).json({error:msg})}});
app.get('/api/monetization',(req,res)=>res.json(monetizationBrief(list(),listProducts(DATA),listSites(DATA))));
app.get('/api/growth/queue',(req,res)=>res.json({...growthQueue(DATA),acceptedBriefs:acceptedBriefs(DATA)}));
app.post('/api/growth/refresh',(req,res)=>{const analytics=buildCreatorAnalytics(list(),listPublishJobs(DATA,{})),scored=scoreContentOpportunities(list(),null,experimentInsights(DATA));res.json(refreshGrowthQueue(DATA,{analytics,opportunities:scored.opportunities||[],experiments:experimentInsights(DATA)}))});
app.post('/api/growth/items/:id/decision',(req,res)=>{try{res.json(decideGrowthItem(DATA,req.params.id,String(req.body?.decision||''),req.body?.note))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/campaigns',(req,res)=>{const all=list(),perf=performanceSummary(DATA,all),publishes=listPublishJobs(DATA,{});res.json({campaigns:listCampaigns(DATA).map(c=>({...c,metrics:campaignMetrics(c,all),kpiProgress:campaignKpiProgress(c,perf,publishes),trend:performanceTrend(DATA,{projectIds:c.projectIds||[],days:30}).points.slice(-14)}))})});
app.get('/api/campaigns/:id/learning-report',(req,res)=>{const c=getCampaign(DATA,req.params.id);if(!c)return res.status(404).json({error:'campaign not found'});const projects=list(),perf=performanceSummary(DATA,projects),learning=crossPlatformLearning(listPlatformPerformance(DATA),projects),creative=creativeIntelligence(projects,perf,experimentInsights(DATA)),report=saveCampaignLearningReport(DATA,buildCampaignLearningReport(c,{projects,performance:perf,publishJobs:listPublishJobs(DATA,{}),creative,learning}));res.json(report)});
app.post('/api/campaigns',(req,res)=>{try{res.status(201).json(createCampaign(DATA,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/campaigns/:id',(req,res)=>{const c=getCampaign(DATA,req.params.id);if(!c)return res.status(404).json({error:'campaign not found'});const perf=performanceSummary(DATA,list());res.json({...c,metrics:campaignMetrics(c,list()),kpiProgress:campaignKpiProgress(c,perf,listPublishJobs(DATA,{}))})});
app.patch('/api/campaigns/:id',(req,res)=>{try{const projectIds=Array.isArray(req.body?.projectIds)?req.body.projectIds:null;if(projectIds&&projectIds.some(id=>!load(String(id))))return res.status(404).json({error:'one or more projects were not found'});res.json(updateCampaign(DATA,req.params.id,req.body||{}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/campaigns/:id/schedule',(req,res)=>{const c=getCampaign(DATA,req.params.id);if(!c)return res.status(404).json({error:'campaign not found'});res.json(campaignSchedule(c,publishingCalendar(DATA,{days:Number(req.query.days||30)}),{slots:Number(req.query.slots||5)}))});
app.get('/api/campaigns/:id/kpis',(req,res)=>{const c=getCampaign(DATA,req.params.id);if(!c)return res.status(404).json({error:'campaign not found'});res.json(campaignKpiProgress(c,performanceSummary(DATA,list()),listPublishJobs(DATA,{})))});
app.get('/api/campaigns/:id/trend',(req,res)=>{const c=getCampaign(DATA,req.params.id);if(!c)return res.status(404).json({error:'campaign not found'});res.json(performanceTrend(DATA,{projectIds:c.projectIds||[],days:Number(req.query.days||30)}))});
app.get('/api/campaigns/:id/recommendations',(req,res)=>{const c=getCampaign(DATA,req.params.id);if(!c)return res.status(404).json({error:'campaign not found'});const linked=new Set(c.projectIds||[]),actions=performanceActions(DATA,list()).actions.filter(x=>linked.has(x.projectId));res.json({campaignId:c.id,actions,policy:{observedMetricsOnly:true,ownerReviewRequired:true,autoCreate:false}})});
app.get('/api/dashboard',async(req,res)=>{try{const all=list(),providerSnapshot=providerJobsSnapshot(DATA),diagnostics=await diagnosticsSnapshot(all,providerSnapshot);res.json({health:{status:'ok',service:'viral-shorts-studio',mode:'autonomous-production'},projects:all.map(projectSummary),stats:statsSnapshot(all),providerJobs:{counts:providerSnapshot.counts,total:providerSnapshot.total,providers:providerSnapshot.providers,jobs:providerSnapshot.jobs.slice(0,100)},publishQueue:publishQueueSummary(DATA),publishingConnectors:{google:googleOAuthStatus(DATA),youtube:youtubePublisherStatus(youtubeCredentialEnv(DATA)),tiktok:tiktokPublisherStatus(),instagram:instagramPublisherStatus(),youtubeAnalytics:youtubeAnalyticsStatus(youtubeAnalyticsCredentialEnv(DATA)),tiktokAnalytics:tiktokAnalyticsStatus(),instagramAnalytics:instagramAnalyticsStatus()},providerVerification:{state:readVerification(DATA),worker:providerWorkerInventory(DATA)},diagnostics})}catch{res.status(500).json({error:'dashboard unavailable'})}});
app.get('/api/voices',(req,res)=>res.json({voices:voiceCatalog(DATA),engines:['piper','flite'],preferred:'piper',policy:{localFirst:true,freeOnly:true,paidFallback:false}}));
app.post('/api/voices/:id/favourite',(req,res)=>{try{res.json(setVoiceFavourite(DATA,req.params.id,req.body?.favourite!==false))}catch(e){res.status(404).json({error:String(e.message||e)})}});
app.get('/api/voices/:id/preview',(req,res)=>{const voice=getVoice(req.params.id);if(!voice)return res.status(404).json({error:'voice not found'});const dir=path.join(DATA,'voice-previews');fs.mkdirSync(dir,{recursive:true});const text=voicePreviewText(req.query.text),key=crypto.createHash('sha256').update(`${voice.id}|${text}`).digest('hex').slice(0,16),out=path.join(dir,`${voice.id}-${key}.wav`);if(!fs.existsSync(out)){let r;if(voice.engine==='piper'&&voice.model&&fs.existsSync(voice.model))r=spawnSync(process.env.PIPER_BIN||'/opt/piper/bin/piper',['--model',voice.model,'--output_file',out],{input:text,encoding:'utf8',stdio:['pipe','ignore','ignore'],timeout:30000});else r=spawnSync('ffmpeg',['-y','-f','lavfi','-i',`flite=text='${text.replace(/'/g,' ')}':voice=${voice.id}`,'-ar','44100','-ac','1',out],{stdio:'ignore',timeout:20000});if(r.status!==0||!fs.existsSync(out))return res.status(500).json({error:'voice preview generation failed'});}res.type('audio/wav').sendFile(out);});
app.get('/api/capabilities',(req,res)=>res.json({
  niches,
  stages:['research','source-check','hook','script','storyboard','shot-direction','visual-prompts','archive-candidates','whiteboard-candidates','verified-free-ai-candidates','free-allowance-planning','provider-job-harvesting','candidate-scoring','auto-selection','motion-clips','voice','captions','render','credits','qa','approval','distribution-package','publish-queue'],
  formats:['9:16','16:9','1:1','30s / 8 scenes','60s / 14 scenes','90s / 20 scenes','2–30 min long-form / adaptive scenes'],
  videoModes, languages, aspects, voices, captionStyles, imageKinds:imageKinds(),
  styles,
  currentProviders:['Wikipedia research','Wikimedia Commons licensed imagery','FFmpeg motion-video','Piper neural narration','FFmpeg Flite fallback narration'],
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
app.get('/api/opportunity-lab',(req,res)=>res.json({scorecards:listOpportunityScorecards(DATA).slice(0,30)}));
app.post('/api/opportunity-lab/live-scan',async(req,res)=>{try{const query=String(req.body?.query||'').trim();if(query.length<3)return res.status(400).json({error:'query is required'});const specs=[['topic',query],['trend',query],['competitor',query],['faceless',query],['store',`digital stores products selling ${query}`],['ad',`advertising campaigns creatives for ${query}`]],reports=[];for(const [mode,q] of specs){const report=await runResearch(DATA,{query:q,mode:['store','ad'].includes(mode)?'competitor':mode});reports.push({...report,mode,originalMode:report.mode});}const card=saveOpportunityScorecard(DATA,buildOpportunityScorecard(query,reports));res.status(201).json({...card,reports:reports.map(x=>({id:x.id,mode:x.mode,sourceCount:x.sourceCount})),disclaimer:'Store/ad signals are source-grounded web evidence, not native platform volume or Meta Ad Library datasets.'})}catch(e){res.status(400).json({error:String(e.message||e)})}});

app.post('/api/opportunity-lab',async(req,res)=>{try{const query=String(req.body?.query||'').trim();if(query.length<3)return res.status(400).json({error:'query is required'});const base=await runResearch(DATA,{query,mode:'topic'}),reports=[base];for(const mode of ['trend','competitor','faceless'])reports.push(await runResearch(DATA,{query,mode},base.sources));const card=saveOpportunityScorecard(DATA,buildOpportunityScorecard(query,reports));res.status(201).json({...card,reports:reports.map(x=>({id:x.id,mode:x.mode,sourceCount:x.sourceCount}))})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/products',(req,res)=>res.json({products:listProducts(DATA)}));
app.post('/api/products',(req,res)=>{try{res.status(201).json(createProduct(DATA,{...(req.body||{}),brand:readBrandBrain(DATA)}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/products/:id',(req,res)=>{const x=getProduct(DATA,req.params.id);return x?res.json(x):res.status(404).json({error:'not found'})});
app.get('/api/products/:id/export/:format',(req,res)=>{const x=getProduct(DATA,req.params.id),file=x?.exports?.[String(req.params.format||'').toLowerCase()];if(!x)return res.status(404).json({error:'not found'});if(!file||!fs.existsSync(file))return res.status(404).json({error:'export not found'});res.download(file,path.basename(file));});
app.get('/api/websites',(req,res)=>res.json({sites:listSites(DATA)}));
app.post('/api/websites',(req,res)=>{try{res.status(201).json(createSite(DATA,{...(req.body||{}),brand:readBrandBrain(DATA)}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/websites/:id',(req,res)=>{const x=getSite(DATA,req.params.id);return x?res.json(x):res.status(404).json({error:'not found'})});
app.get('/api/websites/:id/preview',(req,res)=>{const x=getSite(DATA,req.params.id),file=x?.exports?.html;if(!x)return res.status(404).json({error:'not found'});if(!file||!fs.existsSync(file))return res.status(404).json({error:'preview not found'});res.sendFile(file);});
app.get('/api/websites/:id/bundle',(req,res)=>{const x=getSite(DATA,req.params.id),file=x?.exports?.zip;if(!x)return res.status(404).json({error:'not found'});if(!file||!fs.existsSync(file))return res.status(404).json({error:'bundle not found'});res.download(file,`${String(x.name||'website').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-website.zip`);});
app.get('/api/agents',(req,res)=>res.json({agents:listAgents(DATA),policy:{freeOnly:true,arbitraryCode:false,ownerApprovalRequired:true}}));
app.patch('/api/agents/:id',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});try{res.json(configureAgent(DATA,req.params.id,req.body||{}))}catch(e){res.status(404).json({error:String(e.message||e)})}});
function planCreatorGoalWithSignals(input={}){const projects=list(),perf=performanceSummary(DATA,projects),series=contentSeriesRecommendations(projects,perf),learning=crossPlatformLearning(listPlatformPerformance(DATA),projects),creative=creativeIntelligence(projects,perf,experimentInsights(DATA));refreshCreativeMemory(DATA,projects,perf,experimentInsights(DATA));const aware=performanceAwareCreatorPlan(planCreatorGoal(input),{performance:perf,series});return {...aware,team:coordinatedAgentPlan(aware.goal,{performance:perf,learning,creative}),creativeMemory:retrieveCreativeMemory(DATA,{limit:4})};}
app.post('/api/agents/:id/plan',(req,res)=>{try{const g=agentGoal(DATA,req.params.id,req.body||{});res.json({...g,plan:planCreatorGoalWithSignals({goal:g.goal})})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/creator-agent/tools',(req,res)=>res.json({tools:creatorTools,policy:{autonomy:'approval-gated',cost:'free-only'}}));
app.post('/api/creator-agent/plan',(req,res)=>{try{const plan=planCreatorGoalWithSignals(req.body||{}),projects=list(),perf=performanceSummary(DATA,projects),learning=crossPlatformLearning(listPlatformPerformance(DATA),projects),creative=creativeIntelligence(projects,perf,experimentInsights(DATA));res.status(201).json({...plan,team:coordinatedAgentPlan(plan.goal,{performance:perf,learning,creative})})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/creator-agent/team-plan',(req,res)=>{try{const projects=list(),perf=performanceSummary(DATA,projects),learning=crossPlatformLearning(listPlatformPerformance(DATA),projects),creative=creativeIntelligence(projects,perf,experimentInsights(DATA));res.status(201).json(coordinatedAgentPlan(req.body?.goal,{performance:perf,learning,creative}))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/creator-agent/handoffs',(req,res)=>res.json({handoffs:listAgentHandoffs(DATA,{runId:String(req.query.runId||'')})}));
app.get('/api/creator-agent/runs',(req,res)=>{const runs=listRuns(DATA).slice(0,30).map(run=>syncRunWithProjects(DATA,run,load)).map(run=>{const handoffs=syncAgentHandoffs(DATA,run);return {...run,handoffs,artifacts:(run.artifacts||[]).map(a=>a.type==='video'&&a.id?({...a,projectStatus:load(a.id)?.status||a.status,progress:load(a.id)?.progress??null,launchReady:load(a.id)?.qa?.launchReady===true,approval:load(a.id)?.publishApproval?.status||null}):a)}});res.json({runs})});
async function executeCreatorStep(step,plan,run,artifacts){
  step.status='running';step.startedAt=new Date().toISOString();delete step.error;updateRun(DATA,run.id,{steps:run.steps,artifacts});
  if(step.tool==='research'){const report=await runResearch(DATA,{query:plan.goal,mode:'topic'});artifacts.push({type:'research',id:report.id,label:report.query});}
  else if(step.tool==='brand-brain'){const brand=readBrandBrain(DATA);artifacts.push({type:'brand',name:brand.name,version:brand.version});}
  else if(step.tool==='product-studio'){const item=createProduct(DATA,{title:plan.goal,type:/spreadsheet|tracker/i.test(plan.goal)?'spreadsheet':'ebook',brand:readBrandBrain(DATA)});artifacts.push({type:'product',id:item.id,label:item.title});}
  else if(step.tool==='website-builder'){const item=createSite(DATA,{name:plan.goal,goal:plan.goal,brand:readBrandBrain(DATA)});artifacts.push({type:'website',id:item.id,label:item.name});}
  else if(step.tool==='video-maker'){
    const existing=(artifacts||[]).find(a=>a.type==='video'&&a.id),existingProject=existing?load(existing.id):null;
    if(existingProject?.status==='failed'){prepareProjectRetry(existingProject);save(existingProject);setImmediate(kick);}
    else if(!existingProject){if([...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length>=5)throw Error('Video queue full');const brand=readBrandBrain(DATA),job={id:crypto.randomUUID(),status:'queued',progress:0,createdAt:new Date().toISOString(),niche:'storytelling',style:brand.visualStyle||'documentary',mode:'multi-scene',language:brand.language||'en',aspect:'9:16',voice:brand.voice||'auto',captionStyle:'bold',characterId:null,character:null,brand:{name:brand.name,version:brand.version},creatorContext:`${brandPrompt(brand,null)}\nObserved creative memory: ${JSON.stringify(retrieveCreativeMemory(DATA,{limit:4}).items||[])}`.slice(0,5000),topic:plan.goal,duration:60,autonomous:true,autoCandidates:true,candidateCount:3,creatorRunId:run.id};save(job);artifacts.push({type:'video',id:job.id,topic:job.topic,status:'queued'});setImmediate(kick);}
  }
  else if(step.tool==='image-maker'){const item=createImageBrief(DATA,{kind:'youtube-thumbnail',title:plan.goal,prompt:`High-retention thumbnail for ${plan.goal}`});artifacts.push({type:'image',id:item.id,label:item.title});}
  else if(step.tool==='publishing'){artifacts.push({type:'publishing',status:'blocked-until-video-approved'});}
  else {step.status='skipped';step.completedAt=new Date().toISOString();step.error='unsupported creator tool';return;}
  step.status='complete';step.completedAt=new Date().toISOString();
}
app.post('/api/creator-agent/execute',async(req,res)=>{
  let run;try{
    const plan=planCreatorGoalWithSignals(req.body||{}),key=String(req.get('idempotency-key')||req.body?.idempotencyKey||'').trim().slice(0,120),existing=key?findRunByIdempotency(DATA,key):null;
    if(existing)return res.status(200).json(syncRunWithProjects(DATA,existing,load));
    run=createRun(DATA,plan,{idempotencyKey:key});const coordinated=coordinatedAgentPlan(plan.goal,{performance:performanceSummary(DATA,list()),learning:crossPlatformLearning(listPlatformPerformance(DATA),list()),creative:creativeIntelligence(list(),performanceSummary(DATA,list()),experimentInsights(DATA))});ensureAgentHandoffs(DATA,run.id,coordinated);const artifacts=[];
    for(const step of run.steps)await executeCreatorStep(step,plan,run,artifacts);
    const video=artifacts.find(a=>a.type==='video');for(const h of listAgentHandoffs(DATA,{runId:run.id}).filter(h=>['growth','creative','production'].includes(h.to)&&h.status!=='complete'))completeAgentHandoff(DATA,h.id,{summary:`${h.from} completed handoff to ${h.to}`});run=updateRun(DATA,run.id,{status:video?'producing':'awaiting-approval',steps:run.steps,artifacts,checkpoint:video?{stage:'video-production',projectId:video.id,progress:0}:{stage:'approval'},completedAt:new Date().toISOString()});res.status(202).json({...run,handoffs:listAgentHandoffs(DATA,{runId:run.id})});
  }catch(e){if(run){const msg=String(e.message||e).slice(0,240),steps=(run.steps||[]).map(s=>s.status==='running'?{...s,status:'failed',error:msg,completedAt:new Date().toISOString()}:s);updateRun(DATA,run.id,{status:'failed',steps,error:msg});}res.status(400).json({error:String(e.message||e)})}
});
app.post('/api/campaigns/:id/orchestrate',async(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});if(req.body?.confirm!==true)return res.status(409).json({error:'explicit confirm=true is required'});const campaign=getCampaign(DATA,req.params.id);if(!campaign)return res.status(404).json({error:'campaign not found'});let run;try{const goal=campaign.goal||campaign.name,plan=planCreatorGoalWithSignals({goal}),key=`campaign:${campaign.id}:${String(req.body?.idempotencyKey||'default').slice(0,60)}`,existing=findRunByIdempotency(DATA,key);if(existing)return res.json({...existing,campaignId:campaign.id,handoffs:listAgentHandoffs(DATA,{runId:existing.id})});run=createRun(DATA,plan,{idempotencyKey:key});ensureAgentHandoffs(DATA,run.id,plan.team);const artifacts=[];for(const step of run.steps)await executeCreatorStep(step,plan,run,artifacts);const video=artifacts.find(a=>a.type==='video'),projectIds=[...new Set([...(campaign.projectIds||[]),...(video?.id?[video.id]:[])])];updateCampaign(DATA,campaign.id,{projectIds,status:'active'});run=updateRun(DATA,run.id,{status:video?'producing':'awaiting-approval',steps:run.steps,artifacts,campaignId:campaign.id,checkpoint:video?{stage:'video-production',projectId:video.id,progress:0}:{stage:'approval'},completedAt:new Date().toISOString()});res.status(202).json({...run,campaignId:campaign.id,handoffs:listAgentHandoffs(DATA,{runId:run.id}),policy:{ownerConfirmed:true,autoPublish:false,freeOnly:true}})}catch(e){if(run)updateRun(DATA,run.id,{status:'failed',error:String(e.message||e).slice(0,240)});res.status(400).json({error:String(e.message||e)})}});
app.post('/api/agents/:id/execute',async(req,res)=>{let run;try{const g=agentGoal(DATA,req.params.id,req.body||{}),plan=planCreatorGoalWithSignals({goal:g.goal});run=createRun(DATA,plan,{idempotencyKey:String(req.get('idempotency-key')||'').trim().slice(0,120)});const artifacts=[];for(const step of run.steps)await executeCreatorStep(step,plan,run,artifacts);const video=artifacts.find(a=>a.type==='video');run=updateRun(DATA,run.id,{status:video?'producing':'awaiting-approval',steps:run.steps,artifacts,agentId:g.agent.id,checkpoint:video?{stage:'video-production',projectId:video.id,progress:0}:{stage:'approval'},completedAt:new Date().toISOString()});res.status(202).json(run)}catch(e){if(run)updateRun(DATA,run.id,{status:'failed',error:String(e.message||e).slice(0,240)});res.status(400).json({error:String(e.message||e)})}});
app.post('/api/creator-agent/runs/:id/retry',async(req,res)=>{
  const run=getRun(DATA,req.params.id);if(!run)return res.status(404).json({error:'run not found'});
  const plan=planCreatorGoal({goal:run.goal}),artifacts=[...(run.artifacts||[])],failedStep=(run.steps||[]).find(s=>s.status==='failed');
  try{
    if(run.checkpoint?.projectId){const project=load(run.checkpoint.projectId);if(project?.status==='failed'){prepareProjectRetry(project);save(project);setImmediate(kick);const updated=updateRun(DATA,run.id,{status:'producing',checkpoint:{stage:'video-production',projectId:project.id,progress:Number(project.progress||0)},error:null});return res.status(202).json(updated);}}
    if(!failedStep)return res.status(409).json({error:'no failed workflow step to retry'});
    failedStep.status='pending';delete failedStep.error;await executeCreatorStep(failedStep,plan,run,artifacts);const video=artifacts.find(a=>a.type==='video');const updated=updateRun(DATA,run.id,{status:video?'producing':'awaiting-approval',steps:run.steps,artifacts,checkpoint:video?{stage:'video-production',projectId:video.id,progress:Number(load(video.id)?.progress||0)}:{stage:'approval'},error:null});res.status(202).json(updated);
  }catch(e){const msg=String(e.message||e).slice(0,240);failedStep.status='failed';failedStep.error=msg;res.status(400).json(updateRun(DATA,run.id,{status:'failed',steps:run.steps,error:msg}));}
});

app.get('/api/openrouter/free-models',(req,res)=>res.json(readOpenRouterFreeCatalog()));
app.get('/api/provider-worker/status',(req,res)=>{const f=path.join(DATA,'provider-worker-status.json');if(!fs.existsSync(f))return res.json({state:'offline'});try{res.json(JSON.parse(fs.readFileSync(f,'utf8')))}catch{res.json({state:'invalid'})}});
app.get('/api/provider-verification',(req,res)=>res.json({state:readVerification(DATA),worker:providerWorkerInventory(DATA)}));
app.get('/api/provider-capabilities',(req,res)=>res.json({capabilities:providerCapabilities(),inventory:providerWorkerInventory(DATA),smoke:providerSmokeSummary(DATA),policy:{freeOnly:true,smokeRequiredBeforeExecution:true}}));
app.post('/api/providers/:id/smoke',async(req,res)=>{const id=String(req.params.id||'').toLowerCase(),row=providerWorkerInventory(DATA).find(x=>x.id===id);if(!row)return res.status(404).json({error:'provider not found'});if(!row.preflightReady)return res.status(409).json({error:'provider is not authenticated with fresh verified-free allowance'});const smokeKind=row.capability?.kinds?.includes('image')?'image':row.capability?.kinds?.[0]||row.kind||'image',smokeJob={id:`smoke-${id}-${Date.now()}`,provider:id,kind:smokeKind,prompt:smokeKind==='video'?'gentle camera push toward a simple blue geometric shape on a plain white background':'simple blue geometric shape on a plain white background',verifiedFree:true};try{const result=await executeProviderJob(smokeJob,path.join(DATA,'provider-assets','smoke',id));const stat=fs.statSync(result.file);if(!stat.isFile()||stat.size<256)throw Error('provider smoke output is empty');const smoke=recordProviderSmoke(DATA,id,{success:true,model:result.model,kind:result.kind,detail:`${stat.size} bytes`});consumeFreeAllowance(DATA,id,1);res.json({provider:id,success:true,smoke,remaining:readVerification(DATA).providers?.[id]?.remaining??0})}catch(e){const smoke=recordProviderSmoke(DATA,id,{success:false,detail:String(e.message||e).slice(0,300)});res.status(502).json({provider:id,success:false,smoke,error:String(e.message||e)})}});
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

function queueVideoProject(body={}){
  if(shuttingDown)throw Error('Studio is restarting; retry shortly');
  const topic=String(body.topic||'').trim();
  if(topic.length<3||topic.length>300)throw Error('topic is required');
  if([...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length>=5)throw Error('Queue full; retry after a project finishes');
  const duration=Number(body.duration||60);if(!Number.isFinite(duration)||duration<30||duration>1800)throw Error('Choose a duration from 30 seconds to 30 minutes');
  const niche=niches.includes(body.niche)?body.niche:'storytelling',requestedMode=videoModes.includes(body.mode)?body.mode:'multi-scene',mode=body.style==='whiteboard'?'whiteboard':requestedMode,style=mode==='whiteboard'?'whiteboard':styles.includes(body.style)?body.style:'documentary',language=languages.includes(body.language)?body.language:'en',aspect=aspects.includes(body.aspect)?body.aspect:'9:16',voice=voices.includes(body.voice)?body.voice:'auto',captionStyle=captionStyles.includes(body.captionStyle)?body.captionStyle:'bold',character=body.characterId?getCharacter(DATA,String(body.characterId)):null,brand=readBrandBrain(DATA),creatorContext=brandPrompt(brand,character);
  const job={id:crypto.randomUUID(),status:'queued',progress:0,createdAt:new Date().toISOString(),niche,style,mode,language,aspect,voice,captionStyle,characterId:character?.id||null,character:character?{id:character.id,name:character.name}:null,brand:{name:brand.name,version:brand.version},creatorContext,topic,duration,autonomous:true,autoCandidates:body.autoCandidates!==false,candidateCount:Math.max(1,Math.min(4,Number(body.candidateCount||3)))};save(job);setImmediate(kick);return job;
}
app.post('/api/projects',(req,res)=>{
  try{return res.status(202).json(queueVideoProject(req.body||{}))}catch(e){const msg=String(e.message||e);return res.status(/Queue full/.test(msg)?429:/restarting/.test(msg)?503:400).json({error:msg})}
});
/* legacy creation route removed after queueVideoProject consolidation */

/*
app.post('/api/projects-legacy',(req,res)=>{
  if(shuttingDown)return res.status(503).json({error:'Studio is restarting; retry shortly'});
  const body=req.body||{};
  const topic=String(body.topic||'').trim();
  if(topic.length<3 || topic.length>300) return res.status(400).json({error:'topic is required'});
  if([...jobs.values()].filter(j=>!['complete','failed'].includes(j.status)).length>=5)return res.status(429).json({error:'Queue full; retry after a project finishes'});
  const duration=Number(body.duration||60);
  if(!Number.isFinite(duration)||duration<30||duration>1800)return res.status(400).json({error:'Choose a duration from 30 seconds to 30 minutes'});
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
*/

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
app.post('/api/projects/:id/scenes/reorder',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});
  const current=(j.storyboard||[]).map(x=>x.index),order=(Array.isArray(req.body?.order)?req.body.order:[]).map(Number);if(order.length!==current.length||new Set(order).size!==current.length||current.some(x=>!order.includes(x)))return res.status(400).json({error:'order must contain every scene exactly once'});
  const rank=new Map(order.map((x,i)=>[x,i]));j.storyboard=[...(j.storyboard||[])].sort((a,b)=>rank.get(a.index)-rank.get(b.index));j.scenes=[...(j.scenes||[])].sort((a,b)=>(rank.get(a.index)??9999)-(rank.get(b.index)??9999));j.sequenceUpdatedAt=new Date().toISOString();j.status='queued';j.progress=85;delete j.error;delete j.render;invalidatePublishApproval(j,'scene-order-changed',{required:REQUIRE_PUBLISH_APPROVAL});save(j);setImmediate(kick);res.status(202).json({id:j.id,status:j.status,order,publishApproval:j.publishApproval});
});
app.post('/api/projects/:id/scenes/bulk',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});
  const indexes=[...new Set((Array.isArray(req.body?.indexes)?req.body.indexes:[]).map(Number).filter(Number.isInteger))],action=String(req.body?.action||'regenerate');if(!indexes.length)return res.status(400).json({error:'indexes are required'});const scenes=indexes.map(i=>j.storyboard?.find(x=>x.index===i));if(scenes.some(x=>!x))return res.status(404).json({error:'one or more scenes were not found'});
  if(action==='style'){const style=String(req.body?.style||'');if(!styles.includes(style))return res.status(400).json({error:'unsupported style'});for(const scene of scenes)scene.style=style;}else if(action!=='regenerate')return res.status(400).json({error:'unsupported bulk action'});
  for(const scene of scenes){archiveSceneVariant(j,scene.index);scene.variantSeed=Number(scene.variantSeed||0)+1;const dir=path.join(projectDir(j.id),`scene-${String(scene.index).padStart(2,'0')}`);try{fs.rmSync(dir,{recursive:true,force:true})}catch{}}
  j.scenes=(j.scenes||[]).filter(x=>!indexes.includes(x.index));j.status='queued';j.progress=25;delete j.error;delete j.render;invalidatePublishApproval(j,action==='style'?'scene-style-changed':'scenes-regenerated',{required:REQUIRE_PUBLISH_APPROVAL});save(j);setImmediate(kick);res.status(202).json({id:j.id,status:j.status,indexes,action,publishApproval:j.publishApproval});
});
app.patch('/api/projects/:id/scenes/:index',(req,res)=>{
  const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});
  if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});
  const index=Number(req.params.index),scene=j.storyboard?.find(x=>x.index===index);if(!scene)return res.status(404).json({error:'scene not found'});
  const patch=req.body||{},changes={};
  if(patch.narration!==undefined){const v=String(patch.narration||'').replace(/\s+/g,' ').trim().slice(0,420);if(v.length<8)return res.status(400).json({error:'narration must be at least 8 characters'});changes.narration=v;}
  if(patch.overlay!==undefined)changes.overlay=String(patch.overlay||'').replace(/\s+/g,' ').trim().slice(0,95);
  if(patch.searchQuery!==undefined)changes.searchQuery=String(patch.searchQuery||'').replace(/\s+/g,' ').trim().slice(0,260);
  if(!Object.keys(changes).length)return res.status(400).json({error:'no editable scene fields supplied'});
  archiveSceneVariant(j,index);Object.assign(scene,changes,{variantSeed:Number(scene.variantSeed||0)+1,editedAt:new Date().toISOString()});
  const dir=path.join(projectDir(j.id),`scene-${String(index).padStart(2,'0')}`);try{fs.rmSync(dir,{recursive:true,force:true})}catch{}
  j.scenes=(j.scenes||[]).filter(x=>x.index!==index);j.status='queued';j.progress=25;delete j.error;delete j.render;invalidatePublishApproval(j,'scene-edited',{required:REQUIRE_PUBLISH_APPROVAL});save(j);setImmediate(kick);
  res.status(202).json({id:j.id,scene:index,status:j.status,changes,publishApproval:j.publishApproval});
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
app.get('/api/projects/:id/thumbnails',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});try{res.json({projectId:j.id,variants:ensureThumbnailVariants(DATA,j)})}catch(e){res.status(409).json({error:String(e.message||e)})}});
app.get('/api/projects/:id/thumbnails/:variant',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});try{const variants=ensureThumbnailVariants(DATA,j),item=variants.find(x=>x.index===Number(req.params.variant));if(!item)return res.status(404).json({error:'thumbnail variant not found'});res.type('image/jpeg').sendFile(item.file)}catch(e){res.status(409).json({error:String(e.message||e)})}});
app.post('/api/projects/:id/thumbnail-experiment',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});try{const variants=ensureThumbnailVariants(DATA,j),exp=createExperiment(DATA,{projectId:j.id,type:'thumbnail',variants:variants.map(x=>x.url)});res.status(201).json({...exp,thumbnailVariants:variants.map(({file,...x})=>x)})}catch(e){res.status(409).json({error:String(e.message||e)})}});
app.post('/api/projects/:id/thumbnail-ai-briefs',(req,res)=>{if(req.authActor?.type!=='owner')return res.status(403).json({error:'owner required'});const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete')return res.status(409).json({error:'project must be complete'});try{const perf=performanceSummary(DATA,list()).top.find(x=>x.projectId===j.id)||null,briefs=thumbnailCreativeBriefs(j,{performance:perf}),chosen=chooseFreeProvider(DATA,'auto'),assets=[];for(const brief of briefs){const item=createImageBrief(DATA,{kind:'youtube-thumbnail',title:`${j.topic} · ${brief.concept}`,prompt:brief.prompt});let providerJob=null;if(chosen&&canQueueFreeProvider(chosen))providerJob=createProviderJob(DATA,{provider:chosen.id,projectId:`asset-${item.id}`,assetId:item.id,sceneIndex:1,kind:'image',prompt:item.prompt,verifiedFree:true,priority:65});assets.push({asset:item,concept:brief.concept,providerJob})}res.status(201).json({projectId:j.id,assets,route:chosen?{provider:chosen.id,executable:!!chosen.executable,verifiedFree:!!chosen.verifiedFree}:null,fallback:'deterministic-composed-thumbnails',policy:{freeOnly:true,autoPromote:false,ownerReviewRequired:true}})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.post('/api/experiments/:id/promote',(req,res)=>{try{const exp=listExperiments(DATA).find(x=>x.id===req.params.id);if(!exp)return res.status(404).json({error:'experiment not found'});if(exp.status!=='complete')return res.status(409).json({error:'experiment must be complete before promotion'});const insight=experimentInsights(DATA).winners.find(x=>x.experimentId===exp.id);if(!insight)return res.status(409).json({error:'experiment has no measurable winner'});const selected=req.body?.variant===undefined?Number(insight.variant):Number(req.body.variant);if(!Number.isInteger(selected)||selected<0||selected>=exp.variants.length)return res.status(400).json({error:'invalid variant'});if(selected!==Number(insight.variant)&&req.body?.confirmOverride!==true)return res.status(409).json({error:'selected variant is not the measured winner; confirmOverride is required'});const j=load(exp.projectId);if(!j)return res.status(404).json({error:'project not found'});j.publish||={};if(exp.type==='title')j.publish.title=exp.variants[selected];else j.publish.thumbnail=exp.variants[selected];j.optimizationPromotion={experimentId:exp.id,type:exp.type,variant:selected,value:exp.variants[selected],measuredWinner:Number(insight.variant),promotedAt:new Date().toISOString(),ownerReviewed:true};invalidatePublishApproval(j,'experiment-winner-promoted',{required:REQUIRE_PUBLISH_APPROVAL});save(j);res.json({projectId:j.id,promotion:j.optimizationPromotion,publishApproval:j.publishApproval})}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/projects/:id/thumbnail',(req,res)=>{const j=load(req.params.id);if(!j?.render?.file||!fs.existsSync(j.render.file))return res.status(404).json({error:'video not ready'});const out=path.join(projectDir(j.id),'thumbnail.jpg');if(!fs.existsSync(out)){const r=spawnSync('ffmpeg',['-y','-ss','0.8','-i',j.render.file,'-frames:v','1','-vf','scale=720:-2',out],{stdio:'ignore',timeout:20000});if(r.status!==0||!fs.existsSync(out))return res.status(500).json({error:'thumbnail generation failed'});}res.sendFile(out);});
app.get('/api/projects/:id/distribution/:platform',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete'||j.qa?.launchReady!==true)return res.status(409).json({error:'project is not launch-ready'});if(REQUIRE_PUBLISH_APPROVAL&&j.publishApproval?.status!=='approved')return res.status(409).json({error:'project is not approved for publishing'});try{res.json(buildDistributionPackage(j,String(req.params.platform||'')))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/projects/:id/repurpose',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete')return res.status(409).json({error:'project must be complete before repurposing'});res.json(buildRepurposePack(j));});
app.get('/api/projects/:id/repurpose/clips',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete')return res.status(409).json({error:'project must be complete before clip planning'});res.json({projectId:j.id,clips:clipPlan(j)});});
app.get('/api/projects/:id/repurpose/aspect/:aspect',async(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete')return res.status(409).json({error:'project must be complete before repurposing'});try{const file=await ensureAspectVariant(DATA,j,String(req.params.aspect||''));if(req.query.download==='1')return res.download(file,downloadName(j,`repurpose-${String(req.params.aspect).replace(':','x')}.mp4`));res.sendFile(file)}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/projects/:id/repurpose/clips/:clip/video',async(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete')return res.status(409).json({error:'project must be complete before clip extraction'});try{const out=await ensureClip(DATA,j,Number(req.params.clip));if(req.query.download==='1')return res.download(out.file,downloadName(j,`clip-${out.clip.index}.mp4`));res.sendFile(out.file)}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get('/api/publishing/connectors',(req,res)=>res.json({google:googleOAuthStatus(DATA),youtube:youtubePublisherStatus(youtubeCredentialEnv(DATA)),tiktok:tiktokPublisherStatus(),instagram:instagramPublisherStatus(),youtubeAnalytics:youtubeAnalyticsStatus(youtubeAnalyticsCredentialEnv(DATA)),tiktokAnalytics:tiktokAnalyticsStatus(),instagramAnalytics:instagramAnalyticsStatus()}));
app.get('/api/publish-jobs',(req,res)=>res.json({summary:publishQueueSummary(DATA),jobs:listPublishJobs(DATA,{projectId:String(req.query.projectId||''),status:String(req.query.status||'')}).slice(0,100)}));
app.get('/api/publishing/calendar',(req,res)=>res.json(publishingCalendar(DATA,{days:Number(req.query.days||30),conflictMinutes:Number(req.query.conflictMinutes||30)})));
app.get('/api/projects/:id/publish-options',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});res.json({experiments:listExperiments(DATA).filter(x=>x.projectId===j.id&&x.status!=='complete').map(x=>({id:x.id,type:x.type,status:x.status,variants:x.variants}))})});
app.post('/api/projects/:id/publish-jobs',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});try{const body=req.body||{},experimentId=String(body.experimentId||'').trim();if(experimentId){const exp=listExperiments(DATA).find(x=>x.id===experimentId&&x.projectId===j.id);if(!exp)throw Error('experiment does not belong to project');const variant=Number(body.experimentVariant);if(!Number.isInteger(variant)||variant<0||!exp.variants?.[variant])throw Error('invalid experiment variant');}res.status(201).json(createPublishJob(DATA,j,body))}catch(e){res.status(409).json({error:String(e.message||e)})}});
const publishingExecutions=new Set();
async function executePublishJob(job){
  if(!job)throw new Error('publish job not found');if(!['youtube-shorts','tiktok','instagram-reels'].includes(job.platform))throw new Error('platform connector not implemented');
  if(publishingExecutions.has(job.id))throw new Error('publish job is already executing');
  const project=load(job.projectId);if(!project||project.status!=='complete'||project.qa?.launchReady!==true||project.publishApproval?.status!=='approved')throw new Error('project approval or readiness changed');
  if(job.status==='published')return job;if(job.status==='scheduled'&&job.scheduledAt&&Date.parse(job.scheduledAt)>Date.now())throw new Error('publish job is scheduled for the future');
  publishingExecutions.add(job.id);try{updatePublishJob(DATA,job.id,{status:'uploading',lastError:null});const result=job.platform==='youtube-shorts'?await uploadYouTubeVideo({videoFile:project.render?.file,pkg:job.package,scheduledAt:job.scheduledAt,env:youtubeCredentialEnv(DATA)}):job.platform==='tiktok'?await uploadTikTokVideo({videoFile:project.render?.file,pkg:job.package}):await uploadInstagramReel({projectId:project.id,videoFile:project.render?.file,pkg:job.package,signingSecret:process.env.PUBLISH_MEDIA_SIGNING_SECRET||AUTH_SECRET});const mode=job.platform==='youtube-shorts'?'youtube-api':job.platform==='tiktok'?'tiktok-content-posting-api':'instagram-graph-api';return updatePublishJob(DATA,job.id,{status:'published',delivery:{mode,externalPostingEnabled:true,result},publishedAt:new Date().toISOString()});}catch(e){updatePublishJob(DATA,job.id,{status:'failed',lastError:String(e.message||e).slice(0,240)});throw e}finally{publishingExecutions.delete(job.id)}
}
app.post('/api/publish-jobs/:id/execute',async(req,res)=>{const job=getPublishJob(DATA,req.params.id);if(!job)return res.status(404).json({error:'publish job not found'});try{res.json(await executePublishJob(job))}catch(e){const msg=String(e.message||e);res.status(/future|approval|connector|already|disabled/.test(msg)?409:502).json({error:msg})}});
app.get('/api/projects/:id/publish-manifest',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(j.status!=='complete'||j.qa?.launchReady!==true)return res.status(409).json({error:'project is not launch-ready'});if(REQUIRE_PUBLISH_APPROVAL&&j.publishApproval?.status!=='approved')return res.status(409).json({error:'project is not approved for publishing'});const manifest={id:j.id,topic:j.topic,generatedAt:new Date().toISOString(),video:`/api/projects/${j.id}/video`,credits:`/api/projects/${j.id}/credits`,publish:j.publish||null,approval:j.publishApproval||null,qa:{launchReady:true,viralityScore:j.qa?.viralityScore??null,retentionScore:j.qa?.retention?.score??null,narrativeArcScore:j.qa?.narrativeArc?.score??null,editingScore:j.qa?.editingRhythm?.score??null}};res.setHeader('Content-Disposition',`attachment; filename="${downloadName(j,'publish-manifest.json')}"`);res.json(manifest);});
app.delete('/api/projects/:id',(req,res)=>{const j=load(req.params.id);if(!j)return res.status(404).json({error:'not found'});if(!['complete','failed'].includes(j.status))return res.status(409).json({error:'Project is busy'});const providerJobsDeleted=deleteProviderJobsForProject(DATA,j.id),aiInboxDeleted=deleteAiCandidatesForProject(DATA,j.id),publishJobsDeleted=deletePublishJobsForProject(DATA,j.id);jobs.delete(j.id);fs.rmSync(projectDir(j.id),{recursive:true,force:true});res.json({deleted:true,id:j.id,providerJobsDeleted,aiInboxDeleted,publishJobsDeleted});});

for(const job of list()){let changed=false;if(job.status==='failed'&&!job.failedStage){job.failedStage=inferFailureStage(job);changed=true;}const hadApproval=!!job.publishApproval?.status;if(job.status==='complete')ensurePublishApproval(job,{required:REQUIRE_PUBLISH_APPROVAL});const recovered=recoverProjectState(job);if(recovered.changed||changed||(!hadApproval&&!!job.publishApproval?.status))save(job);}
const maintainProviderState=()=>{const assetIds=(listCreatorAssets(DATA).assets||[]).map(x=>`asset-${x.id}`);const result=maintainProviderJobs(DATA,{projectIds:[...list().map(x=>x.id),...assetIds],retentionDays:Number(process.env.PROVIDER_JOB_RETENTION_DAYS||30)});lastProviderMaintenance={...result,ranAt:new Date().toISOString()};return lastProviderMaintenance;};
maintainProviderState();verifyProviders(DATA).catch(()=>{});refreshOpenRouterFreeCatalog().catch(()=>{});setInterval(()=>{reconcileProviderJobs(DATA);maintainProviderState();},30000).unref();setInterval(()=>verifyProviders(DATA).catch(()=>{}),15*60*1000).unref();setInterval(()=>refreshOpenRouterFreeCatalog().catch(()=>{}),30*60*1000).unref();
setInterval(()=>{if(enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))for(const j of list())if(j.status==='complete')maybeAutoCloudPlan(j.id).catch(()=>{});},60000).unref();
setInterval(()=>{if(!enabledFlag(process.env.AUTO_EXECUTE_SCHEDULED_YOUTUBE??'false'))return;const status=youtubePublisherStatus(youtubeCredentialEnv(DATA));if(!status.enabled)return;const due=duePublishJobs(DATA).filter(j=>!publishingExecutions.has(j.id));if(due[0])executePublishJob(due[0]).catch(()=>{});},30000).unref();
setInterval(()=>{if(!enabledFlag(process.env.AUTO_EXECUTE_SCHEDULED_TIKTOK??'false'))return;const status=tiktokPublisherStatus();if(!status.enabled)return;const due=duePublishJobs(DATA,{platform:'tiktok'}).filter(j=>!publishingExecutions.has(j.id));if(due[0])executePublishJob(due[0]).catch(()=>{});},30000).unref();
setInterval(()=>{if(!enabledFlag(process.env.AUTO_EXECUTE_SCHEDULED_INSTAGRAM??'false'))return;const status=instagramPublisherStatus();if(!status.enabled)return;const due=duePublishJobs(DATA,{platform:'instagram-reels'}).filter(j=>!publishingExecutions.has(j.id));if(due[0])executePublishJob(due[0]).catch(()=>{});},30000).unref();
setImmediate(()=>{kick();if(enabledFlag(process.env.AUTO_CLOUD_ENHANCE??'true'))for(const j of list())if(j.status==='complete')maybeAutoCloudPlan(j.id).catch(()=>{});});
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Shorts Studio listening on ${PORT}`));
async function gracefulShutdown(signal){
  if(shuttingDown)return;shuttingDown=true;console.log(`${signal}: draining`);server.close();
  const deadline=Date.now()+35_000;while(active&&Date.now()<deadline)await new Promise(r=>setTimeout(r,500));
  process.exit(active?1:0);
}
process.once('SIGTERM',()=>gracefulShutdown('SIGTERM'));process.once('SIGINT',()=>gracefulShutdown('SIGINT'));
