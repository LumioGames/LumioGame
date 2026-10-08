#!/usr/bin/env node

/**
 * Switch this game to another engine release (ADR-123 决策 6):
 *
 *   node Tools/update-engine.mjs <version>        e.g. 0.0.2  → tag v0.0.2
 *
 * 1. shallow-fetch tag v<version> of LumioEngineRelease;
 * 2. run *that* release's own tools/verify-release.mjs for this machine's <rid>;
 * 3. only then move the Engine/ submodule to it and stage the pointer (`git add Engine`).
 *
 * Any failure — the tag does not exist, the release does not verify, this platform is not in
 * it, or a later git step (checkout, submodule registration, staging) fails part-way — ends with
 * the Engine gitlink in the index, `.gitmodules`, the submodule config and Engine/'s checkout put
 * back to what they were before the command. The error says whether that restore is complete;
 * if something could not be put back it names exactly what is still changed (B-00116).
 * Committing the staged pointer is the developer's step; the command prints it.
 *
 * The first pin (no Engine gitlink yet, `.gitmodules` only) goes through the same three steps:
 * the verified clone becomes the submodule.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPlatform, ENGINE_DIR, ENGINE_URL, hostRid, readManifest, verifyRelease } from './engine-release.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export class UpdateError extends Error {
  constructor(message) {
    super(`ENGINE_UPDATE_FAILED: ${message}`);
    this.name = 'UpdateError';
    this.code = 'ENGINE_UPDATE_FAILED';
    /** After a failure: true when the state below equals the state before the command. */
    this.restored = undefined;
    /** After a failure: what is still different from before the command (empty when restored). */
    this.stillChanged = [];
  }
}

function defaultGit(args, { cwd }) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function output(result) {
  return `${result?.stdout ?? ''}${result?.stderr ?? ''}${result?.error ? result.error.message : ''}`.trim();
}

/** The pointer as git records it: the gitlink in the index plus the submodule's checked-out HEAD. */
export function readPointer({ root = ROOT, git = defaultGit } = {}) {
  const index = git(['ls-files', '--stage', '--', ENGINE_DIR], { cwd: root });
  const line = String(index.stdout ?? '').trim();
  const gitlink = /^160000 ([0-9a-f]{40}) /.exec(line)?.[1] ?? null;
  const engine = join(root, ENGINE_DIR);
  let head = null;
  if (isOwnWorkTree(engine, git)) {
    const result = git(['rev-parse', 'HEAD'], { cwd: engine });
    if (result.status === 0) head = String(result.stdout).trim();
  }
  return { gitlink, head };
}

function isOwnWorkTree(dir, git) {
  if (!existsSync(join(dir, '.git'))) return false;
  const top = git(['rev-parse', '--show-toplevel'], { cwd: dir });
  if (top.status !== 0) return false;
  // Symlinked temp roots (macOS /var → /private/var) must not read as another tree.
  const canonical = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };
  return canonical(String(top.stdout).trim()) === canonical(dir);
}

function repository(root, git) {
  const top = git(['rev-parse', '--show-toplevel'], { cwd: root });
  if (top.status !== 0) throw new UpdateError(`finding the game repository: ${output(top)}`);
  const repoRoot = String(top.stdout).trim();
  const enginePath = join(relative(realpathSync(repoRoot), realpathSync(root)), ENGINE_DIR).split(sep).join('/');
  const paths = git(['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'], { cwd: repoRoot });
  const entry = String(paths.stdout ?? '').split('\n')
    .map((line) => /^submodule\.(.+)\.path (.+)$/.exec(line.trim()))
    .find((match) => match?.[2] === enginePath);
  return { repoRoot, enginePath, submoduleName: entry?.[1] ?? enginePath };
}

function submoduleUrl({ repoRoot, submoduleName }, git) {
  const result = git(['config', '-f', '.gitmodules', `submodule.${submoduleName}.url`], { cwd: repoRoot });
  const url = String(result.stdout ?? '').trim();
  return result.status === 0 && url ? url : ENGINE_URL;
}

/** The index entry of one path, as `git ls-files --stage` prints it ('' when absent). */
function stageEntry(root, git, path) {
  return String(git(['ls-files', '--stage', '--', path], { cwd: root }).stdout ?? '').trim();
}

