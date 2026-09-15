export function operationalHealth({projects=[],runs=[],backlog=[],executions=[],capacity={capacity:1},now=Date.now(),staleMinutes=45}={}){
  const cutoff=now-Math.max(5,Number(staleMinutes||45))*60000;
  const age=x=>Date.parse(x?.updatedAt||x?.createdAt||0);
  const staleProjects=projects.filter(x=>!['complete','failed'].includes(x.status)&&Number.isFinite(age(x))&&age(x)<cutoff).map(x=>({type:'project',id:x.id,status:x.status,updatedAt:x.updatedAt||x.createdAt||null}));
  const staleRuns=runs.filter(x=>['planning','executing','producing'].includes(x.status)&&Number.isFinite(age(x))&&age(x)<cutoff).map(x=>({type:'run',id:x.id,status:x.status,updatedAt:x.updatedAt||x.createdAt||null}));
  const staleBacklog=backlog.filter(x=>x.status==='in-progress'&&Number.isFinite(age(x))&&age(x)<cutoff).map(x=>({type:'backlog',id:x.id,status:x.status,updatedAt:x.updatedAt||x.createdAt||null}));
  const failures=executions.filter(x=>x.status==='failed').slice(0,20);
  const pressure=Math.max(0,Math.min(100,100-Math.max(1,Number(capacity.capacity||1))*25));
  const incidents=[...staleProjects,...staleRuns,...staleBacklog];
  return {checkedAt:new Date(now).toISOString(),staleMinutes:Number(staleMinutes||45),incidents,stale:{projects:staleProjects.length,runs:staleRuns.length,backlog:staleBacklog.length},recentExecutionFailures:failures.length,capacity:{available:Number(capacity.capacity||1),pressure},status:incidents.length||failures.length?'attention':'healthy',policy:{detectOnly:true,autoRecover:false,autoPublish:false}};
}
