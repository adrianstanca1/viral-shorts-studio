const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

const styleLooks={
  documentary:{contrast:1.05,saturation:0.96,brightness:-0.01,gamma:1.00,sharpness:0.35,vignette:true},
  cinematic:{contrast:1.09,saturation:0.94,brightness:-0.015,gamma:0.98,sharpness:0.28,vignette:true},
  hybrid:{contrast:1.06,saturation:1.02,brightness:0,gamma:1.00,sharpness:0.42,vignette:false},
  whiteboard:{contrast:1.03,saturation:0.92,brightness:0.015,gamma:1.02,sharpness:0.25,vignette:false},
  animated:{contrast:1.04,saturation:1.08,brightness:0,gamma:1.00,sharpness:0.25,vignette:false}
};

export function professionalFinishingProfile({style='documentary',duration=30,aspect='9:16'}={}){
  const look=styleLooks[style]||styleLooks.documentary;
  const seconds=Math.max(1,Number(duration||30));
  const fade=Math.min(.35,Math.max(.16,seconds*.008));
  const video=[
    `eq=contrast=${look.contrast}:saturation=${look.saturation}:brightness=${look.brightness}:gamma=${look.gamma}`,
    `unsharp=5:5:${look.sharpness}:3:3:0`
  ];
  if(look.vignette)video.push('vignette=PI/10');
  video.push(`fade=t=in:st=0:d=${fade.toFixed(2)}`);
  video.push(`fade=t=out:st=${Math.max(.1,seconds-fade).toFixed(2)}:d=${fade.toFixed(2)}`);
  video.push('format=yuv420p');
  const audio=[
    'highpass=f=70',
    'lowpass=f=16000',
    'acompressor=threshold=-18dB:ratio=3:attack=20:release=250:makeup=2',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    `afade=t=in:st=0:d=${fade.toFixed(2)}`,
    `afade=t=out:st=${Math.max(.1,seconds-fade).toFixed(2)}:d=${fade.toFixed(2)}`
  ];
  return {
    version:1,style,aspect,duration:seconds,fadeSeconds:Number(fade.toFixed(2)),
    videoFilter:video.join(','),audioFilter:audio.join(','),
    targetLoudnessLufs:-16,truePeakDb:-1.5
  };
}

export function sceneMotionDirection(scene={},position=0,total=1){
  const beat=String(scene.beat||'context');
  const seed=(Number(scene.index||position+1)+Number(scene.variantSeed||0))%4;
  if(beat==='hook')return {mode:'push-in',strength:1.0};
  if(beat==='payoff')return {mode:'pull-out',strength:.85};
  if(seed===0)return {mode:'push-in',strength:.72};
  if(seed===1)return {mode:'pull-out',strength:.65};
  if(seed===2)return {mode:'hold',strength:.35};
  return {mode:position>=Math.max(0,total-2)?'pull-out':'push-in',strength:.58};
}

export function finishingSummary(profile={}){
  return {version:profile.version||1,style:profile.style,fadeSeconds:profile.fadeSeconds,targetLoudnessLufs:profile.targetLoudnessLufs,truePeakDb:profile.truePeakDb};
}
