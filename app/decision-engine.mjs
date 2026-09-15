import { withProvenance } from './recommendation-provenance.mjs';
export function nextBestActions({campaigns=[],campaignPlans=[],performance={top:[]},creative={recommendations:[]},learning={recommendations:[]},runs=[]}={}){
  const actions=[];
  for(const p of campaignPlans)for(const a of p.actions||[])actions.push({...a,campaignId:p.campaignId});
  const failed=runs.filter(r=>['failed','needs-attention'].includes(r.status));
  for(const r of failed.slice(0,5))actions.push(withProvenance({type:'recover-agent-run',priority:95,runId:r.id,message:`Recover creator run for ${r.goal}`},{sources:[{type:'internal-qa',id:r.id,label:'run state',evidence:{status:r.status,checkpoint:r.checkpoint||null}}]}));
  if((performance.top||[])[0]){const x=performance.top[0];actions.push(withProvenance({type:'repurpose-winner',priority:80,projectId:x.projectId,message:`Repurpose ${x.topic||'top project'} using its observed performance evidence.`},{sources:[{type:'observed-performance',id:x.projectId,label:x.topic||'top project',observed:true,evidence:{views:x.views,watchMinutes:x.watchMinutes,score:x.score,platforms:x.platforms}}]}));}
  if((learning.recommendations||[])[0]){const x=learning.recommendations[0];actions.push(withProvenance({type:'platform-focus',priority:68,message:x.reason||'Follow observed platform signal.'},{sources:[{type:'observed-performance',id:`${x.niche}:${x.platform}`,label:'cross-platform signal',observed:true,evidence:{niche:x.niche,platform:x.platform,confidence:x.confidence}}]}));}
  if((creative.recommendations||[])[0]){const x=creative.recommendations[0];actions.push(withProvenance({type:'creative-focus',priority:65,message:x.message},{sources:[{type:'observed-creative',id:x.type||'creative',label:'creative intelligence',observed:true,evidence:x.evidence||null}]}));}
  return {generatedAt:new Date().toISOString(),actions:actions.sort((a,b)=>b.priority-a.priority).slice(0,20),policy:{ownerReviewRequired:true,autoPublish:false,autoBudget:false,freeOnly:true}};
}
