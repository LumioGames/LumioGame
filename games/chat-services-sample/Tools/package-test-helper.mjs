import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function buildFixturePackage() {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'lumio-chat-ui-'));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL('./package.mjs', import.meta.url)),
      '--browser-sdk', process.env.LUMIO_CHAT_BROWSER_SDK ?? 'C:/Work/LumioGames/.floating-chat-materials/sdk',
      '--manifest-sha256', process.env.LUMIO_CHAT_SDK_MANIFEST_SHA256 ?? 'c41d734cbe3da872b4ecab3fe7b77cbe8710546df5ce7d73908bf10b38d96c7f',
      '--contract', process.env.LUMIO_CHAT_CONTRACT ?? 'C:/Work/LumioGames/.run-floating-chat-sources/engine/engine/wire/game-services-v1.json',
      '--platform-origin', 'https://lumiogames.cn', '--out', output]);
    return output;
  } catch (error) { await fs.rm(output, { recursive: true, force: true }); throw error; }
}
