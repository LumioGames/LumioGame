import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPlayerHost } from './player-host.mjs';
import { parseLaunchArgs } from './launcher.mjs';
import { createHash } from 'node:crypto';

test('private diagnostic evidence preserves original JSON and rejects unsafe requests', { timeout: 5000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-private-evidence-'));
  writeFileSync(join(root, 'index.html'), '<script type="importmap">{}</script>');
  const evidenceDir = join(root, 'own-evidence');
  const { server, url } = await startPlayerHost({ root, evidenceDir, playerCount: 2, getLaunch: async () => { throw new Error('no account operation'); } });
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); rmSync(root, { recursive: true, force: true }); });
  const origin = new URL(url).origin;
  const endpoint = new URL('/api/player/evidence?player=A&kind=movement-trace&scene=movement-sync-preview&trace=movement', url);
  const raw = '{"version":2,"events":[],"capacity":300000,"truncated":false,"diagnosticFailures":0}\n';
  const send = (address = endpoint, body = raw, extra = {}) => fetch(address, { method: 'POST', headers: { Origin: origin, 'X-Lumio-Player': '1', 'Content-Type': 'application/json', ...extra }, body });
  const response = await send(); assert.equal(response.status, 201);
  const receipt = await response.json(); assert.equal(receipt.bytes, Buffer.byteLength(raw));
  assert.equal(receipt.sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(readFileSync(join(evidenceDir, receipt.file), 'utf8'), raw);
  assert.match(await (await fetch(url)).text(), /evidenceEndpoint/);
  assert.equal((await send(endpoint, raw, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await send(endpoint, raw, { 'X-Lumio-Player': '0' })).status, 403);
  assert.equal((await send(new URL(endpoint.href.replace('player=A', 'player=C')))).status, 400);
  assert.equal((await send(new URL(endpoint.href + '&file=../../escape.json'))).status, 400);
  assert.equal((await send(new URL(endpoint.href.replace('scene=movement-sync-preview', 'scene=ordinary')))).status, 400);
  assert.equal((await send(endpoint, '{"version":2,"events":[{"password":"forbidden"}]}')).status, 400);
  assert.equal((await send(endpoint, '{"version":2,"events":[],"credential":"forbidden"}')).status, 400);
  assert.equal((await send(endpoint, raw, { 'Content-Type': 'text/plain' })).status, 415);
  const witnessUrl = new URL(endpoint.href.replace('kind=movement-trace', 'kind=resource-witness'));
  const witness = JSON.stringify({ version: 1, arm: 'baseline', pageRunId: 'own-run', manifestDigest: 'a'.repeat(64), resources: [], coverage: { expected: 0 } });
  assert.equal((await send(witnessUrl, witness)).status, 201);
  const off = await startPlayerHost({ root, getLaunch: async () => ({}) });
  t.after(async () => { off.server.closeAllConnections(); await new Promise(done => off.server.close(done)); });
  assert.equal((await fetch(new URL('/api/player/evidence', off.url), { method: 'POST', body: raw })).status, 404);
});

test('player host freezes the explicitly selected client export and never serves server files', async t => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-config-host-'));
  const configDir = join(root, 'selected');
  mkdirSync(join(configDir, 'client'), { recursive: true });
  mkdirSync(join(configDir, 'server'));
  writeFileSync(join(root, 'index.html'), '<script src="./main.js"></script>');
  writeFileSync(join(configDir, 'manifest.json'), '{"endpoint":"client","projectionRoots":{"C":"client/manifest.json"}}');
  writeFileSync(join(configDir, 'client/manifest.json'), '{"tables":[]}');
  const original = Buffer.from('{"selected":"真实 profile + seed"}\r\n');
  writeFileSync(join(configDir, 'client/game.json'), original);
  writeFileSync(join(configDir, 'server/private.json'), 'private-server-only');
  const { server, url } = await startPlayerHost({ root, configDir, getLaunch: async () => { throw new Error('must not launch'); } });
  t.after(async () => {
    server.closeAllConnections(); await new Promise(done => server.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(join(configDir, 'client/game.json'), '{"changedAfterStart":true}');
  const endpoint = new URL('/api/game/config', url);
  const response = await fetch(endpoint);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { files } = await response.json();
  assert.deepEqual(Object.keys(files).sort(), ['client/game.json', 'client/manifest.json', 'manifest.json']);
  assert.deepEqual(Buffer.from(files['client/game.json'], 'base64'), original);
  assert.deepEqual(Buffer.from(files['manifest.json'], 'base64'), readFileSync(join(configDir, 'manifest.json')));
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 405);
  assert.equal((await fetch(new URL('/api/game/config/server/private.json', url))).status, 404);
  const head = await fetch(endpoint, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});

test('an explicit missing client export fails before starting a player host', async t => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-config-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'index.html'), '<script src="./main.js"></script>');
  await assert.rejects(startPlayerHost({ root, configDir: join(root, 'missing-export'), getLaunch: async () => ({}) }), /config|ENOENT/);
});

