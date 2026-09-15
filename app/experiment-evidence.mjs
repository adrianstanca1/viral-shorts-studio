const n=v=>Math.max(0,Number(v||0));
export function normalizeExperimentObservation(input={}){
  const variant=Number(input.variant);if(!Number.isInteger(variant)||variant<0)throw Error('valid variant is required');
  return {variant,impressions:n(input.impressions),clicks:n(input.clicks),watchSeconds:n(input.watchSeconds),source:String(input.source||'owner-observed').slice(0,80),observedAt:new Date(input.observedAt&&Number.isFinite(Date.parse(input.observedAt))?input.observedAt:Date.now()).toISOString()};
}
export function experimentEvidenceSummary(experiment={}){
  const rows=(experiment.results||[]).map(r=>({...r,impressions:n(r.impressions),clicks:n(r.clicks),watchSeconds:n(r.watchSeconds)})).filter(r=>Number.isInteger(r.variant)&&experiment.variants?.[r.variant]);
  const scored=rows.map(r=>({...r,ctr:r.impressions?Number((100*r.clicks/r.impressions).toFixed(2)):0,watchPerImpression:r.impressions?Number((r.watchSeconds/r.impressions).toFixed(2)):0})).sort((a,b)=>b.ctr-a.ctr||b.watchPerImpression-a.watchPerImpression||b.impressions-a.impressions);
  const represented=new Set(scored.filter(x=>x.impressions>0).map(x=>x.variant)),allVariants=represented.size>=Math.min(2,experiment.variants?.length||0),minEvidence=scored.length?Math.min(...scored.filter(x=>x.impressions>0).map(x=>x.impressions)):0;
  return {rows:scored,winner:allVariants&&scored[0]?scored[0]:null,readyToClose:allVariants&&minEvidence>=100,confidence:minEvidence>=500?'strong':minEvidence>=100?'directional':'early',policy:{autoApply:false,ownerReviewRequired:true}};
}

export function attributedExperimentObservations(experiments=[],records=[]){
  const valid=new Map(experiments.map(x=>[x.id,x])),groups=new Map();
  for(const r of records){const a=r.attribution;if(!a?.experimentId||!Number.isInteger(Number(a.variant))||!valid.has(a.experimentId))continue;const exp=valid.get(a.experimentId);if(!exp.variants?.[Number(a.variant)])continue;const impressions=n(r.metrics?.impressions),clicks=n(r.metrics?.clicks),watchSeconds=n(r.metrics?.watchMinutes)*60;if(impressions<=0)continue;const key=`${a.experimentId}:${Number(a.variant)}`,g=groups.get(key)||{experimentId:a.experimentId,variant:Number(a.variant),impressions:0,clicks:0,watchSeconds:0,sources:new Set()};g.impressions+=impressions;g.clicks+=clicks;g.watchSeconds+=watchSeconds;g.sources.add(String(r.source||r.platform||'platform'));groups.set(key,g)}
  return [...groups.values()].map(g=>({experimentId:g.experimentId,variant:g.variant,impressions:g.impressions,clicks:g.clicks,watchSeconds:Number(g.watchSeconds.toFixed(1)),source:`attributed:${[...g.sources].sort().join('+')}`.slice(0,80)}));
}