function gitPath(root, git, path) {
  const result = git(['rev-parse', '--git-path', path], { cwd: root });
  const value = String(result.stdout ?? '').trim();
  if (result.status !== 0 || !value) return null;
  return isAbsolute(value) ? value : resolve(root, value);
}

function engineContents(engine) {
  if (!existsSync(engine)) return null;
  return statSync(engine).isDirectory() ? readdirSync(engine).sort() : ['(not a directory)'];
}

/**
 * Everything this command may change, read before it changes anything. `compareState` of two
 * snapshots is the truth behind the failure message.
 */
function snapshot(root, git, { repoRoot, enginePath, submoduleName }) {
  const engine = join(root, ENGINE_DIR);
  const gitmodules = join(repoRoot, '.gitmodules');
  const modules = gitPath(repoRoot, git, `modules/${submoduleName}`);
  const configName = submoduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownTree = isOwnWorkTree(engine, git);
  return {
    pointer: readPointer({ root, git }),
    engineIndex: stageEntry(repoRoot, git, enginePath),
    gitmodulesIndex: stageEntry(repoRoot, git, '.gitmodules'),
    gitmodules: existsSync(gitmodules) ? readFileSync(gitmodules, 'utf8') : null,
    submoduleName,
    submoduleConfig: String(git(['config', '--local', '--get-regexp', `^submodule\\.${configName}\\.[^.]+$`], { cwd: repoRoot }).stdout ?? '').trim(),
    modules,
    modulesExisted: modules ? existsSync(modules) : false,
    ownTree,
    // Only meaningful when Engine/ is not the submodule (the first pin): absent, or empty.
    contents: ownTree ? null : engineContents(engine),
  };
}

export function compareState(before, after) {
  const changed = [];
  if (before.pointer.gitlink !== after.pointer.gitlink || before.engineIndex !== after.engineIndex) {
    changed.push(`the Engine gitlink in the index (was ${before.pointer.gitlink ?? 'absent'}, now ${after.pointer.gitlink ?? 'absent'})`);
  }
  if (before.pointer.head !== after.pointer.head) {
    changed.push(`Engine/'s checkout (was ${before.pointer.head ?? 'not a submodule checkout'}, now ${after.pointer.head ?? 'not a submodule checkout'})`);
  }
  if (before.gitmodules !== after.gitmodules) changed.push('.gitmodules in the working tree');
  if (before.gitmodulesIndex !== after.gitmodulesIndex) changed.push('.gitmodules in the index');
  if (before.submoduleConfig !== after.submoduleConfig) changed.push(`the submodule.${before.submoduleName}.* entries of .git/config`);
  if (before.modulesExisted !== after.modulesExisted) changed.push(`${before.modules ?? `.git/modules/${ENGINE_DIR}`} (${after.modulesExisted ? 'created' : 'removed'})`);
  if (!before.ownTree && JSON.stringify(before.contents) !== JSON.stringify(after.ownTree ? ['(a submodule checkout)'] : after.contents)) {
    changed.push(`the contents of ${ENGINE_DIR}/ (was ${before.contents === null ? 'absent' : before.contents.length ? 'non-empty' : 'empty'})`);
  }
  return changed;
}

function restoreIndexEntry(root, git, path, entry) {
  const match = /^(\d{6}) ([0-9a-f]{40}) 0\t/.exec(entry);
  const result = match
    ? git(['update-index', '--add', '--cacheinfo', `${match[1]},${match[2]},${path}`], { cwd: root })
    : git(['update-index', '--force-remove', '--', path], { cwd: root });
  if (result.error || result.status !== 0) throw new UpdateError(`restoring ${path} in the index: ${output(result)}`);
}

/**
 * Put back what a failed update changed, best effort, each piece only when it differs. Returns
 * what is still different afterwards.
 */
