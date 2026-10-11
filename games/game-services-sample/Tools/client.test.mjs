import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../Client/session.mjs';

function fixture() {
  const calls = [];
  const state = { revision: 7, schemaVersion: 'expedition_v2', updatedAt: 1800000000000, view: { started: true, supplies: 3, draws: 0, bestScore: 0, canClaim: false, canExplore: true, trail: 'camp' } };
  const profile = { anonymousName: '匿名探险家' };
  const sdk = { request: async (method, body) => { calls.push({ method, body }); return method === 'initialize' ? { state, profile, epoch: { operationEpoch: 'epoch_1', serverTime: 1800000000000, expiresAt: 1800000300000 } } : method === 'getState' ? state : method === 'getProfile' ? profile : { status: 'committed' }; }, setOnline() {}, dispose() {}, unresolvedOperations: [] };
  return { session: createSession(sdk), calls };
}
test('offline trial never sends or imports official actions', async () => {
  const { session, calls } = fixture(); await session.start(); session.offline(); const before = calls.length;
  session.trial('ridge'); session.trial('river'); assert.equal(calls.length, before);
  await assert.rejects(session.act('explore', { route: 'ridge' }), /offline/);
  await session.reconnect(); assert.deepEqual(calls.slice(before).map(c => c.method), ['initialize']);
  assert.equal(session.current.view.supplies, 3); assert.equal(session.current.mode, 'official');
});
test('actions carry only intent plus server epoch and revision', async () => {
  const { session, calls } = fixture(); await session.start(); await session.act('explore', { route: 'river' });
  const action = calls.find(c => c.method === 'performAction').body;
  assert.deepEqual(Object.keys(action).sort(), ['action', 'arguments', 'expectedRevision', 'operationEpoch', 'operationId']);
  assert.equal(action.expectedRevision, 7); assert.equal(action.operationEpoch, 'epoch_1'); assert.deepEqual(action.arguments, { route: 'river' });
});
test('retired instance clears disclosures and cannot issue more actions', async () => {
  const { session, calls } = fixture(); await session.start(); session.invalidate(true);
  const before = calls.length; await assert.rejects(session.act('claim_supplies'), /restart/);
  assert.equal(calls.length, before); assert.equal(session.current.profile, null); assert.equal(session.current.view, null);
});
test('profile refusal still permits official play under anonymous projection', async () => {
  const { session } = fixture(); await session.start(); await session.act('explore', { route: 'ridge' });
  assert.equal(session.current.profile.anonymousName, '匿名探险家'); assert.equal(session.current.mode, 'official');
});
test('late action response cannot overwrite a trial or retired projection', async () => {
  let release;
  const base = { revision: 1, view: { supplies: 2 } };
  const sdk = { unresolvedOperations: [], setOnline() {}, dispose() {}, request: async method => method === 'initialize'
    ? { state: base, profile: { anonymousName: '匿名' }, epoch: { operationEpoch: 'ep', serverTime: 1000, expiresAt: 301000 } }
    : method === 'performAction' ? new Promise(resolve => { release = resolve; }) : base };
  const session = createSession(sdk); await session.start(); const pending = session.act('begin');
  session.offline(); release({ status: 'committed' }); await pending;
  assert.equal(session.current.mode, 'trial'); assert.equal(session.current.view.supplies, 3);
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
        const reply = { state: { revision: initialized, view: { supplies: initialized } }, profile: { anonymousName: '匿名' }, epoch: { operationEpoch: `epoch-${initialized}`, serverTime: 1800000000000 + clock, expiresAt: 1800000300000 + clock } };
        return initializeReply ? initializeReply(reply) : reply;
      }
      if (method === 'getState') return { revision: initialized, view: { supplies: initialized } };
      if (method === 'getProfile') return { anonymousName: '匿名' };
      if (method === 'performAction') return { status: 'committed' };
    }, recover: async operation => { calls.push({ method: 'recover', body: operation }); return { status: 'not_found' }; } };
  return { session: createSession(sdk, () => {}, { now: () => clock }), sdk, calls, ref, advance: ms => { clock += ms; }, holdInitialize: fn => { initializeReply = fn; } };
}
test('new actions renew expired server epochs and use the renewed authoritative revision', async () => {
  const f = renewingSession(); await f.session.start(); f.advance(300001); await f.session.act('begin');
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
  const pending = f.session.act('begin');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finish, 'function');
  f.session.offline(); finish(); await pending;
  assert.equal(f.calls.some(x => x.method === 'performAction'), false); assert.equal(f.session.current.mode, 'trial');
  assert.equal(f.session.current.view.supplies, 3);
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
