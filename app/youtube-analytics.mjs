const ANALYTICS_SCOPE='https://www.googleapis.com/auth/yt-analytics.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const REPORTS_URL='https://youtubeanalytics.googleapis.com/v2/reports';
const flag=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
const hasScope=(scope,needed)=>String(scope||'').split(/\s+/).includes(needed);
const dateOnly=d=>new Date(d).toISOString().slice(0,10);

export function youtubeAnalyticsStatus(env=process.env){
  const configured=!!(env.YOUTUBE_ANALYTICS_CLIENT_ID&&env.YOUTUBE_ANALYTICS_CLIENT_SECRET&&env.YOUTUBE_ANALYTICS_REFRESH_TOKEN);
  const scoped=hasScope(env.YOUTUBE_ANALYTICS_SCOPE,ANALYTICS_SCOPE);
  const enabled=configured&&scoped&&flag(env.YOUTUBE_ANALYTICS_ENABLED);
  return {id:'youtube-analytics',configured,scoped,enabled,scope:ANALYTICS_SCOPE,mode:configured?(scoped?'oauth-refresh-token':'scope-missing'):'not-connected',readOnly:true};
}

async function refreshAccessToken(env=process.env){
  const st=youtubeAnalyticsStatus(env);if(!st.enabled)throw new Error(st.configured&&!st.scoped?'YouTube Analytics scope is not granted':'YouTube Analytics is not enabled');
  const body=new URLSearchParams({client_id:env.YOUTUBE_ANALYTICS_CLIENT_ID,client_secret:env.YOUTUBE_ANALYTICS_CLIENT_SECRET,refresh_token:env.YOUTUBE_ANALYTICS_REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(20000)});const data=await r.json().catch(()=>({}));if(!r.ok||!data.access_token)throw new Error(`YouTube Analytics OAuth refresh failed (${r.status})`);return data.access_token;
}

export function analyticsWindow(days=28,now=Date.now()){
  const end=new Date(now-86400000),start=new Date(end.getTime()-(Math.max(1,Math.min(90,Number(days||28)))-1)*86400000);return {startDate:dateOnly(start),endDate:dateOnly(end)};
}
export async function fetchYouTubeAnalytics({days=28,env=process.env}={}){
  const token=await refreshAccessToken(env),{startDate,endDate}=analyticsWindow(days);
  const q=new URLSearchParams({ids:'channel==MINE',startDate,endDate,metrics:'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost',dimensions:'day',sort:'day'});
  const r=await fetch(`${REPORTS_URL}?${q}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`YouTube Analytics report failed (${r.status})`);
  const headers=(data.columnHeaders||[]).map(x=>x.name),rows=(data.rows||[]).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
  const totals=rows.reduce((a,x)=>{for(const k of ['views','estimatedMinutesWatched','subscribersGained','subscribersLost'])a[k]+=Number(x[k]||0);return a},{views:0,estimatedMinutesWatched:0,subscribersGained:0,subscribersLost:0});
  const weightedAverageViewDuration=totals.views?Number((rows.reduce((n,x)=>n+Number(x.averageViewDuration||0)*Number(x.views||0),0)/totals.views).toFixed(1)):0;
  return {provider:'youtube-analytics',readOnly:true,startDate,endDate,days:rows.length,totals:{...totals,averageViewDuration:weightedAverageViewDuration},rows,generatedAt:new Date().toISOString()};
}
