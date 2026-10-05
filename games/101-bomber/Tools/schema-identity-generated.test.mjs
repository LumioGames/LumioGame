import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readObservation,readObservationInputs,observeSnapshot,tokenize,verifyGeneratedHooks} from './schema-identity-read.mjs';

const root=new URL('../',import.meta.url);
for(const side of ['server','client']) {
  const path=`Gameplay/generated/${side}/BomberPresentationJournal.g.cs`;
  const text=await readFile(new URL(path,root),'utf8');
  const fields=[{kind:'container',shape:{member:'Entries',ordinal:0,containerKind:'SyncList',elementType:'System.String',clrType:'SyncList<System.String>'}}];
  test(`${side}: actual container hook declarations and dispatch are complete`,()=>{
    verifyGeneratedHooks(tokenize(text,path),fields,side,path);
    for(const [from,to] of [
      ['ordinal == 0','ordinal == 1'],
      ['OnEntriesItemChanged(change, reason);',''],
      ['ListItemChange<string> change','ListItemChange<int> change'],
      ['IReadOnlyList<string> old','IReadOnlyList<int> old'],
    ]) {
      assert.ok(text.includes(from));
      assert.throws(()=>verifyGeneratedHooks(tokenize(text.replace(from,to),path),fields,side,path),e=>e.code==='unsupported_source_shape');
    }
  });
}


const observed=await readObservation(fileURLToPath(root));
const files=await readObservationInputs(fileURLToPath(root));
test('explicit SDK selection records its real root while preserving pinned logical evidence',()=>{
  assert.equal(observed.packageRoot,resolve(process.env.BOMBER_SCHEMA_ENGINE_ROOT||fileURLToPath(new URL('Engine/',root))));
  assert.deepEqual([...files.keys()],observed.files.map(file=>file.path));
  assert.ok(observed.files.some(file=>file.path==='Engine/manifest.json'));
  assert.ok(observed.files.some(file=>file.path.startsWith('Engine/sdk/')&&file.path.endsWith('.nupkg')));
});
test('SDK selection rejects ambiguous relative paths and never falls back from an absent explicit package',async()=>{
  await assert.rejects(readObservationInputs(fileURLToPath(root),{engineRoot:'Engine'}),{code:'invalid_package_root'});
  await assert.rejects(readObservationInputs(fileURLToPath(root),{engineRoot:resolve(fileURLToPath(root),'Gameplay')}),{code:'ENOENT'});
});
test('package03 actual uint capture and checked restore are present on both sides',()=>{
  const field=observed.identities.find(i=>i.value==='BomberFireZoneState.sourceSkill');
  for(const side of ['server','client']) assert.deepEqual(field.shape.serialization[side],{capturePersist:true,captureSync:true,restorePersist:true});
});
for(const side of ['server','client']) test(side+': uint omission, wrong codec and unchecked restore fail closed',()=>{
  const path='Gameplay/generated/'+side+'/BomberFireZoneState.g.cs',text=files.get(path).toString();
  for(const [from,to] of [
    ['writer.WriteUInt64("BomberFireZoneState.sourceSkill", SourceSkill.Value);',''],
    ['writer.WriteUInt64("BomberFireZoneState.sourceSkill", SourceSkill.Value);','writer.WriteInt32("BomberFireZoneState.sourceSkill", SourceSkill.Value);'],
    ['checked((uint)sourceSkillRestore)','(uint)sourceSkillRestore'],
  ]) {
    const index=from.startsWith('writer.')?text.indexOf(from,text.indexOf('void IGeneratedComponent.CaptureSync')):text.indexOf(from);
    assert.ok(index>=0);const changed=new Map(files);changed.set(path,Buffer.from(text.slice(0,index)+to+text.slice(index+from.length)));
    assert.throws(()=>observeSnapshot(changed),e=>e.code==='unsupported_source_shape'&&e.path===path&&e.member.includes('sourceSkill'));
  }
});
for(const side of ['server','client']) test(side+': uint restore rejects disabled or detached guards',()=>{
  const path='Gameplay/generated/'+side+'/BomberFireZoneState.g.cs',text=files.get(path).toString();
  const guard='if (reader.TryReadUInt64("BomberFireZoneState.sourceSkill", out ulong sourceSkillRestore))';
  const assignment='SourceSkill.SetSilent(checked((uint)sourceSkillRestore));';
  for(const [from,to] of [
    [guard,'if (false && reader.TryReadUInt64("BomberFireZoneState.sourceSkill", out ulong sourceSkillRestore))'],
    [guard,'if (false) '+guard],
    [guard,guard+';'],
    [assignment,'if (false) '+assignment],
  ]) {
    assert.ok(text.includes(from));
    const changed=new Map(files);changed.set(path,Buffer.from(text.replace(from,to)));
    assert.throws(()=>observeSnapshot(changed),e=>e.code==='unsupported_source_shape'&&e.path===path);
  }
});
test('candidate admission rejects altered manifest bytes and absent or substituted SDK bytes',()=>{
  const sdkPath=[...files.keys()].find(path=>path.startsWith('Engine/sdk/')&&path.endsWith('.nupkg'));
  assert.ok(sdkPath);
  for(const path of ['Engine/manifest.json',sdkPath]) {
    for(const replacement of [null,Buffer.from('substituted package')]) {
      const changed=new Map(files);if(replacement===null)changed.delete(path);else changed.set(path,replacement);
      assert.throws(()=>observeSnapshot(changed),e=>e.code==='unsupported_source_shape');
    }
  }
});

for(const side of ['server','client']) test(side+': actual capacity metadata and container binding cannot drift',()=>{
  const registry='Gameplay/generated/'+side+'/Lumio.Bomber.Gameplay.Registry.g.cs';
  const metadata='Gameplay/generated/'+side+'/attribute-declarations.json';
  const generated='Gameplay/generated/'+side+'/BomberPresentationJournal.g.cs';
  for(const [path,change] of [
    [registry,text=>text.replace('"BomberPresentationJournal.entries", "list", "persistent", "replicated", "room-public", 128','"BomberPresentationJournal.entries", "list", "persistent", "replicated", "room-public", 127')],
    [metadata,text=>{const rows=JSON.parse(text);rows.find(r=>r.attributeId==='BomberPresentationJournal.entries').maxCapacity=127;return JSON.stringify(rows);}],
    [generated,text=>text.replace('Entries.Bound(host, this, 0,','Entries.Bound(host, this, 1,')],
  ]) {
    const text=files.get(path).toString(),replacement=change(text);assert.notEqual(text,replacement);
    const changed=new Map(files);changed.set(path,Buffer.from(replacement));
    assert.throws(()=>observeSnapshot(changed),e=>e.code==='unsupported_source_shape');
  }
});
