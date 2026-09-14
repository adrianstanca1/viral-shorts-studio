const COOKIE='vss_owner_recovery';
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function shell(body){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owner recovery</title><style>body{font-family:system-ui;background:#0b0d12;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(430px,calc(100% - 40px));background:#11151d;border:1px solid #2a3140;border-radius:18px;padding:24px}.muted{color:#a9b4c7}.code{font:800 32px ui-monospace,monospace;letter-spacing:5px;background:#0d1118;padding:14px;border-radius:10px;text-align:center}input,button{width:100%;box-sizing:border-box;padding:13px;margin-top:12px;border-radius:10px;border:1px solid #31394b}input{background:#0d1118;color:#fff}button{font-weight:800}.err{color:#ff9d9d}.ok{color:#9de3b2}a{color:#a9c7ff}</style></head><body><main class="card">${body}</main></body></html>`}
export function recoveryPage({state='new',code='',error=''}={}){
  if(state==='pending')return shell(`<h2>Recovery requested</h2><p>Give this verification code to the administrator:</p><div class="code">${esc(code)}</div><p class="muted">The code does not reset your password by itself. Keep this browser open, then refresh after approval.</p><p><a href="/recover-owner">Check approval</a></p>`);
  if(state==='approved')return shell(`<h2>Set a new owner password</h2><p class="ok">Recovery request approved.</p>${error?`<p class="err">${esc(error)}</p>`:''}<form method="post" action="/recover-owner/complete"><input name="password" type="password" minlength="12" autocomplete="new-password" placeholder="New password" required autofocus><input name="confirm" type="password" minlength="12" autocomplete="new-password" placeholder="Confirm new password" required><button type="submit">Change password</button></form>`);
  if(state==='done')return shell(`<h2>Password changed</h2><p class="ok">Your owner password has been updated securely.</p><p><a href="/login">Continue to sign in</a></p>`);
  if(state==='expired'||state==='used')return shell(`<h2>Recovery request unavailable</h2><p class="muted">This recovery request has expired or was already used.</p><form method="post" action="/recover-owner/request"><button type="submit">Create a new recovery request</button></form>`);
  return shell(`<h2>Recover owner access</h2><p class="muted">Create a short-lived recovery request. The administrator must approve the displayed verification code before this browser can set a new password.</p><form method="post" action="/recover-owner/request"><button type="submit">Request recovery</button></form><p><a href="/login">Back to login</a></p>`);
}
export function recoveryCookie(req){
  const raw=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`));
  return raw?decodeURIComponent(raw.slice(COOKIE.length+1)):'';
}
export function setRecoveryCookie(req,res,id){
  const secure=String(process.env.FORCE_SECURE_COOKIE||'').toLowerCase()==='true'||req.secure||String(req.get?.('x-forwarded-proto')||'').toLowerCase()==='https';
  res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Strict; Path=/recover-owner; Max-Age=600${secure?'; Secure':''}`);
}
export function clearRecoveryCookie(res){res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/recover-owner; Max-Age=0`)}
