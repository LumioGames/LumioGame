import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, unreadTotal, isChannelId } from '../Client/session.mjs';

function fixture() {
  const calls = [];
  const state = { revision: 7, schemaVersion: 'chat_v1', updatedAt: 1800000000000, view: { started: true, messageCount: 0, canSend: true, recent: [] } };
  const profile = { anonymousName: '匿名玩家' };
  const sdk = { request: async (method, body) => { calls.push({ method, body }); return method === 'initialize' ? { state, profile, epoch: { operationEpoch: 'epoch_1', serverTime: 1800000000000, expiresAt: 1800000300000 } } : method === 'getState' ? state : method === 'getProfile' ? profile : { status: 'committed' }; }, setOnline() {}, dispose() {}, unresolvedOperations: [] };
  return { session: createSession(sdk), calls };
}
test('offline trial never sends or imports official actions', async () => {
  const { session, calls } = fixture(); await session.start(); session.offline(); const before = calls.length;
  session.trial('你好'); session.trial('还在吗'); assert.equal(calls.length, before);
  assert.equal(session.current.view.recent.length, 2);
  await assert.rejects(session.act('send', { text: '你好' }), /offline/);
  await session.reconnect(); assert.deepEqual(calls.slice(before).map(c => c.method), ['initialize']);
  assert.equal(session.current.view.messageCount, 0); assert.equal(session.current.mode, 'official');
});
test('actions carry only intent plus server epoch and revision', async () => {
  const { session, calls } = fixture(); await session.start(); await session.act('send', { text: '大家好', channel: 'public' });
  const action = calls.find(c => c.method === 'performAction').body;
  assert.deepEqual(Object.keys(action).sort(), ['action', 'arguments', 'expectedRevision', 'operationEpoch', 'operationId']);
  assert.equal(action.expectedRevision, 7); assert.equal(action.operationEpoch, 'epoch_1'); assert.deepEqual(action.arguments, { text: '大家好', channel: 'public' });
});
test('retired instance clears disclosures and cannot issue more actions', async () => {
  const { session, calls } = fixture(); await session.start(); session.invalidate(true);
  const before = calls.length; await assert.rejects(session.act('begin'), /restart/);
  assert.equal(calls.length, before); assert.equal(session.current.profile, null); assert.equal(session.current.view, null);
});
test('profile refusal still permits official chat under anonymous projection', async () => {
  const { session } = fixture(); await session.start(); await session.act('send', { text: '你好' });
  assert.equal(session.current.profile.anonymousName, '匿名玩家'); assert.equal(session.current.mode, 'official');
});
test('late action response cannot overwrite a trial or retired projection', async () => {
  let release;
  const base = { revision: 1, view: { canSend: true } };
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {}, request: async method => method === 'initialize'
    ? { state: base, profile: { anonymousName: '匿名' }, epoch: { operationEpoch: 'ep', serverTime: 1000, expiresAt: 301000 } }
    : method === 'performAction' ? new Promise(resolve => { release = resolve; }) : base };
  const session = createSession(sdk); await session.start(); const pending = session.act('begin');
  session.offline(); release({ status: 'committed' }); await pending;
  assert.equal(session.current.mode, 'trial'); assert.equal(session.current.view.messageCount, 0);
  session.invalidate(true); session.reconcile({ method: 'getState', result: base });
  assert.equal(session.current.view, null); assert.equal(session.current.profile, null);
});

