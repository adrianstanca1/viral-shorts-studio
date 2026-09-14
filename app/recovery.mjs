import fs from 'node:fs';

const terminal=new Set(['complete','failed','queued']);

export function inferFailureStage(job={}){
  if(job.failedStage)return String(job.failedStage);
  const error=String(job.error||'').toLowerCase(),progress=Number(job.progress||0);
  if(/ffmpeg|ffprobe|assembl|codec|swscaler|audio|caption/.test(error))return progress>=85?'assembling':'generating-scenes';
  if(/commons|asset|media|image|video/.test(error))return 'generating-scenes';
  if(/source|research|wikipedia|tavily/.test(error))return 'research';
  if(/storyboard|script|narration|hook/.test(error))return 'storyboarding';
  if(progress>=90)return 'assembling';
  if(progress>=25)return 'generating-scenes';
  if(progress>=10)return 'storyboarding';
  return 'queued';
}

export function failureIsRecent(item={},hours=2,{now=Date.now}={}){
  const at=Date.parse(item.failedAt||item.updatedAt||item.createdAt||'');
  if(!Number.isFinite(at))return false;
  return now()-at<=Math.max(1,Number(hours||2))*3600000;
}
export function recoverProjectState(job,{exists=fs.existsSync,now=()=>new Date().toISOString()}={}){
  if(!job||typeof job!=='object')return {changed:false,job};
  const prior=String(job.status||'queued');
  const storyboard=Array.isArray(job.storyboard)?job.storyboard:[];
  const scenes=Array.isArray(job.scenes)?job.scenes:[];
  const validScenes=scenes.filter(s=>s?.file&&exists(s.file));
  const expected=storyboard.length;
  if(prior==='complete'){
    const renderOk=!!job.render?.file&&exists(job.render.file);
    const creditsOk=!!job.render?.credits&&exists(job.render.credits);
    const scenesOk=expected>0&&validScenes.length===expected;
    if(renderOk&&creditsOk&&scenesOk)return {changed:false,job};
    job.status='queued';
    job.progress=scenesOk?85:Math.max(25,25+Math.round(60*validScenes.length/Math.max(1,expected)));
    job.recoveredAt=now();job.recoveryReason='completed-artifact-integrity-failed';
    job.scenes=validScenes;delete job.render;delete job.qa;delete job.completedAt;delete job.error;delete job.failedAt;
    return {changed:true,job};
  }
  if(!terminal.has(prior)){
    job.status='queued';job.recoveredAt=now();job.recoveryReason=`interrupted-${prior||'unknown'}`;
    job.scenes=validScenes;job.progress=Math.max(0,Math.min(85,Number(job.progress||0)));delete job.error;delete job.failedAt;delete job.render;
    return {changed:true,job};
  }
  return {changed:false,job};
}


export function classifyRecoverability(job={}){
  if(!job||job.status!=='failed')return {recoverable:false,confidence:'none',reason:'project is not failed'};
  const stage=inferFailureStage(job),error=String(job.error||'').toLowerCase();
  if(/permission denied|unauthori[sz]ed|invalid api|authentication|forbidden/.test(error))return {recoverable:false,confidence:'low',reason:'credential or permission failure requires configuration'};
  if(/no research sources|invalid topic|unsupported/.test(error))return {recoverable:false,confidence:'low',reason:'input or source failure likely needs manual correction'};
  if(stage==='generating-scenes'&&/commons|asset|media|image|video|download/.test(error))return {recoverable:true,confidence:'high',reason:'media retrieval can be retried with current fallback logic'};
  if(stage==='assembling'&&/ffmpeg|ffprobe|codec|swscaler|audio|caption|assembl/.test(error))return {recoverable:true,confidence:'high',reason:'render tooling is available in the current runtime'};
  if(['research','storyboarding','generating-scenes','assembling'].includes(stage))return {recoverable:true,confidence:'medium',reason:`current pipeline can retry from ${stage}`};
  return {recoverable:true,confidence:'low',reason:'retry is possible but outcome is uncertain'};
}

export function prepareProjectRetry(job,{now=()=>new Date().toISOString()}={}){
  if(!job||typeof job!=='object')throw new Error('project required');
  if(job.status!=='failed')throw new Error('only failed projects can be retried');
  const at=job.failedAt||now(),stage=job.failedStage||'unknown',error=String(job.error||'Unknown generation error').slice(0,1200);
  const failure={at,stage,error},history=Array.isArray(job.failureHistory)?[...job.failureHistory]:[];
  const last=history.at(-1);if(!last||last.at!==failure.at||last.stage!==failure.stage||last.error!==failure.error)history.push(failure);
  job.failureHistory=history.slice(-5);job.lastFailure=failure;job.status='queued';job.progress=0;
  job.retryCount=Number(job.retryCount||0)+1;job.lastRetryAt=now();
  delete job.error;delete job.failedStage;delete job.failedAt;
  return job;
}
