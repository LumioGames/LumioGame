import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeClientConfig } from './make-client-config.mjs';

test('published config carrier preserves compiled client bytes and excludes private projections', () => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-client-carrier-'));
  try {
    mkdirSync(join(root, 'client')); mkdirSync(join(root, 'server'));
    const manifest = '{"releaseFingerprint":"same-compiled-release"}\n';
    const table = '{"rows":[{"id":101,"name":"default"}]}\n';
    writeFileSync(join(root, 'manifest.json'), manifest);
    writeFileSync(join(root, 'client/manifest.json'), '{"projection":"client"}');
    writeFileSync(join(root, 'client/game.json'), table);
    writeFileSync(join(root, 'server/private.json'), 'private-projection');
    const output = join(root, 'client-config.json');
    const result = writeClientConfig(root, output);
    const carrier = JSON.parse(readFileSync(output));
    assert.deepEqual(Object.keys(carrier.files).sort(), ['client/game.json','client/manifest.json','manifest.json']);
    assert.equal(Buffer.from(carrier.files['manifest.json'], 'base64').toString(), manifest);
    assert.equal(Buffer.from(carrier.files['client/game.json'], 'base64').toString(), table);
    assert.equal(result.releaseFingerprint, 'same-compiled-release');
    assert.equal(result.files, 3);
    assert.equal(readFileSync(output).includes('private-projection'), false);
  } finally { rmSync(root, {recursive:true,force:true}); }
});

test('missing compiled client manifest refuses publication', () => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-client-carrier-'));
  try {
    mkdirSync(join(root, 'client'));
    writeFileSync(join(root, 'manifest.json'), '{}');
    assert.throws(() => writeClientConfig(root, join(root, 'client-config.json')));
  } finally { rmSync(root, {recursive:true,force:true}); }
});
