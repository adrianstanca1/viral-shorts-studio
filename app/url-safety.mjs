import net from 'node:net';

function blockedIpv4(host){
  const p=host.split('.').map(Number); if(p.length!==4||p.some(x=>!Number.isInteger(x)))return true;
  const [a,b,c]=p;
  return a===0||a===10||a===127||a>=224||
    (a===100&&b>=64&&b<=127)||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&b===168)||
    (a===192&&b===0&&c===0)||(a===192&&b===0&&c===2)||
    (a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||
    (a===203&&b===0&&c===113);
}
function blockedIpv6(host){
  const h=host.toLowerCase();
  if(h==='::'||h==='::1'||h.startsWith('fc')||h.startsWith('fd')||/^fe[89ab]/.test(h)||h.startsWith('ff'))return true;
  if(h.startsWith('::ffff:')){const tail=h.slice(7);return net.isIP(tail)===4?blockedIpv4(tail):true;}
  return false;
}
export function isPublicHttps(value){
  let u;try{u=new URL(String(value||''))}catch{return false}
  if(u.protocol!=='https:'||u.username||u.password)return false;
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return false;
  const family=net.isIP(host);if(family===4)return !blockedIpv4(host);if(family===6)return !blockedIpv6(host);
  return !!host;
}