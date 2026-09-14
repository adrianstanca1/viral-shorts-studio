import { completeText } from './text-router.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { writeGenerationQueue, generativeStatus } from './generative-router.mjs';
import { listAiCandidates } from './ai-candidate-router.mjs';
import { rankSources, rankFacts, narrationQuality, sceneAcceptance, retentionAnalysis, fitNarrationBudget, optimizePacing } from './content-quality.mjs';

const UA = 'ViralShortsStudio/0.2 (self-hosted creator tool)';
const mediaBreakers=new Map();
function breakerAvailable(name){return (mediaBreakers.get(name)?.until||0)<=Date.now();}
function breakerSuccess(name){mediaBreakers.delete(name);}
function breakerFailure(name,error){
  const prev=mediaBreakers.get(name)||{failures:0}; const failures=prev.failures+1;
  const rateLimited=/429|too many requests/i.test(String(error?.message||error));
  const cooldown=rateLimited?5*60_000:Math.min(120_000,15_000*failures);
  mediaBreakers.set(name,{failures,until:Date.now()+cooldown,lastError:rateLimited?'rate-limited':'temporarily-unavailable',lastFailureAt:new Date().toISOString()});
}
export function mediaProviderStatus(){
  const w=mediaBreakers.get('wikimedia-video');
  return {wikimediaVideo:{enabled:true,status:breakerAvailable('wikimedia-video')?'available':w?.lastError||'cooldown',failures:w?.failures||0,nextRetryAt:w?.until?new Date(w.until).toISOString():null}};
}

function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function cleanText(s=''){ return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function sentences(s=''){ return cleanText(s).split(/(?<=[.!?])\s+/).filter(x=>x.length>35); }
function safeName(s='asset'){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'asset'; }
function ensure(p){ fs.mkdirSync(p,{recursive:true}); return p; }
function saveJson(p,v){ fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)); fs.renameSync(p+'.tmp',p); }

function subtitleTs(sec){
  const ms=Math.max(0,Math.round(Number(sec||0)*1000));
  const h=String(Math.floor(ms/3600000)).padStart(2,'0'),m=String(Math.floor(ms%3600000/60000)).padStart(2,'0');
  const ss=String(Math.floor(ms%60000/1000)).padStart(2,'0'),mmm=String(ms%1000).padStart(3,'0');
  return `${h}:${m}:${ss},${mmm}`;
}
export function writePhraseCaptions(file,text,duration,{wordsPerCue=4}={}){
  const words=cleanText(text).split(/\s+/).filter(Boolean), total=Math.max(.25,Number(duration||0));
  if(!words.length){fs.writeFileSync(file,'');return file;}
  const cues=[]; let pos=0,index=1;
  while(pos<words.length){
    const chunk=words.slice(pos,pos+wordsPerCue),start=total*(pos/words.length),end=total*(Math.min(words.length,pos+chunk.length)/words.length);
    cues.push(`${index++}\n${subtitleTs(start)} --> ${subtitleTs(Math.max(start+.18,end))}\n${chunk.join(' ')}\n`);pos+=chunk.length;
  }
  fs.writeFileSync(file,cues.join('\n'));return file;
}
const captionFilter=file=>`subtitles=${file}:force_style='FontName=DejaVu Sans,FontSize=20,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,Outline=3,Shadow=1,Alignment=2,MarginV=110'`;


function cacheFile(root,kind,key){
  const hash=crypto.createHash('sha256').update(String(key)).digest('hex').slice(0,24);
  return path.join(ensure(path.join(root,'cache',kind)),`${hash}.json`);
}
async function cachedJson(root,kind,key,ttlMs,producer){
  const file=cacheFile(root,kind,key);
  try{const v=JSON.parse(fs.readFileSync(file,'utf8'));if(Date.now()-Date.parse(v.savedAt)<ttlMs)return {...v,cacheHit:true};}catch{}
  const value=await producer();
  const wrapped={savedAt:new Date().toISOString(),value};saveJson(file,wrapped);return {...wrapped,cacheHit:false};
}
function nowMs(){return Date.now();}
function stageMetric(metrics,name,start){metrics[name]=Number(((Date.now()-start)/1000).toFixed(2));}

function tokens(s=''){return new Set(cleanText(s).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2));}
function relevanceScore(asset,scene){
  const wanted=tokens(`${scene.searchQuery} ${scene.overlay}`), have=tokens(`${asset.title||''} ${asset.artist||''}`);
  let score=0; for(const t of wanted) if(have.has(t)) score+=3;
  if(asset.license && asset.license!=='unknown') score+=2;
  if(asset.type==='video') score+=1;
  return score;
}

async function fetchJson(url){
  const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'user-agent':UA}});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

async function run(cmd,args,opts={}){
  return new Promise((resolve,reject)=>{
    const p=spawn(cmd,args,{stdio:['ignore','pipe','pipe'],...opts});
    const timer=setTimeout(()=>p.kill('SIGKILL'),180000);
    p.on('error',e=>{clearTimeout(timer);reject(e);});
    p.on('close',()=>clearTimeout(timer));
    let out='',err=''; p.stdout?.on('data',d=>out=(out+d).slice(-65536)); p.stderr?.on('data',d=>err=(err+d).slice(-65536));
    p.on('close',c=>c===0?resolve(out.trim()):reject(new Error(`${cmd} exited ${c}: ${err.slice(-1500)}`)));
  });
}

