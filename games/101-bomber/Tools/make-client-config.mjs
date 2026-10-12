import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClientConfigResponse } from './client-config-host.mjs';

/** Publish exactly the same compiled client carrier used by the existing config host. */
export function writeClientConfig(configDir, outputFile) {
  const serve = createClientConfigResponse(configDir);
  let status, body;
  serve({ method: 'GET' }, {
    setHeader() {},
    writeHead(value) { status = value; },
    end(value) { body = value; },
  }, '/api/game/config');
  if (status !== 200 || !Buffer.isBuffer(body)) throw new Error('client_config_carrier_missing');
  const carrier = JSON.parse(body.toString());
  const manifest = JSON.parse(Buffer.from(carrier.files['manifest.json'], 'base64').toString());
  writeFileSync(resolve(outputFile), body);
  return { files: Object.keys(carrier.files).length, bytes: body.length, releaseFingerprint: manifest.releaseFingerprint };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error('Usage: node Tools/make-client-config.mjs <compiled-client-dir> <output-json>');
  console.log(JSON.stringify(writeClientConfig(process.argv[2], process.argv[3])));
}
