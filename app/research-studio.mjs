import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { researchTopic } from './pipeline.mjs';
const file=root=>path.join(root,'research-studio.json');
function read(root){try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {reports:[]}}}
function write(root,x){fs.mkdirSync(root,{recursive:true});const tmp=file(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(x,null,2),{mode:0o600});fs.renameSync(tmp,file(root))}
const words=s=>new Set(String(s||'').toLowerCase().match(/[a-z0-9]{4,}/g)||[]);
function opportunities(query,sources){const q=words(query),freq=new Map();for(const src of sources)for(const w of words(`${src.title} ${src.extract}`))if(!q.has(w))freq.set(w,(freq.get(w)||0)+1);return [...freq].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([topic,evidence])=>({topic,evidence,score:Math.min(100,45+evidence*12)}))}
export async function runResearch(root,input={},providedSources=null){const query=String(input.query||'').trim().slice(0,300);if(query.length<3)throw new Error('research query is required');const mode=['topic','trend','competitor','faceless'].includes(input.mode)?input.mode:'topic';const sources=Array.isArray(providedSources)&&providedSources.length?providedSources:await researchTopic(query);const report={id:crypto.randomUUID(),query,mode,createdAt:new Date().toISOString(),sourceCount:sources.length,sources:sources.slice(0,8),opportunities:opportunities(query,sources),disclaimer:mode==='trend'?'Opportunity scores are evidence signals, not platform search-volume measurements.':mode==='faceless'?'Channel/revenue estimates are not claimed without channel analytics data.':'Source-grounded research summary.'};const x=read(root);x.reports=[report,...(x.reports||[])].slice(0,100);write(root,x);return report}
export function listResearch(root){return read(root).reports||[]}
export function researchPrompt(report){return `Create a source-grounded video about ${report.query}. Prioritize these opportunity terms: ${(report.opportunities||[]).slice(0,5).map(x=>x.topic).join(', ')}.`}
