import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_FILE='owner-auth.json';
const RECOVERY_FILE='owner-recovery.json';
const MAX_RECOVERY_REQUESTS=20;
const RECOVERY_TTL_MS=10*60*1000;

const authPath=root=>path.join(root,AUTH_FILE);
const recoveryPath=root=>path.join(root,RECOVERY_FILE);
function writeJson0600(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});
  fs.chmodSync(tmp,0o600);fs.renameSync(tmp,file);fs.chmodSync(file,0o600);
}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function equal(a,b){const A=Buffer.from(String(a||'')),B=Buffer.from(String(b||''));return A.length===B.length&&A.length>0&&crypto.timingSafeEqual(A,B)}
function hashPassword(password,salt=crypto.randomBytes(16).toString('base64url')){
  const hash=crypto.scryptSync(String(password),salt,64).toString('base64url');
  return {algorithm:'scrypt',salt,hash};
}
export function ownerPasswordConfigured(root){
  const state=readJson(authPath(root),{});
  return state?.password?.algorithm==='scrypt'&&!!state.password?.salt&&!!state.password?.hash;
}
export function verifyOwnerPassword(root,password,{legacySecret=''}={}){
  const state=readJson(authPath(root),{});
  if(state?.password?.algorithm==='scrypt'&&state.password?.salt&&state.password?.hash){
    const candidate=hashPassword(password,state.password.salt).hash;
    return equal(candidate,state.password.hash);
  }
  return equal(password,legacySecret);
}
export function setOwnerPassword(root,password){
  const value=String(password||'');
  if(value.length<12)throw new Error('Use at least 12 characters for the owner password');
  const current=readJson(authPath(root),{});
  const next={...current,version:1,password:hashPassword(value),updatedAt:new Date().toISOString()};
  writeJson0600(authPath(root),next);return {updatedAt:next.updatedAt};
}
function recoveryList(root){const data=readJson(recoveryPath(root),[]);return Array.isArray(data)?data:[]}
function saveRecoveryList(root,list){writeJson0600(recoveryPath(root),list.slice(-MAX_RECOVERY_REQUESTS))}
export function createOwnerRecovery(root){
  const now=Date.now(),id=crypto.randomUUID(),code=String(crypto.randomInt(100000,1000000));
  const item={id,code,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+RECOVERY_TTL_MS).toISOString(),approvedAt:null,usedAt:null};
  const list=recoveryList(root).filter(x=>Date.parse(x.expiresAt||0)>now&&!x.usedAt);
  list.push(item);saveRecoveryList(root,list);return item;
}
export function ownerRecoveryStatus(root,id){
  const item=recoveryList(root).find(x=>x.id===id);if(!item)return {state:'missing'};
  if(item.usedAt)return {state:'used',item};
  if(Date.parse(item.expiresAt||0)<=Date.now())return {state:'expired',item};
  return {state:item.approvedAt?'approved':'pending',item};
}
export function approveOwnerRecovery(root,code){
  const now=Date.now(),list=recoveryList(root);
  const item=[...list].reverse().find(x=>x.code===String(code)&&!x.usedAt&&Date.parse(x.expiresAt||0)>now);
  if(!item)throw new Error('No active recovery request matches that code');
  item.approvedAt=new Date(now).toISOString();saveRecoveryList(root,list);
  return {createdAt:item.createdAt,expiresAt:item.expiresAt,approvedAt:item.approvedAt};
}
export function completeOwnerRecovery(root,id,password){
  const list=recoveryList(root),item=list.find(x=>x.id===id),now=Date.now();
  if(!item||item.usedAt||!item.approvedAt||Date.parse(item.expiresAt||0)<=now)throw new Error('Recovery request is not approved or has expired');
  const result=setOwnerPassword(root,password);item.usedAt=new Date(now).toISOString();saveRecoveryList(root,list);return result;
}
