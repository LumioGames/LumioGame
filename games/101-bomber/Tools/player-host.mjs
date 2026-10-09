import { createServer } from 'node:http';
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createClientConfigResponse } from './client-config-host.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png' };

/** Loopback player harness. Account credentials stay in the launcher's closure. */
export async function startPlayerHost({ root, port = 0, playerCount = 1, getLaunch, configDir, evidenceDir }) {
  if (playerCount !== 1 && playerCount !== 2) throw new RangeError('playerCount must be 1 or 2');
  const directory = resolve(root);
  const evidence = evidenceDir == null ? null : resolve(evidenceDir);
  if (evidence) mkdirSync(evidence, { recursive: true });
  const saved = [0, 0];
  const configResponse = createClientConfigResponse(configDir);
  const indexPath = resolve(directory, 'index.html');
  const readPlayerHtml = playerIndex => {
    const index = readFileSync(indexPath, 'utf8');
    const marker = index.search(/<script\b/i);
    if (marker < 0) throw new Error('Published player bundle has no script/import map.');
    const label = playerIndex === 0 ? 'A' : 'B';
    const launchEndpoint = playerCount === 1 ? '/api/player/launch' : `/api/player/launch?player=${label}`;
    return index.slice(0, marker)
      + `<script>window.__lumioPlayerConfig = {label:"${label}",launchEndpoint:"${launchEndpoint}"${evidence ? `,evidenceEndpoint:"/api/player/evidence?player=${label}"` : ''}};</script>\n`
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
      if (pathname === '/api/player/evidence') {
        if (!evidence) { response.writeHead(404); response.end(); return; }
        if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
        if (request.headers.origin !== origin || request.headers['x-lumio-player'] !== '1') {
          response.writeHead(403); response.end(); return;
        }
        const params = requestedUrl.searchParams, index = playerIndex(params), kind = params.get('kind');
        if (index < 0 || !['movement-trace', 'resource-witness'].includes(kind) ||
            params.get('scene') !== 'movement-sync-preview' || params.get('trace') !== 'movement' ||
            [...params.keys()].some(key => !['player', 'kind', 'scene', 'trace'].includes(key) || params.getAll(key).length !== 1)) {
          response.writeHead(400); response.end(); return;
        }
        if (request.headers['content-type'] !== 'application/json') { response.writeHead(415); response.end(); return; }
        if (saved[index] >= 16) { response.writeHead(429); response.end(); return; }
        const maximum = kind === 'movement-trace' ? 32 * 1024 * 1024 : 1024 * 1024;
        if (Number(request.headers['content-length']) > maximum) { response.writeHead(413); response.end(); return; }
        try {
          const raw = await readEvidenceBody(request, maximum);
          const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
          if (!validEvidence(value, kind)) { response.writeHead(400); response.end(); return; }
          if (saved[index] >= 16) { response.writeHead(429); response.end(); return; }
          const file = `${index === 0 ? 'A' : 'B'}-${kind}-${randomUUID()}.json`;
          const receipt = { version: 1, player: index === 0 ? 'A' : 'B', kind, file,
            bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex'), savedAt: new Date().toISOString() };
          writeFileSync(join(evidence, file), raw, { flag: 'wx' });
          writeFileSync(join(evidence, file + '.receipt.json'), JSON.stringify(receipt) + '\n', { flag: 'wx' });
          saved[index]++;
          response.writeHead(201, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(receipt));
        } catch (error) {
          response.writeHead(error.status ?? (error instanceof SyntaxError || error instanceof TypeError ? 400 : 500));
          response.end('{"error":"diagnostic_evidence_save_failed"}');
        }
        return;
      }
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

function readEvidenceBody(request, maximum) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0;
    const cleanup = () => { clearTimeout(timer); request.off('data', data); request.off('end', end); request.off('error', error); request.off('aborted', aborted); };
    const fail = status => { cleanup(); request.resume(); reject(Object.assign(new Error('diagnostic_request_rejected'), { status })); };
    const data = chunk => { bytes += chunk.length; if (bytes > maximum) fail(413); else chunks.push(chunk); };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const error = () => fail(400), aborted = () => fail(400);
    const timer = setTimeout(() => fail(408), 5000);
    request.on('data', data); request.once('end', end); request.once('error', error); request.once('aborted', aborted);
  });
}

function validEvidence(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = kind === 'movement-trace'
    ? ['version', 'timeBasis', 'frameTimeBasis', 'managedTimeBasis', 'startedAt', 'exportedAt', 'userAgent', 'truncated', 'diagnosticFailures', 'capacity', 'events']
    : ['version', 'mode', 'arm', 'pageRunId', 'manifestDigest', 'sdkVersion', 'resources', 'bootAlternativeGroups', 'stages', 'failures', 'coverage', 'trustBase'];
  if (Object.keys(value).some(key => !allowed.includes(key))) return false;
  if (kind === 'movement-trace' ? value.version !== 2 || !Array.isArray(value.events) || value.events.length > 300000
    : value.version !== 1 || !['baseline', 'f3'].includes(value.arm) || typeof value.pageRunId !== 'string' || value.pageRunId.length > 128 ||
      !/^[a-f0-9]{64}$/.test(value.manifestDigest ?? '') || !Array.isArray(value.resources) || value.resources.length > 1024 || value.coverage?.expected !== value.resources.length) return false;
  const pending = [[value, 0]]; let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (++count > 2000000 || depth > 32) return false;
    if (!node || typeof node !== 'object') continue;
    for (const [key, child] of Object.entries(node)) {
      if (/password|credential|authorization|cookie|secret/i.test(key)) return false;
      if (child && typeof child === 'object') pending.push([child, depth + 1]);
    }
  }
  return true;
}
