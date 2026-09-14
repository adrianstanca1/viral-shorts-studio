import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readGoogleOAuthStore, writeGoogleOAuthStore } from './google-oauth.mjs';

const tokenFile=root=>path.join(root,'google-setup-token.json');
const tokenHash=t=>crypto.createHash('sha256').update(String(t||'')).digest('hex');
const safeEqualHex=(a,b)=>{try{const A=Buffer.from(String(a||''),'hex'),B=Buffer.from(String(b||''),'hex');return A.length===B.length&&A.length>0&&crypto.timingSafeEqual(A,B)}catch{return false}};

export function createGoogleSetupToken(root,{ttlMinutes=30}={}){
  fs.mkdirSync(root,{recursive:true});const token=crypto.randomBytes(32).toString('base64url');
  const rec={version:1,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+Math.max(5,Number(ttlMinutes)||30)*60_000).toISOString(),used:false,createdAt:new Date().toISOString()};
  fs.writeFileSync(tokenFile(root),JSON.stringify(rec,null,2),{mode:0o600});fs.chmodSync(tokenFile(root),0o600);return {token,expiresAt:rec.expiresAt};
}
export function googleSetupTokenValid(root,token){
  try{const rec=JSON.parse(fs.readFileSync(tokenFile(root),'utf8'));return !rec.used&&Date.parse(rec.expiresAt)>Date.now()&&safeEqualHex(rec.tokenHash,tokenHash(token));}catch{return false;}
}
export function saveGoogleOAuthClient(root,{token,clientId,clientSecret,ownerEmail}){
  if(!googleSetupTokenValid(root,token))throw new Error('Setup link is invalid or expired');
  const id=String(clientId||'').trim(),secret=String(clientSecret||'').trim(),email=String(ownerEmail||'').trim().toLowerCase();
  if(id.length<20||secret.length<8)throw new Error('Google OAuth client credentials are incomplete');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Owner email is invalid');
  const store=readGoogleOAuthStore(root);store.oauthClient={clientId:id,clientSecret:secret,ownerEmails:email?[email]:[],configuredAt:new Date().toISOString()};writeGoogleOAuthStore(root,store);
  const rec=JSON.parse(fs.readFileSync(tokenFile(root),'utf8'));rec.used=true;rec.usedAt=new Date().toISOString();fs.writeFileSync(tokenFile(root),JSON.stringify(rec,null,2),{mode:0o600});fs.chmodSync(tokenFile(root),0o600);
  return {configured:true,ownerEmailConfigured:!!email};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export function googleSetupPage(token,{error=''}={}){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Google Setup · Viral Shorts Studio</title><style>body{font-family:system-ui;background:#0b0d12;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(520px,calc(100% - 36px));background:#11151d;border:1px solid #2a3140;border-radius:18px;padding:24px}input,button{width:100%;box-sizing:border-box;padding:13px;margin-top:10px;border-radius:10px;border:1px solid #31394b}input{background:#0d1118;color:#fff}button{font-weight:800}.muted{color:#9aa6ba}.err{color:#ff9d9d}.ok{color:#85f5a3}</style></head><body><form class="card" method="post" action="/setup/google" autocomplete="off"><h2>Connect Google</h2><p class="muted">Credentials go directly from this browser to your VPS and are stored only in the protected application data volume. This setup link is single-use.</p>${error?`<p class="err">${esc(error)}</p>`:''}<input type="hidden" name="token" value="${esc(token)}"><label>Google OAuth Client ID<input name="clientId" required autocapitalize="off" spellcheck="false"></label><label>Google OAuth Client Secret<input name="clientSecret" type="password" required autocomplete="new-password"></label><label>Owner Google email<input name="ownerEmail" type="email" required autocomplete="email"></label><button type="submit">Save securely & continue</button></form></body></html>`;}
export function googleSetupSuccessPage(){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Google connected</title><style>body{font-family:system-ui;background:#0b0d12;color:#fff;display:grid;place-items:center;min-height:100vh}.card{max-width:480px;background:#11151d;border:1px solid #2a3140;border-radius:18px;padding:24px}.ok{color:#85f5a3}a{display:block;text-align:center;padding:13px;border-radius:10px;background:white;color:#111;text-decoration:none;font-weight:800;margin-top:16px}</style></head><body><div class="card"><h2 class="ok">Google OAuth saved securely</h2><p>Continue with Google to pair your owner identity and sign in. The one-time setup link has now expired.</p><a href="/api/oauth/google/login">Continue with Google</a></div></body></html>`;}
