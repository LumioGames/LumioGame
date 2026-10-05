// File-interface validation only. These functions do not implement Bomber rules.
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isTick = value => Number.isSafeInteger(value) && value >= 0;
export const isEntityId = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value) && !/^0+$/.test(value);
export function isJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) && !isObject(value)) return false;
  if (ancestors.has(value)) return false;
  const next = new Set(ancestors); next.add(value);
  return Object.values(value).every(child => isJsonValue(child, next));
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const cellKey = cell => `${cell.x},${cell.y},${cell.z}`;
function validate(world, label) {
  const failures = [];
  const fail = (check, message) => failures.push({ check: `world:${check}`, message: `${label}: ${message}` });
  if (!isObject(world)) { fail('schema', 'must be an object'); return failures; }
  if (!isJsonValue(world)) { fail('schema', 'requires finite JSON values'); return failures; }
  if (world.schema !== 'bomber.world-evidence/1') fail('schema', 'expected bomber.world-evidence/1');
  if (Object.keys(world).some(key => !['schema', 'tick', 'cells', 'entities'].includes(key))) fail('schema', 'unknown top-level field');
  if (!isTick(world.tick)) fail('tick', 'tick must be a nonnegative safe integer');
  for (const field of ['cells', 'entities']) {
    if (!Array.isArray(world[field]) || world[field].length === 0) { fail(field, 'must be a nonempty array'); continue; }
    const keys = new Set();
    for (const [index, item] of world[field].entries()) {
      if (!isObject(item)) { fail(field, `[${index}] must be an object`); continue; }
      let key;
      if (field === 'cells') {
        if (!['x', 'y', 'z'].every(axis => Number.isSafeInteger(item[axis])) || !Number.isInteger(item.blockType) || item.blockType < 0 || item.blockType > 65535
          || Object.keys(item).some(name => !['x', 'y', 'z', 'blockType'].includes(name))) fail(field, `[${index}] requires integer coordinates and uint16 official blockType`);
        key = cellKey(item);
      } else {
        if (!isEntityId(item.entityId) || typeof item.type !== 'string' || !item.type.trim()
          || !isObject(item.fields) || Object.keys(item.fields).length === 0
          || Object.keys(item).some(name => !['entityId', 'type', 'fields'].includes(name))) fail(field, `[${index}] requires full nondefault 128-bit entityId, type, and nonempty fields`);
        key = item.entityId;
      }
      if (keys.has(key)) fail(field, `duplicate key ${key}`);
      keys.add(key);
    }
  }
  return failures;
}

export function assertWorld(actual, expected) {
  const failures = [...validate(actual, 'actual'), ...validate(expected, 'expected')];
  if (failures.length) return failures;
  if (actual.tick !== expected.tick) failures.push({ check: 'world:tick', message: 'final ticks differ' });
  for (const [field, key] of [['cells', cellKey], ['entities', item => item.entityId]]) {
    const ordered = world => [...world[field]].sort((a, b) => key(a).localeCompare(key(b)));
    if (canonical(ordered(actual)) !== canonical(ordered(expected))) failures.push({ check: `world:${field}`, message: `${field} differ from expected evidence` });
  }
  return failures;
}

export const worldsMatch = (actual, expected) => assertWorld(actual, expected).length === 0;
