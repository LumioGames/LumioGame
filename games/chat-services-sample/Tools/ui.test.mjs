import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createChatPoller } from '../Client/session.mjs';

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
  assert.deepEqual(f.calls.filter(x => x.method === 'performAction').map(x => x.body.arguments), [{ text: '你好🌿 مرحبا', channel: 'public' }]);
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

// ---- Chat v1.2 surface ----------------------------------------------------
// Minimal in-file DOM stub: enough document behavior for the real view module
// without any external dependency, mirroring the browser fixture contract.
class StubElement {
  constructor(document, tag) {
    this.ownerDocument = document; this.tagName = tag.toUpperCase();
    this.children = []; this.attributes = {}; this.dataset = {}; this.style = {};
    this.listeners = {}; this.className = ''; this._text = '';
    this.hidden = false; this.disabled = false; this.scrollTop = 0; this.scrollHeight = 0;
    this.value = ''; this.selectionStart = 0; this.selectionEnd = 0; this.parentNode = null;
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { for (const node of nodes) { if (node == null) continue; node.parentNode = this; this.children.push(node); } return this; }
  replaceChildren(...nodes) { this.children = []; this._text = ''; return this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  dispatch(type, event = {}) { for (const listener of this.listeners[type] ?? []) listener({ preventDefault() {}, ...event }); }
  click() { return this.disabled ? undefined : this.onclick?.({ preventDefault() {}, clientX: 24, clientY: 24 }); }
  focus() {}
  setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
}
function createDom() {
  const document = { visibilityState: 'visible', hidden: false, listeners: {}, ids: new Map(),
    createElement(tag) { return new StubElement(document, tag); },
    getElementById(id) { if (!document.ids.has(id)) document.ids.set(id, new StubElement(document, 'div')); return document.ids.get(id); },
    addEventListener(type, listener) { (document.listeners[type] ??= []).push(listener); } };
  document.body = new StubElement(document, 'body');
  return document;
}
const descendants = function* (node) { for (const child of node.children) { yield child; yield* descendants(child); } };
const byClassName = (root, className) => [...descendants(root)].filter(node => typeof node.className === 'string' && node.className.split(/\s+/).includes(className));

function viewFixture({ summary, social, socialError } = {}) {
  const document = createDom(), active = [];
  const me = { playerId: 'player_me', displayName: '薄荷', accountLinked: true, consentRevision: 1, policyRevision: 2 };
  const state = { revision: 4, schemaVersion: 'chat_v3', updatedAt: 1800000000000, view: { started: true, canSend: true, messageCount: 2, recent: [] } };
  const channels = { public: { channelId: 'public', messages: [], nextCursor: null, hasMore: false, unread: 0 },
    dm_9: { channelId: 'dm_9', messages: [], nextCursor: null, hasMore: false, unread: 0 } };
  const calls = [];
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {},
    async request(method, body) {
      calls.push({ method, body });
      if (method === 'initialize') return { state, profile: me, epoch: { operationEpoch: 'epoch_1', serverTime: 1800000000000, expiresAt: 1800000300000 } };
      if (method === 'getState') return structuredClone(state);
      if (method === 'getProfile') return me;
      if (method === 'performAction') {
        state.revision++; state.view.messageCount++; state.view.recent.push(body.arguments.text);
        const channelId = body.arguments.channel === 'dm' ? body.arguments.channelId : 'public';
        const feed = channels[channelId] ??= { channelId, messages: [], nextCursor: null, hasMore: false, unread: 0 };
        feed.messages.push({ messageId: `${channelId}_m${feed.messages.length + 1}`, channelId, seq: feed.messages.length + 1,
          sender: { playerId: me.playerId, profile: me, accountLinked: true }, text: body.arguments.text, sentAtMs: 1800000180000 });
        return { status: 'committed' };
      }
      if (method === 'channelRead') return structuredClone(channels[body.channelId] ?? { channelId: body.channelId, messages: [], nextCursor: null, hasMore: false, unread: 0 });
      if (method === 'channelSummary') return structuredClone(summary ?? { publicUnread: 0, dmChannels: [], friendRequests: { incoming: [], outgoing: [] }, totalUnread: 0 });
      if (method === 'socialRead') { if (socialError) throw Object.assign(Error('login'), { code: socialError }); return structuredClone(social ?? { friends: [], incoming: [], outgoing: [] }); }
      if (method === 'friendRequest') return { requestId: 'req_new', status: 'pending' };
      if (method === 'friendRespond') return { requestId: body.requestId, status: body.accept ? 'accepted' : 'declined' };
      if (method === 'friendRemove') return { status: 'removed' };
    } };
  assert.equal(typeof ui.createChatView, 'function');
  const operations = ui.createOperationTracker(sdk);
  const view = ui.createChatView(document, sdk, operations);
  const session = createSession(operations.sdk, value => view.render(value));
  view.bind(session, { setActive: id => active.push(id) });
  return { document, element: id => document.getElementById(id), view, session, sdk, calls, active, channels, me, state };
}
const mintProfile = { playerId: 'player_mint', displayName: '阿薄荷' };
const guestMessage = { messageId: 'pm1', channelId: 'public', seq: 1, sender: { playerId: 'player_guest', profile: { anonymousName: '游客小叶' }, accountLinked: false }, text: '大家好', sentAtMs: 1800000000000 };
const namedMessage = { messageId: 'pm2', channelId: 'public', seq: 2, sender: { playerId: mintProfile.playerId, profile: mintProfile, accountLinked: true }, text: '[精灵:开心] 早上好', sentAtMs: 1800000060000 };

test('public channel renders other senders, guest badges and sticker bubbles without raw ids', async () => {
  const f = viewFixture();
  f.channels.public.messages.push(structuredClone(guestMessage), structuredClone(namedMessage));
  f.channels.public.nextCursor = 'c1';
  await f.session.start();
  await f.session.readChannel('public');
  const pub = f.element('pub');
  assert.equal(pub.children.length, 2);
  assert.equal(byClassName(pub, 'guest-tag').filter(node => node.textContent === '游客').length, 1);
  assert.ok(pub.textContent.includes('游客小叶')); assert.ok(pub.textContent.includes('阿薄荷'));
  assert.ok(pub.textContent.includes(ui.formatTime(1800000000000)));
  assert.ok(!pub.textContent.includes('player_guest'), 'raw playerIds never render');
  assert.ok(!pub.textContent.includes('player_mint'));
  assert.equal(byClassName(pub, 'sticker').length, 1);
  assert.equal(byClassName(pub, 'sender-button').length, 2, 'others are addable, own rows are not');
});
test('duplicate messageIds from a later page never render twice', async () => {
  const f = viewFixture();
  f.channels.public.messages.push(structuredClone(guestMessage));
  f.channels.public.nextCursor = 'c1';
  await f.session.start();
  await f.session.readChannel('public');
  assert.equal(f.element('pub').children.length, 1);
  f.channels.public = { channelId: 'public', messages: [structuredClone(guestMessage), structuredClone(namedMessage)], nextCursor: null, hasMore: false, unread: 0 };
  await f.session.readChannel('public', { cursor: 'c1' });
  assert.equal(f.session.current.channel.public.list.length, 2);
  assert.equal(f.element('pub').children.length, 2);
});
test('own public messages align right and public sends use the frozen argument shape', async () => {
  const f = viewFixture(); await f.session.start();
  f.element('box').value = '  公共你好 ';
  await f.element('send').click();
  assert.deepEqual(f.calls.filter(call => call.method === 'performAction').at(-1).body.arguments, { text: '公共你好', channel: 'public' });
  assert.equal(f.element('box').value, '', 'confirmed public send clears the composer');
  const rows = f.element('pub').children;
  assert.equal(rows.length, 1); assert.equal(rows[0].className, 'chat-message mine');
  assert.ok(f.element('pub').textContent.includes('公共你好'));
});
test('friends tab lists friends, unread badges and request actions from real projections', async () => {
  const incoming = [{ requestId: 'req_in', playerId: 'player_kai', profile: { anonymousName: '小凯' }, requestedAtMs: 2 }];
  const f = viewFixture({ summary: { publicUnread: 1, dmChannels: [{ channelId: 'dm_9', friendPlayerId: mintProfile.playerId, profile: mintProfile, unread: 2, lastMessageAtMs: 1 }], friendRequests: { incoming, outgoing: [] }, totalUnread: 3 },
    social: { friends: [{ playerId: mintProfile.playerId, profile: mintProfile, dmChannelId: 'dm_9', friendsSinceMs: 1 }],
      incoming, outgoing: [{ requestId: 'req_out', playerId: 'player_lin', profile: { displayName: '小琳' }, requestedAtMs: 3 }] } });
  await f.session.start();
  await f.session.socialRead(); await f.session.channelSummary();
  await f.element('friends-tab').click();
  assert.equal(f.element('friends-panel').hidden, false);
  assert.equal(f.element('friends-signin').hidden, true);
  assert.equal(f.element('friend-lists').hidden, false);
  const friends = f.element('friends');
  assert.equal(friends.children.length, 1);
  assert.ok(friends.textContent.includes('阿薄荷'));
  assert.ok(byClassName(friends, 'unread-badge').some(node => node.textContent === '2'));
  assert.ok(f.element('requests-in').textContent.includes('小凯'));
  assert.ok(f.element('requests-out').textContent.includes('等待中'));
  await byClassName(f.element('requests-in'), 'friend-action').find(node => node.textContent === '接受').click();
  assert.deepEqual(f.calls.filter(call => call.method === 'friendRespond').at(-1).body, { requestId: 'req_in', accept: true });
  assert.ok(f.calls.some(call => call.method === 'socialRead'), 'accept refreshes the social projection');
  await byClassName(friends, 'friend-action').find(node => node.textContent === '删除').click();
  assert.deepEqual(f.calls.filter(call => call.method === 'friendRemove').at(-1).body, { targetPlayerId: mintProfile.playerId });
});
test('dm view switches inside the friends tab and sends carry channelId', async () => {
  const f = viewFixture({ social: { friends: [{ playerId: mintProfile.playerId, profile: mintProfile, dmChannelId: 'dm_9', friendsSinceMs: 1 }], incoming: [], outgoing: [] } });
  await f.session.start();
  await f.session.socialRead();
  await f.element('friends-tab').click();
  assert.deepEqual(f.active, [null], 'friends list polls public without markRead');
  await byClassName(f.element('friends'), 'friend-action').find(node => node.textContent === '私聊').click();
  assert.equal(f.element('dm-view').hidden, false);
  assert.equal(f.element('friend-lists').hidden, true);
  assert.equal(f.element('dm-title').textContent, '阿薄荷');
  assert.equal(f.active.at(-1), 'dm_9');
  assert.ok(f.calls.some(call => call.method === 'channelRead' && call.body.channelId === 'dm_9'));
  f.element('dm-box').value = '悄悄话';
  await f.element('dm-send').click();
  assert.deepEqual(f.calls.filter(call => call.method === 'performAction').at(-1).body.arguments, { text: '悄悄话', channel: 'dm', channelId: 'dm_9' });
  assert.equal(f.element('dm-box').value, '', 'confirmed dm send clears the dm composer');
  assert.ok(f.element('dm-msgs').textContent.includes('悄悄话'));
  await f.element('dm-back').click();
  assert.equal(f.element('dm-view').hidden, true);
  assert.equal(f.element('friend-lists').hidden, false);
  assert.equal(f.active.at(-1), null);
});
test('friend menu disables self and guest targets and sends exact friendRequest bodies', async () => {
  const f = viewFixture();
  f.channels.public.messages.push(structuredClone(guestMessage), structuredClone(namedMessage));
  await f.session.start();
  await f.session.readChannel('public');
  const buttons = byClassName(f.element('pub'), 'sender-button');
  await buttons.find(node => node.textContent.includes('游客小叶')).click();
  assert.equal(f.element('friend-menu').hidden, false);
  assert.equal(f.element('friend-menu-add').hidden, true);
  assert.match(f.element('friend-menu-hint').textContent, /游客/);
  await buttons.find(node => node.textContent.includes('阿薄荷')).click();
  assert.equal(f.element('friend-menu-add').hidden, false);
  assert.equal(f.element('friend-menu-add').disabled, false);
  await f.element('friend-menu-add').click();
  assert.deepEqual(f.calls.filter(call => call.method === 'friendRequest').at(-1).body, { targetPlayerId: mintProfile.playerId });
  assert.ok(f.calls.some(call => call.method === 'socialRead'));
  assert.equal(f.element('friend-menu').hidden, true);
});
test('anonymous players see the sign-in prompt instead of friend lists', async () => {
  const f = viewFixture({ socialError: 'gs_login_required' });
  await f.session.start();
  await f.session.socialRead().catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  await f.element('friends-tab').click();
  assert.equal(f.element('friends-signin').hidden, false);
  assert.equal(f.element('friend-lists').hidden, true);
  assert.equal(f.element('friends-login').disabled, false);
  await f.element('friends-login').click();
  assert.ok(f.calls.some(call => call.method === 'login'));
});
test('chat error mapping covers the frozen chat error codes', () => {
  assert.equal(typeof ui.chatErrorText, 'function');
  assert.equal(ui.chatErrorText({ code: 'gs_login_required' }), '请先登录');
  assert.equal(ui.chatErrorText({ code: 'gs_channel_denied' }), '没有权限访问该频道');
  assert.equal(ui.chatErrorText({ code: 'gs_message_blocked' }), '消息未通过安全审核，请修改后重发');
  assert.equal(ui.chatErrorText({ code: 'gs_message_moderation_unavailable' }), '安全审核暂不可用，稍后重试');
  assert.equal(ui.chatErrorText({ code: 'gs_social_denied', gameReason: 'target_not_logged_in' }), '对方是游客，无法添加');
  assert.equal(ui.chatErrorText({ code: 'gs_social_denied', gameReason: 'already_friends' }), '你们已经是好友了');
  assert.equal(ui.chatErrorText({ code: 'gs_social_denied', gameReason: 'already_requested' }), '申请已发送，等待对方处理');
  assert.equal(ui.chatErrorText({ code: 'gs_social_denied', gameReason: 'self' }), '不能添加自己');
  assert.match(ui.chatErrorText({ code: 'gs_social_denied' }), /好友操作未完成/);
  assert.equal(ui.chatErrorText({ code: 'gs_bridge_user_action_required' }), '请使用游戏外侧平台的“资料授权”按钮。');
});
test('send argument assembly stays inside the frozen send contract', () => {
  assert.equal(typeof ui.sendArguments, 'function');
  assert.deepEqual(ui.sendArguments('你好'), { text: '你好', channel: 'public' });
  assert.deepEqual(ui.sendArguments('你好', { channel: 'public' }), { text: '你好', channel: 'public' });
  assert.equal('channelId' in ui.sendArguments('你好', { channel: 'public', channelId: 'dm_9' }), false, 'public never carries channelId');
  assert.deepEqual(ui.sendArguments('你好', { channel: 'dm', channelId: 'dm_9' }), { text: '你好', channel: 'dm', channelId: 'dm_9' });
  assert.equal(typeof ui.formatTime, 'function');
  assert.equal(ui.formatTime(1800000090000), `${String(new Date(1800000090000).getHours()).padStart(2, '0')}:${String(new Date(1800000090000).getMinutes()).padStart(2, '0')}`);
  assert.equal(ui.formatTime('nope'), '');
});

function pollerFixture({ summaryReply, socialReply } = {}) {
  const posted = [], timers = [], calls = [];
  const parent = { postMessage(message, origin) { posted.push({ message, origin }); } };
  const document = { visibilityState: 'visible' };
  const state = { revision: 1, schemaVersion: 'chat_v3', updatedAt: 1, view: { started: true, canSend: true, messageCount: 0, recent: [] } };
  const profile = { playerId: 'player_me', anonymousName: '匿名玩家' };
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {},
    async request(method, body) {
      calls.push({ method, body });
      if (method === 'initialize') return { state, profile, epoch: { operationEpoch: 'ep', serverTime: 1800000000000, expiresAt: 1800000300000 } };
      if (method === 'getState') return state;
      if (method === 'getProfile') return profile;
      if (method === 'channelRead') return { channelId: body.channelId, messages: [], nextCursor: null, hasMore: false, unread: 0 };
      if (method === 'channelSummary') return summaryReply ? summaryReply() : { publicUnread: 0, dmChannels: [], friendRequests: { incoming: [], outgoing: [] }, totalUnread: 0 };
      if (method === 'socialRead') return socialReply ? socialReply() : { friends: [], incoming: [], outgoing: [] };
      return { status: 'committed' };
    } };
  const session = createSession(sdk);
  const poller = createChatPoller(session, { document, parent, platformOrigin: 'https://platform.example',
    schedule: (task, ms) => { const entry = { task, ms, fired: false, cancelled: false }; timers.push(entry); return () => { entry.cancelled = true; }; } });
  const flush = async () => { for (let index = 0; index < 8; index++) await new Promise(resolve => setImmediate(resolve)); };
  const fire = async ms => {
    const entry = timers.find(timer => !timer.fired && !timer.cancelled && timer.ms === ms);
    if (!entry) throw Error(`no pending ${ms}ms timer; have ${timers.filter(timer => !timer.fired).map(timer => timer.ms)}`);
    entry.fired = true; entry.task(); await flush();
  };
  return { session, poller, posted, timers, calls, flush, fire };
}
test('unread activity posts only real summary changes to the platform origin', async () => {
  let summary = { publicUnread: 2, dmChannels: [{ channelId: 'dm_1', friendPlayerId: 'p2', profile: {}, unread: 3, lastMessageAtMs: 1 }], friendRequests: { incoming: [{ requestId: 'r1', playerId: 'p3', profile: {}, requestedAtMs: 1 }], outgoing: [] }, totalUnread: 5 };
  const f = pollerFixture({ summaryReply: () => structuredClone(summary) });
  f.poller.sync(f.session.current);
  await f.flush();
  assert.deepEqual(f.posted, [], 'connecting sessions never poll');
  await f.session.start();
  f.poller.sync(f.session.current);
  await f.flush();
  assert.deepEqual(f.posted.map(entry => entry.message), [{ type: 'lumio:chat-activity', totalUnread: 6, pulse: true }]);
  assert.equal(f.posted[0].origin, 'https://platform.example');
  await f.fire(3000); await f.fire(5000); await f.fire(2500);
  assert.equal(f.posted.length, 1, 'unchanged unread stays silent');
  summary = { ...summary, publicUnread: 4 };
  await f.fire(5000);
  assert.deepEqual(f.posted.at(-1).message, { type: 'lumio:chat-activity', totalUnread: 8, pulse: true });
  summary = { ...summary, publicUnread: 0, dmChannels: [], friendRequests: { incoming: [], outgoing: [] } };
  await f.fire(5000); await f.fire(5000);
  assert.deepEqual(f.posted.at(-1).message, { type: 'lumio:chat-activity', totalUnread: 0, pulse: false });
  assert.ok(f.posted.every(entry => Object.keys(entry.message).length === 3 && entry.message.type === 'lumio:chat-activity'), 'the signal carries no chat content');
  f.poller.stop();
});
test('polling stops for offline trial and restarts after reconnect', async () => {
  const f = pollerFixture();
  await f.session.start();
  f.poller.sync(f.session.current);
  await f.flush();
  assert.ok(f.calls.some(call => call.method === 'channelRead'), 'official sessions poll reads');
  f.session.offline();
  f.poller.sync(f.session.current);
  assert.equal(f.timers.filter(timer => !timer.fired && !timer.cancelled).length, 0, 'stop cancels pending polls');
  const before = f.calls.length;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, before, 'trial mode never polls');
  await f.session.reconnect();
  f.poller.sync(f.session.current);
  await f.flush();
  assert.ok(f.calls.length > before, 'reconnect resumes polling');
  f.poller.stop();
});
test('rate-limited summaries back off exponentially up to the 20s cap', async () => {
  let replies = 0;
  const f = pollerFixture({ summaryReply: () => { replies++; throw Object.assign(Error('limited'), { code: 'gs_rate_limited' }); } });
  await f.session.start();
  f.poller.sync(f.session.current);
  await f.flush();
  assert.equal(replies, 1);
  assert.ok(f.timers.some(timer => !timer.fired && timer.ms === 10000), 'first backoff doubles the base');
  await f.fire(10000); assert.equal(replies, 2);
  assert.ok(f.timers.some(timer => !timer.fired && timer.ms === 20000));
  await f.fire(20000); assert.equal(replies, 3);
  await f.fire(20000); assert.equal(replies, 4);
  assert.ok(f.timers.some(timer => !timer.fired && timer.ms === 20000), 'backoff caps at 20s');
  f.poller.stop();
});
