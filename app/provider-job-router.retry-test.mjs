import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProviderJob, claimProviderJobs, releaseProviderJob, getProviderJob, reconcileProviderJobs, providerJobsSnapshot } from './provider-job-router.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-retry-test-'));
try{
  const job=createProviderJob(root,{provider:'external',projectId:'p-retry',sceneIndex:1,kind:'video',verifiedFree:true,maxAttempts:2});
  assert.equal(job.maxAttempts,2);

  let claimed=claimProviderJobs(root,{provider:'external',workerId:'w1'});
  assert.equal(claimed.length,1);
  assert.equal(claimed[0].attempts,1);
  let released=releaseProviderJob(root,job.id,'temporary provider error');
  assert.equal(released.status,'pending');

  claimed=claimProviderJobs(root,{provider:'external',workerId:'w2'});
  assert.equal(claimed.length,1);
  assert.equal(claimed[0].attempts,2);
  released=releaseProviderJob(root,job.id,'provider failed again');
  assert.equal(released.status,'failed');
  assert.equal(released.failedReason,'retry-exhausted');
  assert.equal(claimProviderJobs(root,{provider:'external'}).length,0);

  const leaseJob=createProviderJob(root,{provider:'external',projectId:'p-lease',sceneIndex:2,kind:'video',verifiedFree:true,maxAttempts:1});
  const leased=claimProviderJobs(root,{provider:'external',workerId:'lease-worker',leaseSeconds:30}).find(x=>x.id===leaseJob.id);
  assert.ok(leased);
  const target=path.join(root,'provider-jobs',`${leaseJob.id}.json`);
  const record=JSON.parse(fs.readFileSync(target,'utf8'));
  record.leaseUntil=new Date(Date.now()-1000).toISOString();
  fs.writeFileSync(target,JSON.stringify(record));
  reconcileProviderJobs(root);
  assert.equal(getProviderJob(root,leaseJob.id).status,'failed');
  assert.equal(providerJobsSnapshot(root).counts.failed,2);
  console.log('provider retry tests: ok');
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
