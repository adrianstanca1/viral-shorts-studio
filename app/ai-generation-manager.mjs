const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const beatWeight={hook:30,payoff:26,escalation:18,evidence:16,context:10,setup:8};

function selectedScene(project,index){return (project.scenes||[]).find(s=>s.index===index)}
function variants(project,index){return project.sceneVariants?.[String(index)]||[]}
function currentBest(project,index){
  const active=selectedScene(project,index); const pool=[active,...variants(project,index)].filter(Boolean);
  return Math.max(0,...pool.map(x=>Number(x.candidateScore||0)));
}
function hasAi(project,index){
  const active=selectedScene(project,index); if(active?.aiProvider)return true;
  return variants(project,index).some(x=>x.aiProvider||String(x.visualType||'').startsWith('ai-'));
}
function scenePriority(project,scene){
  const score=currentBest(project,scene.index); let priority=Number(beatWeight[scene.beat]||10);
  priority+=clamp(86-score,0,30); if(hasAi(project,scene.index))priority-=24;
  if(selectedScene(project,scene.index)?.hasRealVideo)priority-=8;
  return Math.round(priority);
}
export function buildAiGenerationPlan(project,options={}){
  const allowance=Math.max(0,Number(options.allowance??project.aiFreeAllowance??0));
  const maxScenes=clamp(Number(options.maxScenes||4),1,8);
  const minScore=clamp(Number(options.minScore||82),50,100);
  const provider=String(options.provider||'higgsfield');
  const ranked=(project.storyboard||[]).map(scene=>({
    index:scene.index,beat:scene.beat,priority:scenePriority(project,scene),
    currentScore:currentBest(project,scene.index),hasAi:hasAi(project,scene.index),
    visualPrompt:scene.visualPrompt,motionPrompt:scene.motionPrompt,duration:scene.durationHint
  })).sort((a,b)=>b.priority-a.priority||a.index-b.index);
  let remaining=Math.min(allowance,maxScenes); const selected=[];
  for(const s of ranked){
    if(remaining<=0)break;
    if(s.hasAi||s.currentScore>=minScore)continue;
    selected.push({...s,provider,kind:'video',reason:`${s.beat||'scene'} priority; current best ${s.currentScore||'unscored'}`});remaining--;
  }
  return {freeOnly:true,paidFallback:false,provider,allowance,maxScenes,minScore,selected,skipped:ranked.filter(x=>!selected.some(s=>s.index===x.index)),createdAt:new Date().toISOString()};
}

export function summarizeAiPlan(plan){
  return {provider:plan.provider,allowance:plan.allowance,selected:plan.selected.length,sceneIndexes:plan.selected.map(x=>x.index),freeOnly:true,paidFallback:false};
}
