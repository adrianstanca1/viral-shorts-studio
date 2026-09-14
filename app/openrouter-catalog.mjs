import fs from 'node:fs';
import path from 'node:path';

const DATA=process.env.DATA_DIR||'/app/data';
const file=()=>path.join(DATA,'openrouter-free-models.json');
const score=m=>{
  const id=String(m.id||''); let s=Math.min(40,Number(m.context_length||0)/25000);
  if(/nemotron-3-ultra|nemotron-3-super/.test(id))s+=28;
  if(/inkling|nex-n2\.5-pro|ling-3\.0-flash-vl/.test(id))s+=22;
  if(/gemma-4/.test(id))s+=18;
  if(/code|coder|laguna/.test(id))s+=8;
  if(id==='openrouter/free')s+=4;
  return s;
};
export async function refreshOpenRouterFreeCatalog(){
  const r=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`OpenRouter catalog HTTP ${r.status}`);
  const j=await r.json();
  const models=(j.data||[]).filter(m=>Number(m.pricing?.prompt||1)===0&&Number(m.pricing?.completion||1)===0)
    .map(m=>({id:m.id,name:m.name,context:Number(m.context_length||0),score:Number(score(m).toFixed(2))}))
    .sort((a,b)=>b.score-a.score);
  const out={updatedAt:new Date().toISOString(),count:models.length,models};
  fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(file(),JSON.stringify(out,null,2));return out;
}
export function readOpenRouterFreeCatalog(){try{return JSON.parse(fs.readFileSync(file(),'utf8'))}catch{return {updatedAt:null,count:0,models:[]}}}
export function preferredOpenRouterFreeModels(limit=12){
  const ids=readOpenRouterFreeCatalog().models.map(x=>x.id).filter(x=>x==='openrouter/free'||x.endsWith(':free'));
  return [...new Set([...ids,'openrouter/free'])].slice(0,Math.max(1,limit));
}
