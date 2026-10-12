import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../Client/session.mjs';

const ui = await import('../Client/view.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const profile = { playerId: 'player_a', anonymousName: '匿名玩家', consentRevision: 1, policyRevision: 2 };
function fixture({ status = 'committed', started = true, settleAfter = 1, fail = false, otherSessionSend = false,
  recoveryStatus = 'committed', unresolvedStatus = 'pending', invalidateOnSend = false } = {}) {
  let controller, count = 0, recoveries = 0;
  const calls = [], cleared = [], notices = [], busy = [];
  const state = { revision: 1, schemaVersion: 'chat_v1', updatedAt: 1800000000000,
    view: { started, canSend: started, messageCount: 0, recent: [] } };
  let intent;
  const commit = () => {
    if (intent.action === 'begin') { state.view.started = true; state.view.canSend = true; }
    else { state.view.messageCount++; state.view.recent.push(intent.arguments.text); }
    state.revision++;
  };
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {},
    async request(method, body) {
      calls.push({ method, body });
      if (method === 'initialize') return { state, profile, epoch: { operationEpoch: 'epoch_1', serverTime: 1800000000000, expiresAt: 1800000300000 } };
      if (method === 'getState') return structuredClone(state);
      if (method === 'getProfile') return profile;
      if (method === 'performAction') {
        count++; intent = body;
        if (fail) throw Error('network failure');
        if (status === 'committed') commit();
        if (otherSessionSend) { state.view.messageCount++; state.view.recent.push('其他会话的消息'); }
        if (status === 'pending' || status === 'unknown') sdk.unresolvedOperations.push({ operationId: body.operationId, operationEpoch: body.operationEpoch });
        if (invalidateOnSend) { controller.invalidate(); session.invalidate(); }
        if (status === 'unknown') throw Object.assign(Error('unknown'), { unknown: true });
        return { status, error: status === 'rejected' ? { code: 'rejected_by_rule' } : undefined };
      }
    },
    async recover(operation) {
      calls.push({ method: 'recover', body: operation }); recoveries++;
      if (recoveries >= settleAfter) {
        if (recoveryStatus === 'committed') commit();
        sdk.unresolvedOperations.length = 0; return { status: recoveryStatus, error: recoveryStatus === 'rejected' ? { code: 'recovery_rejected' } : undefined };
      }
      return { status: unresolvedStatus };
    },
  };
  assert.equal(typeof ui.createOperationTracker, 'function', 'exact SDK operation receipt must be observed');
  const operations = ui.createOperationTracker(sdk);
  const session = createSession(operations.sdk, value => controller?.observe(value));
  assert.equal(typeof ui.createChatController, 'function', 'automatic confirmation controller is required');
  controller = ui.createChatController(session, { operations, notify: value => notices.push(value), clearDraft: value => cleared.push(value),
    onBusy: value => busy.push(value), delay: async () => {} });
  return { session, controller, operations, state, sdk, calls, cleared, notices, busy, count: () => count };
}

