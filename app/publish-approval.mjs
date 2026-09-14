const cleanNote=value=>String(value||'').trim().slice(0,1000);

export function ensurePublishApproval(project,{required=true,now=()=>new Date().toISOString()}={}){
  if(!project||project.status!=='complete')return project?.publishApproval||null;
  if(project.publishApproval?.status)return project.publishApproval;
  project.publishApproval=required
    ? {status:'pending',required:true,createdAt:now()}
    : {status:'approved',required:false,createdAt:now(),decidedAt:now(),decisionBy:'system'};
  return project.publishApproval;
}

export function decidePublishApproval(project,{decision,note='',now=()=>new Date().toISOString()}={}){
  if(!project||project.status!=='complete')throw new Error('Project must be complete before publish review');
  const normalized=String(decision||'').toLowerCase();
  if(!['approved','rejected'].includes(normalized))throw new Error('decision must be approved or rejected');
  if(normalized==='approved'&&project.qa?.launchReady!==true)throw new Error('Project must pass launch readiness before approval');
  project.publishApproval={status:normalized,required:true,note:cleanNote(note),decidedAt:now(),decisionBy:'owner'};
  return project.publishApproval;
}

export function invalidatePublishApproval(project,reason='content-changed',{required=true,now=()=>new Date().toISOString()}={}){
  if(!project)return null;
  const prior=project.publishApproval?.status||null;
  project.publishApproval=required
    ? {status:'pending',required:true,invalidatedAt:now(),invalidationReason:String(reason).slice(0,120),priorStatus:prior}
    : {status:'approved',required:false,invalidatedAt:now(),invalidationReason:String(reason).slice(0,120),priorStatus:prior,decidedAt:now(),decisionBy:'system'};
  return project.publishApproval;
}
