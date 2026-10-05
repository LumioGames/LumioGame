import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export function validateCandidate(root) {
  root = resolve(root);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.candidateKind !== 'browser-validation-only' || manifest.fullRelease !== false)
    throw new Error('Not a browser validation candidate; this selector cannot approve a complete release');
  const sourceNames = ['LumioGameEngine', 'LumioGameRuntime', 'LumioClient', 'LumioVoxelEngine', 'LumioNativeCore'];
  for (const name of sourceNames)
    if (!/^[0-9a-f]{40}$/.test(manifest.sources?.[name])) throw new Error(`Missing fixed candidate source: ${name}`);
  if (!manifest.files || !Object.keys(manifest.files).length) throw new Error('Candidate hash manifest is empty');
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (isAbsolute(path) || path.includes('\\') || path.split('/').includes('..') || relative(root, resolve(root, path)).startsWith('..'))
      throw new Error('Candidate path escapes its root');
    if (!/^[0-9a-f]{64}$/.test(hash) || createHash('sha256').update(readFileSync(join(root, path))).digest('hex') !== hash)
      throw new Error(`Candidate hash mismatch: ${path}`);
  }
  const actualFiles = [];
  function inventory(directory, prefix = '') {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), relativePath = prefix + name, info = lstatSync(path);
      if (info.isSymbolicLink()) throw new Error('Candidate inventory cannot contain symbolic links');
      if (info.isDirectory()) inventory(path, relativePath + '/');
      else if (info.isFile()) actualFiles.push(relativePath);
      else throw new Error('Candidate inventory contains a non-file artifact');
    }
  }
  inventory(root);
  if (JSON.stringify(actualFiles.filter(path => path !== 'manifest.json').sort()) !== JSON.stringify(Object.keys(manifest.files).sort()))
    throw new Error('Candidate inventory differs from its hash manifest');
  if (manifest.sdkIdentity !== 'sdk/identity.json' || !manifest.files[manifest.sdkIdentity]) throw new Error('SDK identity is not hashed');
  const identity = JSON.parse(readFileSync(join(root, manifest.sdkIdentity), 'utf8'));
  if (identity.packageId !== 'Lumio.Engine.SDK' || identity.version !== manifest.version || !/^[0-9A-Za-z.+-]+$/.test(identity.version))
    throw new Error('SDK identity version mismatch');
  const packagePath = `sdk/Lumio.Engine.SDK.${identity.version}.nupkg`;
  if (!manifest.files[packagePath] || createHash('sha512').update(readFileSync(join(root, packagePath))).digest('base64') !== identity.sha512)
    throw new Error('SDK package identity mismatch');
  if (manifest.builderIdentity !== 'builder-identity.json' || !manifest.files[manifest.builderIdentity]) throw new Error('Candidate builder identity is not hashed');
  const builder = JSON.parse(readFileSync(join(root, manifest.builderIdentity), 'utf8'));
  if (builder.entry !== 'eng/pack-release.mjs defaultBuilders.replica + defaultBuilders.web') throw new Error('Candidate builder entry is not the official browser assembler');
  for (const name of sourceNames) if (builder.sources?.[name] !== manifest.sources[name]) throw new Error(`Candidate builder source mismatch: ${name}`);
  if (builder.sdk?.version !== identity.version || !/^[0-9a-f]{64}$/.test(identity.payloadSha256) || builder.sdk.payloadSha256 !== identity.payloadSha256)
    throw new Error('Candidate builder SDK payload mismatch');
  if (!Array.isArray(builder.files) || !builder.files.length) throw new Error('Candidate builder web inventory is empty');
  const webPaths = new Set();
  for (const file of builder.files) {
    const path = `web/${file.path}`;
    if (!Object.hasOwn(manifest.files, path) || webPaths.has(path) || file.sha256 !== manifest.files[path] || !Number.isSafeInteger(file.bytes) || file.bytes !== lstatSync(join(root, path)).size)
      throw new Error(`Candidate builder web inventory mismatch: ${path}`);
    webPaths.add(path);
  }
  if (JSON.stringify([...webPaths].sort()) !== JSON.stringify(actualFiles.filter(path => path.startsWith('web/')).sort()))
    throw new Error('Candidate builder web inventory is incomplete');
  return { root, version: identity.version, manifest };
}

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function writeSelection(root, output) {
  const selected = validateCandidate(root), file = resolve(output), config = `${file}.NuGet.config`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(config, `<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/><add key="lumio-engine" value="${xml(join(selected.root, 'sdk'))}"/></packageSources><packageSourceMapping><packageSource key="nuget.org"><package pattern="*"/></packageSource><packageSource key="lumio-engine"><package pattern="Lumio.Engine.SDK"/></packageSource></packageSourceMapping></configuration>\n`);
  writeFileSync(file, `<Project><PropertyGroup><LumioEngineRoot>${xml(selected.root.replaceAll('\\', '/') + '/')}</LumioEngineRoot><LumioEngineCandidate>true</LumioEngineCandidate><LumioRequiredSdkVersion>${xml(selected.version)}</LumioRequiredSdkVersion><RestoreConfigFile>${xml(config)}</RestoreConfigFile></PropertyGroup></Project>\n`);
  return { selectionProps: file, ...selected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--verify') validateCandidate(process.argv[3]);
  else if (process.argv.length === 4) console.log(JSON.stringify(writeSelection(process.argv[2], process.argv[3])));
  else throw new Error('Usage: select-engine-candidate.mjs <candidate-root> <selection.props> | --verify <candidate-root>');
}
