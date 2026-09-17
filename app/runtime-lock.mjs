import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function readLock(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return null}
}
function stale(file,staleMs){
  try{return Date.now()-fs.statSync(file).mtimeMs>staleMs}catch{return true}
}
export function acquireRuntimeLock(root,{name='studio-runtime',staleMs=120000}={}){
  fs.mkdirSync(root,{recursive:true});
  const file=path.join(root,`${name}.lock`);
  const token=crypto.randomUUID();
  const write=()=>{
    const fd=fs.openSync(file,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify({token,pid:process.pid,startedAt:new Date().toISOString()}));
    fs.closeSync(fd);
  };
  try{write()}catch(e){
    if(e?.code!=='EEXIST')throw e;
    if(!stale(file,staleMs))throw Error('studio runtime lock is already held');
    try{fs.unlinkSync(file)}catch{}
    write();
  }
  let released=false;
  const heartbeat=()=>{if(released)return;const current=readLock(file);if(current?.token!==token)throw Error('studio runtime lock ownership changed');const now=new Date();fs.utimesSync(file,now,now)};
  const release=()=>{if(released)return;released=true;const current=readLock(file);if(current?.token===token)try{fs.unlinkSync(file)}catch{}};
  return {file,token,heartbeat,release};
}
export function startRuntimeLockHeartbeat(lock,{intervalMs=30000}={}){
  const timer=setInterval(()=>{try{lock.heartbeat()}catch{process.exitCode=1}},Math.max(5000,intervalMs));
  timer.unref();
  return ()=>clearInterval(timer);
}
