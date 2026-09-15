const avg=xs=>xs.length?xs.reduce((a,b)=>a+Number(b||0),0)/xs.length:0;
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
function channelMomentum(report){
  const rows=report?.rows||[];if(rows.length<14)return null;const recent=rows.slice(-7).reduce((n,x)=>n+Number(x.views||0),0),prior=rows.slice(-14,-7).reduce((n,x)=>n+Number(x.views||0),0);if(prior<=0)return recent>0?100:0;return Number(clamp(50+((recent-prior)/prior)*50).toFixed(1));
}
export function scoreContentOpportunities(projects=[],youtubeReport=null,experimentData={winners:[]}){
  const completed=projects.filter(x=>x.status==='complete'),groups=new Map();
  for(const p of completed){const key=`${p.niche||'unknown'}|${p.style||'unknown'}`,g=groups.get(key)||{niche:p.niche||'unknown',style:p.style||'unknown',projects:[]};g.projects.push(p);groups.set(key,g)}
  const momentum=channelMomentum(youtubeReport),rows=[...groups.values()].map(g=>{const xs=g.projects,virality=avg(xs.map(x=>x.qa?.viralityScore)),retention=avg(xs.map(x=>x.qa?.retention?.score)),ready=100*xs.filter(x=>x.qa?.launchReady===true).length/Math.max(1,xs.length);const base=.5*virality+.3*retention+.2*ready,score=Number(clamp(momentum==null?base:.85*base+.15*momentum).toFixed(1));return {niche:g.niche,style:g.style,score,projects:xs.length,averageVirality:Number(virality.toFixed(1)),averageRetention:Number(retention.toFixed(1)),launchReadyRate:Number(ready.toFixed(1)),confidence:xs.length>=5?'strong':xs.length>=2?'directional':'early'}}).sort((a,b)=>b.score-a.score);
  const winners=(experimentData.winners||[]).filter(x=>x.status==='complete').slice(0,5).map(x=>({type:x.type,value:x.value,confidence:x.confidence,ctr:x.ctr}));
  return {generatedAt:new Date().toISOString(),channelMomentum:momentum,externalAnalyticsUsed:!!youtubeReport,opportunities:rows.slice(0,10),winningCreativePatterns:winners,policy:{recommendationsOnly:true,autoPublish:false,autoBrandOverwrite:false}};
}
