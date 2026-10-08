import assert from 'node:assert/strict';

// Mirrors the fixed plan tuple consumed by EffectReducerPlan.FreezeCore. This
// reports declaration requirements; it does not authorize product admission.
export function summarizeEffectOperationBudgets(plan) {
  assert.ok(Array.isArray(plan) && plan.length === 9);
  const fields = plan[2], rows = plan[5], programs = plan[7];
  const registryIndices = new Map(fields.map((field, index) => [JSON.stringify(field), index]));
  assert.equal(registryIndices.size, fields.length);
  const scalarBytes = type => ({ bool: 1, i32: 4, u32: 4, i64: 8, u64: 8, entity: 16 })[type] ?? 0;
  const factFields = new Set(), reducerFields = new Set();
  let factValueBytes = 0, writes = 0, indexedWrites = 0, writeBytes = 0, work = 0, scratchBytes = 0, reducerValueBytes = 0;
  for (const row of rows) for (const column of row[5]) {
    assert.ok(Number.isSafeInteger(column[0]) && column[0] >= 0 && column[0] < fields.length);
    if (column[1] === 'status') continue;
    factFields.add(column[0]);
    factValueBytes = Math.max(factValueBytes, scalarBytes(fields[column[0]][6]));
  }
  for (const program of programs) {
    assert.ok(program[8].every(value => Number.isSafeInteger(value) && value >= 0));
    writes += program[8][0]; indexedWrites += program[8][1]; writeBytes += program[8][2]; work += program[8][3];
    scratchBytes = Math.max(scratchBytes, program[8][4]);
    for (const field of program[5]) {
      const index = registryIndices.get(JSON.stringify(field.slice(0, 12)));
      assert.notEqual(index, undefined, 'Each reducer binding must name exact actual registry storage.');
      reducerFields.add(index);
      reducerValueBytes = Math.max(reducerValueBytes, scalarBytes(field[6]));
    }
  }
  return { factFields: factFields.size, factValueBytes, factFieldIndices: [...factFields].sort((a, b) => a - b),
    writes, indexedWrites, writeBytes, work, scratchBytes, reducerFields: reducerFields.size, reducerValueBytes,
    rows: rows.map(row => ({ name: row[1], columns: row[5].length, capacity: row[4] })),
    programs: programs.map(program => ({ name: program[2], after: program[3], limits: program[8] })) };
}
