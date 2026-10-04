import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

// Run the release entrypoint against deterministic command doubles so both
// invocation and propagation of a failed production preflight are checked.
test('release gate invokes production preflight and stops on its failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'viral-release-gate-'));
  try {
    for (const dir of ['scripts', 'app', 'python', 'hermes', 'bin']) await mkdir(path.join(root, dir));
    await cp(new URL('./release-check.sh', import.meta.url), path.join(root, 'scripts/release-check.sh'));
    await writeFile(path.join(root, 'provider-registry.json'), '[]');
    const log = path.join(root, 'calls');
    await writeFile(path.join(root, 'scripts/production-runtime-preflight.test.sh'), 'echo preflight >> "$RELEASE_TEST_LOG"\nexit 37\n');
    for (const name of ['node', 'python3', 'npm', 'docker', 'git']) {
      const stub = path.join(root, 'bin', name);
      await writeFile(stub, '#!/bin/sh\nexit 0\n');
      await chmod(stub, 0o755);
    }
    const result = spawnSync('bash', [path.join(root, 'scripts/release-check.sh')], {
      env: { ...process.env, PATH: path.join(root, 'bin') + ':' + process.env.PATH, RELEASE_TEST_LOG: log }, encoding: 'utf8',
    });
    assert.equal(await readFile(log, 'utf8'), 'preflight\n');
    assert.equal(result.status, 37, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /release-check: ok/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
