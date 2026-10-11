import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const sample = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const value = name => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw Error(`${name} is required`); return process.argv[i + 1]; };
const engine = path.resolve(value('--engine-sdk')), platform = path.resolve(value('--platform-sdk')), output = path.resolve(value('--out'));
const origin = value('--platform-origin'), url = new URL(origin);
if (url.origin !== origin || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error('An exact trusted HTTPS origin is required (loopback HTTP only for local probes)');
await fs.mkdir(output, { recursive: true });
if ((await fs.readdir(output)).length) throw Error('Output must be a new empty directory; existing packages are never overwritten');
const sdk = path.join(engine, 'engine/browser/game-services');
const closure = JSON.parse(await fs.readFile(path.join(sdk, 'dist/runtime-closure.json')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceWire = await fs.readFile(path.join(engine, 'engine/wire/game-services-v1.json'));
if (closure.contractSha256 !== digest(sourceWire)) throw Error('SDK closure does not match its wire');
const entries = [];
async function put(relative, bytes) { await fs.mkdir(path.dirname(path.join(output, relative)), { recursive: true }); await fs.writeFile(path.join(output, relative), bytes); entries.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) }); }
for (const file of closure.files) {
  if (!/^(src\/[a-z-]+\.mjs|dist\/(runtime-contract\.mjs|lifecycle\.wasm))$/.test(file.path)) throw Error('Unexpected SDK closure path');
  const bytes = await fs.readFile(path.join(sdk, file.path)); if (digest(bytes) !== file.sha256) throw Error('SDK closure bytes changed');
  await put('vendor/engine/' + file.path, bytes);
}
await put('vendor/lumio/adapter.mjs', await fs.readFile(path.join(platform, 'packages/game-services-lumio/src/adapter.mjs')));
for (const name of ['index.html', 'style.css', 'app.mjs', 'session.mjs']) await put('Client/' + name, await fs.readFile(path.join(sample, 'Client', name)));
await put('Client/publication.json', Buffer.from(JSON.stringify({ platformOrigin: origin }) + '\n'));
await fs.writeFile(path.join(output, 'publication-manifest.json'), JSON.stringify({ contractSha256: closure.contractSha256, files: entries }, null, 2) + '\n');
console.log(JSON.stringify({ output, files: entries.length, contractSha256: closure.contractSha256 }));
