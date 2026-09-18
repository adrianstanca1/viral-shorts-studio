import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=path.resolve(process.env.SHOWCASE_ROOT||'./data/showcase');
const projectsRoot=process.env.SHOWCASE_PROJECTS_ROOT?path.resolve(process.env.SHOWCASE_PROJECTS_ROOT):null;
const outDir=path.resolve(process.env.SHOWCASE_REEL_DIR||path.join(root,'reel'));
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';
const font=process.env.SHOWCASE_FONT||'/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const segmentSeconds=Math.max(6,Math.min(15,Number(process.env.SHOWCASE_SEGMENT_SECONDS||11)));
const width=1280,height=720,fps=25;

const picks=[
  {id:process.env.SHOWCASE_DOCUMENTARY_ID||'documentary-great-train-robbery',label:'DOCUMENTARY  ·  True Crime',start:0},
  {id:process.env.SHOWCASE_CINEMATIC_ID||'cinematic-mars',label:'CINEMATIC  ·  Storytelling',start:5},
  {id:process.env.SHOWCASE_HYBRID_ID||'hybrid-heat-pump',label:'HYBRID  ·  Visual Explainer',start:6},
  {id:process.env.SHOWCASE_WHITEBOARD_ID||'whiteboard-rainscreen',label:'WHITEBOARD  ·  Technical Education',start:4}
];

function run(args){
  const r=spawnSync(ffmpeg,args,{encoding:'utf8'});
  if(r.status!==0)throw new Error((r.stderr||r.stdout||'ffmpeg failed').slice(-2400));
}
function projectVideo(id){
  if(projectsRoot){
    const metaFile=path.join(projectsRoot,id,'project.json');
    if(fs.existsSync(metaFile)){
      const project=JSON.parse(fs.readFileSync(metaFile,'utf8')), file=project?.render?.file;
      if(file&&fs.existsSync(file))return file;
    }
  }
  const file=path.join(root,'projects',id,'final.mp4');
  if(!fs.existsSync(file))throw new Error(`showcase source missing: ${file}`);
  return file;
}
function safeTextFile(name,text){
  const file=path.join(outDir,name);
  fs.writeFileSync(file,String(text).replace(/[\r\n]+/g,' ').trim());
  return file;
}
function videoFilter(labelFile){
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    `fps=${fps}`,
    `drawtext=fontfile=${font}:textfile=${labelFile}:fontcolor=white:fontsize=42:box=1:boxcolor=black@0.58:boxborderw=18:x=48:y=48`,
    'fade=t=in:st=0:d=0.35',
    `fade=t=out:st=${Math.max(.5,segmentSeconds-.45)}:d=0.45`
  ].join(',');
}
function renderCard(name,title,subtitle,duration=3){
  const titleFile=safeTextFile(`${name}-title.txt`,title),subFile=safeTextFile(`${name}-sub.txt`,subtitle);
  const out=path.join(outDir,`${name}.mp4`);
  const vf=[
    `drawtext=fontfile=${font}:textfile=${titleFile}:fontcolor=white:fontsize=58:x=(w-text_w)/2:y=(h-text_h)/2-48`,
    `drawtext=fontfile=${font}:textfile=${subFile}:fontcolor=white@0.82:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2+42`
  ].join(',');
  run(['-y','-f','lavfi','-i',`color=c=0x111111:s=${width}x${height}:r=${fps}:d=${duration}`,'-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-vf',vf,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','44100','-ac','2','-t',String(duration),'-shortest',out]);
  return out;
}

fs.mkdirSync(outDir,{recursive:true});
const parts=[renderCard('00-intro','CREATOR OS','Four production styles · one autonomous pipeline',3)];
for(let i=0;i<picks.length;i++){
  const pick=picks[i],labelFile=safeTextFile(`${i+1}-label.txt`,pick.label),out=path.join(outDir,`${i+1}-${pick.id}.mp4`);
  run(['-y','-ss',String(pick.start),'-t',String(segmentSeconds),'-i',projectVideo(pick.id),'-vf',videoFilter(labelFile),'-af',`afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(.5,segmentSeconds-.4)}:d=0.4`,'-r',String(fps),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','44100','-ac','2',out]);
  parts.push(out);
}
parts.push(renderCard('99-outro','RESEARCH → SCRIPT → SCENES → VOICE → QA','Documentary · Cinematic · Hybrid · Whiteboard',3));

const list=path.join(outDir,'concat.txt');
fs.writeFileSync(list,parts.map(file=>`file '${file.replaceAll("'","'\\''")}'`).join('\n')+'\n');
const final=path.join(outDir,'creator-os-showreel.mp4');
run(['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',final]);

const stat=fs.statSync(final);
const manifest={createdAt:new Date().toISOString(),file:final,size:stat.size,durationEstimate:parts.length?6+picks.length*segmentSeconds:0,segments:picks};
fs.writeFileSync(path.join(outDir,'showreel.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
