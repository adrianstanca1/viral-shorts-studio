import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const USERINFO_URL='https://openidconnect.googleapis.com/v1/userinfo';
const YOUTUBE_SCOPE='https://www.googleapis.com/auth/youtube.upload';
const states=new Map();
const truthy=v=>['1','true','yes','on'].includes(String(v||'').toLowerCase());
const cleanEmail=v=>String(v||'').trim().toLowerCase();

function clientId(env=process.env,store={}){return env.GOOGLE_CLIENT_ID||env.YOUTUBE_CLIENT_ID||store.oauthClient?.clientId||'';}
function clientSecret(env=process.env,store={}){return env.GOOGLE_CLIENT_SECRET||env.YOUTUBE_CLIENT_SECRET||store.oauthClient?.clientSecret||'';}
function storeFile(root){return path.join(root,'google-oauth.json');}
function b64url(buf){return Buffer.from(buf).toString('base64url');}
function challenge(verifier){return b64url(crypto.createHash('sha256').update(verifier).digest());}
function purgeStates(){const now=Date.now();for(const [k,v] of states)if(v.expiresAt<=now)states.delete(k);}
function allowedEmails(env=process.env,store={}){const fromEnv=String(env.GOOGLE_OWNER_EMAILS||env.GOOGLE_OWNER_EMAIL||'').split(',');const fromStore=Array.isArray(store.oauthClient?.ownerEmails)?store.oauthClient.ownerEmails:[];return [...fromEnv,...fromStore].map(cleanEmail).filter(Boolean);}

export function readGoogleOAuthStore(root){
  try{return JSON.parse(fs.readFileSync(storeFile(root),'utf8'));}catch{return {version:1};}
}
export function writeGoogleOAuthStore(root,value){
  fs.mkdirSync(root,{recursive:true});const file=storeFile(root),tmp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify({...value,version:1,updatedAt:new Date().toISOString()},null,2),{mode:0o600});
  fs.chmodSync(tmp,0o600);fs.renameSync(tmp,file);fs.chmodSync(file,0o600);return value;
}
export function googleOAuthStatus(root,{env=process.env}={}){
  const store=readGoogleOAuthStore(root),configured=!!(clientId(env,store)&&clientSecret(env,store));
  const allow=allowedEmails(env,store),paired=!!store.owner?.sub;
  return {configured,loginEnabled:configured&&(allow.length>0||paired||truthy(env.GOOGLE_LOGIN_ALLOW_ANY)),ownerPaired:paired,youtubeConnected:!!store.youtube?.refreshToken,redirectUriConfigured:!!env.GOOGLE_OAUTH_REDIRECT_URI};
}
export function googleLoginAuthorized(profile,root,{env=process.env}={}){
  if(!profile?.email_verified)return false;const email=cleanEmail(profile.email),store=readGoogleOAuthStore(root),allow=allowedEmails(env,store);
  if(store.owner?.sub&&String(store.owner.sub)===String(profile.sub))return true;
  if(allow.includes(email))return true;
  return truthy(env.GOOGLE_LOGIN_ALLOW_ANY);
}
export function pairGoogleOwner(profile,root){
  const store=readGoogleOAuthStore(root);store.owner={sub:String(profile.sub||''),email:cleanEmail(profile.email),name:String(profile.name||'').slice(0,120),pairedAt:new Date().toISOString()};writeGoogleOAuthStore(root,store);return store.owner;
}
export function saveYouTubeGrant(profile,tokens,root){
  if(!tokens?.refresh_token)throw new Error('Google did not return an offline refresh token');
  const store=readGoogleOAuthStore(root);store.youtube={refreshToken:String(tokens.refresh_token),sub:String(profile.sub||''),email:cleanEmail(profile.email),scope:String(tokens.scope||''),connectedAt:new Date().toISOString()};writeGoogleOAuthStore(root,store);return store.youtube;
}
export function youtubeCredentialEnv(root,{env=process.env}={}){
  const store=readGoogleOAuthStore(root);return {...env,YOUTUBE_CLIENT_ID:env.YOUTUBE_CLIENT_ID||env.GOOGLE_CLIENT_ID||store.oauthClient?.clientId||'',YOUTUBE_CLIENT_SECRET:env.YOUTUBE_CLIENT_SECRET||env.GOOGLE_CLIENT_SECRET||store.oauthClient?.clientSecret||'',YOUTUBE_REFRESH_TOKEN:env.YOUTUBE_REFRESH_TOKEN||store.youtube?.refreshToken||''};
}
export function beginGoogleOAuth({flow,redirectUri,root=null,env=process.env}){
  const store=root?readGoogleOAuthStore(root):{};if(!clientId(env,store)||!clientSecret(env,store))throw new Error('Google OAuth client is not configured');
  purgeStates();const state=b64url(crypto.randomBytes(24)),verifier=b64url(crypto.randomBytes(48));states.set(state,{flow,verifier,redirectUri,root,expiresAt:Date.now()+10*60_000});
  const scopes=flow==='youtube'?['openid','email','profile',YOUTUBE_SCOPE]:['openid','email','profile'];
  const q=new URLSearchParams({client_id:clientId(env,store),redirect_uri:redirectUri,response_type:'code',scope:scopes.join(' '),state,code_challenge:challenge(verifier),code_challenge_method:'S256',include_granted_scopes:'true'});
  if(flow==='youtube'){q.set('access_type','offline');q.set('prompt','consent');}
  return `${AUTH_URL}?${q}`;
}
export async function finishGoogleOAuth({code,state,root=null,env=process.env}){
  purgeStates();const pending=states.get(String(state||''));states.delete(String(state||''));if(!pending)throw new Error('Google OAuth state is invalid or expired');
  const store=(root||pending.root)?readGoogleOAuthStore(root||pending.root):{};
  const body=new URLSearchParams({code:String(code||''),client_id:clientId(env,store),client_secret:clientSecret(env,store),redirect_uri:pending.redirectUri,grant_type:'authorization_code',code_verifier:pending.verifier});
  const tr=await fetch(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(20000)});const tokens=await tr.json().catch(()=>({}));if(!tr.ok||!tokens.access_token)throw new Error(`Google OAuth token exchange failed (${tr.status})`);
  const ur=await fetch(USERINFO_URL,{headers:{authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(15000)});const profile=await ur.json().catch(()=>({}));if(!ur.ok||!profile.sub||!profile.email)throw new Error(`Google profile verification failed (${ur.status})`);
  return {flow:pending.flow,tokens,profile};
}