async function tavilyResearch(topic){
  const key=process.env.TAVILY_API_KEY||process.env.TAVILY_KEY;
  if(!key || process.env.TAVILY_ENABLED!=='true') return [];
  try{
    const r=await fetch('https://api.tavily.com/search',{
      method:'POST',signal:AbortSignal.timeout(25000),headers:{'content-type':'application/json'},
      body:JSON.stringify({api_key:key,query:topic,search_depth:'basic',max_results:5,include_answer:false,include_raw_content:false})
    });
    if(!r.ok) return [];
    const d=await r.json();
    return (d.results||[]).slice(0,5).map(x=>({title:cleanText(x.title||'Web source'),url:x.url,extract:cleanText(x.content||'').slice(0,1800),provider:'tavily'})).filter(x=>x.url&&x.extract);
  }catch{return [];}
}

export async function researchTopic(topic){
  const q=new URLSearchParams({action:'query',list:'search',srsearch:topic,srlimit:'4',format:'json',origin:'*'});
  const search=await fetchJson(`https://en.wikipedia.org/w/api.php?${q}`);
  const hits=search.query?.search||[];
  const sources=[];
  for(const h of hits.slice(0,3)){
    const p=new URLSearchParams({action:'query',prop:'extracts|info',exintro:'1',explaintext:'1',inprop:'url',pageids:String(h.pageid),format:'json',origin:'*'});
    const data=await fetchJson(`https://en.wikipedia.org/w/api.php?${p}`);
    const page=Object.values(data.query?.pages||{})[0];
    if(page?.extract) sources.push({title:page.title,url:page.fullurl,extract:cleanText(page.extract),provider:'wikipedia'});
  }
  const web=await tavilyResearch(topic);
  const seen=new Set(sources.map(x=>x.url));
  for(const item of web){ if(!seen.has(item.url)){sources.push(item);seen.add(item.url);} }
  return rankSources(topic,sources).slice(0,8);
}

export function buildStoryboard({topic,niche,duration,sources,style='documentary'}){
  const targetScenes=Number(duration||60)<=30?8:Number(duration||60)<=60?14:20;
  const rankedFacts=rankFacts(topic,sources);
  const facts=rankedFacts.map(x=>x.text);
  const hookByNiche={
    'true-crime':`The detail most people miss about ${topic} changes the whole story.`,
    history:`What really happened in ${topic} is stranger than the simplified version.`,
    'fact-check':`You have probably heard this claim about ${topic}. Here is what the evidence actually says.`,
    storytelling:`This story about ${topic} gets more surprising with every step.`
  };
  const hook=hookByNiche[niche]||hookByNiche.storytelling;
  const body=[];
  const factPool=facts.length?facts:[`${topic} is documented in the cited sources.`];
  for(let i=0;i<targetScenes-2;i++) body.push(factPool[i%factPool.length]);
  const chosen=[hook,...body,`That is the short version of ${topic}. Check the cited sources before sharing the claim further.`];
  const beat=(i)=>{
    if(i===0)return 'hook'; if(i===targetScenes-1)return 'payoff';
    const r=i/(targetScenes-1); if(r<.2)return 'setup'; if(r<.45)return 'context'; if(r<.7)return 'evidence'; return 'escalation';
  };
  const shotByBeat={hook:'dramatic close-up',setup:'establishing wide shot',context:'archival detail',evidence:'evidence or document detail',escalation:'dynamic contextual shot',payoff:'memorable closing image'};
  return chosen.slice(0,targetScenes).map((narration,i)=>{
    const beatName=beat(i), shotType=shotByBeat[beatName];
    const clean=narration.split(/\s+/).slice(0,22).join(' ');
    return {
      index:i+1, beat:beatName, shotType, style,
      narration:clean,
      overlay:(i===0?hook:narration).replace(/\s+/g,' ').slice(0,95),
      searchQuery:`${topic} ${shotType} ${narration.split(' ').slice(0,7).join(' ')}`,
      visualPrompt:style==='whiteboard'?`Clean whiteboard marker illustration explaining ${topic}; simple dark ink strokes on white background, educational diagram feel, no watermark. Scene fact: ${clean}`:`Vertical ${style==='cinematic'?'cinematic':'documentary'} ${shotType} about ${topic}. Historically/contextually accurate, ${style} style, no visible text, 9:16 composition. Scene fact: ${clean}`,
      motionPrompt:style==='whiteboard'?'progressive hand-drawn ink reveal with readable hold':(i%3===0?'slow cinematic push-in with subtle parallax':i%3===1?'controlled lateral pan with restrained documentary motion':'slow pull-back revealing contextual detail'),
      camera:i%3===0?'slow push in':i%3===1?'gentle pan':'slow zoom out',
      durationHint:Number((Number(duration||60)/targetScenes).toFixed(2)),
      sourceIndex:i>0&&i<targetScenes-1?(rankedFacts[i-1]?.sourceIndex??0):null,
      narrationQuality:narrationQuality(clean,{beat:beatName}),
      assets:[]
    };
  });
}