test('player mode reserves exactly one of the legacy eight slots for the browser', () => {
  const options = parseLaunchArgs(['--player', '--origin', 'http://127.0.0.1:18081'], {});
  assert.equal(options.bots, 7);
  assert.equal(options.startPlatform, false);
  assert.notEqual(options.spectatorLogin, options.loginPrefix + '1');
  for (const args of [['--bots', '8'], ['--admission-only'], ['--spectator']])
    assert.throws(() => parseLaunchArgs(['--player', ...args], {}), /player/);
  assert.equal(parseLaunchArgs(['--player', '--scenario-dll', 'scenario.dll'], {}).scenarioDll, 'scenario.dll');
});

test('player host mints a fresh ticket per request, never embeds it, and rejects foreign origins', async t => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-player-host-'));
  writeFileSync(join(root, 'index.html'), '<script type="importmap">{}</script><script src="./main.js"></script>');
  writeFileSync(join(root, 'main.js'), 'window.test = true;');
  let calls = 0;
  const { server, url, urls } = await startPlayerHost({ root, getLaunch: async () => ({ admissionCredential: `secret-${++calls}` }) });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  const page = await fetch(url);
  const html = await page.text();
  assert.deepEqual(urls, [url]);
  assert.match(html, /__lumioPlayerConfig/);
  assert.doesNotMatch(html, /secret-/);
  assert.equal(calls, 0);
  assert.match(await (await fetch(new URL('main.js', url))).text(), /window.test/);
  const endpoint = new URL('/api/player/launch', url);
  for (let n = 1; n <= 2; n++) {
    const response = await fetch(endpoint, { method: 'POST', headers: { Origin: new URL(url).origin, 'X-Lumio-Player': '1' } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { admissionCredential: `secret-${n}` });
  }
  assert.equal((await fetch(endpoint)).status, 405);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://foreign.example', 'X-Lumio-Player': '1' } })).status, 403);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { Origin: new URL(url).origin } })).status, 403);
  assert.equal((await fetch(new URL('/play/?player=B', url))).status, 400);
  assert.equal((await fetch(new URL('/api/player/launch?player=B', url),
    { method: 'POST', headers: { Origin: new URL(url).origin, 'X-Lumio-Player': '1' } })).status, 400);
  assert.equal(calls, 2);
});

test('two player pages route independent fresh tickets and read the current published HTML', async t => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-player-host-'));
  writeFileSync(join(root, 'index.html'), '<script type="importmap">{"old":true}</script>');
  const calls = [0, 0];
  const { server, url, urls } = await startPlayerHost({ root, playerCount: 2, getLaunch: async index =>
    ({ admissionCredential: `secret-${index}-${++calls[index]}` }) });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  assert.deepEqual(urls, [`${new URL(url).origin}/play/?player=A`, `${new URL(url).origin}/play/?player=B`]);
  assert.equal(url, urls[0]);
  writeFileSync(join(root, 'index.html'), '<script type="importmap">{"new":true}</script>');
  for (const [index, label] of ['A', 'B'].entries()) {
    const html = await (await fetch(urls[index])).text();
    assert.match(html, /"new":true/);
    assert.doesNotMatch(html, /"old":true|secret-/);
    assert.match(html, new RegExp(`label:"${label}",launchEndpoint:"/api/player/launch\\?player=${label}"`));
    const endpoint = new URL(`/api/player/launch?player=${label}`, url);
    for (let n = 1; n <= 2; n++) {
      const response = await fetch(endpoint, { method: 'POST', headers: { Origin: new URL(url).origin, 'X-Lumio-Player': '1' } });
      assert.deepEqual(await response.json(), { admissionCredential: `secret-${index}-${n}` });
    }
  }
  assert.deepEqual(calls, [2, 2]);
});

test('two player host rejects invalid labels and overlaps only for the same player', async t => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-player-host-'));
  writeFileSync(join(root, 'index.html'), '<script src="./main.js"></script>');
  const pending = new Map();
  const entered = [];
  let bothEntered;
  const ready = new Promise(resolve => { bothEntered = resolve; });
  const { server, url } = await startPlayerHost({ root, playerCount: 2, getLaunch: index => {
    entered.push(index);
    if (entered.length === 2) bothEntered();
    return new Promise(resolve => pending.set(index, resolve));
  } });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  const origin = new URL(url).origin;
  const launch = label => fetch(new URL(`/api/player/launch?player=${label}`, url),
    { method: 'POST', headers: { Origin: origin, 'X-Lumio-Player': '1' } });
  assert.equal((await fetch(new URL('/play/?player=C', url))).status, 400);
  assert.equal((await fetch(new URL('/?player=C', url))).status, 400);
  assert.equal((await fetch(new URL('/play/?player=A&player=B', url))).status, 400);
  assert.equal((await launch('C')).status, 400);
  assert.equal((await launch('A&player=B')).status, 400);
  const firstA = launch('A');
  const firstB = launch('B');
  await ready;
  assert.deepEqual(entered.sort(), [0, 1]);
  assert.equal((await launch('A')).status, 409);
  pending.get(0)({ admissionCredential: 'A' });
  pending.get(1)({ admissionCredential: 'B' });
  assert.deepEqual(await (await firstA).json(), { admissionCredential: 'A' });
  assert.deepEqual(await (await firstB).json(), { admissionCredential: 'B' });
});
