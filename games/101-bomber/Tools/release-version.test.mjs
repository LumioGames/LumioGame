import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseProps = 'eng/BomberRelease.props';
const RELEASE_VERSION = /<Version>([^<]+)<\/Version>/.exec(readFileSync(join(repo, releaseProps), 'utf8'))?.[1];
if (!RELEASE_VERSION) throw new Error('BomberRelease.props must declare Version');
const SDK_VERSION = /<LumioRequiredSdkVersion>([^<]+)<\/LumioRequiredSdkVersion>/.exec(readFileSync(join(repo, releaseProps), 'utf8'))?.[1];
if (!SDK_VERSION) throw new Error('BomberRelease.props must declare LumioRequiredSdkVersion');
const scopes = [
  {
    name: 'root',
    files: ['Directory.Build.props', 'Directory.Build.targets', 'eng/ResolveLumioSdk.proj'],
    probe: 'eng/ResolveLumioSdk.proj',
    missing: 'LUMIO_SDK_UNRESOLVED',
  },
  {
    name: 'Spectator',
    files: ['Client/UI/Spectator/Directory.Build.props', 'Client/UI/Spectator/Directory.Build.targets'],
    probe: 'Client/UI/Spectator/Probe.proj',
    missing: 'BLOCKED: the Engine/ release is missing its spectator parts',
  },
];

function fixture(t, scope, version) {
  const root = mkdtempSync(join(tmpdir(), 'b-rv-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [...scope.files, releaseProps, 'eng/EngineCandidate.targets', 'eng/select-engine-candidate.mjs']) {
    const source = join(repo, file);
    if (!existsSync(source)) continue;
    const destination = join(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  if (scope.name === 'Spectator') {
    writeFileSync(join(root, scope.probe), '<Project DefaultTargets="Build">\n  <Import Project="Directory.Build.props" />\n  <Import Project="Directory.Build.targets" />\n  <Target Name="Build" DependsOnTargets="EnsureSpectatorInputs" />\n</Project>\n');
    const config = join(root, 'Client/Config/Tables/client/manifest.json');
    mkdirSync(dirname(config), { recursive: true });
    writeFileSync(config, '{}');
  }
  if (version !== null) {
    const engine = join(root, 'Engine');
    mkdirSync(join(engine, 'sdk'), { recursive: true });
    writeFileSync(join(engine, 'manifest.json'), JSON.stringify({ version }));
    writeFileSync(join(engine, 'sdk', `Lumio.Engine.SDK.${version}.nupkg`), 'fixture');
    const replica = join(engine, 'web/replica/netstandard2.1');
    mkdirSync(replica, { recursive: true });
    writeFileSync(join(engine, 'web/connect-ds.mjs'), '');
    writeFileSync(join(replica, 'Lumio.Client.Spectator.dll'), 'fixture');
  }
  return join(root, scope.probe);
}

function msbuild(probe, ...args) {
  const result = spawnSync('dotnet', ['msbuild', probe, '-nologo', '-v:q', ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

for (const scope of scopes) {
  test(`${scope.name}: matching release builds and evaluates separate product and SDK versions`, (t) => {
    const probe = fixture(t, scope, SDK_VERSION);
    const build = msbuild(probe);
    assert.equal(build.code, 0, build.output);
    const evaluated = msbuild(probe, '-getProperty:Version,LumioRequiredSdkVersion,LumioSdkVersion,LumioEngineRoot');
    assert.equal(evaluated.code, 0, evaluated.output);
    const values = JSON.parse(evaluated.output);
    assert.equal(values.Properties.Version, RELEASE_VERSION);
    assert.equal(values.Properties.LumioRequiredSdkVersion, SDK_VERSION);
    assert.equal(values.Properties.LumioSdkVersion, SDK_VERSION);
    assert.match(values.Properties.LumioEngineRoot.replaceAll('\\', '/'), /\/Engine\/$/);
  });

  test(`${scope.name}: a different installed SDK reports the required and actual versions`, (t) => {
    const probe = fixture(t, scope, '0.0.2-main.3c5ac27');
    const result = msbuild(probe);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /LUMIO_SDK_VERSION_MISMATCH/);
    assert.match(result.output, /0\.0\.2-main\.3c5ac27/);
    assert.ok(result.output.includes(SDK_VERSION), result.output);
    assert.match(result.output.replaceAll('\\', '/'), /\/Engine\//);
  });

  test(`${scope.name}: a missing release keeps its existing input diagnostic`, (t) => {
    const probe = fixture(t, scope, null);
    const result = msbuild(probe);
    assert.notEqual(result.code, 0, result.output);
    assert.ok(result.output.includes(scope.missing), result.output);
    assert.doesNotMatch(result.output, /LUMIO_SDK_VERSION_MISMATCH/);
  });
}

test('Presentation and Platform release identifiers agree with evaluated product version', (t) => {
  const probe = fixture(t, scopes[0], SDK_VERSION);
  const evaluated = msbuild(probe, '-getProperty:Version,LumioRequiredSdkVersion');
  assert.equal(evaluated.code, 0, evaluated.output);
  const { Version, LumioRequiredSdkVersion } = JSON.parse(evaluated.output).Properties;
  const presentation = JSON.parse(readFileSync(join(repo, 'Client/Presentation/package.json'), 'utf8'));
  const platform = readFileSync(join(repo, 'Tools/compose/platform.env'), 'utf8');
  const releaseId = platform.match(/^Platform__Allocations__bomber__GameReleaseId=(.+)$/m)?.[1]?.trim();
  assert.equal(Version, RELEASE_VERSION);
  assert.equal(LumioRequiredSdkVersion, SDK_VERSION);
  assert.equal(presentation.version, Version);
  assert.equal(releaseId, `bomber-${Version}`);
});
