const roles=[
  ['research','Research Agent','source-grounded evidence and opportunity map'],
  ['growth','Growth Agent','observed performance, series and platform priorities'],
  ['creative','Creative Agent','hooks, titles, thumbnails and visual direction'],
  ['production','Production Agent','video and asset execution'],
  ['qa','QA Agent','quality, retention, visual and launch-readiness checks'],
  ['publishing','Publishing Agent','approval-gated packaging, scheduling and distribution']
];
export function coordinatedAgentPlan(goal,{performance={top:[]},learning={rows:[],recommendations:[]},creative={patterns:[]}}={}){
  const clean=String(goal||'').trim().slice(0,500);if(clean.length<3)throw Error('goal is required');
  const evidence={topProjects:(performance.top||[]).slice(0,3).map(x=>({projectId:x.projectId,topic:x.topic,views:Number(x.views||0),score:Number(x.score||0),platforms:x.platforms||[]})),platformSignals:(learning.rows||[]).slice(0,4),creativePatterns:(creative.patterns||[]).slice(0,4)};
  const stages=roles.map(([id,name,output],i)=>({id,name,index:i,status:'planned',dependsOn:i?[roles[i-1][0]]:[],output,ownerGate:id==='publishing'}));
  const handoffs=stages.slice(1).map((s,i)=>({from:stages[i].id,to:s.id,status:'pending',required:true}));
  return {goal:clean,mode:'coordinated-approval-gated',costPolicy:'free-only',createdAt:new Date().toISOString(),stages,handoffs,evidence,policy:{ownerReviewRequired:true,autoPublish:false,autoBudget:false,arbitraryCode:false}};
}
