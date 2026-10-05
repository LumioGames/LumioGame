import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeEffectOperationBudgets} from './effect-operation-budgets.mjs';

const field = [10101, 1, 0, 0, 0, 'list', 'entity', 1, 'none', 'server', 'remote', ''];
test('budget projection uses registry field indices and excludes only status columns', () => {
  const plan = ['', [], [field], [], [], [[1, 'first', 0, true, 1, [[0, 'captured', 0], [0, 'status', 1]]],
    [1, 'second', 0, true, 1, [[0, 'output', 0]]]], [], [], []];
  const summary = summarizeEffectOperationBudgets(plan);
  assert.equal(summary.factFields, 1);
  assert.equal(summary.factValueBytes, 16);
});
test('budget projection sums program limits but takes the maximum scratch requirement', () => {
  const program = (name, limits) => [[], '', name, [], [], [[...field, 0, 0]], [], [], limits];
  const plan = ['', [], [field], [], [], [], [], [program('one', [10, 2, 480, 100, 128]), program('two', [20, 3, 960, 200, 256])], []];
  const summary = summarizeEffectOperationBudgets(plan);
  assert.equal(summary.writes, 30); assert.equal(summary.indexedWrites, 5);
  assert.equal(summary.writeBytes, 1440); assert.equal(summary.work, 300); assert.equal(summary.scratchBytes, 256);
  assert.equal(summary.reducerFields, 1); assert.equal(summary.reducerValueBytes, 16);
});
test('budget projection resolves every binding of actual official generated storage', () => {
  const plan = JSON.parse(readFileSync(new URL('../Gameplay/generated/server/effect-operation-plans.json', import.meta.url)));
  const summary = summarizeEffectOperationBudgets(plan);
  assert.ok(summary.factFields > 0); assert.equal(summary.factValueBytes, 16);
  assert.ok(summary.programs.some(program => program.name === 'bomber.outcome'));
});
