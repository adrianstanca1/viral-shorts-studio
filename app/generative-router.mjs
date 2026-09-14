import fs from 'node:fs';
import path from 'node:path';

const now=()=>Date.now();
const safeBool=v=>String(v||'').toLowerCase()==='true';

export function providerConfig(env=process.env){
  return {
    mode: env.GENERATIVE_MODE || 'plan-only',
    freeOnly: true,
    paidFallback: false,
    providers: [
      {id:'huggingface', enabled:safeBool(env.HF_GENERATION_ENABLED), configured:Boolean(env.HF_TOKEN||env.HF_KEY), verifiedFree:safeBool(env.HF_FREE_VERIFIED), tasks:['text-to-image','image-to-video']},
      {id:'fal', enabled:safeBool(env.FAL_GENERATION_ENABLED), configured:Boolean(env.FAL_KEY), verifiedFree:safeBool(env.FAL_FREE_VERIFIED), tasks:['text-to-image','image-to-video','text-to-video']},
    ]
  };
}

export function eligibleProviders(task,env=process.env){
  return providerConfig(env).providers.filter(p=>p.enabled&&p.configured&&p.verifiedFree&&p.tasks.includes(task));
}

export function buildSceneRequests(project){
  const plan=project.generationPlan||{};
  return (plan.scenes||[]).map(scene=>({
    id:`scene-${String(scene.index).padStart(2,'0')}`,
    sceneIndex:scene.index,
    task:'image-to-video',
    aspect:plan.aspect||'9:16',
    duration:scene.duration,
    prompt:scene.visualPrompt,
    motionPrompt:scene.motionPrompt,
    negativePrompt:'text, subtitles, logos, watermark, distorted anatomy, duplicate people, low detail, flicker',
    status:'planned',
    providers:eligibleProviders('image-to-video')
  }));
}

export function writeGenerationQueue(project,projectDir){
  const queue={version:1,createdAt:new Date().toISOString(),mode:providerConfig().mode,freeOnly:true,paidFallback:false,requests:buildSceneRequests(project)};
  const file=path.join(projectDir,'generative-queue.json');
  fs.writeFileSync(file,JSON.stringify(queue,null,2));
  return {file,queue};
}

export function generativeStatus(env=process.env){
  const cfg=providerConfig(env);
  return {...cfg, eligibleImageToVideo:eligibleProviders('image-to-video',env).map(p=>p.id), checkedAt:new Date(now()).toISOString()};
}
