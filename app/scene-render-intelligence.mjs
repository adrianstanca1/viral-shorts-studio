import crypto from 'node:crypto';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const clean=(v='')=>String(v??'').replace(/\s+/g,' ').trim();
const words=(v='',max=24)=>clean(v).split(/\s+/).filter(Boolean).slice(0,max).join(' ');

const styleDefaults={
  documentary:{lighting:'natural cinematic contrast',camera:'documentary realism',negative:'watermark, logo, visible text, distorted anatomy, duplicate subject, low detail'},
  cinematic:{lighting:'cinematic motivated lighting',camera:'cinematic composition with deliberate depth',negative:'watermark, logo, visible text, flat lighting, distorted anatomy, duplicate subject'},
  whiteboard:{lighting:'clean even white background',camera:'flat instructional composition',negative:'photorealism, watermark, logo, clutter, illegible text, heavy shadows'}
};

export function normalizeSceneSpec(scene={},project={}){
  const style=clean(scene.style||project.style||'documentary').toLowerCase();
  const defaults=styleDefaults[style]||styleDefaults.documentary;
  const aspect=clean(scene.aspect||project.aspect||'9:16');
  const subject=words(scene.subject||scene.searchQuery||scene.sourceTitle||project.topic||scene.narration,18);
  const setting=words(scene.setting||scene.sourceTitle||project.topic||'',14);
  const framing=clean(scene.shotType||scene.framing||'medium shot');
  const continuity=clean(scene.continuity||project.visualContinuity||project.brandBrain?.visualStyle||style);
  const narration=words(scene.narration||'',38);
  const overlay=words(scene.overlay||'',10);
  const duration=clamp(Number(scene.durationHint||scene.duration||4),1,30);
  const beat=clean(scene.beat||'context');
  return {
    index:Number(scene.index||0),beat,style,aspect,duration,subject,setting,framing,
    camera:clean(scene.camera||defaults.camera),lighting:clean(scene.lighting||defaults.lighting),
    continuity,narration,overlay,negative:clean(scene.negativePrompt||defaults.negative)
  };
}

export function buildProviderPrompt(scene={},project={},options={}){
  const spec=normalizeSceneSpec(scene,project);
  const provider=clean(options.provider||'generic').toLowerCase();
  const motion=clean(scene.motionPrompt||'subtle purposeful camera movement, stable subject, natural motion');
  const brand=words(project.brandPrompt||project.brandBrain?.visualStyle||'',16);
  const base=[
    `Subject: ${spec.subject}`,
    spec.setting&&`Setting: ${spec.setting}`,
    `Framing: ${spec.framing}; ${spec.camera}`,
    `Lighting: ${spec.lighting}`,
    `Style: ${spec.style}; aspect ${spec.aspect}`,
    spec.continuity&&`Continuity: preserve ${spec.continuity}`,
    brand&&`Brand look: ${brand}`,
    `Story beat: ${spec.beat}; narration context: ${spec.narration}`,
    `Motion: ${motion}`,
    `Avoid: ${spec.negative}`
  ].filter(Boolean).join('. ');
  const limit=provider==='higgsfield'?1200:provider==='nvidia'?1000:900;
  return {spec,prompt:base.slice(0,limit),negativePrompt:spec.negative,motionPrompt:motion.slice(0,320)};
}

export function sceneVariantTarget(scene={},currentScore=0){
  const beat=String(scene.beat||'context');
  const score=Number(currentScore||0);
  if(score>=88)return 1;
  if(['hook','payoff'].includes(beat))return score<72?3:2;
  if(score<65)return 2;
  return 1;
}

export function sceneRepairDirective(scene={},quality={}){
  const reasons=[];
  if(Number(quality.visualScore||quality.candidateScore||0)<75)reasons.push('increase subject relevance and visual specificity');
  if(quality.continuity===false)reasons.push('preserve character, wardrobe, environment and palette continuity');
  if(quality.textRisk===true)reasons.push('remove generated text and leave typography to the editor');
  if(quality.motionRisk===true)reasons.push('reduce motion complexity and keep camera movement stable');
  return reasons.length?reasons.join('; '):'preserve composition and make only minimal quality improvements';
}

export function promptFingerprint(value=''){
  return crypto.createHash('sha256').update(clean(value)).digest('hex').slice(0,16);
}
