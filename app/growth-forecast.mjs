const num=v=>Math.max(0,Number(v||0));
const pct=(a,b)=>b?Number((100*(a-b)/b).toFixed(1)):null;
export function channelGrowthForecast(trend={points:[]},{horizonDays=14}={}){
  const points=(trend.points||[]).filter(x=>x?.date).slice(-30),h=Math.max(1,Math.min(30,Number(horizonDays||14)));
  if(points.length<3)return {status:'insufficient-data',horizonDays:h,observations:points.length,forecast:null,policy:{observedDataOnly:true,guarantee:false,ownerReviewRequired:true}};
  const recent=points.slice(-Math.min(7,points.length)),prior=points.slice(-Math.min(14,points.length),-recent.length);
  const avg=(rows,key)=>rows.length?rows.reduce((s,x)=>s+num(x[key]),0)/rows.length:0;
  const dailyViews=avg(recent,'views'),dailyWatch=avg(recent,'watchMinutes'),priorViews=avg(prior,'views');
  const momentum=prior.length&&priorViews>0?pct(dailyViews,priorViews):null;
  return {status:'directional',horizonDays:h,observations:points.length,forecast:{views:Math.round(dailyViews*h),watchMinutes:Number((dailyWatch*h).toFixed(1)),dailyViews:Number(dailyViews.toFixed(1)),momentumPercent:momentum},confidence:points.length>=14?'observed':points.length>=7?'directional':'early',policy:{observedDataOnly:true,guarantee:false,ownerReviewRequired:true}};
}
