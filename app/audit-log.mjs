import fs from 'node:fs';
import path from 'node:path';
const file=root=>path.join(root,'audit-log.jsonl');
export function recordAudit(root,event={}){fs.mkdirSync(root,{recursive:true});const row={at:new Date().toISOString(),actorType:String(event.actorType||'unknown').slice(0,40),actorId:String(event.actorId||'').slice(0,120),role:String(event.role||'').slice(0,40),method:String(event.method||'').slice(0,12),path:String(event.path||'').slice(0,240),status:Number(event.status||0)};fs.appendFileSync(file(root),JSON.stringify(row)+'\n',{mode:0o600});return row}
export function readAudit(root,limit=200){try{return fs.readFileSync(file(root),'utf8').trim().split('\n').filter(Boolean).slice(-Math.max(1,Math.min(1000,Number(limit||200)))).reverse().map(x=>JSON.parse(x))}catch{return []}}