test('confirmed Unicode send automatically recovers once and only then clears its draft', async () => {
  const f = fixture(); await f.session.start();
  assert.equal(await f.controller.submit('  你好🌿 مرحبا  '), true);
  assert.deepEqual(f.cleared, ['你好🌿 مرحبا']);
  assert.deepEqual(f.calls.filter(x => x.method === 'performAction').map(x => x.body.arguments), [{ text: '你好🌿 مرحبا' }]);
  assert.equal(f.calls.filter(x => x.method === 'getState').length, 2);
  assert.deepEqual(f.busy, [true, false]);
});
test('rejected action returns void but must retain draft and report rejection', async () => {
  const f = fixture({ status: 'rejected' }); await f.session.start();
  assert.equal(await f.controller.submit('保留我'), false); assert.deepEqual(f.cleared, []);
  assert.match(f.notices.at(-1), /拒绝|rejected/); assert.equal(f.count(), 1);
});
test('another same-identity session count increase never confirms this rejected operation', async () => {
  const f = fixture({ status: 'rejected', otherSessionSend: true }); await f.session.start();
  assert.equal(await f.controller.submit('本次被拒绝'), false); assert.deepEqual(f.cleared, []);
  assert.equal(f.session.current.view.messageCount, 1); assert.match(f.notices.at(-1), /拒绝|rejected/);
});
test('pending is queried with bounded delays without sending another action', async () => {
  const f = fixture({ status: 'pending', settleAfter: 3 }); await f.session.start();
  assert.equal(await f.controller.submit('等待确认'), true);
  assert.equal(f.count(), 1); assert.equal(f.calls.filter(x => x.method === 'recover').length, 3);
  assert.equal(new Set(f.calls.filter(x => x.method === 'recover').map(x => x.body.operationId)).size, 1);
});
test('long pending retains draft and blocks repeated send until manual confirmation', async () => {
  const f = fixture({ status: 'pending', settleAfter: 5 }); await f.session.start();
  assert.equal(await f.controller.submit('待查询'), false); assert.deepEqual(f.cleared, []);
  assert.equal(await f.controller.submit('待查询'), false); assert.equal(f.count(), 1);
  assert.match(f.notices.at(-1), /未确认|查询/);
  assert.equal(await f.controller.recover(), true); assert.deepEqual(f.cleared, ['待查询']);
});
test('unknown network outcome recovers original operation before clearing', async () => {
  const f = fixture({ status: 'unknown' }); await f.session.start();
  assert.equal(await f.controller.submit('不知道结果'), true); assert.equal(f.count(), 1);
});
test('recovery rejection stays visible after session refresh and other-session count increase', async () => {
  const f = fixture({ status: 'pending', recoveryStatus: 'rejected', otherSessionSend: true }); await f.session.start();
  assert.equal(await f.controller.submit('原操作被拒绝'), false); assert.deepEqual(f.cleared, []);
  assert.match(f.notices.at(-1), /recovery_rejected/); assert.equal(f.count(), 1);
});
test('not_found remains unresolved and never emits a new performAction', async () => {
  const f = fixture({ status: 'unknown', settleAfter: 99, unresolvedStatus: 'not_found' }); await f.session.start();
  assert.equal(await f.controller.submit('未知结果'), false); assert.deepEqual(f.cleared, []);
  assert.match(f.notices.at(-1), /not_found/);
  await f.controller.submit('未知结果'); assert.equal(f.count(), 1);
});
test('failed transport retains draft', async () => {
  const f = fixture({ fail: true }); await f.session.start();
  assert.equal(await f.controller.submit('网络失败'), false); assert.deepEqual(f.cleared, []);
});
test('begin also automatically confirms authoritative started state', async () => {
  const f = fixture({ status: 'pending', started: false }); await f.session.start();
  assert.equal(await f.controller.begin(), true); assert.equal(f.session.current.view.started, true);
  assert.deepEqual(f.cleared, []);
});
test('concurrent double click emits only one operation', async () => {
  const f = fixture(); await f.session.start();
  const first = f.controller.submit('同一条'); const second = f.controller.submit('同一条');
  await Promise.all([first, second]); assert.equal(f.count(), 1); assert.equal(f.cleared.length, 1);
});
test('offline change stops recovery and never clears a previously submitted draft', async () => {
  const f = fixture({ status: 'pending', settleAfter: 99 }); await f.session.start();
  f.sdk.recover = async () => { f.session.offline(); return { status: 'pending' }; };
  assert.equal(await f.controller.submit('原身份'), false); assert.deepEqual(f.cleared, []);
  assert.equal(f.session.current.mode, 'trial'); assert.equal(f.count(), 1);
});
test('local trial accepts Unicode without performing official actions', async () => {
  const f = fixture(); await f.session.start(); f.session.offline();
  assert.equal(await f.controller.submit('🌱 离线'), true); assert.equal(f.count(), 0);
  assert.deepEqual(f.session.current.view.recent, ['🌱 离线']);
});
test('IME and shifted Enter never submit', () => {
  assert.equal(typeof ui.shouldSubmitKey, 'function');
  for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'Enter', shiftKey: true }, { key: 'a' }]) assert.equal(ui.shouldSubmitKey(event), false);
  assert.equal(ui.shouldSubmitKey({ key: 'Enter' }), true);
});
test('only known fixed stickers parse; unknown markup and links stay plain text', () => {
  assert.equal(typeof ui.messageParts, 'function');
  assert.deepEqual(ui.messageParts('你好[精灵:开心]🌿'), [{ text: '你好' }, { sticker: '开心', frame: 5 }, { text: '🌿' }]);
  assert.deepEqual(ui.messageParts('<img src=x onerror=alert(1)>[精灵:未知]https://x/p.webp'), [{ text: '<img src=x onerror=alert(1)>[精灵:未知]https://x/p.webp' }]);
});