async function commonsImages(query,limit=3){
  const q=new URLSearchParams({action:'query',generator:'search',gsrnamespace:'6',gsrsearch:`${query} filetype:bitmap`,gsrlimit:String(limit),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1280',format:'json',origin:'*'});
  const data=await fetchJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  return Object.values(data.query?.pages||{}).map(p=>{
    const ii=p.imageinfo?.[0]||{}; const m=ii.extmetadata||{};
    return {title:p.title,url:ii.thumburl||ii.url,source:`https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`,license:m.LicenseShortName?.value||m.License?.value||'unknown',artist:cleanText(m.Artist?.value||''),type:'image'};
  }).filter(x=>x.url);
}

async function commonsVideos(query,limit=3){
  if(!query) return [];
  const q=new URLSearchParams({action:'query',generator:'search',gsrnamespace:'6',gsrsearch:`${query} filetype:video`,gsrlimit:String(limit),prop:'videoinfo',viprop:'url|mime|derivatives|extmetadata',format:'json',origin:'*'});
  const data=await fetchJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  return Object.values(data.query?.pages||{}).map(p=>{
    const vi=p.videoinfo?.[0]||{}; const m=vi.extmetadata||{};
    const derivatives=vi.derivatives||[];
    const preferred=derivatives.find(d=>d.transcodekey==='480p.vp9.webm')||derivatives.find(d=>d.transcodekey==='360p.webm')||derivatives.find(d=>String(d.type||'').includes('video/webm'))||{};
    return {title:p.title,url:preferred.src||vi.url,source:`https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`,license:m.LicenseShortName?.value||m.License?.value||'unknown',artist:cleanText(m.Artist?.value||''),mime:preferred.type||vi.mime||'',type:'video'};
  }).filter(x=>x.url);
}
async function download(url,dest,maxBytes=12_000_000){
  let last;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'user-agent':UA,'accept':'image/*,*/*;q=0.8'},redirect:'follow'});
      if(!r.ok) throw new Error(`download HTTP ${r.status}`);
      const len=Number(r.headers.get('content-length')||0);
      if(len && len>maxBytes) throw new Error(`asset too large: ${len}`);
      const buf=Buffer.from(await r.arrayBuffer());
      if(buf.length>maxBytes) throw new Error(`asset too large: ${buf.length}`);
      fs.writeFileSync(dest,buf); return dest;
    }catch(e){ last=e; await new Promise(r=>setTimeout(r,500*attempt)); }
  }
  throw last;
}

