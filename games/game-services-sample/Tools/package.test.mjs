import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const tool = fileURLToPath(new URL('./package.mjs', import.meta.url));
const sdk = process.env.GAME_SAMPLE_BROWSER_SDK;
const pin = process.env.GAME_SAMPLE_BROWSER_SDK_MANIFEST_SHA256;
const contract = process.env.LUMIO_ENGINE_ROOT && path.join(process.env.LUMIO_ENGINE_ROOT, 'engine/wire/game-services-v1.json');
test('actual whole published SDK packs without source repositories', async () => {
  assert.ok(sdk && pin && contract, 'actual official SDK, external manifest pin and source contract are required; cannot skip');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sample-publish-'));
  try {
    const result = spawnSync(process.execPath, [tool, '--browser-sdk', sdk, '--manifest-sha256', pin, '--contract', contract, '--platform-origin', 'https://platform.example', '--out', path.join(temp, 'game')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await fs.readFile(path.join(temp, 'game/vendor/manifest.json')), await fs.readFile(path.join(sdk, 'manifest.json')));
    assert.deepEqual(await fs.readFile(path.join(temp, 'game/vendor/lumio/ai.js')), await fs.readFile(path.join(sdk, 'lumio/ai.js')));
    assert.equal(await fs.readFile(path.join(temp, 'game/Client/app.mjs'), 'utf8'), await fs.readFile(fileURLToPath(new URL('../Client/app.mjs', import.meta.url)), 'utf8'));
    const entry = await fs.readFile(path.join(temp, 'game/index.html'), 'utf8');
    assert.doesNotMatch(entry, /<base\b/i, 'formal isolated host uses base-uri none');
    assert.match(entry, /href="\.\/Client\/style\.css"/);
    assert.match(entry, /src="\.\/Client\/app\.mjs"/);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('missing WASM and changed bytes in actual published archive fail', async () => {
  assert.ok(sdk && pin && contract, 'actual official SDK inputs required');
  for (const attack of ['wasm', 'changed']) {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sample-corrupt-'));
    try {
      await fs.cp(sdk, path.join(temp, 'sdk'), { recursive: true });
      if (attack === 'wasm') await fs.unlink(path.join(temp, 'sdk/core/dist/lifecycle.wasm'));
      else await fs.appendFile(path.join(temp, 'sdk/lumio/adapter.mjs'), '\n// polluted');
      const result = spawnSync(process.execPath, [tool, '--browser-sdk', path.join(temp, 'sdk'), '--manifest-sha256', pin, '--contract', contract, '--platform-origin', 'https://platform.example', '--out', path.join(temp, 'game')], { encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /SDK (asset|dependency) invalid/);
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  }
});
