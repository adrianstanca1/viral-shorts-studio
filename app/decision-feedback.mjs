import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const file=root=>path.join(root,'decision-feedback.json');
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,items:[]}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const f=file(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,f);return state};
export function recordDecisionFeedback(root,input={}){const decisionId=String(input.decisionId||'').trim(),decisionType=String(input.decisionType||'').trim(),decision=String(input.decision||'').trim();if(!decisionId||!decisionType||!['accepted','rejected'].includes(decision))throw Error('decisionId, decisionType and accepted/rejected decision are required');const s=read(root),item={id:crypto.randomUUID(),decisionId,decisionType,decision,reason:String(input.reason||'').slice(0,500),createdAt:new Date().toISOString()};s.items=[item,...s.items].slice(0,1000);write(root,s);return item}
export function decisionFeedbackSummary(root){const rows=read(root).items||[],byType={};for(const r of rows){const x=byType[r.decisionType]||{accepted:0,rejected:0};x[r.decision]=(x[r.decision]||0)+1;byType[r.decisionType]=x}return {total:rows.length,byType,records:rows.slice(0,200),policy:{advisoryOnly:true,autoExecute:false}}}
