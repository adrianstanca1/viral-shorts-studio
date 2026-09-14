import fs from 'node:fs';

const scope='https://www.googleapis.com/auth/youtube.upload';
const tokenUrl='https://oauth2.googleapis.com/token';
const uploadUrl='https://www.googleapis.com/upload/youtube/v3/videos';
const flag=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());

export function youtubePublisherStatus(env=process.env){
  const configured=!!(env.YOUTUBE_CLIENT_ID&&env.YOUTUBE_CLIENT_SECRET&&env.YOUTUBE_REFRESH_TOKEN);
  return {id:'youtube',configured,enabled:configured&&flag(env.YOUTUBE_PUBLISH_ENABLED),externalPostingEnabled:configured&&flag(env.YOUTUBE_PUBLISH_ENABLED),scope,mode:configured?'oauth-refresh-token':'not-connected',privacyDefault:'private'};
}

async function refreshAccessToken(env=process.env){
  const st=youtubePublisherStatus(env);if(!st.configured)throw new Error('YouTube publisher is not connected');
  const body=new URLSearchParams({client_id:env.YOUTUBE_CLIENT_ID,client_secret:env.YOUTUBE_CLIENT_SECRET,refresh_token:env.YOUTUBE_REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(20000)});
  const data=await r.json().catch(()=>({}));if(!r.ok||!data.access_token)throw new Error(`YouTube OAuth refresh failed (${r.status})`);return data.access_token;
}

function metadataFor(pkg,scheduledAt,env=process.env){
  const schedule=scheduledAt&&Date.parse(scheduledAt)>Date.now()?scheduledAt:null;
  return {snippet:{title:String(pkg.title||'').slice(0,100),description:String(pkg.caption||pkg.description||'').slice(0,5000),tags:(pkg.hashtags||[]).map(x=>String(x).replace(/^#/,'')).filter(Boolean).slice(0,30),categoryId:String(env.YOUTUBE_CATEGORY_ID||'22')},status:{privacyStatus:'private',selfDeclaredMadeForKids:false,...(schedule?{publishAt:new Date(schedule).toISOString()}:{})}};
}
export async function uploadYouTubeVideo({videoFile,pkg,scheduledAt=null,env=process.env}){
  const st=youtubePublisherStatus(env);if(!st.enabled)throw new Error('YouTube publishing is disabled');
  if(!videoFile||!fs.existsSync(videoFile))throw new Error('video file is not available');
  const token=await refreshAccessToken(env),size=fs.statSync(videoFile).size,meta=metadataFor(pkg,scheduledAt,env);
  const init=await fetch(`${uploadUrl}?uploadType=resumable&part=snippet,status`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=UTF-8','x-upload-content-length':String(size),'x-upload-content-type':'video/mp4'},body:JSON.stringify(meta),signal:AbortSignal.timeout(30000)});
  if(!init.ok)throw new Error(`YouTube upload session failed (${init.status})`);
  const location=init.headers.get('location');if(!location)throw new Error('YouTube upload session missing location');
  const upload=await fetch(location,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'video/mp4','content-length':String(size)},body:fs.createReadStream(videoFile),duplex:'half',signal:AbortSignal.timeout(15*60_000)});
  const data=await upload.json().catch(()=>({}));if(!upload.ok||!data.id)throw new Error(`YouTube video upload failed (${upload.status})`);
  return {provider:'youtube',videoId:data.id,url:`https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`,privacyStatus:data.status?.privacyStatus||'private',scheduledAt:meta.status.publishAt||null,uploadedAt:new Date().toISOString()};
}