test('anonymous profile never requests an avatar', async () => {
  assert.equal(typeof ui.createAvatarCache, 'function');
  let calls = 0; const cache = ui.createAvatarCache({ request() { calls++; } });
  cache.project([profile]); assert.equal(cache.url(profile), null); await Promise.resolve(); assert.equal(calls, 0);
});
test('authorized avatar uses real resource contract and caches within its projection', async () => {
  assert.equal(typeof ui.createAvatarCache, 'function');
  const p = { ...profile, avatarResourceId: 'avatar_a' }; const calls = [];
  const cache = ui.createAvatarCache({ async request(method, body) { calls.push({ method, body }); return { resourceId: 'avatar_a', mimeType: 'image/webp', bytesBase64: 'YWJjZA==', consentRevision: 1, policyRevision: 2 }; } });
  cache.project([p]); await new Promise(resolve => setImmediate(resolve)); cache.project([p]);
  assert.equal(cache.url(p), 'data:image/webp;base64,YWJjZA==');
  assert.deepEqual(calls, [{ method: 'getAvatar', body: { resourceId: 'avatar_a' } }]);
});
test('late avatar after revoked consent cannot display or populate cache', async () => {
  assert.equal(typeof ui.createAvatarCache, 'function');
  let finish; const p = { ...profile, avatarResourceId: 'avatar_a' };
  const cache = ui.createAvatarCache({ request: () => new Promise(resolve => { finish = resolve; }) });
  cache.project([p]); cache.invalidate(); cache.project([profile]);
  finish({ resourceId: 'avatar_a', mimeType: 'image/webp', bytesBase64: 'YWJjZA==', consentRevision: 1, policyRevision: 2 });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cache.url(p), null);
});
test('mismatched revisions, resource, or MIME never display', async () => {
  assert.equal(typeof ui.createAvatarCache, 'function');
  const p = { ...profile, avatarResourceId: 'avatar_a' };
  for (const patch of [{ consentRevision: 2 }, { policyRevision: 3 }, { resourceId: 'other' }, { mimeType: 'image/svg+xml' }]) {
    const cache = ui.createAvatarCache({ async request() { return { resourceId: 'avatar_a', mimeType: 'image/webp', bytesBase64: 'YWJjZA==', consentRevision: 1, policyRevision: 2, ...patch }; } });
    cache.project([p]); await new Promise(resolve => setImmediate(resolve)); assert.equal(cache.url(p), null);
  }
});
test('same resource cannot carry avatar across different players or authorization revisions', async () => {
  assert.equal(typeof ui.createAvatarCache, 'function');
  let finish; const p = { ...profile, avatarResourceId: 'avatar_a' };
  const cache = ui.createAvatarCache({ request: () => new Promise(resolve => { finish ??= resolve; }) });
  cache.project([p]); const replacement = { ...p, playerId: 'player_b', consentRevision: 2 }; cache.project([replacement]);
  finish({ resourceId: 'avatar_a', mimeType: 'image/webp', bytesBase64: 'YWJjZA==', consentRevision: 1, policyRevision: 2 });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cache.url(p), null); assert.equal(cache.url(replacement), null);
});
test('SDK automatic reconciliation updates only the matching exact operation receipt', async () => {
  const record = { operationId: 'op_a', operationEpoch: 'epoch_a' };
  const tracker = ui.createOperationTracker({ async request() { return { status: 'pending' }; } });
  await tracker.sdk.request('performAction', record);
  assert.equal(typeof tracker.reconcile, 'function');
  tracker.reconcile({ method: 'getOperation', operation: { ...record, operationId: 'op_b' }, result: { status: 'committed' } });
  assert.equal(tracker.current.status, 'pending');
  tracker.reconcile({ method: 'getOperation', operation: record, result: { status: 'rejected', error: { code: 'chat_rejected' } } });
  assert.equal(tracker.current.status, 'rejected'); assert.equal(tracker.current.error.code, 'chat_rejected');
});

