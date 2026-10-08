import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareEngine } from '../Tools/engine-release.mjs';

// Complete candidates use the packaged official verifier. Browser-only candidates have
// their own narrower selector and cannot authorize a DS/Bot/Platform launch.
export function validateRelease(root, options = {}) {
  const release = prepareEngine({ ...options, releaseRoot: root });
  return { root: release.dir, version: release.manifest.version, manifest: release.manifest };
}

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function writeSelection(root, output, options = {}) {
  const selected = validateRelease(root, options);
  const file = resolve(output), config = `${file}.NuGet.config`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(config, `<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/><add key="lumio-engine" value="${xml(join(selected.root, 'sdk'))}"/></packageSources><packageSourceMapping><packageSource key="nuget.org"><package pattern="*"/></packageSource><packageSource key="lumio-engine"><package pattern="Lumio.Engine.SDK"/></packageSource></packageSourceMapping></configuration>\n`);
  writeFileSync(file, `<Project><PropertyGroup><LumioEngineRoot>${xml(selected.root.replaceAll('\\', '/') + '/')}</LumioEngineRoot><LumioEngineCandidate>true</LumioEngineCandidate><LumioEngineCandidateKind>complete-release</LumioEngineCandidateKind><LumioRequiredSdkVersion>${xml(selected.version)}</LumioRequiredSdkVersion><RestoreConfigFile>${xml(config)}</RestoreConfigFile></PropertyGroup></Project>\n`);
  return { selectionProps: file, ...selected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--verify' && process.argv.length === 4) validateRelease(process.argv[3]);
  else if (process.argv.length === 4) console.log(JSON.stringify(writeSelection(process.argv[2], process.argv[3])));
  else throw new Error('Usage: select-engine-release.mjs <complete-release-root> <selection.props> | --verify <complete-release-root>');
}
