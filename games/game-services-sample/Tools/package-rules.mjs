import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const arg = name => { const i = process.argv.indexOf(name); if (i < 0) throw Error(`${name} required`); return process.argv[i + 1]; };
const sample = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wireBytes = await fs.readFile(path.join(arg('--engine'), 'engine/wire/game-services-v1.json'));
const wire = JSON.parse(wireBytes), deployment = JSON.parse(await fs.readFile(path.join(sample, 'Server/deployment.json')));
const dll = path.resolve(arg('--dll')), output = path.resolve(arg('--out'));
if (path.basename(dll) !== 'Lumio.GameServices.Sample.Rules.dll') throw Error('Expected the built sample plugin assembly');
await fs.mkdir(output, { recursive: true }); if ((await fs.readdir(output)).length) throw Error('Output must be empty');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await fs.readFile(dll), catalog = await fs.readFile(path.join(sample, 'Server/catalog.json'));
await fs.mkdir(path.join(output, 'artifact')); await fs.writeFile(path.join(output, 'artifact', path.basename(dll)), bytes);
const manifest = Buffer.from(JSON.stringify({ gameId: deployment.gameId, environment: deployment.environment, releaseId: deployment.releaseId, ruleVersion: deployment.ruleVersion,
  contractId: wire.contractId, contractSha256: hash(wireBytes), entryAssembly: path.basename(dll), entryType: deployment.pluginEntryType, files: [{ path: path.basename(dll), sha256: hash(bytes) }] }));
await fs.writeFile(path.join(output, 'artifact.json'), manifest); await fs.writeFile(path.join(output, 'catalog.json'), catalog);
await fs.writeFile(path.join(output, 'registration-input.json'), JSON.stringify({ ...deployment, artifactRoot: './artifact', artifactManifest: './artifact.json', manifestDigest: hash(manifest), schemaCatalogDigest: hash(catalog), maximumConcurrentCalls: 4 }, null, 2));
console.log(JSON.stringify({ output, artifactDigest: hash(manifest), schemaCatalogDigest: hash(catalog) }));
