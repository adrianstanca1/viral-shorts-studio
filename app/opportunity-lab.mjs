import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const file=root=>path.join(root,'opportunity-lab.json');
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,scorecards:[]}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const tmp=file(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,file(root));return state};
export function buildOpportunityScorecard(query,reports=[]){
  const modes=[...new Set(reports.map(x=>x.mode))],sourceCount=Math.max(0,...reports.map(x=>Number(x.sourceCount||0))),terms=new Map();
  for(const report of reports)for(const item of report.opportunities||[]){const key=String(item.topic||'').toLowerCase();if(!key)continue;const row=terms.get(key)||{topic:item.topic,evidence:0,scores:[],modes:new Set()};row.evidence+=Number(item.evidence||0);row.scores.push(Number(item.score||0));row.modes.add(report.mode);terms.set(key,row)}
  const opportunities=[...terms.values()].map(x=>({topic:x.topic,score:Math.round(x.scores.reduce((a,b)=>a+b,0)/Math.max(1,x.scores.length)),evidence:x.evidence,modes:[...x.modes],confidence:x.modes.size>=3&&sourceCount>=5?'high':x.modes.size>=2?'medium':'directional'})).sort((a,b)=>b.score-a.score||b.evidence-a.evidence).slice(0,15);
  return {id:crypto.randomUUID(),query:String(query||'').slice(0,300),createdAt:new Date().toISOString(),modes,sourceCount,opportunities,connectors:{facelessFinder:'evidence-derived',trendFinder:'evidence-derived',storeFinder:'connector-required',metaAdLibrary:'connector-required'},policy:{sourceGrounded:true,platformVolumeClaimed:false,revenueClaimed:false,autoAct:false}};
}
export function saveOpportunityScorecard(root,scorecard){const state=read(root);state.scorecards=[scorecard,...state.scorecards].slice(0,100);write(root,state);return scorecard}
export function listOpportunityScorecards(root){return read(root).scorecards||[]}
