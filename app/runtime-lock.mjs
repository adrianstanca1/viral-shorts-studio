import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

function readLock(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return null}
}
function processStart(pid){
  if(process.platform!=='linux')return null;
  try{return fs.readFileSync(`/proc/${pid}/stat`,'utf8').trim().split(/\s+/)[21]||null}catch{return null}
}
function runtimeInstanceId(){return String(process.env.HOSTNAME||os.hostname()||'host').slice(0,160)}
function ownerAlive(lock,instanceId){
  if(!lock||!Number.isInteger(Number(lock.pid)))return false;
  if(lock.instanceId&&lock.instanceId!==instanceId)return false;
  try{process.kill(Number(lock.pid),0)}catch(e){if(e?.code==='ESRCH')return false;return e?.code==='EPERM'}
  if(lock.processStart){
    const actual=processStart(Number(lock.pid));
    if(actual&&actual!==String(lock.processStart))return false;
  }
  return true;
}
function stale(file,staleMs,instanceId){
  try{
    const lock=readLock(file);
    if(!ownerAlive(lock,instanceId))return true;
    return Date.now()-fs.statSync(file).mtimeMs>staleMs;
  }catch{return true}
}
export function acquireRuntimeLock(root,{name='studio-runtime',staleMs=120000,instanceId=runtimeInstanceId()}={}){
  fs.mkdirSync(root,{recursive:true});
  const file=path.join(root,`${name}.lock`);
  const token=crypto.randomUUID();
  const write=()=>{
    const fd=fs.openSync(file,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify({token,pid:process.pid,processStart:processStart(process.pid),instanceId,startedAt:new Date().toISOString()}));
    fs.closeSync(fd);
  };
  try{write()}catch(e){
    if(e?.code!=='EEXIST')throw e;
    if(!stale(file,staleMs,instanceId))throw Error('studio runtime lock is already held');
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
