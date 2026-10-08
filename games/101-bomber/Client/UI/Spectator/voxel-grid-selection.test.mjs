import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('real voxel WASM tests reject an invalid explicit candidate without falling back', () => {
  const candidate = path.join(fileURLToPath(new URL('.', import.meta.url)), 'missing-review-candidate');
  const env = { ...process.env, LUMIO_ENGINE_CANDIDATE_ROOT: candidate };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./voxel-grid.test.mjs', import.meta.url))], {
    env, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(child.error, undefined);
  assert.notEqual(child.status, 0, child.stdout + child.stderr);
  assert.ok((child.stdout + child.stderr).includes('missing-review-candidate'), 'Failure must identify the selected candidate, not a fallback artifact.');
});
