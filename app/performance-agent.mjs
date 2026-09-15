const compact=(x={})=>({projectId:x.projectId,topic:x.topic,niche:x.niche,views:Number(x.views||0),watchMinutes:Number(x.watchMinutes||0),score:Number(x.score||0),platforms:x.platforms||[]});

export function performanceAwareCreatorPlan(plan,{performance={top:[]},series={series:[]}}={}){
  const top=(performance.top||[]).slice(0,3).map(compact),strongestSeries=(series.series||[]).slice(0,3).map(x=>({id:x.id,niche:x.niche,leadTopic:x.leadTopic,confidence:x.confidence,observedViews:Number(x.observedViews||0),averagePerformanceScore:Number(x.averagePerformanceScore||0)}));
  const recommendations=[];
  if(top[0])recommendations.push({type:'observed-winner',projectId:top[0].projectId,message:`Study the structure of ${top[0].topic} before producing the next related asset.`,evidence:{views:top[0].views,watchMinutes:top[0].watchMinutes,score:top[0].score}});
  if(strongestSeries[0])recommendations.push({type:'series',seriesId:strongestSeries[0].id,message:`Consider the ${strongestSeries[0].niche} series because it has the strongest observed evidence.`,evidence:{views:strongestSeries[0].observedViews,score:strongestSeries[0].averagePerformanceScore,confidence:strongestSeries[0].confidence}});
  return {...plan,observedSignals:{topProjects:top,series:strongestSeries},recommendations,policy:{observedMetricsOnly:true,ownerReviewRequired:true,autoChangeGoal:false,autoPublish:false}};
}
