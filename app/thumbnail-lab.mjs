import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function thumbnailVariantPlan(project={}){
  const duration=Math.max(1,Number(project.render?.actualDuration||project.duration||60));
  const fractions=[0.08,0.42,0.74];
  return fractions.map((f,i)=>({index:i,timestamp:Number(Math.min(duration-0.05,Math.max(0.1,duration*f)).toFixed(2)),label:['Hook frame','Mid-story frame','Payoff frame'][i]}));
}
const safeTitle=p=>String(p.publish?.title||p.topic||'').replace(/\s+/g,' ').trim().slice(0,90);
export function ensureThumbnailVariants(root,project){
  if(!project?.id||!project.render?.file||!fs.existsSync(project.render.file))throw Error('video not ready');
  const dir=path.join(root,'projects',project.id,'thumbnails');fs.mkdirSync(dir,{recursive:true});const title=safeTitle(project),textFile=path.join(dir,'title.txt');fs.writeFileSync(textFile,title,{mode:0o600});
  return thumbnailVariantPlan(project).map(v=>{const file=path.join(dir,`variant-${v.index}-v2.jpg`);if(!fs.existsSync(file)){const y=['h-th-72','72','h/2-th/2'][v.index]||'h-th-72',box=v.index===1?'box=1:boxcolor=black@0.58:boxborderw=24':'box=1:boxcolor=black@0.46:boxborderw=20',vf=`scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile=${textFile}:${box}:fontcolor=white:fontsize=54:x=(w-text_w)/2:y=${y}`;const r=spawnSync('ffmpeg',['-y','-ss',String(v.timestamp),'-i',project.render.file,'-frames:v','1','-vf',vf,'-q:v','2',file],{stdio:'ignore',timeout:30000});if(r.status!==0||!fs.existsSync(file))throw Error(`thumbnail variant ${v.index} generation failed`);}return {...v,composition:['hook-bottom','headline-top','payoff-center'][v.index]||'composed',title,file,url:`/api/projects/${project.id}/thumbnails/${v.index}`};});
}

export function thumbnailCreativeBriefs(project,{performance=null}={}){
  const title=safeTitle(project),signal=performance?`Observed performance: ${Number(performance.views||0)} views and score ${Number(performance.score||0)}.`:'No external performance evidence yet.';
  return [
    {index:0,concept:'curiosity-closeup',prompt:`YouTube thumbnail for "${title}". Strong curiosity gap, one dominant subject, close crop, high visual separation, no tiny text. ${signal}`},
    {index:1,concept:'before-after-contrast',prompt:`YouTube thumbnail for "${title}". Clear visual contrast or before/after composition, one focal idea, dramatic readable hierarchy, minimal words. ${signal}`},
    {index:2,concept:'evidence-reveal',prompt:`YouTube thumbnail for "${title}". Evidence/reveal composition using a striking object or document, cinematic lighting, simple background, strong mobile readability. ${signal}`}
  ];
}
