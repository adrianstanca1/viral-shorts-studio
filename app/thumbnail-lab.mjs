import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function thumbnailVariantPlan(project={}){
  const duration=Math.max(1,Number(project.render?.actualDuration||project.duration||60));
  const fractions=[0.08,0.42,0.74];
  return fractions.map((f,i)=>({index:i,timestamp:Number(Math.min(duration-0.05,Math.max(0.1,duration*f)).toFixed(2)),label:['Hook frame','Mid-story frame','Payoff frame'][i]}));
}
export function ensureThumbnailVariants(root,project){
  if(!project?.id||!project.render?.file||!fs.existsSync(project.render.file))throw Error('video not ready');
  const dir=path.join(root,'projects',project.id,'thumbnails');fs.mkdirSync(dir,{recursive:true});
  return thumbnailVariantPlan(project).map(v=>{const file=path.join(dir,`variant-${v.index}.jpg`);if(!fs.existsSync(file)){const r=spawnSync('ffmpeg',['-y','-ss',String(v.timestamp),'-i',project.render.file,'-frames:v','1','-vf','scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720','-q:v','2',file],{stdio:'ignore',timeout:30000});if(r.status!==0||!fs.existsSync(file))throw Error(`thumbnail variant ${v.index} generation failed`);}return {...v,file,url:`/api/projects/${project.id}/thumbnails/${v.index}`};});
}
