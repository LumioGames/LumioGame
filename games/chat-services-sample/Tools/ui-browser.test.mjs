import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { buildFixturePackage } from './package-test-helper.mjs';
const require = createRequire(import.meta.url);
if (!process.env.LUMIO_CHAT_PLAYWRIGHT?.trim()) throw Error('Set LUMIO_CHAT_PLAYWRIGHT to the installed Playwright module, and install its Chromium browser; see games/chat-services-sample/README.md. Browser tests never skip missing materials.');
let chromium;
try { ({ chromium } = require(process.env.LUMIO_CHAT_PLAYWRIGHT)); }
catch (error) { throw Error('LUMIO_CHAT_PLAYWRIGHT could not load. Supply an installed Playwright module as described in games/chat-services-sample/README.md.', { cause: error }); }

// This replaces app.mjs only in the test HTTP server. No fixture is included in the publication.
const fixture = `
import { createSession } from './session.mjs';
import { createChatView, createOperationTracker } from './view.mjs';
const label = document.createElement('span'); label.textContent = 'UI 夹具 · 非正式会话'; label.style.cssText = 'position:absolute;top:1px;right:4px;font-size:8px;color:#7b5b21'; document.querySelector('header').append(label);
const p = { playerId: 'fixture_player', anonymousName: '匿名玩家', consentRevision: 0, policyRevision: 1 };
let status = 'committed', intent;
const state = { revision: 1, schemaVersion: 'chat_v1', updatedAt: 1800000000000, view: { started: true, canSend: true, messageCount: 2, recent: ['你好，今天也一起积攒灵光 🌿', '[精灵:开心]'] } };
const calls = [];
const sdk = { unresolvedOperations: [], dispose() {}, setOnline() {}, async request(method, body) {
 calls.push({method, body});
 if (method === 'initialize') return {state, profile:p, epoch:{operationEpoch:'fixture_epoch',serverTime:1800000000000,expiresAt:1800000300000}};
 if (method === 'getState') return structuredClone(state);
 if (method === 'getProfile') return p;
 if (method === 'leaderboardTop') return { rows: [{rank:1,value:12,profile:p}] };
 if (method === 'performAction') { intent = body; if(status === 'committed') {state.view.messageCount++;state.view.recent.push(body.arguments.text);state.revision++;}
   if (status === 'pending') { sdk.unresolvedOperations.push({operationId:body.operationId,operationEpoch:body.operationEpoch}); view.invalidate(); session.invalidate(); }
   if (status === 'pending-begin') sdk.unresolvedOperations.push({operationId:body.operationId,operationEpoch:body.operationEpoch});
   return {status: status === 'pending-begin' ? 'pending' : status,error:{code:'fixture_rejected'}}; }
}, async recover() {if(status==='pending-begin'){state.view.started=true;state.view.canSend=true;state.revision++;sdk.unresolvedOperations.length=0;return {status:'committed'};} return {status:'pending'};} };
const operations = createOperationTracker(sdk);
const view = createChatView(document, sdk, operations), session = createSession(operations.sdk, value => view.render(value)); view.bind(session);
window.fixture = {session,calls,reject:()=>status='rejected',pending:()=>status='pending',partial:()=>{
 status='pending-begin'; view.invalidate();session.invalidate();state.view.started=false;state.view.canSend=false;
 session.reconcile({method:'getState',result:state});
},restoreProfile:()=>session.reconcile({method:'getProfile',result:p}),commit:()=>{
 const operation = sdk.unresolvedOperations[0]; sdk.unresolvedOperations.length=0;
 const event={method:'getOperation',operation,result:{status:'committed'}}; operations.reconcile(event); session.reconcile(event);
 state.view.messageCount++;state.view.recent.push(intent.arguments.text);state.revision++;
 session.reconcile({method:'getState',result:state});session.reconcile({method:'getProfile',result:p});
},empty:()=>{state.view.recent=[];session.reconcile({method:'getState',result:state})}};
await session.start();
`;
test('browser UI: compact layouts, real text safety, IME, stickers, draft rejection and reduced motion', async () => {
  const output = await buildFixturePackage(), screenshots = path.resolve('.sdd/floating-chat-ui-screenshots');
  await fs.mkdir(screenshots, { recursive: true });
  const server = http.createServer(async (request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (relative === 'Client/app.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(fixture); return; }
    try {
      const target = path.resolve(output, relative);
      if (!target.startsWith(output + path.sep)) throw Error('outside');
      const type = path.extname(target); response.setHeader('content-type', ({ '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.webp': 'image/webp' })[type] ?? 'application/octet-stream');
      response.end(await fs.readFile(target));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const errors = [], page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[390,426], [380,426], [378,278], [900,600]]) {
      await page.setViewportSize({ width, height }); await page.goto('http://127.0.0.1:' + server.address().port + '/');
      await page.locator('#box').waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.getElementById('send').disabled);
      const layout = await page.evaluate(() => ({ width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight,
        input:document.getElementById('box').getBoundingClientRect().toJSON(), send:document.getElementById('send').getBoundingClientRect().toJSON() }));
      assert.ok(layout.width <= width, `horizontal overflow ${width}: ${layout.width}`);
      assert.ok(layout.height <= height, `vertical shell overflow ${height}: ${layout.height}`);
      assert.ok(layout.input.bottom <= height && layout.send.bottom <= height && layout.send.width >= 44);
      await page.screenshot({ path: path.join(screenshots, `${width}x${height}.png`) });
      await page.locator('#ranks').click(); await page.locator('#rows').getByText('12 条').waitFor();
      await page.screenshot({ path: path.join(screenshots, `${width}x${height}-ranks.png`) });
    }
    await page.setViewportSize({width:390,height:426}); await page.goto('http://127.0.0.1:' + server.address().port + '/Client/index.html');
    await page.waitForFunction(() => !!window.fixture);
    await page.locator('#box').fill('输入法草稿');
    await page.locator('#box').dispatchEvent('keydown', { key:'Enter',isComposing:true });
    assert.equal(await page.locator('#box').inputValue(), '输入法草稿');
    await page.locator('#emoji').click(); await page.locator('#stickers').getByRole('button', {name:'挥手'}).click();
    assert.match(await page.locator('#box').inputValue(), /\[精灵:挥手\]/);
    await page.locator('#send').click(); await page.waitForFunction(() => document.getElementById('box').value === '');
    assert.equal(await page.locator('#msgs .sticker').count(), 2);
    await page.locator('#box').fill('<img src=x onerror=alert(1)> مرحبا🌿'); await page.locator('#send').click();
    await page.waitForFunction(() => document.getElementById('box').value === '');
    assert.equal(await page.locator('#msgs .bubble img').count(), 0);
    assert.match(await page.locator('#msgs').textContent(), /<img src=x onerror=alert\(1\)> مرحبا🌿/);
    await page.evaluate(() => window.fixture.reject()); await page.locator('#box').fill('拒绝后留在输入框'); await page.locator('#send').click();
    await page.waitForFunction(() => !document.getElementById('send').disabled);
    assert.equal(await page.locator('#box').inputValue(), '拒绝后留在输入框'); assert.match(await page.locator('#message').textContent(), /fixture_rejected/);
    for (const edited of [false, true]) {
      await page.evaluate(() => window.fixture.pending());
      await page.locator('#box').fill('资料更新中的原草稿'); await page.locator('#send').click();
      await page.waitForFunction(() => window.fixture.session.current.profile === null);
      assert.equal(await page.locator('#box').inputValue(), '资料更新中的原草稿');
      if (edited) await page.locator('#box').evaluate(el => { el.value = '后来编辑的新草稿'; });
      await page.evaluate(() => window.fixture.commit());
      assert.equal(await page.locator('#box').inputValue(), edited ? '后来编辑的新草稿' : '');
      assert.equal(await page.locator('#recover').isHidden(), true);
      await page.waitForFunction(() => !document.getElementById('send').disabled);
    }
    await page.evaluate(() => window.fixture.partial());
    assert.equal(await page.locator('#begin').isVisible(), true);
    assert.equal(await page.locator('#begin').isDisabled(), true);
    const writes = await page.evaluate(() => window.fixture.calls.filter(call => call.method === 'performAction').length);
    await page.locator('#begin').evaluate(el => el.onclick());
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call.method === 'performAction').length), writes);
    await page.evaluate(() => window.fixture.restoreProfile());
    assert.equal(await page.locator('#begin').isDisabled(), false);
    await page.locator('#begin').click();
    await page.waitForFunction(() => window.fixture.session.current.view.started && !window.fixture.session.current.pending.length);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call.method === 'performAction').length), writes + 1);
    const position = await page.locator('.header-spirit').evaluate(el => getComputedStyle(el).backgroundPosition);
    await page.waitForFunction(previous => getComputedStyle(document.querySelector('.header-spirit')).backgroundPosition !== previous, position, { timeout: 1500 });
    await page.emulateMedia({reducedMotion:'reduce'}); await page.evaluate(() => window.fixture.empty());
    assert.equal(await page.locator('.empty-state .spirit').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.screenshot({ path:path.join(screenshots,'390x426-empty-reduced-motion.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(output, {recursive:true,force:true}); }
});
