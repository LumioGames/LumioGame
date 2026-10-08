import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// Keep one export cut for the lifetime of this local host. The Runtime loader,
// not this HTTP carrier, validates and interprets the configuration manifest.
export function createClientConfigResponse(configDir) {
  if (configDir == null) return () => false;
  const root = realpathSync(resolve(configDir));
  const read = relative => {
    const file = realpathSync(join(root, relative));
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('client_config_path_invalid');
    return readFileSync(file).toString('base64');
  };
  const files = { 'manifest.json': read('manifest.json'), 'client/manifest.json': read('client/manifest.json') };
  for (const name of readdirSync(join(root, 'client')).sort()) {
    if (/^[a-zA-Z0-9_-]+\.json$/.test(name)) files[`client/${name}`] = read(`client/${name}`);
  }
  const body = Buffer.from(JSON.stringify({ files }));
  return (request, response, pathname) => {
    if (pathname !== '/api/game/config') return false;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405); response.end(); return true;
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
    return true;
  };
}
