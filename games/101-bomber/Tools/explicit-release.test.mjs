import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareEngine } from './engine-release.mjs';
import { parseLaunchArgs } from './launcher.mjs';

function fixture(overrides = {}, verifier = 'process.exit(0)') {
  const root = mkdtempSync(join(tmpdir(), 'bomber-complete-release-'));
  mkdirSync(join(root, 'tools'));
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({
    version: '0.1.0-main.abcdef0', platforms: ['win-x64'], ...overrides,
  }));
  writeFileSync(join(root, 'tools/verify-release.mjs'), verifier);
  return root;
}

test('explicit complete release resolves every engine asset from the verified selected root', () => {
  const root = fixture();
  const calls = [];
  const release = prepareEngine({ repoRoot: tmpdir(), releaseRoot: root, rid: 'win-x64',
    git: () => { throw new Error('explicit selection must not initialize or fall back to Engine/'); },
    node: (args, options) => { calls.push({ args, options }); return { status: 0 }; },
  });
  assert.equal(release.dir, root);
  assert.equal(release.initialized, false);
  assert.equal(release.layout.dsExe, join(root, 'server/win-x64/lumio-ds.exe'));
  assert.equal(release.layout.botHost, join(root, 'bot/win-x64/Lumio.Client.Bot.Host.dll'));
  assert.equal(release.layout.web, join(root, 'web'));
  assert.deepEqual(calls, [{ args: [join(root, 'tools/verify-release.mjs'), '--root', root, '--rid', 'win-x64'], options: { cwd: root } }]);
});

test('explicit release refuses browser-only, missing, unsupported and corrupt packages without fallback', () => {
  const never = () => { throw new Error('must not fall back to submodule'); };
  const options = { repoRoot: tmpdir(), rid: 'win-x64', git: never };
  assert.throws(() => prepareEngine({ ...options, releaseRoot: fixture({ candidateKind: 'browser-validation-only', fullRelease: false }) }), /complete release/i);
  assert.throws(() => prepareEngine({ ...options, releaseRoot: join(tmpdir(), 'missing-bomber-release-28b0e6d') }), /BLOCKED_ENV/);
  assert.throws(() => prepareEngine({ ...options, releaseRoot: fixture({ platforms: ['linux-x64'] }) }), /this machine is win-x64/);
  assert.throws(() => prepareEngine({ ...options, releaseRoot: fixture({}, 'console.error("sha256 mismatch"); process.exit(1)') }), /ENGINE_RELEASE_INVALID.*sha256 mismatch/);
});

test('launcher accepts an explicit complete engine release only as a named CLI input', () => {
  assert.equal(parseLaunchArgs(['--engine-release', 'C:/private/full-release'], {}).engineRelease, 'C:/private/full-release');
  assert.equal(parseLaunchArgs([], { LUMIO_ENGINE_ROOT: 'C:/loose/source' }).engineRelease, undefined);
});

test('complete release build selection pins the same root, SDK version and feed and rejects browser output', async () => {
  const { writeSelection } = await import('../eng/select-engine-release.mjs');
  const root = fixture();
  const output = join(mkdtempSync(join(tmpdir(), 'bomber-release-props-')), 'selection.props');
  const selected = writeSelection(root, output, { rid: 'win-x64' });
  assert.equal(selected.root, root);
  assert.match(readFileSync(output, 'utf8'), /<LumioEngineCandidateKind>complete-release<\/LumioEngineCandidateKind>/);
  assert.match(readFileSync(output, 'utf8'), /<LumioRequiredSdkVersion>0\.1\.0-main\.abcdef0<\/LumioRequiredSdkVersion>/);
  assert.ok(readFileSync(output, 'utf8').includes(root.replaceAll('\\', '/') + '/'));
  assert.ok(readFileSync(`${output}.NuGet.config`, 'utf8').includes(join(root, 'sdk')));
  const rejected = `${output}.rejected`;
  assert.throws(() => writeSelection(fixture({ candidateKind: 'browser-validation-only', fullRelease: false }), rejected, { rid: 'win-x64' }), /complete release/i);
  assert.equal(existsSync(rejected), false);
});

test('Bot scenario references resolve from the selected complete release', () => {
  const root = fixture();
  const project = fileURLToPath(new URL('../Client/Bots/Lumio.Bomber.Bots.csproj', import.meta.url));
  const result = spawnSync('dotnet', ['msbuild', project, `-p:LumioEngineRoot=${root}/`,
    '-getProperty:LumioClientBotDirectory,NETCoreSdkRuntimeIdentifier'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const { Properties: properties } = JSON.parse(result.stdout);
  assert.equal(properties.LumioClientBotDirectory.replaceAll('\\', '/'),
    `${root.replaceAll('\\', '/')}/bot/${properties.NETCoreSdkRuntimeIdentifier}`);
});
