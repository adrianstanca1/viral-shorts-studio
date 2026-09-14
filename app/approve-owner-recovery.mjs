import { approveOwnerRecovery } from './owner-auth.mjs';
const root=process.argv[2]||process.env.DATA_DIR||'/app/data';
const code=String(process.argv[3]||'').trim();
if(!/^\d{6}$/.test(code)){console.error('usage: node app/approve-owner-recovery.mjs <data-dir> <6-digit-code>');process.exit(2)}
try{const result=approveOwnerRecovery(root,code);console.log(`owner recovery approved; expires ${result.expiresAt}`)}catch(e){console.error(String(e.message||e));process.exit(1)}
