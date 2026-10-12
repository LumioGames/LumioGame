import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function buildFixturePackage() {
  const required = ['LUMIO_CHAT_BROWSER_SDK', 'LUMIO_CHAT_SDK_MANIFEST_SHA256', 'LUMIO_CHAT_CONTRACT'];
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) throw Error(`Missing ${missing.join(', ')}. Set all three SDK material variables as described in games/chat-services-sample/README.md; integration tests never skip missing materials.`);
  for (const [name, target] of [['LUMIO_CHAT_BROWSER_SDK', path.join(process.env.LUMIO_CHAT_BROWSER_SDK, 'manifest.json')], ['LUMIO_CHAT_CONTRACT', process.env.LUMIO_CHAT_CONTRACT]]) {
    await fs.access(target).catch(() => { throw Error(`${name} material is unavailable: ${target}. Supply verified SDK/contract materials as described in games/chat-services-sample/README.md.`); });
  }
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'lumio-chat-ui-'));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL('./package.mjs', import.meta.url)),
      '--browser-sdk', process.env.LUMIO_CHAT_BROWSER_SDK,
      '--manifest-sha256', process.env.LUMIO_CHAT_SDK_MANIFEST_SHA256,
      '--contract', process.env.LUMIO_CHAT_CONTRACT,
      '--platform-origin', 'https://lumiogames.cn', '--out', output]);
    return output;
  } catch (error) { await fs.rm(output, { recursive: true, force: true }); throw error; }
}
