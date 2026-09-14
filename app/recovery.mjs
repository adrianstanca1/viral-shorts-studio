import fs from 'node:fs';

const terminal=new Set(['complete','failed','queued']);
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