async function makeNarration(text,outWav,targetDuration){
  const safe=text.replace(/[\\':]/g,' ').replace(/\s+/g,' ').slice(0,420);
  const raw=outWav.replace(/\.wav$/,'.raw.wav');
  await run('ffmpeg',['-y','-f','lavfi','-i',`flite=text='${safe}':voice=slt`,'-ar','44100','-ac','1',raw]);
  const measured=Number(await run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',raw]))||targetDuration;
  const target=clamp(Number(targetDuration)||measured,3,12);
  let ratio=measured/target;
  const filters=[];
  while(ratio>2){filters.push('atempo=2.0');ratio/=2;}
  while(ratio<0.5){filters.push('atempo=0.5');ratio/=0.5;}
  filters.push(`atempo=${clamp(ratio,0.5,2).toFixed(4)}`);
  await run('ffmpeg',['-y','-i',raw,'-filter:a',filters.join(','),'-t',String(target),'-ar','44100','-ac','1',outWav]);
  try{fs.rmSync(raw,{force:true});}catch{}
  return target;
}

async function makeImageClip(image,out,duration,zoomIn=true){
  const frames=Math.max(75,Math.round(duration*25));
  const z=zoomIn?`min(zoom+0.0008,1.12)`:`if(lte(zoom,1.0),1.12,max(1.0,zoom-0.0008))`;
  const vf=`scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=25,fade=t=in:st=0:d=0.18,fade=t=out:st=${Math.max(0.2,duration-0.18)}:d=0.18,format=yuv420p`;
  await run('ffmpeg',['-y','-loop','1','-i',image,'-vf',vf,'-t',String(duration),'-r','25','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','24',out]);
}

async function makeVideoClip(video,out,duration){
  const vf=`scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=25,fade=t=in:st=0:d=0.15,fade=t=out:st=${Math.max(0.2,duration-0.15)}:d=0.15,format=yuv420p`;
  await run('ffmpeg',['-y','-stream_loop','-1','-i',video,'-vf',vf,'-t',String(duration),'-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','24',out]);
}

function wrapOverlay(s,max=28){
  const words=s.split(/\s+/); const lines=[]; let line='';
  for(const w of words){ if((line+' '+w).trim().length>max){ lines.push(line); line=w; } else line=(line+' '+w).trim(); }
  if(line) lines.push(line); return lines.slice(0,3).join('\n');
}

export function candidateScore(result,scene){
  const assets=result.assets||[];
  const titles=new Set(assets.map(a=>String(a.title||'').toLowerCase()));
  const licensed=assets.filter(a=>a.license&&a.license!=='unknown').length;
  const relevance=assets.reduce((n,a)=>n+relevanceScore(a,scene),0);
  const diversity=titles.size===assets.length?8:0;
  const motion=result.hasRealVideo?12:0;
  const whiteboard=result.visualType==='whiteboard' ? (['evidence','context'].includes(scene.beat)?25:['setup','escalation'].includes(scene.beat)?14:6) : 0;
  return Math.round(clamp(45+licensed*4+Math.min(20,relevance)+diversity+motion+whiteboard,0,100));
}

async function makeWhiteboardScene(scene,sceneDir,title,sharedNarration=null){
  const wav=sharedNarration?.wav||path.join(sceneDir,'voice.wav');
  const duration=sharedNarration?.duration||await makeNarration(scene.narration,wav,scene.durationHint);
  const srt=path.join(sceneDir,'captions.srt');writePhraseCaptions(srt,scene.narration,duration);
  const output=path.join(sceneDir,'scene.mp4'), board=path.join(sceneDir,'board.png');
  const spec={title:String(title||'Whiteboard Short'),text:scene.narration,scene:scene.index,width:720,height:1280,duration,audio:wav,output,boardOutput:board,captions:'captions.srt',preset:'veryfast',crf:24};
  fs.writeFileSync(path.join(sceneDir,'whiteboard.json'),JSON.stringify(spec));
  const python=process.env.WHITEBOARD_PYTHON||'/opt/whiteboard/bin/python', adapter=process.env.WHITEBOARD_ADAPTER||'/app/python/whiteboard_scene.py';
  const raw=await run(python,[adapter,'--spec','whiteboard.json'],{cwd:sceneDir,env:{...process.env,FFMPEG_PATH:'ffmpeg',RENDER_THREADS:'2'}});
  let whiteboard={};try{whiteboard=JSON.parse(raw.trim().split('\n').at(-1))}catch{}
  return {...scene,duration:Number(duration.toFixed(2)),assets:[{title:'Generated whiteboard board',source:'local',license:'original',artist:'Viral Shorts Studio',type:'whiteboard',file:'board.png'}],file:output,captions:srt,hasRealVideo:false,visualType:'whiteboard',whiteboard,narrationReused:!!sharedNarration};
}

async function makeAiImportedScene(scene,sceneDir,ai,sharedNarration=null){
  const wav=sharedNarration?.wav||path.join(sceneDir,'voice.wav');
  const duration=sharedNarration?.duration||await makeNarration(scene.narration,wav,scene.durationHint);
  const media=path.join(sceneDir,ai.kind==='video'?'ai-source.mp4':'ai-source.jpg');
  if(ai.localFile){fs.copyFileSync(ai.localFile,media);}else await download(ai.url,media,ai.kind==='video'?80_000_000:20_000_000);
  const visual=path.join(sceneDir,'ai-visual.mp4');
  if(ai.kind==='video')await makeVideoClip(media,visual,duration);else await makeImageClip(media,visual,duration,true);
  const overlayFile=path.join(sceneDir,'overlay.txt');fs.writeFileSync(overlayFile,wrapOverlay(scene.overlay));
  const out=path.join(sceneDir,'scene.mp4');
  const srt=path.join(sceneDir,'captions.srt');writePhraseCaptions(srt,scene.narration,duration);
  const draw=`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile=${overlayFile}:fontcolor=white:fontsize=46:line_spacing=10:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.64-text_h/2`;
  await run('ffmpeg',['-y','-i',visual,'-i',wav,'-vf',`${draw},${captionFilter(srt)}`,'-c:v','libx264','-threads','2','-preset','veryfast','-crf','22','-c:a','aac','-b:a','128k','-t',String(duration),out]);
  const promptTokens=tokens(ai.prompt||''), wanted=tokens(scene.visualPrompt||scene.searchQuery||''); let overlap=0;for(const t of wanted)if(promptTokens.has(t))overlap++;
  const providerBonus=ai.provider==='higgsfield'?10:ai.provider==='nvidia'?8:6, motion=ai.kind==='video'?12:5;
  return {...scene,duration:Number(duration.toFixed(2)),captions:srt,assets:[{title:`AI ${ai.kind} candidate`,source:ai.url,license:'provider-generated',artist:ai.provider,type:`ai-${ai.kind}`,provider:ai.provider,jobId:ai.id}],file:out,hasRealVideo:ai.kind==='video',visualType:`ai-${ai.kind}`,aiProvider:ai.provider,aiJobId:ai.id,narrationReused:!!sharedNarration,candidateScore:Math.round(clamp(62+providerBonus+motion+Math.min(12,overlap*2),0,100))};
}

async function makeSceneCandidates(scene,dir,fallbackQuery,mediaPool,videoPool,count=1){
  const hybrid=scene.style==='hybrid';
  const total=scene.style==='whiteboard'?1:clamp(Number(count)||1,1,4), results=[];
  const importedAi=(scene.aiCandidates||[]).slice(0,2);
  let sharedNarration=null;
  if(total>1 || hybrid){
    const sharedDir=ensure(path.join(dir,'candidates',`scene-${String(scene.index).padStart(2,'0')}`,'shared'));
    const wav=path.join(sharedDir,'voice.wav');
    const duration=await makeNarration(scene.narration,wav,scene.durationHint);
    sharedNarration={wav,duration};
  }
  for(const ai of importedAi){
    try{
      const aiDir=ensure(path.join(dir,'candidates',`scene-${String(scene.index).padStart(2,'0')}`,`ai-${ai.provider}-${ai.id}`));
      results.push(await makeAiImportedScene(scene,aiDir,ai,sharedNarration));
    }catch{}
  }
  const archiveCount=hybrid?Math.max(1,total-1):total;
  for(let i=0;i<archiveCount;i++){
    const variantScene={...scene,style:hybrid?'documentary':scene.style,variantSeed:Number(scene.variantSeed||0)+i};
    const candidateDir=(total===1&&!hybrid)?dir:ensure(path.join(dir,'candidates',`scene-${String(scene.index).padStart(2,'0')}`,`archive-${variantScene.variantSeed}`));
    const result=await makeScene(variantScene,candidateDir,fallbackQuery,mediaPool,videoPool,sharedNarration);
    result.candidateScore=candidateScore(result,scene); results.push(result);
  }
  if(hybrid){
    const whiteboardScene={...scene,style:'whiteboard',variantSeed:Number(scene.variantSeed||0)};
    const candidateDir=ensure(path.join(dir,'candidates',`scene-${String(scene.index).padStart(2,'0')}`,'whiteboard'));
    const result=await makeScene(whiteboardScene,candidateDir,fallbackQuery,mediaPool,videoPool,sharedNarration);
    result.candidateScore=candidateScore(result,scene); results.push(result);
  }
  results.sort((a,b)=>b.candidateScore-a.candidateScore);
  return {selected:results[0],candidates:results};
}

async function makeScene(scene,dir,fallbackQuery,mediaPool=[],videoPool=[],sharedNarration=null){
  const sceneDir=ensure(path.join(dir,`scene-${String(scene.index).padStart(2,'0')}`));
  const variant=Math.max(0,Number(scene.variantSeed||0));
  if(scene.style==='whiteboard') return makeWhiteboardScene(scene,sceneDir,fallbackQuery,sharedNarration);
  const poolStart=Math.max(0,((scene.index-1)*2 + variant*3) % Math.max(1,mediaPool.length));
  const candidates=[...mediaPool.slice(poolStart,poolStart+4),...await commonsImages(`${scene.searchQuery} ${variant?`variation ${variant}`:''}`.trim(),8).catch(()=>[])];
  if(candidates.length<6) candidates.push(...await commonsImages(scene.searchQuery.split(' ').slice(0,4).join(' '),8).catch(()=>[]));
  if(fallbackQuery) candidates.push(...await commonsImages(fallbackQuery,12).catch(()=>[]));
  let unique=[...new Map(candidates.filter(x=>x?.url).map(x=>[x.url,x])).values()].sort((a,b)=>relevanceScore(b,scene)-relevanceScore(a,scene));
  if(unique.length>2 && variant){const shift=variant%unique.length;unique=[...unique.slice(shift),...unique.slice(0,shift)];}
  const downloaded=[];
  for(let i=0;i<unique.length && downloaded.length<2;i++){
    const ext=path.extname(new URL(unique[i].url).pathname).slice(0,5)||'.jpg';
    const dest=path.join(sceneDir,`asset-${downloaded.length+1}${ext}`);
    try{
      await download(unique[i].url,dest);
      await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',dest]);
      downloaded.push({...unique[i],local:dest});
    }catch{ try{fs.rmSync(dest,{force:true});}catch{} }
  }
  if(!downloaded.length){
    for(let i=0;i<2;i++){
      const dest=path.join(sceneDir,`fallback-${i+1}.png`);
      const text=(i===0?scene.overlay:scene.narration).replace(/[\\':]/g,' ').replace(/\s+/g,' ').slice(0,90);
      await run('ffmpeg',['-y','-f','lavfi','-i',`color=c=${i===0?'0x10131a':'0x251b12'}:s=720x1280:d=1`,'-vf',`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${text}':fontcolor=white:fontsize=40:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2`,'-frames:v','1',dest]);
      downloaded.push({title:'Generated fallback card',url:'',source:'local',license:'original',artist:'Viral Shorts Studio',type:'generated',local:dest});
    }
  }
  while(downloaded.length<2) downloaded.push(downloaded[0]);
  let motionVideo=null;
  if(scene.index%2===0 && breakerAvailable('wikimedia-video')){
    const simple=(fallbackQuery||scene.searchQuery).split(/\s+/).slice(0,6).join(' ');
    const poolSlice=videoPool.slice(((scene.index/2)-1)%Math.max(1,videoPool.length),((scene.index/2)-1)%Math.max(1,videoPool.length)+2);
    const vids=[...poolSlice,...await commonsVideos(simple,3).catch(()=>[])];
    for(const v of [...new Map(vids.filter(x=>x?.url).map(x=>[x.url,x])).values()].sort((a,b)=>relevanceScore(b,scene)-relevanceScore(a,scene))){
      try{await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',v.url]);motionVideo={...v,local:v.url};break;}catch{}
    }
  }
  const wav=sharedNarration?.wav||path.join(sceneDir,'voice.wav');
  const duration=sharedNarration?.duration||await makeNarration(scene.narration,wav,scene.durationHint);
  const half=duration/2;
  const c1=path.join(sceneDir,'clip-1.mp4'), c2=path.join(sceneDir,'clip-2.mp4');
  if(motionVideo){
    try{await makeVideoClip(motionVideo.local,c1,half);breakerSuccess('wikimedia-video');}
    catch(error){breakerFailure('wikimedia-video',error);motionVideo=null;await makeImageClip(downloaded[0].local,c1,half,true);}
  }else await makeImageClip(downloaded[0].local,c1,half,true);
  await makeImageClip(downloaded[motionVideo?0:1].local,c2,half,false);
  const list=path.join(sceneDir,'clips.txt');
  fs.writeFileSync(list,`file '${c1}'\nfile '${c2}'\n`);
  const silent=path.join(sceneDir,'silent.mp4');
  await run('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy',silent]);
  const overlayFile=path.join(sceneDir,'overlay.txt');
  fs.writeFileSync(overlayFile,wrapOverlay(scene.overlay));
  const out=path.join(sceneDir,'scene.mp4');
  const srt=path.join(sceneDir,'captions.srt');writePhraseCaptions(srt,scene.narration,duration);
  const draw=`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile=${overlayFile}:fontcolor=white:fontsize=46:line_spacing=10:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.64-text_h/2`;
  await run('ffmpeg',['-y','-i',silent,'-i',wav,'-vf',`${draw},${captionFilter(srt)}`,'-c:v','libx264','-threads','2','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-t',String(duration),out]);
  const assets=downloaded.map(({local,...a})=>({...a,file:path.basename(local)}));
  if(motionVideo){const {local,...v}=motionVideo;assets.unshift({...v,file:'remote-stream'});}
  return {...scene,duration:Number(duration.toFixed(2)),assets,file:out,captions:srt,hasRealVideo:!!motionVideo,visualType:motionVideo?'archive-video':'archive-motion',narrationReused:!!sharedNarration};
}

export async function produceProject(project,root,onUpdate=()=>{}){
  const dir=ensure(path.join(root,'projects',project.id));
  const update=(patch)=>{ Object.assign(project,patch); saveJson(path.join(dir,'project.json'),project); onUpdate(project); };
  try{
    const metrics=project.metrics||{}; const totalStarted=nowMs();
    update({status:'researching',progress:5,metrics});
    const researchStarted=nowMs();
    let researchCacheHit=false;
    let sources=project.sources?.length?project.sources:null;
    if(!sources){
      const cached=await cachedJson(root,'research',project.topic,6*60*60*1000,()=>researchTopic(project.topic));
      sources=cached.value;researchCacheHit=cached.cacheHit;
    }
    if(!sources.length) throw new Error('No research sources found');
    stageMetric(metrics,'researchSeconds',researchStarted);
    update({sources,researchCacheHit,progress:15,status:'storyboarding',metrics});
    let storyboard=project.storyboard?.length?project.storyboard:buildStoryboard({...project,sources});
    if(!project.storyboard?.length){
      try{
        const count=storyboard.length;
        const validate=text=>{try{const a=JSON.parse(text);return Array.isArray(a)&&a.length===count&&a.every(x=>typeof x?.narration==='string'&&x.narration.trim().length>=8&&x.narration.length<=420);}catch{return false;}};
        const compactSources=sources.map((s,i)=>({index:i,title:s.title,extract:String(s.extract||'').slice(0,900)}));
        const completion=await completeText({task:'storyboard',quality:['true-crime','fact-check'].includes(project.niche)?'strong':'balanced',target:count*55,validate,messages:[
          {role:'system',content:'Return only a JSON array of scenes with narration, overlay and sourceIndex (zero-based). Use ONLY supplied source facts. Do not invent allegations, dramatic claims, quotes or citations. For 30-second videos keep each narration 8-12 words; otherwise 8-14 words. Scene 1 must be a factual curiosity hook, not clickbait. The final scene must resolve why the story matters using sourced facts. Avoid vague pronouns and repeated facts. Keep overlay under 72 characters.'},
          {role:'user',content:JSON.stringify({topic:project.topic,sceneCount:count,sources:compactSources})}
        ]});
        const text=completion.text; const ai=JSON.parse(text).map((x,i)=>({...x,sourceIndex:Number.isInteger(x.sourceIndex)&&sources[x.sourceIndex]?x.sourceIndex:i%sources.length,narration:String(x.narration||'').trim().slice(0,420),overlay:String(x.overlay||x.narration||'').trim().slice(0,95)}));storyboard=storyboard.map((scene,i)=>({...scene,...ai[i]}));
        update({scriptProvider:completion.provider,scriptModel:completion.model});
      }catch(error){
        const reason=(error?.failures||[]).map(x=>`${x.id}:${x.error}`).join('; ').slice(0,240);
        update({scriptProvider:'source-extracts',providerWarning:reason?`AI router unavailable (${reason}); using cited source excerpts.`:'AI router unavailable; using cited source excerpts.'});
      }
    }
    storyboard=fitNarrationBudget(storyboard,Number(project.duration));
    storyboard=optimizePacing(storyboard,Number(project.duration));
    update({storyboard,pacingOptimized:true});
    const mediaStarted=nowMs();
    const cacheKey=`${project.topic}|media-v2`;
    const mediaCached=await cachedJson(root,'media',cacheKey,12*60*60*1000,async()=>{
      const [images,videos]=await Promise.all([commonsImages(project.topic,24).catch(()=>[]),commonsVideos(project.topic,8).catch(()=>[])]);
      return {images,videos};
    });
    const mediaPool=mediaCached.value.images||[], videoPool=mediaCached.value.videos||[];
    stageMetric(metrics,'mediaDiscoverySeconds',mediaStarted);
    const generationPlan={version:2,aspect:'9:16',duration:Number(project.duration),style:project.style||'documentary',freeOnly:true,scenes:storyboard.map(s=>({index:s.index,beat:s.beat,shotType:s.shotType,duration:s.durationHint,visualPrompt:s.visualPrompt,motionPrompt:s.motionPrompt,searchQuery:s.searchQuery}))};
    saveJson(path.join(dir,'generation-prompts.json'),generationPlan);
    project.generationPlan=generationPlan;
    const generativeQueue=writeGenerationQueue(project,dir);
    update({storyboard,generationPlan,generativeQueue:{file:generativeQueue.file,requestCount:generativeQueue.queue.requests.length,status:generativeStatus()},mediaCacheHit:mediaCached.cacheHit,mediaPool:mediaPool.map(({url,...m})=>m),videoPool:videoPool.map(({url,...m})=>m),progress:25,status:'generating-scenes',metrics});
    const sceneStarted=nowMs();
    const results=new Array(storyboard.length); let completed=0;
    const previousByIndex=new Map((project.scenes||[]).filter(s=>{const plan=storyboard.find(x=>x.index===s.index);return s.file&&fs.existsSync(s.file)&&plan&&Math.abs(Number(s.duration||0)-Number(plan.durationHint||0))<=0.15&&String(s.narration||'').trim()===String(plan.narration||'').trim();}).map(s=>[s.index,s]));
    const importantPoints=storyboard.length>=18?[1,Math.ceil(storyboard.length*.25),Math.ceil(storyboard.length*.5),Math.ceil(storyboard.length*.75),storyboard.length]:storyboard.length>=12?[1,Math.ceil(storyboard.length/3),Math.ceil(storyboard.length*2/3),storyboard.length]:[1,Math.ceil(storyboard.length/2),storyboard.length];
    const importantIndexes=new Set(importantPoints);
    const autoCandidateCount=project.autoCandidates===false?1:clamp(Number(project.candidateCount||3),1,4);
    update({scenePlan:{targetScenes:storyboard.length,importantScenes:[...importantIndexes],candidateCount:autoCandidateCount}});
    const renderOne=async(scene)=>{
      const previous=previousByIndex.get(scene.index); if(previous)return previous;
      const aiCandidates=listAiCandidates(root,project.id,scene.index);
      if(aiCandidates.length) scene.aiCandidates=aiCandidates;
      let pack,last; const count=importantIndexes.has(scene.index)?autoCandidateCount:1;
      for(let attempt=0;attempt<2;attempt++){try{pack=await makeSceneCandidates(scene,dir,project.topic,mediaPool,videoPool,count);break;}catch(e){last=e;}}
      if(!pack)throw last;
      let acceptance=sceneAcceptance(pack.selected?.candidateScore,scene.beat);
      if(!acceptance.accepted&&count===1&&scene.style!=='whiteboard'){
        try{const retry=await makeSceneCandidates({...scene,variantSeed:Number(scene.variantSeed||0)+7},dir,project.topic,mediaPool,videoPool,2);if((retry.selected?.candidateScore||0)>(pack.selected?.candidateScore||0))pack=retry;}catch{}
        acceptance=sceneAcceptance(pack.selected?.candidateScore,scene.beat);
      }
      pack.selected.qualityGate=acceptance;
      if(pack.candidates.length>1){
        project.sceneVariants ||= {}; project.sceneVariants[String(scene.index)] ||= [];
        const archived=pack.candidates.map(c=>({id:crypto.randomUUID(),index:scene.index,createdAt:new Date().toISOString(),variantSeed:Number(c.variantSeed||0),duration:c.duration,assets:c.assets||[],hasRealVideo:!!c.hasRealVideo,visualType:c.visualType||'unknown',file:c.file,captions:c.captions,candidateScore:c.candidateScore,aiProvider:c.aiProvider,aiJobId:c.aiJobId,autoGenerated:true}));
        project.sceneVariants[String(scene.index)].push(...archived);
        const selectedMeta=archived.find(v=>v.file===pack.selected.file); if(selectedMeta)pack.selected.variantId=selectedMeta.id;
      }
      return pack.selected;
    };
    let cursor=0; const workerCount=Math.min(Number(process.env.SCENE_CONCURRENCY||2),storyboard.length,3);
    const worker=async()=>{while(true){const i=cursor++;if(i>=storyboard.length)return;results[i]=await renderOne(storyboard[i]);completed++;update({scenes:results.filter(Boolean).sort((a,b)=>a.index-b.index),progress:25+Math.round(60*completed/storyboard.length),metrics});}};
    await Promise.all(Array.from({length:workerCount},worker));
    const scenes=results;
    stageMetric(metrics,'sceneRenderSeconds',sceneStarted);
    update({status:'assembling',progress:90});
    const concat=path.join(dir,'final-list.txt');
    fs.writeFileSync(concat,scenes.map(s=>`file '${s.file}'`).join('\n')+'\n');
    const assembled=path.join(dir,'assembled.mp4'), final=path.join(dir,'final.mp4');
    await run('ffmpeg',['-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',assembled]);
    const targetDuration=Number(project.duration), assembledDuration=Number(await run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',assembled]));
    if(Math.abs(assembledDuration-targetDuration)>.08){
      const args=['-y','-i',assembled];
      if(assembledDuration<targetDuration){const pad=Math.max(.05,targetDuration-assembledDuration);args.push('-vf',`tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}`,'-af',`apad=pad_dur=${pad.toFixed(3)}`);}
      args.push('-t',String(targetDuration),'-c:v','libx264','-threads','2','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',final);
      await run('ffmpeg',args);
    }else fs.renameSync(assembled,final);
    try{fs.rmSync(assembled,{force:true});}catch{}
    const credits=path.join(dir,'credits.json');
    saveJson(credits,{sources,assets:scenes.flatMap(s=>s.assets)});
    const probe=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',final]));
    const videoStream=(probe.streams||[]).find(x=>x.codec_type==='video'),audioStream=(probe.streams||[]).find(x=>x.codec_type==='audio');
    const actualDuration=Number(probe.format?.duration||0),durationDelta=Number((actualDuration-Number(project.duration)).toFixed(2));
    const vertical=!!videoStream&&Number(videoStream.height)>Number(videoStream.width),audio=!!audioStream;
    if(!videoStream||!vertical||!audio||!Number.isFinite(actualDuration)||actualDuration<=0)throw new Error('Final media QA failed: valid vertical video with audio was not produced');
    const mediaQa={width:Number(videoStream.width||0),height:Number(videoStream.height||0),videoCodec:videoStream.codec_name||null,audioCodec:audioStream.codec_name||null,fileBytes:fs.statSync(final).size};
    const realVideoScenes=scenes.filter(s=>s.hasRealVideo).length;
    const visualMix=scenes.reduce((m,s)=>{const k=s.visualType||'unknown';m[k]=(m[k]||0)+1;return m;},{});
    const candidateScenes=Object.values(project.sceneVariants||{}).filter(v=>Array.isArray(v)&&v.some(x=>x.autoGenerated)).length;
    const candidateRenders=Object.values(project.sceneVariants||{}).flat().filter(x=>x.autoGenerated).length;
    const sourceCount=sources.length;
    const sceneQuality=scenes.map(s=>({index:s.index,score:Number(s.candidateScore||0),gate:s.qualityGate||sceneAcceptance(s.candidateScore,storyboard.find(x=>x.index===s.index)?.beat)}));
    const acceptedScenes=sceneQuality.filter(x=>x.gate.accepted).length;
    const retention=retentionAnalysis(scenes);
    const retentionReady=retention.score>=72&&retention.highRiskScenes.length<=Math.max(1,Math.floor(scenes.length*.2));
    const viralityScore=Math.round(clamp(50+(scenes.length>=6?8:0)+(sourceCount>=5?7:0)+(realVideoScenes*3)+(Math.abs(durationDelta)<=0.5?10:0)+(retention.score>=80?12:retention.score>=70?7:0),0,100));
    const slug=project.topic.replace(/[^a-z0-9 ]/gi,' ').trim();
    const publish={title:`${slug}: the part most people miss`.slice(0,90),description:`A fast, source-backed ${project.niche.replace('-', ' ')} short about ${slug}. Verify claims using the included credits before publishing.`,hashtags:['#shorts',`#${project.niche.replace(/-/g,'')}`,'#storytelling']};
    stageMetric(metrics,'totalSeconds',totalStarted);
    const launchReady=vertical&&audio&&Math.abs(durationDelta)<=0.5&&scenes.length===storyboard.length&&acceptedScenes>=Math.ceil(scenes.length*.75)&&retentionReady;
    update({status:'complete',progress:100,render:{file:final,credits,actualDuration:Number(actualDuration.toFixed(2)),targetDuration:Number(project.duration)},qa:{sceneCount:scenes.length,assetsPerScene:scenes.map(s=>s.assets.length),realVideoScenes,visualMix,candidateScenes,candidateRenders,durationDelta,vertical,audio,launchReady,media:mediaQa,retention,sceneQuality,acceptedScenes,contentQualityPercent:Math.round(100*acceptedScenes/Math.max(1,scenes.length)),viralityScore},publish,metrics,completedAt:new Date().toISOString()});
    return project;
  }catch(error){
    update({status:'failed',error:String(error.message||error),failedAt:new Date().toISOString()});
    throw error;
  }
}
