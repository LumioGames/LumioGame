import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, '.run'), { recursive: true });
const directory = mkdtempSync(join(root, '.run/rule-profile-'));
function evaluate(properties = '', packageName = '') {
  const file = join(directory, `probe-${Math.random().toString(16).slice(2)}.proj`);
  writeFileSync(file, `<Project><PropertyGroup><GameRulePluginProject>true</GameRulePluginProject></PropertyGroup><Import Project="${root}/Directory.Build.props"/><PropertyGroup>${properties}</PropertyGroup>${packageName ? `<ItemGroup><PackageReference Include="${packageName}"/></ItemGroup>` : ''}<Import Project="${root}/Directory.Build.targets"/></Project>`);
  return spawnSync('dotnet', ['msbuild', file, '-nologo', '-t:ValidateGameBuildProfile', '-getProperty:TargetFramework,TargetFrameworks,GenerateDocumentationFile,TreatWarningsAsErrors,EnableNETAnalyzers'], { encoding: 'utf8' });
}
function denied(properties, packageName = '') {
  const result = evaluate(properties, packageName);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /GAME_BUILD_PROFILE_INVALID/);
}
test('rule plugins use the real net10 contract with production documentation and checks', () => {
  const result = evaluate();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const value = JSON.parse(result.stdout).Properties;
  assert.equal(value.TargetFramework, 'net10.0');
  assert.equal(value.TargetFrameworks, '');
  assert.equal(value.GenerateDocumentationFile, 'true');
  assert.equal(value.TreatWarningsAsErrors, 'true');
  assert.equal(value.EnableNETAnalyzers, 'true');
});
test('rule plugins cannot combine a gameplay or test profile', () => {
  denied('<GameProductionProject>true</GameProductionProject>');
  denied('<GameTestProject>true</GameTestProject>');
});
test('rule plugins cannot retarget or become a test project', () => {
  denied('<TargetFramework>netstandard2.1</TargetFramework>');
  denied('<TargetFrameworks>net10.0;netstandard2.1</TargetFrameworks>');
  denied('<IsTestProject>true</IsTestProject>');
});
test('rule plugins cannot reference test packages', () => denied('', 'xunit.v3'));
test('rule plugins retain CSharp 14', () => denied('<LangVersion>13.0</LangVersion>'));
