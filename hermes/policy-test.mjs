import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));
const approval=new Set(cfg.approvalGates);
const cases=[
  ['publish.external',true],['spend.money',true],['persistent.delete',true],['security.change',true],['access.change',true],['infrastructure.destructive',true],
  ['repo.write',false],['tests.run',false],['viral-shorts.restart',false]
];
const safetyControls=[
  ['deployment.requirePreDeployTests',cfg.deployment?.requirePreDeployTests===true],
  ['deployment.requirePostDeployHealthCheck',cfg.deployment?.requirePostDeployHealthCheck===true],
  ['deployment.requireRollbackPoint',cfg.deployment?.requireRollbackPoint===true],
  ['routing.circuitBreaker.enabled',cfg.routing?.circuitBreaker?.enabled===true],
  ['security.redactSecretsInLogs',cfg.security?.redactSecretsInLogs===true],
  ['security.publicSecretEndpoints',cfg.security?.publicSecretEndpoints===false],
  ['security.checkpointBeforeMutation',cfg.security?.checkpointBeforeMutation===true]
];
let bad=0;
for(const [action,expected] of cases){const got=approval.has(action); if(got!==expected){console.error(`FAIL ${action}: expected ${expected}, got ${got}`); bad++;}}
for(const [name,ok] of safetyControls){if(!ok){console.error(`FAIL safety invariant: ${name}`); bad++;}}
if(!cfg.agents.deployment.includes('viral-shorts.restart')){console.error('FAIL deployment agent cannot restart target');bad++}
if(cfg.agents.deployment.some(x=>x.startsWith('system.'))){console.error('FAIL deployment agent has system-wide capabilities');bad++}
if(bad)process.exit(1);
console.log(`POLICY TESTS OK (${cases.length+safetyControls.length+2} assertions)`);
