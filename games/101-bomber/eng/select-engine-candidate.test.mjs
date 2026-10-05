import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateCandidate } from './select-engine-candidate.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bomber-candidate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'sdk'));
  const bytes = Buffer.from('test package identity'), version = '0.1.0-dev.test';
  const identity = { packageId: 'Lumio.Engine.SDK', version, payloadSha256: 'f'.repeat(64), sha512: createHash('sha512').update(bytes).digest('base64') };
  writeFileSync(join(root, 'sdk', `Lumio.Engine.SDK.${version}.nupkg`), bytes);
  writeFileSync(join(root, 'sdk/identity.json'), JSON.stringify(identity));
  const files = Object.fromEntries([[`sdk/Lumio.Engine.SDK.${version}.nupkg`, bytes], ['sdk/identity.json', Buffer.from(JSON.stringify(identity))]]
    .map(([path, data]) => [path, createHash('sha256').update(data).digest('hex')]));
  const manifest = { formatVersion: 1, candidateKind: 'browser-validation-only', fullRelease: false, sdkIdentity: 'sdk/identity.json', builderIdentity: 'builder-identity.json', version, files,
    sources: { LumioGameEngine: 'a'.repeat(40), LumioGameRuntime: 'b'.repeat(40), LumioClient: 'c'.repeat(40), LumioVoxelEngine: 'd'.repeat(40), LumioNativeCore: 'e'.repeat(40) } };
  mkdirSync(join(root,'web')); writeFileSync(join(root,'web/engine.mjs'),'export const fixture=true;');
  const webHash=createHash('sha256').update('export const fixture=true;').digest('hex');
  files['web/engine.mjs']=webHash;
  const builder={entry:'eng/pack-release.mjs defaultBuilders.replica + defaultBuilders.web',sources:{...manifest.sources},sdk:{version,payloadSha256:identity.payloadSha256},files:[{path:'engine.mjs',bytes:26,sha256:webHash}]};
  const saveBuilder=()=>{const body=JSON.stringify(builder);writeFileSync(join(root,'builder-identity.json'),body);files['builder-identity.json']=createHash('sha256').update(body).digest('hex');};saveBuilder();
  const save = () => writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest)); save();
  return { root, manifest, save, builder, saveBuilder };
}
test('candidate identity selects SDK independently of product version', t => {
  const { root } = fixture(t);
  assert.equal(validateCandidate(root).version, '0.1.0-dev.test');
});

test('candidate requires its builder evidence and the exact same sources and SDK payload',t=>{
  const {root,manifest,save,builder,saveBuilder}=fixture(t);
  delete manifest.builderIdentity;save();assert.throws(()=>validateCandidate(root),/builder/i);
  manifest.builderIdentity='builder-identity.json';builder.sources.LumioClient='f'.repeat(40);saveBuilder();save();assert.throws(()=>validateCandidate(root),/source/i);
  builder.sources.LumioClient=manifest.sources.LumioClient;builder.sdk.payloadSha256='e'.repeat(64);saveBuilder();save();assert.throws(()=>validateCandidate(root),/SDK/i);
});

test('candidate refuses unlisted assemblies and removal from the builder web inventory',t=>{
  const {root,manifest,save,builder,saveBuilder}=fixture(t);
  writeFileSync(join(root,'web/Unhashed.dll'),'unlisted');assert.throws(()=>validateCandidate(root),/inventory/i);rmSync(join(root,'web/Unhashed.dll'));
  builder.files=[];saveBuilder();save();assert.throws(()=>validateCandidate(root),/builder|inventory/i);
  delete manifest.files['web/engine.mjs'];save();assert.throws(()=>validateCandidate(root),/inventory/i);
});
test('candidate refuses changed payload, traversal and a false full-release claim', t => {
  const { root, manifest, save } = fixture(t);
  manifest.fullRelease = true; save(); assert.throws(() => validateCandidate(root), /candidate/);
  manifest.fullRelease = false; manifest.files['../escape'] = '0'.repeat(64); save(); assert.throws(() => validateCandidate(root), /path/);
  delete manifest.files['../escape']; save();
  writeFileSync(join(root, 'sdk/identity.json'), '{}'); assert.throws(() => validateCandidate(root), /hash/);
});
