const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
export function contentSeriesRecommendations(projects=[],performance={top:[]}){
  const byId=new Map(projects.map(p=>[p.id,p])),groups=new Map();
  for(const row of performance.top||[]){const p=byId.get(row.projectId);if(!p)continue;const key=norm(p.niche||'general'),g=groups.get(key)||{niche:p.niche||'general',items:[],score:0};g.items.push({projectId:p.id,topic:p.topic,views:Number(row.views||0),watchMinutes:Number(row.watchMinutes||0),score:Number(row.score||0)});g.score+=Number(row.score||0);groups.set(key,g)}
  const series=[...groups.values()].filter(g=>g.items.length).map(g=>{g.items.sort((a,b)=>b.score-a.score);const lead=g.items[0],avg=Number((g.score/g.items.length).toFixed(1));return {id:`series:${norm(g.niche).replace(/ /g,'-')||'general'}`,niche:g.niche,leadProjectId:lead.projectId,leadTopic:lead.topic,evidenceProjects:g.items.length,observedViews:g.items.reduce((n,x)=>n+x.views,0),observedWatchMinutes:g.items.reduce((n,x)=>n+x.watchMinutes,0),averagePerformanceScore:avg,recommendedEpisodes:[`Why ${lead.topic} matters`,`What most people miss about ${lead.topic}`,`${lead.topic}: the deeper story`],confidence:g.items.length>=3?'observed':g.items.length>=2?'directional':'early'} }).sort((a,b)=>b.averagePerformanceScore-a.averagePerformanceScore);
  return {generatedAt:new Date().toISOString(),series:series.slice(0,12),policy:{observedMetricsOnly:true,ownerReviewRequired:true,autoCreate:false}};
}
export function experimentLifecycleRecommendations(projects=[],experiments=[],performance={top:[]}){
  const perf=new Map((performance.top||[]).map(x=>[x.projectId,x])),active=new Set(experiments.filter(x=>x.status!=='complete').map(x=>`${x.projectId}:${x.type}`)),rows=[];
  for(const p of projects.filter(x=>x.status==='complete'&&x.qa?.launchReady===true)){const observed=perf.get(p.id);for(const type of ['title','thumbnail']){if(active.has(`${p.id}:${type}`))continue;const base=Number(p.qa?.viralityScore||0),boost=observed?Math.min(25,Math.round(Number(observed.score||0)/4)):0;rows.push({projectId:p.id,topic:p.topic,type,priority:Math.min(125,Math.round(base+boost)),reason:observed?`Observed performance supports a ${type} experiment (${observed.views||0} views)`:`Launch-ready project needs a ${type} experiment`,evidence:observed?{views:observed.views,watchMinutes:observed.watchMinutes,performanceScore:observed.score}:null})}}
  return {generatedAt:new Date().toISOString(),recommendations:rows.sort((a,b)=>b.priority-a.priority).slice(0,30),policy:{ownerReviewRequired:true,autoCreate:false,autoPromote:false}};
}

export function seriesEpisodeBatch(series,{count=3}={}){
  if(!series?.id)throw Error('series is required');const max=Math.max(1,Math.min(3,Number(count||3))),topics=(series.recommendedEpisodes||[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,max);
  return topics.map((topic,i)=>({seriesId:series.id,index:i+1,topic,niche:series.niche||'storytelling',duration:60,style:'documentary',aspect:'9:16',evidence:{leadProjectId:series.leadProjectId,observedViews:Number(series.observedViews||0),observedWatchMinutes:Number(series.observedWatchMinutes||0),confidence:series.confidence||'early'}}));
}
