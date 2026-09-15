import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const aspects={'9:16':{width:720,height:1280},'16:9':{width:1280,height:720},'1:1':{width:720,height:720}};
const safeAspect=a=>Object.hasOwn(aspects,a)?a:'9:16';
const run=(cmd,args,{timeout=300000}={})=>new Promise((resolve,reject)=>{
  const child=spawn(cmd,args,{stdio:['ignore','ignore','pipe']});let err='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`${cmd} timed out`));},timeout);
  child.stderr.on('data',d=>{err=(err+String(d)).slice(-4000)});child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))});
});
function repurposeDir(root,projectId){const d=path.join(root,'projects',projectId,'repurpose');fs.mkdirSync(d,{recursive:true});return d}

export function clipPlan(project={},maxClips=6){
  const total=Math.max(0,Number(project.render?.actualDuration||project.duration||0));if(total<=0)return [];
  const chapterStarts=[];let elapsed=0;const scenes=[...(project.scenes||[])].sort((a,b)=>a.index-b.index),startByScene=new Map();for(const s of scenes){startByScene.set(s.index,elapsed);elapsed+=Number(s.duration||0)}
  for(const c of project.chapterCheckpoints||[]){const start=startByScene.get(c.startIndex);if(Number.isFinite(start))chapterStarts.push(start)}
  const starts=chapterStarts.length?chapterStarts:Array.from({length:Math.min(maxClips,Math.max(1,Math.ceil(total/60)))},(_,i)=>i*Math.max(1,total/Math.min(maxClips,Math.ceil(total/60))));
  return [...new Set(starts.map(x=>Math.max(0,Math.min(total-1,Number(x.toFixed(2))))))].slice(0,maxClips).map((start,i)=>({index:i+1,start,duration:Number(Math.min(60,total-start).toFixed(2)),label:`Clip ${i+1}`}));
}

export async function ensureAspectVariant(root,project,aspect='9:16'){
  const a=safeAspect(aspect),dim=aspects[a],input=project?.render?.file;if(!input||!fs.existsSync(input))throw new Error('final video is not available');
  const out=path.join(repurposeDir(root,project.id),`aspect-${a.replace(':','x')}.mp4`);if(fs.existsSync(out)&&fs.statSync(out).size>1024)return out;
  const vf=`scale=${dim.width}:${dim.height}:force_original_aspect_ratio=increase,crop=${dim.width}:${dim.height},setsar=1`;
  await run('ffmpeg',['-y','-i',input,'-vf',vf,'-c:v','libx264','-threads','2','-preset','veryfast','-crf','24','-c:a','aac','-b:a','128k','-movflags','+faststart',out]);return out;
}

export async function ensureClip(root,project,clipIndex){
  const plan=clipPlan(project),clip=plan.find(x=>x.index===Number(clipIndex));if(!clip)throw new Error('clip not found');const input=project?.render?.file;if(!input||!fs.existsSync(input))throw new Error('final video is not available');
  const out=path.join(repurposeDir(root,project.id),`clip-${String(clip.index).padStart(2,'0')}.mp4`);if(fs.existsSync(out)&&fs.statSync(out).size>1024)return {file:out,clip};
  await run('ffmpeg',['-y','-ss',String(clip.start),'-i',input,'-t',String(clip.duration),'-c:v','libx264','-threads','2','-preset','veryfast','-crf','24','-c:a','aac','-b:a','128k','-movflags','+faststart',out]);return {file:out,clip};
}
