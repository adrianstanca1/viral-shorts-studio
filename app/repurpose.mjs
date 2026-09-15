const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const tag=s=>'#'+String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,28);
const uniq=xs=>[...new Set(xs.filter(Boolean))];

export function buildRepurposePack(project={}){
  const topic=clean(project.topic),base=project.publish||{},niche=clean(project.niche).replace(/-/g,' '),score=Number(project.qa?.viralityScore||0);
  const titleBase=clean(base.title||topic||'Untitled');
  const titleVariants=uniq([
    titleBase,
    `${topic}: what most people miss`,
    `The hidden detail behind ${topic}`,
    score>=85?`Why ${topic} is worth a second look`:`${topic}, explained clearly`
  ]).map(x=>x.slice(0,100)).slice(0,4);
  const hashtags=uniq([...(base.hashtags||[]),tag(niche),tag(topic.split(' ').slice(0,3).join(''))]).slice(0,12);
  const description=clean(base.description||`Source-backed creator video about ${topic}.`);
  return {
    projectId:project.id,
    generatedAt:new Date().toISOString(),
    source:{topic,niche,aspect:project.aspect||'9:16',duration:Number(project.duration||0),viralityScore:score},
    titleVariants,
    platforms:{
      'youtube-shorts':{recommendedAspect:'9:16',title:titleVariants[0],caption:`${description}\n\n${hashtags.slice(0,8).join(' ')}`.trim(),hashtags:hashtags.slice(0,8)},
      'instagram-reels':{recommendedAspect:'9:16',title:titleVariants[1]||titleVariants[0],caption:`${description}\n\n${hashtags.join(' ')}`.trim(),hashtags},
      'tiktok':{recommendedAspect:'9:16',title:titleVariants[2]||titleVariants[0],caption:`${description.slice(0,1200)}\n\n${hashtags.slice(0,8).join(' ')}`.trim(),hashtags:hashtags.slice(0,8)},
      'square-social':{recommendedAspect:'1:1',title:titleVariants[0],caption:description.slice(0,1800),hashtags:hashtags.slice(0,10)},
      'landscape-video':{recommendedAspect:'16:9',title:titleVariants[3]||titleVariants[0],caption:description,hashtags:hashtags.slice(0,8)}
    },
    policy:{automaticPosting:false,humanApprovalRequired:true,sourceVideoUnchanged:true}
  };
}