function rollback(root, git, before, repo) {
  const { repoRoot, enginePath, submoduleName } = repo;
  const engine = join(root, ENGINE_DIR);
  const attempt = (step) => { try { step(); } catch { /* reported through compareState below */ } };
  let now = snapshot(root, git, repo);

  // 1. A switch that already moved the submodule checkout: move it back.
  if (before.ownTree && before.pointer.head && now.pointer.head !== before.pointer.head && isOwnWorkTree(engine, git)) {
    attempt(() => git(['checkout', '-q', '--detach', before.pointer.head], { cwd: engine }));
  }
  // 2. A first pin that already put the clone in place (and maybe absorbed its .git): take it out
  //    again, with the git dir it created, back to the absent / empty Engine/ it started from.
  // Only ever from an absent or empty Engine/: a non-empty tree git does not own is refused before
  // anything is written, and is never deleted here.
  const startedEmpty = before.contents === null || before.contents.length === 0;
  if (!before.ownTree && startedEmpty && JSON.stringify(now.ownTree ? ['(a submodule checkout)'] : now.contents) !== JSON.stringify(before.contents)) {
    attempt(() => {
      rmSync(engine, { recursive: true, force: true });
      if (before.contents !== null) mkdirSync(engine);
    });
  }
  if (!before.modulesExisted && before.modules && existsSync(before.modules)) {
    attempt(() => rmSync(before.modules, { recursive: true, force: true }));
  }
  now = snapshot(root, git, repo);
  // 3. The submodule entries `git submodule add` writes into .git/config.
  if (now.submoduleConfig !== before.submoduleConfig) {
    attempt(() => {
      git(['config', '--local', '--remove-section', `submodule.${submoduleName}`], { cwd: repoRoot });
      for (const line of before.submoduleConfig.split('\n').filter(Boolean)) {
        const space = line.indexOf(' ');
        git(['config', '--local', '--add', line.slice(0, space), line.slice(space + 1)], { cwd: repoRoot });
      }
    });
  }
  // 4. .gitmodules (working tree and index) and the Engine gitlink.
  if (now.gitmodules !== before.gitmodules) {
    attempt(() => {
      if (before.gitmodules === null) rmSync(join(repoRoot, '.gitmodules'), { force: true });
      else writeFileSync(join(repoRoot, '.gitmodules'), before.gitmodules);
    });
  }
  if (now.gitmodulesIndex !== before.gitmodulesIndex) attempt(() => restoreIndexEntry(repoRoot, git, '.gitmodules', before.gitmodulesIndex));
  if (now.engineIndex !== before.engineIndex) attempt(() => restoreIndexEntry(repoRoot, git, enginePath, before.engineIndex));

  return compareState(before, snapshot(root, git, repo));
}

/** Verify one checked-out release tree for this machine, with the tree's own verifier. */
function verifyTree(dir, rid, node) {
  const manifest = readManifest(dir);
  if (!manifest) throw new UpdateError(`${dir} has no manifest.json; it is not an engine release.`);
  try {
    assertPlatform(manifest, rid);
    verifyRelease({ root: dir, rid, node });
  } catch (error) {
    throw new UpdateError(error.message);
  }
  return manifest;
}

