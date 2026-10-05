import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('Bomber client removes copied mining, restore and chat products', () => {
  for (const path of ['Client/UI/Chat', 'Client/Tests/Chat', 'Client/Bots/BomberMiningPlan.cs', 'Client/Bots/BomberMiningScenario.cs', 'Client/Bots/BomberRestoreVerifyScenario.cs', 'Client/Application/BomberClientInstance.cs'])
    assert.equal(existsSync(join(root, path)), false, path);
});

for (const name of ['Application', 'Bots']) {
  test(`${name} references only the Engine release client graph`, () => {
    const dir = join(root, 'Client', name);
    const project = readdirSync(dir).find(file => file.endsWith('.csproj'));
    const source = readFileSync(join(dir, project), 'utf8');
    assert.doesNotMatch(source, /SAMPLE_|LumioClientApplicationDirectory|LumioClientApplicationAssembly|prebuilt/);
    const evaluation = JSON.parse(execFileSync('dotnet', ['msbuild', join(dir, project), '-getItem:Reference,ProjectReference'],
      { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
    const references = evaluation.Items.Reference.filter(item => item.Identity.includes('Lumio.Client'));
    assert.ok(references.length > 0);
    for (const reference of references) {
      const path = resolve(reference.HintPath || reference.Identity);
      assert.ok(path.startsWith(resolve(root, 'Engine/bot') + sep), path);
      assert.ok(existsSync(path), path);
    }
    const gameplay = evaluation.Items.ProjectReference.find(item => item.Identity.includes('Lumio.Bomber.Gameplay.csproj'));
    assert.ok(gameplay);
    assert.match(gameplay.AdditionalProperties, /LumioEcsSide=client/);
  });
}