function renewingSession() {
  let clock = 0, initialized = 0, initializeReply;
  const calls = [], ref = { operationId: 'old-operation', operationEpoch: 'epoch-1' };
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {},
    request: async (method, body) => {
      calls.push({ method, body });
      if (method === 'initialize') {
        initialized++;
        const reply = { state: { revision: initialized, view: { messageCount: initialized } }, profile: { anonymousName: '匿名' }, epoch: { operationEpoch: `epoch-${initialized}`, serverTime: 1800000000000 + clock, expiresAt: 1800000300000 + clock } };
        return initializeReply ? initializeReply(reply) : reply;
      }
      if (method === 'getState') return { revision: initialized, view: { messageCount: initialized } };
      if (method === 'getProfile') return { anonymousName: '匿名' };
      if (method === 'performAction') return { status: 'committed' };
    }, recover: async operation => { calls.push({ method: 'recover', body: operation }); return { status: 'not_found' }; } };
  return { session: createSession(sdk, () => {}, { now: () => clock }), sdk, calls, ref, advance: ms => { clock += ms; }, holdInitialize: fn => { initializeReply = fn; } };
}
test('new actions renew expired server epochs and use the renewed authoritative revision', async () => {
  const f = renewingSession(); await f.session.start(); f.advance(300001); await f.session.act('send', { text: '续期后第一条' });
  assert.deepEqual(f.calls.map(x => x.method), ['initialize', 'initialize', 'performAction', 'getState', 'getProfile']);
  assert.equal(f.calls[2].body.operationEpoch, 'epoch-2'); assert.equal(f.calls[2].body.expectedRevision, 2);
});
test('reconnect renews the epoch but keeps unresolved old operation identities blocked and queryable', async () => {
  const f = renewingSession(); await f.session.start(); f.sdk.unresolvedOperations.push(f.ref);
  f.session.offline(); f.advance(300001); await f.session.reconnect();
  assert.equal(f.calls.at(-1).method, 'initialize'); assert.deepEqual(f.session.current.pending, [f.ref]);
  const before = f.calls.length; await assert.rejects(f.session.act('begin'), /查询/); assert.equal(f.calls.length, before);
  await f.session.recover(); assert.deepEqual(f.calls.find(x => x.method === 'recover').body, f.ref);
  assert.deepEqual(f.sdk.unresolvedOperations, [f.ref]);
});
test('a late renewal after going offline cannot send an action or overwrite trial state', async () => {
  const f = renewingSession(); await f.session.start(); f.advance(300001);
  let finish; f.holdInitialize(reply => new Promise(resolve => { finish = () => resolve(reply); }));
  const pending = f.session.act('send', { text: '不该发出' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finish, 'function');
  f.session.offline(); finish(); await pending;
  assert.equal(f.calls.some(x => x.method === 'performAction'), false); assert.equal(f.session.current.mode, 'trial');
  assert.equal(f.session.current.view.messageCount, 0);
});
test('retiring during reconnect rejects the late initialize projection', async () => {
  const f = renewingSession(); await f.session.start();
  let finish; f.holdInitialize(reply => new Promise(resolve => { finish = () => resolve(reply); }));
  const pending = f.session.reconnect(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finish, 'function'); f.session.invalidate(true); finish(); await pending;
  assert.equal(f.session.current.view, null); assert.equal(f.session.current.mode, 'retired');
});
test('failed reconnect leaves offline trial available for an explicit retry', async () => {
  const f = renewingSession(); await f.session.start(); f.session.offline();
  f.holdInitialize(() => { throw Error('network unavailable'); });
  await assert.rejects(f.session.reconnect(), /network unavailable/);
  assert.equal(f.session.current.mode, 'trial');
  f.holdInitialize(undefined); await f.session.reconnect(); assert.equal(f.session.current.mode, 'official');
});

test('SDK synchronous reconnect invalidation still leaves a failed connection retryable', async () => {
  const f = renewingSession(); await f.session.start(); f.session.offline();
  // The official SDK reports disclosure invalidation synchronously on offline -> online.
  f.sdk.setOnline = online => { if (online) f.session.invalidate(); };
  f.holdInitialize(() => { throw Error('network unavailable'); });
  await assert.rejects(f.session.reconnect(), /network unavailable/);
  assert.equal(f.session.current.mode, 'trial');
  f.holdInitialize(undefined); await f.session.reconnect();
  assert.equal(f.session.current.mode, 'official');
});

// Chat v1.2 read/social surface: every projection below originates from the
// SDK stub alone; the session never fabricates messages, ids or unread counts.
function chatFixture({ channels = {}, summary, social, socialError } = {}) {
  const calls = [];
  const live = { channels };
  const state = { revision: 3, schemaVersion: 'chat_v3', updatedAt: 1800000000000, view: { started: true, messageCount: 5, canSend: true, recent: [] } };
  const profile = { playerId: 'player_me', displayName: '薄荷', accountLinked: true, consentRevision: 1, policyRevision: 2 };
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {},
    async request(method, body) {
      calls.push({ method, body });
      if (method === 'initialize') return { state, profile, epoch: { operationEpoch: 'epoch_1', serverTime: 1800000000000, expiresAt: 1800000300000 } };
      if (method === 'getState') return structuredClone(state);
      if (method === 'getProfile') return profile;
      if (method === 'channelRead') {
        if (body.channelId !== 'public' && !isChannelId(body.channelId)) throw Object.assign(Error('denied'), { code: 'gs_channel_denied' });
        return structuredClone(live.channels[body.channelId] ?? { channelId: body.channelId, messages: [], nextCursor: null, hasMore: false, unread: 0 });
      }
      if (method === 'channelSummary') {
        if (!summary) throw Object.assign(Error('login'), { code: 'gs_login_required' });
        return structuredClone(summary);
      }
      if (method === 'socialRead') {
        if (socialError) throw Object.assign(Error('login'), { code: socialError });
        return structuredClone(social ?? { friends: [], incoming: [], outgoing: [] });
      }
      if (method === 'friendRequest') return { requestId: 'req_new', status: 'pending' };
      if (method === 'friendRespond') return { requestId: body.requestId, status: body.accept ? 'accepted' : 'declined' };
      if (method === 'friendRemove') return { status: 'removed' };
      return { status: 'committed' };
    } };
  return { session: createSession(sdk), sdk, calls, live };
}
const message = (id, seq, sender, text) => ({ messageId: id, channelId: 'public', seq, sender, text, sentAtMs: 1800000000000 + seq * 60000 });

