import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function workflowPluginRoot(env = process.env) {
  return resolve(env.WORKFLOW_PLUGIN_ROOT || join(homedir(), '.local/share/workflow/plugin'));
}

export function runLintCli(args = []) {
  const cli = join(workflowPluginRoot(), 'bin/spec-lint.mjs');
  if (!existsSync(cli)) {
    console.error('BLOCKED_ENV: install Workflow v1.0.0 runtime or set WORKFLOW_PLUGIN_ROOT; see .spec/AGENTS.md');
    process.exitCode = 2;
    return;
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: 'inherit',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 2;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLintCli(process.argv.slice(2));
}
