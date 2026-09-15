import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import { sceneCountForDuration } from './pipeline.mjs';
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
export function buildCapacityBenchmark(projects=[],targets=[30,300,1200]){
  const completed=projects.filter(p=>p.status==='complete'&&Number(p.metrics?.totalSeconds)>0&&Number(p.qa?.sceneCount||p.scenes?.length)>0);
  const sceneRates=completed.map(p=>Number(p.metrics?.sceneRenderSeconds||0)/Math.max(1,Number(p.qa?.sceneCount||p.scenes?.length))).filter(x=>x>0);
  const fixedCosts=completed.map(p=>Math.max(0,Number(p.metrics?.totalSeconds||0)-Number(p.metrics?.sceneRenderSeconds||0))).filter(Number.isFinite);
  const sceneSeconds=avg(sceneRates),fixedSeconds=avg(fixedCosts);
  const estimates=targets.map(duration=>{const scenes=sceneCountForDuration(duration),estimatedSeconds=sceneSeconds?fixedSeconds+sceneSeconds*scenes:null;return {durationSeconds:duration,scenes,estimatedProductionSeconds:estimatedSeconds?Number(estimatedSeconds.toFixed(1)):null,estimatedRealtimeFactor:estimatedSeconds?Number((estimatedSeconds/duration).toFixed(2)):null}});
  const mem=process.memoryUsage();return {generatedAt:new Date().toISOString(),mode:'observational-extrapolation',sampleSize:completed.length,observed:{sceneSeconds:sceneSeconds?Number(sceneSeconds.toFixed(2)):null,fixedSeconds:fixedSeconds?Number(fixedSeconds.toFixed(2)):null},system:{cpus:os.cpus().length,load1:Number(os.loadavg()[0].toFixed(2)),freeMemoryMB:Math.round(os.freemem()/1048576),totalMemoryMB:Math.round(os.totalmem()/1048576),processRssMB:Math.round(mem.rss/1048576),sceneConcurrency:process.env.SCENE_CONCURRENCY||'adaptive'},estimates,notes:['No live render is started by this benchmark.','Estimates use completed-project stage timings and deterministic scene counts.']};
}
export function saveCapacityBenchmark(root,result){const file=path.join(root,'capacity-benchmark.json'),tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(result,null,2),{mode:0o600});fs.renameSync(tmp,file);return result}
