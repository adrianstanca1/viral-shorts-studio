import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));
const errors=[];
const req=(cond,msg)=>{if(!cond)errors.push(msg)};
req(cfg.orchestrator?.mayExecuteDestructiveActions===false,'orchestrator must not execute destructive actions');
req(Array.isArray(cfg.approvalGates)&&cfg.approvalGates.includes('publish.external'),'external publishing must require approval');
req(cfg.routing?.localPreferred===true,'local routing must be preferred');
req(cfg.routing?.paidFallback===false,'paid fallback must be disabled');
req(cfg.routing?.requireProviderHealthCheck===true,'provider health checks are required');
req(cfg.routing?.requireVerifiedFreeBeforeUse===true,'free providers must be verified before use');
req(cfg.deployment?.allowedStack==='viral-shorts','deployment must be limited to viral-shorts');
req(cfg.deployment?.denyUnrelatedServiceMutation===true,'unrelated services must be protected');
req(cfg.security?.secretsInRepo===false,'secrets must not live in repo');
req(cfg.security?.useAuthenticatedGateway===true,'authenticated gateway must be used');
req(cfg.security?.sandboxWorkers===true,'worker agents must be sandboxed');
req(cfg.memory?.storeSecrets===false,'memory must not store secrets');
if(errors.length){console.error('HERMES CONFIG INVALID'); for(const e of errors) console.error('- '+e); process.exit(1)}
console.log('HERMES CONFIG OK');
