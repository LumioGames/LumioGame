import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../Client/session.mjs';

function fixture() {
  const calls = [];
  const state = { revision: 7, schemaVersion: 'expedition_v2', updatedAt: 1800000000000, view: { started: true, supplies: 3, draws: 0, bestScore: 0, canClaim: false, canExplore: true, trail: 'camp' } };
  const profile = { anonymousName: '匿名探险家' };
  const sdk = { request: async (method, body) => { calls.push({ method, body }); return method === 'initialize' ? { state, profile, epoch: { operationEpoch: 'epoch_1' } } : method === 'getState' ? state : method === 'getProfile' ? profile : { status: 'committed' }; }, setOnline() {}, dispose() {}, unresolvedOperations: [] };
  return { session: createSession(sdk), calls };
}
test('offline trial never sends or imports official actions', async () => {
  const { session, calls } = fixture(); await session.start(); session.offline(); const before = calls.length;
  session.trial('ridge'); session.trial('river'); assert.equal(calls.length, before);
  await assert.rejects(session.act('explore', { route: 'ridge' }), /offline/);
  await session.reconnect(); assert.deepEqual(calls.slice(before).map(c => c.method), ['getState', 'getProfile']);
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
    ? { state: base, profile: { anonymousName: '匿名' }, epoch: { operationEpoch: 'ep' } }
    : method === 'performAction' ? new Promise(resolve => { release = resolve; }) : base };
  const session = createSession(sdk); await session.start(); const pending = session.act('begin');
  session.offline(); release({ status: 'committed' }); await pending;
  assert.equal(session.current.mode, 'trial'); assert.equal(session.current.view.supplies, 3);
  session.invalidate(true); session.reconcile({ method: 'getState', result: base });
  assert.equal(session.current.view, null); assert.equal(session.current.profile, null);
});
