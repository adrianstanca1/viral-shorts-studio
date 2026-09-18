import { buildProviderPrompt, sceneVariantTarget, promptFingerprint } from './scene-render-intelligence.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const beatWeight={hook:30,payoff:26,escalation:18,evidence:16,context:10,setup:8};

function sceneStateMap(project){
  const active=new Map((project.scenes||[]).map(scene=>[Number(scene.index),scene]));
  const variantsByIndex=project.sceneVariants||{};
  const state=new Map();
  for(const scene of project.storyboard||[]){
    const index=Number(scene.index),selected=active.get(index),pool=[selected,...(variantsByIndex[String(index)]||[])].filter(Boolean);
    state.set(index,{
      selected,
      currentScore:Math.max(0,...pool.map(x=>Number(x.candidateScore||0))),
      hasAi:pool.some(x=>x.aiProvider||String(x.visualType||'').startsWith('ai-'))
    });
  }
  return state;
}
function scenePriority(scene,state){
  const score=state.currentScore; let priority=Number(beatWeight[scene.beat]||10);
  priority+=clamp(86-score,0,30); if(state.hasAi)priority-=24;
  if(state.selected?.hasRealVideo)priority-=8;
  return Math.round(priority);
}
export function buildAiGenerationPlan(project,options={}){
  const allowance=Math.max(0,Number(options.allowance??project.aiFreeAllowance??0));
  const maxScenes=clamp(Number(options.maxScenes||4),1,8);
  const minScore=clamp(Number(options.minScore||82),50,100);
  const provider=String(options.provider||'none'),providerKind=['image','video'].includes(String(options.providerKind||''))?String(options.providerKind):'video';
  const state=sceneStateMap(project);
  const ranked=(project.storyboard||[]).map(scene=>{
    const sceneState=state.get(Number(scene.index))||{currentScore:0,hasAi:false,selected:null};
    const prompt=buildProviderPrompt(scene,project,{provider});
    return {
      index:scene.index,beat:scene.beat,priority:scenePriority(scene,sceneState),
      currentScore:sceneState.currentScore,hasAi:sceneState.hasAi,
      visualPrompt:prompt.prompt,motionPrompt:prompt.motionPrompt,negativePrompt:prompt.negativePrompt,
      renderSpec:prompt.spec,promptFingerprint:promptFingerprint(prompt.prompt),
      variantsTarget:sceneVariantTarget(scene,sceneState.currentScore),duration:scene.durationHint
    };
  }).sort((a,b)=>b.priority-a.priority||a.index-b.index);
  let remaining=Math.min(allowance,maxScenes); const selected=[];
  for(const s of ranked){
    if(remaining<=0)break;
    if(s.hasAi||s.currentScore>=minScore)continue;
    selected.push({...s,provider,kind:providerKind,reason:`${s.beat||'scene'} priority; current best ${s.currentScore||'unscored'}`});remaining--;
  }
  const selectedIndexes=new Set(selected.map(x=>x.index));
  return {freeOnly:true,paidFallback:false,provider,allowance,maxScenes,minScore,selected,skipped:ranked.filter(x=>!selectedIndexes.has(x.index)),createdAt:new Date().toISOString()};
}

export function summarizeAiPlan(plan){
  return {provider:plan.provider,allowance:plan.allowance,selected:plan.selected.length,sceneIndexes:plan.selected.map(x=>x.index),freeOnly:true,paidFallback:false};
}
