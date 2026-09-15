import crypto from 'node:crypto';
function parsedTime(value){const t=Date.parse(value||0);return Number.isFinite(t)?t:null}
function incident(type,item,severity,reason){return {type,id:item.id,status:item.status,updatedAt:item.updatedAt||item.createdAt||null,severity,reason}}

export function operationalHealth({projects=[],runs=[],backlog=[],executions=[],capacity={capacity:1},now=Date.now(),staleMinutes=45,failureWindowMinutes=60}={}){
  const staleWindow=Math.max(5,Number(staleMinutes||45)),failureWindow=Math.max(5,Number(failureWindowMinutes||60));
  const staleCutoff=now-staleWindow*60000,failureCutoff=now-failureWindow*60000;
  const isStale=x=>{const t=parsedTime(x?.updatedAt||x?.createdAt);return t!=null&&t<staleCutoff};
  const staleProjects=projects.filter(x=>!['complete','failed'].includes(x.status)&&isStale(x)).map(x=>incident('project',x,'high','project has not advanced within the stale-work window'));
  const staleRuns=runs.filter(x=>['planning','executing','producing'].includes(x.status)&&isStale(x)).map(x=>incident('run',x,'high','creator run has not advanced within the stale-work window'));
  const staleBacklog=backlog.filter(x=>x.status==='in-progress'&&isStale(x)).map(x=>incident('backlog',x,'medium','guarded backlog item has remained in progress too long'));
  const failures=executions.filter(x=>x?.status==='failed'&&parsedTime(x.createdAt)!=null&&parsedTime(x.createdAt)>=failureCutoff).slice(0,20);
  const available=Math.max(1,Number(capacity.capacity||1)),pressure=Math.max(0,Math.min(100,100-available*25));
  const incidents=[...staleProjects,...staleRuns,...staleBacklog];
  const critical=staleProjects.length>0||staleRuns.length>0||failures.length>=3;
  const status=critical?'critical':incidents.length||failures.length?'attention':'healthy';
  const reasons=[];
  if(staleProjects.length)reasons.push(`${staleProjects.length} stale project${staleProjects.length===1?'':'s'}`);
  if(staleRuns.length)reasons.push(`${staleRuns.length} stale creator run${staleRuns.length===1?'':'s'}`);
  if(staleBacklog.length)reasons.push(`${staleBacklog.length} stale backlog item${staleBacklog.length===1?'':'s'}`);
  if(failures.length)reasons.push(`${failures.length} execution failure${failures.length===1?'':'s'} in ${failureWindow}m`);
  return {checkedAt:new Date(now).toISOString(),staleMinutes:staleWindow,failureWindowMinutes:failureWindow,incidents,stale:{projects:staleProjects.length,runs:staleRuns.length,backlog:staleBacklog.length},recentExecutionFailures:failures.length,recentFailures:failures.map(x=>({id:x.id||null,backlogId:x.backlogId||null,type:x.type||null,error:x.error||null,createdAt:x.createdAt||null})),capacity:{available,pressure},status,reasons,policy:{detectOnly:true,autoRecover:false,autoPublish:false}};
}

export function maintenancePreview(health,{limit=10}={}){
  const max=Math.max(1,Math.min(25,Number(limit||10))),resetBacklog=(health?.incidents||[]).filter(x=>x.type==='backlog').slice(0,max).map(x=>({id:x.id,status:x.status,updatedAt:x.updatedAt,severity:x.severity,reason:x.reason}));
  const fingerprintPayload={resetBacklog:resetBacklog.map(x=>({id:x.id,status:x.status,updatedAt:x.updatedAt})),staleMinutes:Number(health?.staleMinutes||45),failureWindowMinutes:Number(health?.failureWindowMinutes||60)};
  const previewToken=crypto.createHash('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex');
  return {generatedAt:new Date().toISOString(),previewToken,resetBacklog,count:resetBacklog.length,blocked:{projects:Number(health?.stale?.projects||0),runs:Number(health?.stale?.runs||0)},policy:{previewOnly:true,ownerConfirmationRequired:true,stateBoundConfirmation:true,projectsAutoRecovered:false,runsAutoRecovered:false,autoPublish:false,freeOnly:true}};
}

export function maintenancePreviewMatches(preview,token){return typeof token==='string'&&token.length===64&&preview?.previewToken===token}