async function invalidatedSend(invalidateOnSend = false) {
  const f = fixture({ status: 'pending', settleAfter: 99, invalidateOnSend }); await f.session.start();
  await f.controller.submit('资料变更期间的原草稿');
  // The view invalidates the UI recovery loop before the session removes its profile projection.
  if (!invalidateOnSend) { f.controller.invalidate(); f.session.invalidate(); }
  const operation = { ...f.sdk.unresolvedOperations[0] };
  f.reconcile = (method, result, ref = operation) => {
    const event = { method, result, operation: ref };
    f.operations.reconcile(event); f.session.reconcile(event);
  };
  f.commit = () => {
    f.sdk.unresolvedOperations.length = 0;
    f.reconcile('getOperation', { status: 'committed' });
    f.reconcile('getState', { ...f.state, revision: 2, view: { ...f.state.view,
      messageCount: 1, recent: ['资料变更期间的原草稿'] } });
  };
  return f;
}
test('same-player profile invalidation finalizes original draft after automatic exact-operation and authoritative projection reconciliation', async () => {
  const f = await invalidatedSend(); f.commit();
  assert.deepEqual(f.cleared, [], 'null profile cannot prove the original player');
  f.reconcile('getProfile', { ...profile, consentRevision: 2 });
  assert.deepEqual(f.cleared, ['资料变更期间的原草稿']);
  assert.equal(f.session.current.pending.length, 0); assert.equal(f.session.current.view.canSend, true);
  f.reconcile('getProfile', profile); assert.equal(f.cleared.length, 1);
  assert.equal(f.count(), 1, 'automatic reconciliation must never resend');
});
test('manual recovery after same-player invalidation also finalizes the original draft', async () => {
  const f = await invalidatedSend();
  f.sdk.recover = async () => {
    f.sdk.unresolvedOperations.length = 0;
    f.state.view.messageCount = 1; f.state.view.recent = ['资料变更期间的原草稿'];
    return { status: 'committed' };
  };
  assert.equal(await f.controller.recover(), true);
  assert.deepEqual(f.cleared, ['资料变更期间的原草稿']); assert.equal(f.count(), 1);
});
test('in-flight invalidation stops the old loop while preserving original operation metadata for automatic confirmation', async () => {
  const f = await invalidatedSend(true);
  assert.equal(f.calls.filter(call => call.method === 'recover').length, 0);
  f.reconcile('getProfile', profile); f.commit();
  assert.deepEqual(f.cleared, ['资料变更期间的原草稿']); assert.equal(f.count(), 1);
});
test('committed receipt without the original message in the authoritative projection retains the draft', async () => {
  const f = await invalidatedSend();
  f.sdk.unresolvedOperations.length = 0;
  f.reconcile('getOperation', { status: 'committed' });
  f.reconcile('getState', { ...f.state, view: { ...f.state.view, messageCount: 1, recent: ['其他会话消息'] } });
  f.reconcile('getProfile', profile); assert.deepEqual(f.cleared, []);
});
test('getState before revalidated getProfile blocks begin, then same-player profile permits automatic begin recovery', async () => {
  const f = fixture({ status: 'pending', started: false }); await f.session.start();
  f.controller.invalidate(); f.session.invalidate();
  f.session.reconcile({ method: 'getState', result: f.state });
  assert.equal(f.session.current.profile, null); assert.equal(f.session.current.view.started, false);
  assert.equal(await f.controller.begin(), false, 'writes wait for an authoritative player projection');
  assert.equal(f.count(), 0);
  f.session.reconcile({ method: 'getProfile', result: profile });
  assert.equal(await f.controller.begin(), true);
  assert.equal(f.count(), 1); assert.equal(f.calls.filter(call => call.method === 'recover').length, 1);
  assert.equal(f.session.current.view.started, true); assert.equal(f.session.current.pending.length, 0);
});
for (const change of ['different player', 'cancel', 'offline', 'retired']) {
  test(`profile invalidation followed by ${change} never clears the old player draft`, async () => {
    const f = await invalidatedSend();
    if (change === 'cancel') f.controller.cancel();
    if (change === 'offline') f.session.offline();
    if (change === 'retired') f.session.invalidate(true);
    if (change === 'different player') f.reconcile('getProfile', { ...profile, playerId: 'player_b' });
    f.commit(); f.reconcile('getProfile', profile);
    assert.deepEqual(f.cleared, []); assert.equal(f.count(), 1);
  });
}
test('same-player reconciliation with wrong operation epoch never clears the draft', async () => {
  const f = await invalidatedSend();
  f.sdk.unresolvedOperations.length = 0;
  f.reconcile('getOperation', { status: 'committed' }, { ...f.operations.current, operationEpoch: 'other_epoch' });
  f.reconcile('getState', { ...f.state, view: { ...f.state.view, messageCount: 1, recent: ['资料变更期间的原草稿'] } });
  f.reconcile('getProfile', profile); assert.deepEqual(f.cleared, []);
});
