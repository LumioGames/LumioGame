// Explicit module integration fixture: real browser/SDK/adapter/WASM and captured real R rule results.
// This scripted HTTP fixture does not implement or certify Platform persistence, authentication or atomicity.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const arg = name => { const i = process.argv.indexOf(name); if (i < 0) throw Error(`${name} required`); return process.argv[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(arg('--out')), engine = path.resolve(arg('--engine-sdk')), platform = path.resolve(arg('--platform-sdk'));
const evidence = JSON.parse(await fs.readFile(arg('--host-evidence')));
const wire = JSON.parse(await fs.readFile(path.join(engine, 'engine/wire/game-services-v1.json')));
if (evidence.Evidence.ContractDigest !== (await import(pathToFileURL(path.join(engine, 'engine/browser/game-services/dist/runtime-contract.mjs')).href)).default.contractSha256) throw Error('Host and SDK contract mismatch');
const nativeCase = id => evidence.cases.find(x => x.id === id).response;
const views = [nativeCase('project_empty').result.view, nativeCase('evaluate_begin').decision.view, nativeCase('evaluate_claim').decision.view, nativeCase('evaluate').decision.view];
const calls = [], browserErrors = []; let phase = 0, permission = 'undecided', chosen = null;
const gameId = '91d25d0c-9b87-4c34-9c47-19b779b10001', now = 1800000000000;
const profile = () => ({ playerId: 'guest_1', anonymousName: '匿名探险家', consentRevision: permission === 'undecided' ? 0 : 1, policyRevision: 1, ...(permission === 'allow' ? { displayName: '远征者' } : {}) });
const epoch = { operationEpoch: 'epoch_1', serverTime: now, expiresAt: now + 300000 };
const state = () => ({ revision: phase, schemaVersion: 'expedition_v2', updatedAt: now, view: views[phase] });
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
let gameOrigin, parentOrigin;
async function staticFile(url, res) {
  const candidate = path.resolve(output, 'publication', '.' + decodeURIComponent(url));
  if (!candidate.startsWith(path.resolve(output, 'publication') + path.sep)) { res.writeHead(404).end(); return; }
  const bytes = await fs.readFile(candidate);
  res.writeHead(200, { 'Content-Type': ({ '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' })[path.extname(candidate)] ?? 'application/octet-stream' }); res.end(bytes);
}
const gameServer = http.createServer((req, res) => staticFile(new URL(req.url, 'http://local').pathname, res).catch(() => res.writeHead(404).end()));
const parentServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html lang="zh"><meta charset="utf-8"><title>模块联调父容器</title><body style="margin:0;background:#101e20;color:white;font-family:system-ui"><p>受控模块联调 · 非正式平台数据库</p><button id="settings">平台资料授权</button><section id="permission" hidden>允许共享昵称头像？<button id="allow">允许</button><button id="deny">拒绝，匿名继续</button></section><section id="binding" hidden></section><iframe id="game" title="林间远征" style="border:0;width:100%;height:1000px"></iframe><script type="module" src="/parent.mjs"></script></body></html>'); return; }
    if (url.pathname === '/parent.mjs') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(parentScript()); return; }
    if (req.method !== 'POST') { await staticFile(url.pathname, res); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    const operation = Object.entries(wire.operations).find(([, op]) => op.binding === 'POST ' + url.pathname || op.binding?.replace('{gameId}', gameId).replace('{environment}', 'test') === 'POST ' + url.pathname)?.[0];
    calls.push({ operation: operation ?? 'settings_action', body });
    if (url.pathname.endsWith('/settings-action')) { res.writeHead(204, { 'X-Lumio-Settings-Action': 'local_probe_setting' }).end(); return; }
    if (operation === 'session_create') return json(res, { credential: 'local-probe-not-a-real-credential', expiresAt: now + 300000, playerId: 'guest_1', gameId, environment: 'test', releaseId: 'expedition_2', ruleVersion: 'expedition_v2' });
    if (operation === 'permission_get') return json(res, { gameId, environment: 'test', gameTitle: '林间远征', consentRevision: profile().consentRevision, policyRevision: 1, fields: [{ fieldId: 'profile.display_name', sensitivity: 2, semanticRevision: 1, purposes: ['game_display'], decision: permission }], prompt: permission === 'undecided' || body.mode === 'settings' ? { promptId: 'local_prompt', expiresAt: now + 300000, fieldIds: ['profile.display_name'] } : null });
    if (operation === 'permission_decide') { permission = body.choice; return json(res, { consentRevision: 1, policyRevision: 1, profile: profile() }); }
    if (operation === 'initialize') return json(res, { playerId: 'guest_1', gameId, environment: 'test', releaseId: 'expedition_2', ruleVersion: 'expedition_v2', profile: profile(), state: state(), capabilities: wire.schemas.InitializeResult.properties.capabilities.items.enum, epoch, eventCapabilities: ['profile_changed', 'identity_changed', 'services_unavailable'] });
    if (operation === 'state_get') return json(res, state());
    if (operation === 'profile_get') return json(res, profile());
    if (operation === 'action_perform') {
      assert.equal(body.expectedRevision, phase); assert.equal(body.operationEpoch, 'epoch_1');
      assert.equal(body.action, ['begin', 'claim_supplies', 'explore'][phase]);
      assert.deepEqual(body.arguments, phase === 2 ? { route: 'ridge' } : {});
      phase++; return json(res, { status: 'committed', operationId: body.operationId, operationEpoch: body.operationEpoch, committedAt: now, revision: phase, result: views[phase] });
    }
    if (operation === 'leaderboard_top') return json(res, { boardId: 'expedition_best', seasonId: 'all_time', snapshotId: 'rank_1', readAt: now, expiresAt: now + 60000, rows: [{ rank: 1, playerId: 'guest_1', value: views[3].bestScore, achievedAt: now, profile: profile() }], nextCursor: null });
    if (operation === 'binding_get') {
      if (chosen) return json(res, { bindingId: 'bind_1', status: 'bound', playerId: 'account_1', stateRevision: 4, restartRequired: true, operationReceipt: null });
      const candidate = (reference, revision) => ({ reference, revision, updatedAt: now, summary: { stateExists: true }, profile: profile() });
      return json(res, { bindingId: 'bind_1', status: 'selection_required', source: candidate('source_ref', 3), target: candidate('target_ref', 1), operationReceipt: null, choiceEpoch: { ...epoch, operationEpoch: 'choice_epoch' } });
    }
    if (operation === 'binding_choose') { chosen = body; return json(res, { status: 'committed', ...body.operation, committedAt: now, revision: 4, result: {} }); }
    return json(res, { code: 'gs_capability_unavailable' }, 400);
  } catch (error) { browserErrors.push(String(error)); json(res, { code: 'gs_invalid_request' }, 400); }
});
function parentScript() { return `
import * as runtime from '/vendor/engine/src/index.mjs';
import { createLumioAdapter } from '/vendor/lumio/adapter.mjs';
const frame=document.querySelector('#game'), section=document.querySelector('#permission'); let bridge;
const adapter=createLumioAdapter({runtime, launch:{gameId:${JSON.stringify(gameId)},environment:'test',releaseId:'expedition_2',runtimeOrigin:${JSON.stringify(gameOrigin)},entryUrl:${JSON.stringify(gameOrigin + '/Client/index.html')}},platformOrigin:${JSON.stringify(parentOrigin)},containerId:'probe_container',documentId:'probe_document',csrf:async()=> 'local_probe_csrf',
showPermissions:()=>new Promise(resolve=>{section.hidden=false;for(const choice of ['allow','deny'])document.querySelector('#'+choice).onclick=()=>{section.hidden=true;resolve(choice)}}),
onLogin:async()=>({bindingId:'bind_1'}),onRestart:()=>bridge.invalidateDisclosure({type:'identity_changed'}),onDisclosure:event=>bridge?.invalidateDisclosure(event),
onBinding:selection=>{const box=document.querySelector('#binding');box.hidden=false;box.replaceChildren();for(const c of [selection.source,selection.target]){const b=document.createElement('button');b.id='choose_'+c.reference;b.textContent='选择'+c.reference+' / 服务器修订'+c.revision;b.onclick=()=>adapter.choose(c.reference);box.append(b)}}});
await adapter.open();
bridge=await runtime.createParentBridge({frameWindow:frame.contentWindow,frameOrigin:${JSON.stringify(gameOrigin)},containerSessionId:'probe_document',wasm:await(await fetch('/vendor/engine/dist/lifecycle.wasm')).arrayBuffer(),execute:adapter.execute});
document.querySelector('#settings').onclick=async event=>{await bridge.openPermissions(event);bridge.permissionsClosed()};
frame.src=${JSON.stringify(gameOrigin + '/Client/index.html#lumioContainer=probe_document')};
`; }
await new Promise(resolve => parentServer.listen(0, '127.0.0.1', resolve));
await new Promise(resolve => gameServer.listen(0, '127.0.0.1', resolve));
parentOrigin = `http://127.0.0.1:${parentServer.address().port}`; gameOrigin = `http://127.0.0.1:${gameServer.address().port}`;
await fs.mkdir(output, { recursive: true });
let browser;
try {
  execFileSync(process.execPath, [path.join(here, 'package.mjs'), '--engine-sdk', engine, '--platform-sdk', platform, '--platform-origin', parentOrigin, '--out', path.join(output, 'publication')]);
  const require = createRequire(path.resolve(arg('--playwright-package'))), { chromium } = require('@playwright/test');
  browser = await chromium.launch({ executablePath: arg('--chromium'), headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  page.on('pageerror', error => browserErrors.push(String(error)));
  await page.goto(parentOrigin); await page.locator('#deny').click();
  const game = page.frameLocator('#game');
  await game.locator('#begin').click(); await game.locator('#claim').click(); await game.locator('#ridge').click();
  await game.locator('#supplies').filter({ hasText: '2' }).waitFor();
  assert.equal(await game.locator('#player').textContent(), '匿名探险家');
  await game.locator('#ranks').click(); await game.locator('#rows li').waitFor();
  assert.match(await game.locator('#rows').textContent(), /匿名探险家/);
  const actionCount = calls.filter(x => x.operation === 'action_perform').length;
  await game.locator('#trial').click(); await game.locator('#river').click(); await game.locator('#ridge').click();
  assert.equal(calls.filter(x => x.operation === 'action_perform').length, actionCount);
  await game.locator('#reconnect').click(); await game.locator('#mode').filter({ hasText: '正式云存档' }).waitFor();
  assert.equal(await game.locator('#supplies').textContent(), '2');
  await game.locator('#ranks').click(); await game.locator('#rows li').waitFor();
  await page.screenshot({ path: path.join(output, 'anonymous-official.png'), fullPage: true });
  await game.locator('#login').click(); await page.locator('#choose_target_ref').click();
  await game.locator('#mode').filter({ hasText: '请重新打开' }).waitFor();
  assert.equal(chosen.selectedReference, 'target_ref'); assert.equal(chosen.operation.operationEpoch, 'choice_epoch');
  assert.equal(await game.locator('#player').textContent(), '匿名探险家'); assert.equal(await game.locator('#supplies').textContent(), '—');
  assert.deepEqual(browserErrors, []);
  await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify({ scope: 'Chromium + actual S SDK/adapter/production WASM, scripted HTTP using real R captured candidates; not Platform DB/E2E acceptance', cases: ['profile-denied-playable', 'begin-claim-explore', 'server-rank-anonymous', 'offline-no-upload', 'reconnect-reload', 'parent-two-candidate-choice', 'retired-document-clears-view'], calls, contract: evidence.Evidence.ContractDigest, nativeEvidence: path.resolve(arg('--host-evidence')) }, null, 2));
  console.log(JSON.stringify({ passed: 7, output }));
} finally { await browser?.close(); parentServer.closeAllConnections(); gameServer.closeAllConnections(); await Promise.all([new Promise(resolve => parentServer.close(resolve)), new Promise(resolve => gameServer.close(resolve))]); }