export function updateEngine({
  version, root = ROOT, rid = hostRid(), git = defaultGit, node, log = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  if (!VERSION.test(String(version ?? ''))) {
    throw new UpdateError(`"${version}" is not a release version (expected X.Y.Z, tag vX.Y.Z).`);
  }
  const tag = `v${version}`;
  const engine = join(root, ENGINE_DIR);
  const repo = repository(root, git);
  const url = submoduleUrl(repo, git);
  const state = snapshot(root, git, repo);
  const before = state.pointer;
  try {
    return switchEngine({ version, tag, engine, url, before, state, root, repo, rid, git, node, log });
  } catch (cause) {
    const error = cause instanceof UpdateError ? cause : new UpdateError(cause?.message ?? String(cause));
    const stillChanged = rollback(root, git, state, repo);
    error.restored = stillChanged.length === 0;
    error.stillChanged = stillChanged;
    error.message += error.restored
      ? `\n${ENGINE_DIR}/ pointer unchanged: the index, .gitmodules and ${ENGINE_DIR}/'s checkout are as they were before this command.`
      : `\n${ENGINE_DIR}/ was NOT fully restored. Still changed: ${stillChanged.join('; ')}.`
        + `\nInspect with "git status" and "git -C ${ENGINE_DIR} status"; "git submodule update --init --depth 1 ${ENGINE_DIR}" puts the checkout back on the committed pointer.`;
    throw error;
  }
}

function switchEngine({ version, tag, engine, url, before, state, root, repo, rid, git, node, log }) {
  const { repoRoot, enginePath, submoduleName } = repo;
  const run = (args, cwd, what) => {
    const result = git(args, { cwd });
    if (result.error || result.status !== 0) throw new UpdateError(`${what}: ${output(result) || `git ${args.join(' ')} exited ${result.status}`}`);
    return result;
  };

  // A gitlink whose submodule was never checked out: initialise it first (pointer unchanged).
  if (before.gitlink && !isOwnWorkTree(engine, git)) {
    run(['submodule', 'update', '--init', '--depth', '1', enginePath], repoRoot, 'initialising Engine/');
  }

  if (isOwnWorkTree(engine, git)) {
    log(`fetching ${tag} from ${url}`);
    run(['fetch', '--depth', '1', 'origin', 'tag', tag, '--no-tags'], engine, `tag ${tag} is not in ${url}`);
    mkdirSync(join(root, '.run'), { recursive: true });
    const scratch = mkdtempSync(join(root, '.run', 'engine-verify-'));
    run(['worktree', 'add', '--detach', scratch, tag], engine, `checking out ${tag} for verification`);
    let manifest;
    try {
      manifest = verifyTree(scratch, rid, node);
    } finally {
      git(['worktree', 'remove', '--force', scratch], { cwd: engine });
      rmSync(scratch, { recursive: true, force: true });
    }
    if (manifest.version !== version) throw new UpdateError(`${tag} carries manifest version ${manifest.version}.`);
    run(['checkout', '--detach', tag], engine, `switching Engine/ to ${tag}`);
  } else {
    // First pin: no gitlink yet. Engine/ must not hold a tree git does not own (a pack-release
    // --from-main fill, say): replacing it silently would lose someone's work.
    if (existsSync(engine) && readdirSync(engine).length > 0) {
      throw new UpdateError(`${engine} is not empty and is not the submodule; move it away, then re-run.`);
    }
    mkdirSync(join(root, '.run'), { recursive: true });
    const scratch = mkdtempSync(join(root, '.run', 'engine-clone-'));
    const clone = join(scratch, 'Engine');
    log(`cloning ${tag} from ${url}`);
    try {
      run(['clone', '--depth', '1', '--branch', tag, url, clone], root, `tag ${tag} is not in ${url}`);
      const manifest = verifyTree(clone, rid, node);
      if (manifest.version !== version) throw new UpdateError(`${tag} carries manifest version ${manifest.version}.`);
      rmSync(engine, { recursive: true, force: true });
      renameSync(clone, engine);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    // Registers the existing clone as the submodule (url and path as .gitmodules states them)
    // and moves its .git into .git/modules like any `git submodule update --init` would.
    run(['submodule', 'add', '--force', '--name', submoduleName, url, enginePath], repoRoot, 'registering Engine/ as a submodule');
    run(['submodule', 'absorbgitdirs', enginePath], repoRoot, 'absorbing Engine/.git');
    // Registration stages the entire .gitmodules, including other games' unstaged edits.
    if (readFileSync(join(repoRoot, '.gitmodules'), 'utf8') === state.gitmodules
      && stageEntry(repoRoot, git, '.gitmodules') !== state.gitmodulesIndex) {
      restoreIndexEntry(repoRoot, git, '.gitmodules', state.gitmodulesIndex);
    }
  }

  run(['add', enginePath], repoRoot, 'staging the Engine/ pointer');
  const after = readPointer({ root, git });
  log(`Engine/ is now ${tag} (${after.gitlink}); verified for ${rid}.`);
  const gitCommand = enginePath === ENGINE_DIR ? 'git' : `git -C "${repoRoot}"`;
  const gitmodulesChanged = readFileSync(join(repoRoot, '.gitmodules'), 'utf8') !== state.gitmodules;
  log(`Commit it: ${gitCommand} commit -m "engine: ${tag}" -- ${gitmodulesChanged ? '.gitmodules ' : ''}${enginePath}`);
  return { tag, before, after };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('-')) {
    process.stderr.write('Usage: node Tools/update-engine.mjs <version>   (e.g. 0.0.2 for tag v0.0.2)\n');
    process.exitCode = 1;
  } else {
    try {
      updateEngine({ version: args[0] });
    } catch (error) {
      // The message says whether the pointer, index and checkout were restored (B-00116).
      process.stderr.write(`${error?.message ?? error}\n`);
      process.exitCode = 1;
    }
  }
}
