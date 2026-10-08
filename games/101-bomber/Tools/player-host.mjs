import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { createClientConfigResponse } from './client-config-host.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png' };

/** Loopback player harness. Account credentials stay in the launcher's closure. */
export async function startPlayerHost({ root, port = 0, playerCount = 1, getLaunch, configDir }) {
  if (playerCount !== 1 && playerCount !== 2) throw new RangeError('playerCount must be 1 or 2');
  const directory = resolve(root);
  const configResponse = createClientConfigResponse(configDir);
  const indexPath = resolve(directory, 'index.html');
  const readPlayerHtml = playerIndex => {
    const index = readFileSync(indexPath, 'utf8');
    const marker = index.search(/<script\b/i);
    if (marker < 0) throw new Error('Published player bundle has no script/import map.');
    const label = playerIndex === 0 ? 'A' : 'B';
    const launchEndpoint = playerCount === 1 ? '/api/player/launch' : `/api/player/launch?player=${label}`;
    return index.slice(0, marker)
      + `<script>window.__lumioPlayerConfig = {label:"${label}",launchEndpoint:"${launchEndpoint}"};</script>\n`
      + index.slice(marker);
  };
  readPlayerHtml(0);
  const playerIndex = searchParams => {
    const labels = searchParams.getAll('player');
    if (labels.length === 0) return 0;
    if (labels.length !== 1) return -1;
    const index = ['A', 'B'].indexOf(labels[0]);
    return index >= 0 && index < playerCount ? index : -1;
  };
  let origin;
  const minting = new Set();
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (request.headers.host !== new URL(origin).host) {
        response.writeHead(403); response.end(); return;
      }
      const requestedUrl = new URL(request.url, origin);
      const pathname = decodeURIComponent(requestedUrl.pathname);
      if (configResponse(request, response, pathname)) return;
      if (pathname === '/api/player/launch') {
        if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
        if (request.headers.origin !== origin || request.headers['x-lumio-player'] !== '1') {
          response.writeHead(403); response.end(); return;
        }
        const index = playerIndex(requestedUrl.searchParams);
        if (index < 0) { response.writeHead(400); response.end(); return; }
        if (minting.has(index)) { response.writeHead(409); response.end(); return; }
        minting.add(index);
        try {
          const launch = await getLaunch(index);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(launch));
        } finally { minting.delete(index); }
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405); response.end(); return;
      }
      if (pathname === '/') {
        const index = playerIndex(requestedUrl.searchParams);
        if (index < 0) { response.writeHead(400); response.end(); return; }
        const location = playerCount === 1 ? '/play/' : `/play/?player=${index === 0 ? 'A' : 'B'}`;
        response.writeHead(302, { Location: location }); response.end(); return;
      }
      if (pathname === '/play/' || pathname === '/play/index.html') {
        const index = playerIndex(requestedUrl.searchParams);
        if (index < 0) { response.writeHead(400); response.end(); return; }
        const html = readPlayerHtml(index);
        response.writeHead(200, { 'Content-Type': MIME['.html'] });
        response.end(request.method === 'HEAD' ? undefined : html); return;
      }
      if (!pathname.startsWith('/play/')) { response.writeHead(404); response.end(); return; }
      const file = resolve(directory, pathname.slice('/play/'.length));
      if (!file.startsWith(directory + sep)) { response.writeHead(403); response.end(); return; }
      let bytes;
      try {
        if (!statSync(file).isFile()) throw new Error('not a file');
        bytes = readFileSync(file);
      } catch { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end('{"error":"player_launch_unavailable"}');
    }
  });
  await new Promise((ready, reject) => {
    server.once('error', reject);
    server.listen(Number(port), '127.0.0.1', ready);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  const urls = playerCount === 1 ? [`${origin}/play/`] : [`${origin}/play/?player=A`, `${origin}/play/?player=B`];
  return { server, url: urls[0], urls };
}
