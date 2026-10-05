import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { READER_FILES } from './sync-config-readers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = 'Gameplay/Lumio.Bomber.Gameplay.csproj';

// ADR-115 / split-export/1: the client end carries only the C projection; the
// server end carries S + V (VoxelEngine runs inside the DS process) plus the
// origins trace. Neither end may carry the other's files.
const ALLOWED = {
  client: name => name === 'config/manifest.json' || name.startsWith('config/client/')
    || /^config\/profiles\/[^/]+\/(manifest\.json|client\/)/.test(name),
  server: name => name === 'config/manifest.json' || name === 'config/origins.json'
    || name.startsWith('config/server/') || name.startsWith('config/voxel/'),
};
const FORBIDDEN_PREFIX = { client: ['config/server/', 'config/voxel/'], server: ['config/client/'] };

function evaluate(side, extra = []) {
  // Evaluation only (no restore, no build): the side selection does not depend on Engine/.
  return JSON.parse(execFileSync('dotnet', ['msbuild', project,
    ...(side ? [`-p:LumioEcsSide=${side}`] : []), ...extra,
    '-getProperty:OutputPath,IntermediateOutputPath', '-getItem:Compile,None'],
  { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
}

for (const side of ['client', 'server', '']) {
  test(`${side || 'default server'} selects only its configuration projection`, () => {
    const result = evaluate(side);
    const selected = side || 'server';
    const end = selected === 'client' ? 'Client' : 'Server';
    const readers = result.Items.Compile.map(x => x.Identity.replaceAll('\\', '/'))
      .filter(x => x.includes('/Config/Generated/'));
    assert.equal(readers.length, READER_FILES.filter(([end]) => end === selected).length);
    assert.ok(readers.every(x => x.includes(`/${end}/Config/Generated/`)), readers.join('\n'));
    const copies = result.Items.None.filter(x => x.CopyToOutputDirectory)
      .map(x => (x.Link || x.Identity).replaceAll('\\', '/'))
      .filter(x => x.startsWith('config/'));
    assert.ok(copies.includes('config/manifest.json'));
    assert.ok(copies.includes(`config/${selected}/manifest.json`));
    assert.ok(copies.every(ALLOWED[selected]), copies.join('\n'));
    for (const prefix of FORBIDDEN_PREFIX[selected]) {
      assert.ok(!copies.some(x => x.startsWith(prefix)), `${selected} must not copy ${prefix}: ${copies.join('\n')}`);
    }
  });
}

test('side and configuration outputs are distinct and honor SDK artifacts isolation', () => {
  const client = evaluate('client').Properties;
  const server = evaluate('server').Properties;
  const release = evaluate('client', ['-p:Configuration=Release']).Properties;
  assert.notEqual(client.OutputPath, server.OutputPath);
  assert.notEqual(client.IntermediateOutputPath, server.IntermediateOutputPath);
  assert.match(client.OutputPath, /Debug/);
  assert.notEqual(client.OutputPath, release.OutputPath);
  const artifacts = path.join(root, 'artifacts', 'config-isolation');
  const isolated = evaluate('client', [`-p:ArtifactsPath=${artifacts}`]).Properties;
  assert.ok(path.resolve(isolated.OutputPath).startsWith(artifacts));
  assert.ok(path.resolve(isolated.IntermediateOutputPath).startsWith(artifacts));
});
