import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BlockedEnvError, blocked, engineDir } from './engine-release.mjs';

export { BlockedEnvError, blocked };

/** The process-management helpers every runner uses (ADR-123: from Engine/tools/, nowhere else). */
export const PROCESS_TOOLS_EXPORTS = Object.freeze(['command', 'startLogged', 'assertAlive', 'waitExit', 'forceCleanup']);

export function processToolsPath(engineRoot) {
  return join(engineRoot, 'tools', 'process-tools.mjs');
}

/**
 * Import Engine/tools/process-tools.mjs. `engineRoot` is the verified release root (normally
 * `prepareEngine(...).dir`); `repoRoot` alone means `<repoRoot>/Engine`.
 */
export async function loadProcessTools({ engineRoot, repoRoot } = {}) {
  const root = engineRoot ?? (repoRoot ? engineDir(repoRoot) : null);
  const file = root ? processToolsPath(root) : null;
  if (!file || !existsSync(file)) {
    throw blocked(`Engine/tools/process-tools.mjs is missing${file ? ` (${file})` : ''}; the Engine/ release is incomplete.`);
  }
  const module = await import(pathToFileURL(file).href);
  for (const name of PROCESS_TOOLS_EXPORTS) {
    if (typeof module[name] !== 'function') {
      throw blocked(`process-tools.mjs is missing ${name}(); do not rewrite process management here.`);
    }
  }
  return module;
}

export function assertRelativePath(value, label) {
  const text = String(value ?? '');
  if (text.length === 0) throw new Error(`${label} is required.`);
  if (isAbsolute(text) || text.startsWith('~')) {
    throw new Error(`${label} must be a repository-relative path, not ${text}`);
  }
  if (text.includes('\\') && !text.includes('/')) {
    return text.replaceAll('\\', '/');
  }
  return text;
}