test('channelRead sends the exact request shape and merges pages by messageId', async () => {
  const channels = { public: { channelId: 'public', messages: [message('m1', 1, { playerId: 'p1' }, '一'), message('m2', 2, { playerId: 'p1' }, '二')], nextCursor: 'c1', hasMore: true, unread: 0 } };
  const f = chatFixture({ channels }); await f.session.start();
  const first = await f.session.readChannel('public', { limit: 30, markRead: true });
  assert.equal(first.channelId, 'public');
  assert.deepEqual(f.calls.at(-1), { method: 'channelRead', body: { channelId: 'public', cursor: null, limit: 30, markRead: true } });
  assert.deepEqual(f.session.current.channel.public.list.map(m => m.messageId), ['m1', 'm2']);
  assert.equal(f.session.current.channel.public.cursor, 'c1'); assert.equal(f.session.current.channel.public.hasMore, true);
  channels.public = { channelId: 'public', messages: [message('m2', 2, { playerId: 'p1' }, '二'), message('m3', 3, { playerId: 'p2' }, '三')], nextCursor: null, hasMore: false, unread: 0 };
  await f.session.readChannel('public', { cursor: 'c1', limit: 2 });
  assert.deepEqual(f.calls.at(-1).body, { channelId: 'public', cursor: 'c1', limit: 2, markRead: false });
  const feed = f.session.current.channel.public;
  assert.deepEqual(feed.list.map(m => m.messageId), ['m1', 'm2', 'm3'], 'duplicate messageIds never append twice');
  assert.equal(feed.cursor, null); assert.equal(feed.hasMore, false);
});
test('dm feeds are keyed by the opened channel and reset on switch', async () => {
  const channels = { dm_a: { channelId: 'dm_a', messages: [message('d1', 1, { playerId: 'p2' }, 'hi')], nextCursor: null, hasMore: false, unread: 0 } };
  const f = chatFixture({ channels }); await f.session.start();
  f.session.openDm('dm_a');
  await f.session.readChannel('dm_a');
  assert.equal(f.session.current.channel.dm.active, 'dm_a');
  assert.deepEqual(f.session.current.channel.dm.list.map(m => m.messageId), ['d1']);
  f.session.openDm('dm_b');
  assert.equal(f.session.current.channel.dm.active, 'dm_b');
  assert.deepEqual(f.session.current.channel.dm.list, []); assert.equal(f.session.current.channel.dm.loaded, false);
  await f.session.readChannel('dm_a');
  assert.deepEqual(f.session.current.channel.dm.list, [], 'a stale read for the previous dm channel is dropped');
  f.session.openDm(null); assert.equal(f.session.current.channel.dm.active, null);
});
test('invalid channels and offline sessions never reach the bridge', async () => {
  const f = chatFixture(); await f.session.start();
  await assert.rejects(f.session.readChannel('bad id!'), /频道无效/);
  f.session.offline();
  await assert.rejects(f.session.readChannel('public'), /offline/);
  await assert.rejects(f.session.channelSummary(), /offline/);
  await assert.rejects(f.session.socialRead(), /offline/);
  await assert.rejects(f.session.friendRequest('p2'), /offline/);
  await assert.rejects(f.session.friendRespond('r1', true), /offline/);
  await assert.rejects(f.session.friendRemove('p2'), /offline/);
  assert.equal(f.calls.filter(call => call.method === 'channelRead').length, 0);
});
test('late channel/social responses after invalidation never publish', async () => {
  const releases = [];
  const state = { revision: 1, view: { started: true, canSend: true, messageCount: 0, recent: [] } };
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {}, request: method => {
    if (method === 'initialize') return Promise.resolve({ state, profile: { playerId: 'p1', anonymousName: '匿名' }, epoch: { operationEpoch: 'ep', serverTime: 1, expiresAt: 2 } });
    if (['channelRead', 'channelSummary', 'socialRead', 'friendRequest'].includes(method)) return new Promise(resolve => { releases.push({ method, resolve }); });
    return Promise.resolve(state);
  } };
  const session = createSession(sdk); await session.start();
  const reads = [session.readChannel('public'), session.channelSummary(), session.socialRead(), session.friendRequest('p2')];
  session.invalidate();
  for (const { resolve } of releases) resolve({ channelId: 'public', messages: [message('m9', 9, { playerId: 'p2' }, '迟到')], totalUnread: 5, requestId: 'r9' });
  assert.deepEqual(await Promise.all(reads), [null, null, null, null]);
  assert.deepEqual(session.current.channel.public.list, []); assert.equal(session.current.summary, null);
  assert.deepEqual(session.current.social, { friends: [], incoming: [], outgoing: [], loginRequired: false });
});
test('channelSummary and socialRead publish authoritative projections', async () => {
  const summary = { publicUnread: 2, dmChannels: [{ channelId: 'dm_a', friendPlayerId: 'p2', profile: { anonymousName: '小叶' }, unread: 1, lastMessageAtMs: 1800000000000 }], friendRequests: { incoming: [{ requestId: 'r1', playerId: 'p3', profile: {}, requestedAtMs: 1 }], outgoing: [] }, totalUnread: 3 };
  const social = { friends: [{ playerId: 'p2', profile: { displayName: '小叶' }, dmChannelId: 'dm_a', friendsSinceMs: 1 }], incoming: [], outgoing: [{ requestId: 'r2', playerId: 'p4', profile: {}, requestedAtMs: 2 }] };
  const f = chatFixture({ summary, social }); await f.session.start();
  await f.session.channelSummary(); await f.session.socialRead();
  assert.equal(f.session.current.summary.publicUnread, 2);
  assert.deepEqual(f.session.current.social.friends.map(friend => friend.dmChannelId), ['dm_a']);
  assert.deepEqual(f.session.current.social.outgoing.map(request => request.requestId), ['r2']);
  assert.equal(f.session.current.social.loginRequired, false);
});
test('socialRead maps gs_login_required to the anonymous sign-in projection', async () => {
  const f = chatFixture({ socialError: 'gs_login_required' }); await f.session.start();
  f.session.socialRead().catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.session.current.social.loginRequired, true);
  assert.deepEqual(f.session.current.social.friends, []);
});
test('friend methods carry exact bodies and return server results', async () => {
  const f = chatFixture(); await f.session.start();
  assert.deepEqual(await f.session.friendRequest('p2'), { requestId: 'req_new', status: 'pending' });
  assert.deepEqual(f.calls.at(-1), { method: 'friendRequest', body: { targetPlayerId: 'p2' } });
  assert.deepEqual(await f.session.friendRespond('r1', true), { requestId: 'r1', status: 'accepted' });
  assert.deepEqual(f.calls.at(-1), { method: 'friendRespond', body: { requestId: 'r1', accept: true } });
  assert.deepEqual(await f.session.friendRespond('r1', false), { requestId: 'r1', status: 'declined' });
  assert.equal(f.calls.at(-1).body.accept, false);
  assert.deepEqual(await f.session.friendRemove('p2'), { status: 'removed' });
  assert.deepEqual(f.calls.at(-1), { method: 'friendRemove', body: { targetPlayerId: 'p2' } });
});
test('reconnect and offline drop channel/social projections entirely', async () => {
  const channels = { public: { channelId: 'public', messages: [message('m1', 1, { playerId: 'p1' }, '一')], nextCursor: 'c1', hasMore: false, unread: 1 } };
  const f = chatFixture({ channels, summary: { publicUnread: 1, dmChannels: [], friendRequests: { incoming: [], outgoing: [] }, totalUnread: 1 }, social: { friends: [{ playerId: 'p2', profile: {}, dmChannelId: 'dm_a', friendsSinceMs: 1 }], incoming: [], outgoing: [] } });
  await f.session.start();
  await f.session.readChannel('public'); await f.session.channelSummary(); await f.session.socialRead();
  f.session.offline();
  assert.deepEqual(f.session.current.channel.public.list, []); assert.equal(f.session.current.summary, null);
  assert.deepEqual(f.session.current.social.friends, []);
  await f.session.reconnect();
  assert.equal(f.session.current.mode, 'official');
  assert.deepEqual(f.session.current.channel.public.list, []); assert.equal(f.session.current.channel.dm.active, null);
  assert.equal(f.session.current.summary, null); assert.deepEqual(f.session.current.social.friends, []);
});
test('unreadTotal adds public, dm and incoming request counts from the summary only', () => {
  assert.equal(unreadTotal(null), 0);
  assert.equal(unreadTotal({ publicUnread: 2, dmChannels: [{ unread: 3 }, { unread: 1 }], friendRequests: { incoming: [{}, {}] } }), 8);
  assert.equal(unreadTotal({ dmChannels: [{ channelId: 'dm_a', unread: 2 }] }), 2);
});
