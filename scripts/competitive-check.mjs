import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const server=read('app/server.mjs'),pipeline=read('app/pipeline.mjs'),plan=read('V3_DEVELOPMENT_PLAN.md'),v4=read('V4_DEVELOPMENT_PLAN.md'),score=read('COMPETITIVE_SCORECARD.md');
const checks=[
  ['scoped MCP integration',server.includes("app.post('/mcp'")],
  ['30-minute production',server.includes('duration>1800')&&pipeline.includes('Math.min(240')],
  ['Opportunity Lab live scan',server.includes("/api/opportunity-lab/live-scan")],
  ['voice catalogue',server.includes("/api/voices")],
  ['thumbnail experiments',server.includes("thumbnail-experiment")],
  ['owner-reviewed winner promotion',server.includes("/api/experiments/:id/promote")&&server.includes('ownerReviewed:true')],
  ['verified-free provider gate',server.includes('canQueueFreeProvider')],
  ['competitive scorecard maintained',score.includes('Competitive Scorecard')&&!score.includes('Planned Opportunity Lab adapters')],
  ['V3 tracked work complete',!/^\s*- \[ \]/m.test(plan)],
  ['campaign operating system',server.includes("/api/campaigns")&&server.includes('campaignSchedule')],
  ['growth autopilot',server.includes("/api/growth/queue")&&server.includes('decideGrowthItem')],
  ['workspace collaboration',server.includes("/api/workspace/invites")&&server.includes('memberCanAccess')],
  ['plugin registry',server.includes("/api/plugins")&&server.includes('pluginForTool')],
  ['recovery manifest',server.includes("/api/backup/manifest")&&server.includes('validateRecoverableState')],
  ['V4 tracked work complete',!/^\s*- \[ \]/m.test(v4)]
];
const failed=checks.filter(x=>!x[1]);for(const [name,ok] of checks)console.log(`${ok?'ok':'FAIL'}: ${name}`);if(failed.length)process.exit(1);
