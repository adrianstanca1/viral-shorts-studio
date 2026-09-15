const n=v=>Math.max(0,Number(v||0));
export function crossPlatformLearning(records=[],projects=[]){
  const byId=new Map(projects.map(p=>[p.id,p])),groups=new Map();
  for(const r of records){const p=byId.get(r.projectId);if(!p)continue;const key=`${p.niche||'general'}:${r.platform||'unknown'}`,g=groups.get(key)||{niche:p.niche||'general',platform:r.platform||'unknown',projects:new Set(),views:0,watchMinutes:0,engagement:0};g.projects.add(p.id);g.views+=n(r.metrics?.views);g.watchMinutes+=n(r.metrics?.watchMinutes);g.engagement+=n(r.metrics?.likes)+n(r.metrics?.comments)+n(r.metrics?.shares)+n(r.metrics?.saved);groups.set(key,g)}
  const rows=[...groups.values()].map(g=>({niche:g.niche,platform:g.platform,projects:g.projects.size,views:g.views,watchMinutes:Number(g.watchMinutes.toFixed(1)),engagement:g.engagement,score:Number((Math.log10(1+g.views)*25+Math.log10(1+g.watchMinutes)*20+Math.log10(1+g.engagement)*15).toFixed(1))})).sort((a,b)=>b.score-a.score);
  const recommendations=[];for(const row of rows.slice(0,8)){if(row.projects>=1&&row.views>=100)recommendations.push({niche:row.niche,platform:row.platform,type:'double-down',confidence:row.projects>=3?'observed':'directional',reason:`Observed ${row.views} views and ${Math.round(row.watchMinutes)} watch minutes across ${row.projects} project(s).`})}
  return {generatedAt:new Date().toISOString(),rows,recommendations,policy:{observedMetricsOnly:true,ownerReviewRequired:true,autoPublish:false,autoBudget:false}};
}
