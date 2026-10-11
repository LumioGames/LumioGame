import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const sample = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const value = name => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw Error(`${name} is required`); return process.argv[i + 1]; };
const sdk = path.resolve(value('--browser-sdk')), pin = value('--manifest-sha256'), contract = path.resolve(value('--contract')), output = path.resolve(value('--out'));
const origin = value('--platform-origin'), url = new URL(origin);
if (url.origin !== origin || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error('An exact trusted HTTPS origin is required (loopback HTTP only for local probes)');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await fs.readFile(path.join(sdk, 'manifest.json'));
if (!/^[a-f0-9]{64}$/.test(pin) || digest(manifestBytes) !== pin) throw Error('SDK external manifest pin invalid');
const manifest = JSON.parse(manifestBytes);
if (manifest.format !== 'lumio.game-services.browser.v1' || manifest.contractSha256 !== digest(await fs.readFile(contract)) || manifest.productionWasm?.testSupport !== false) throw Error('SDK publication invalid');
const files = new Map([['manifest.json', manifestBytes]]);
let gzipBytes = 0;
for (const file of manifest.files) {
  if (typeof file.path !== 'string' || !/^(core|lumio)\/[a-z0-9/_.-]+$/.test(file.path) || file.path.split('/').some(part => !part || part === '.' || part === '..') || files.has(file.path)) throw Error('SDK asset invalid');
  const source = path.join(sdk, file.path);
  const stat = await fs.lstat(source).catch(() => { throw Error('SDK dependency invalid'); });
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('SDK dependency invalid');
  const bytes = await fs.readFile(source);
  if (bytes.length !== file.rawBytes || digest(bytes) !== file.sha256) throw Error('SDK asset invalid');
  files.set(file.path, bytes);
  if (file.runtime) gzipBytes += gzipSync(bytes, { level: 9 }).length;
}
for (const entry of Object.values(manifest.entries)) if (!files.has(entry)) throw Error('SDK dependency invalid');
if (digest(files.get(manifest.entries.wasm)) !== manifest.productionWasm.sha256 || gzipBytes !== manifest.gzip9 || gzipBytes > 131072) throw Error('SDK publication invalid');
async function inventory(directory, relative = '') {
  const result = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const next = relative + item.name;
    if (item.isSymbolicLink()) throw Error('SDK dependency invalid');
    if (item.isDirectory()) result.push(...await inventory(path.join(directory, item.name), next + '/'));
    else if (item.isFile()) result.push(next);
    else throw Error('SDK dependency invalid');
  }
  return result;
}
if (JSON.stringify((await inventory(sdk)).sort()) !== JSON.stringify([...files.keys()].sort())) throw Error('SDK asset invalid');
await fs.mkdir(output, { recursive: true });
if ((await fs.readdir(output)).length) throw Error('Output must be a new empty directory; existing packages are never overwritten');
const entries = [];
async function put(relative, bytes) { await fs.mkdir(path.dirname(path.join(output, relative)), { recursive: true }); await fs.writeFile(path.join(output, relative), bytes); entries.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) }); }
for (const [relative, bytes] of files) await put('vendor/' + relative, bytes);
for (const name of ['index.html', 'style.css', 'app.mjs', 'session.mjs']) await put('Client/' + name, await fs.readFile(path.join(sample, 'Client', name)));
await put('index.html', Buffer.from((await fs.readFile(path.join(sample, 'Client/index.html'), 'utf8')).replace('<head>', '<head><base href="./Client/">')));
await put('Client/publication.json', Buffer.from(JSON.stringify({ platformOrigin: origin }) + '\n'));
await fs.writeFile(path.join(output, 'publication-manifest.json'), JSON.stringify({ sdkManifestSha256: pin, contractSha256: manifest.contractSha256, files: entries }, null, 2) + '\n');
console.log(JSON.stringify({ output, files: entries.length, sdkManifestSha256: pin, contractSha256: manifest.contractSha256 }));
