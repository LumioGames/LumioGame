import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { readPointer, updateEngine } from './update-engine.mjs';

const RID = 'linux-x64';

/** git with a fixed identity; file:// submodules are allowed only inside these fixtures. */
function git(args, { cwd }) {
  if (args[0] === 'clone') assert.match(args.at(-2), /^file:\/\//, 'fixtures must only clone local release repositories');
  return spawnSync('git', ['-c', 'protocol.file.allow=always', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' });
}

function must(args, cwd) {
  const result = git(args, { cwd });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return String(result.stdout).trim();
}

/** A LumioEngineRelease stand-in: one commit + tag per release; `verifies:false` ships a verifier that rejects. */
function releaseRepo(releases) {
  const repo = mkdtempSync(join(tmpdir(), 'lumio-release-repo-'));
  must(['init', '-q'], repo);
  const tags = {};
  for (const { version, verifies = true, platforms = [RID] } of releases) {
    mkdirSync(join(repo, 'tools'), { recursive: true });
    writeFileSync(join(repo, 'manifest.json'), JSON.stringify({ formatVersion: 1, version, platforms, sources: {}, files: {} }));
    writeFileSync(join(repo, 'tools', 'verify-release.mjs'), verifies ? 'process.exit(0);\n' : 'console.error("sha256 mismatch"); process.exit(1);\n');
    must(['add', '-A'], repo);
    must(['commit', '-q', '-m', `release ${version}`], repo);
    must(['tag', `v${version}`], repo);
    tags[version] = must(['rev-parse', 'HEAD'], repo);
  }
  return { url: pathToFileURL(repo).href, tags };
}

/** A game repository whose .gitmodules registers Engine but has no gitlink yet (R-00779's state). */
function gameRepo(url) {
  const repo = mkdtempSync(join(tmpdir(), 'lumio-game-repo-'));
  must(['init', '-q'], repo);
  writeFileSync(join(repo, '.gitmodules'), `[submodule "Engine"]\n\tpath = Engine\n\turl = ${url}\n\tshallow = true\n`);
  must(['add', '.gitmodules'], repo);
  must(['commit', '-q', '-m', 'register Engine'], repo);
  return repo;
}

const quiet = () => {};

test('an unknown version leaves a never-pinned Engine/ unpinned and empty', () => {
  const release = releaseRepo([{ version: '0.0.1' }]);
  const repo = gameRepo(release.url);
  assert.throws(() => updateEngine({ version: '0.0.9', root: repo, rid: RID, git, log: quiet }), /ENGINE_UPDATE_FAILED: tag v0\.0\.9 is not in/);
  assert.deepEqual(readPointer({ root: repo, git }), { gitlink: null, head: null });
  assert.ok(!existsSync(join(repo, 'Engine')) || !existsSync(join(repo, 'Engine', 'manifest.json')));
});

test('the first pin, then switches: success moves the pointer, every failure leaves it exactly where it was', () => {
  const release = releaseRepo([{ version: '0.0.1' }, { version: '0.0.2', verifies: false }, { version: '0.0.3', platforms: ['win-x64'] }, { version: '0.0.4' }]);
  const repo = gameRepo(release.url);

  updateEngine({ version: '0.0.1', root: repo, rid: RID, git, log: quiet });
  const pinned = readPointer({ root: repo, git });
  assert.deepEqual(pinned, { gitlink: release.tags['0.0.1'], head: release.tags['0.0.1'] });
  assert.equal(must(['config', '-f', '.gitmodules', 'submodule.Engine.shallow'], repo), 'true');
  must(['commit', '-q', '-m', 'engine: v0.0.1'], repo);

  // Tag does not exist.
  assert.throws(() => updateEngine({ version: '0.0.9', root: repo, rid: RID, git, log: quiet }), /tag v0\.0\.9 is not in/);
  assert.deepEqual(readPointer({ root: repo, git }), pinned);
  // The new release's own verify-release rejects it.
  assert.throws(() => updateEngine({ version: '0.0.2', root: repo, rid: RID, git, log: quiet }), /sha256 mismatch/);
  assert.deepEqual(readPointer({ root: repo, git }), pinned);
  // The new release does not ship this platform.
  assert.throws(() => updateEngine({ version: '0.0.3', root: repo, rid: RID, git, log: quiet }), /this machine is linux-x64/);
  assert.deepEqual(readPointer({ root: repo, git }), pinned);
  // Not a version at all.
  assert.throws(() => updateEngine({ version: 'latest', root: repo, rid: RID, git, log: quiet }), /not a release version/);
  assert.deepEqual(readPointer({ root: repo, git }), pinned);

  const lines = [];
  updateEngine({ version: '0.0.4', root: repo, rid: RID, git, log: (line) => lines.push(line) });
  assert.deepEqual(readPointer({ root: repo, git }), { gitlink: release.tags['0.0.4'], head: release.tags['0.0.4'] });
  assert.ok(lines.some((line) => line.startsWith('Commit it: git commit')));
  // Staged, not committed: committing is the developer's step.
  assert.equal(must(['ls-tree', 'HEAD', 'Engine'], repo), `160000 commit ${release.tags['0.0.1']}\tEngine`);
});

test('a first pin refuses to replace an Engine/ tree git does not own', () => {
  const release = releaseRepo([{ version: '0.0.1' }]);
  const repo = gameRepo(release.url);
  mkdirSync(join(repo, 'Engine'));
  writeFileSync(join(repo, 'Engine', 'manifest.json'), '{"version":"0.0.1-main.abc","platforms":[]}');
  assert.throws(() => updateEngine({ version: '0.0.1', root: repo, rid: RID, git, log: quiet }), /is not empty and is not the submodule/);
  assert.ok(existsSync(join(repo, 'Engine', 'manifest.json')));
  assert.equal(readPointer({ root: repo, git }).gitlink, null);
});

/** The same git, except the calls `fails(args)` picks exit 1 without running (a git step failing part-way). */
function failingGit(fails) {
  return (args, options) => (fails(args, options) ? { status: 1, stdout: '', stderr: `injected failure: git ${args.join(' ')}` } : git(args, options));
}

const isStageEngine = (args) => args.length === 2 && args[0] === 'add' && args[1] === 'Engine';

/** Everything B-00116 promises to restore, read straight from git and the file system. */
function observed(repo) {
  const config = git(['config', '--local', '--get-regexp', '^submodule\\.Engine\\.'], { cwd: repo });
  return {
    pointer: readPointer({ root: repo, git }),
    index: must(['ls-files', '--stage'], repo),
    status: must(['status', '--porcelain', '--untracked-files=all', '--ignored=no'], repo),
    gitmodules: readFileSync(join(repo, '.gitmodules'), 'utf8'),
    config: String(config.stdout).trim(),
    modules: existsSync(join(repo, '.git', 'modules', 'Engine')),
    engine: existsSync(join(repo, 'Engine', 'manifest.json')),
  };
}

test('B-00116: a first pin that fails after the clone is registered is rolled back completely, and a retry works', () => {
  const release = releaseRepo([{ version: '0.0.1' }]);
  for (const step of ['submodule absorbgitdirs', 'submodule add', 'add Engine']) {
    const repo = gameRepo(release.url);
    const before = observed(repo);
    const fails = step === 'add Engine' ? isStageEngine : (args) => args.join(' ').startsWith(step);
    assert.throws(() => updateEngine({ version: '0.0.1', root: repo, rid: RID, git: failingGit(fails), log: quiet }), (error) => {
      assert.equal(error.code, 'ENGINE_UPDATE_FAILED');
      assert.match(error.message, /injected failure/);
      assert.equal(error.restored, true, `${step}: ${error.message}`);
      assert.deepEqual(error.stillChanged, []);
      assert.match(error.message, /Engine\/ pointer unchanged: the index, \.gitmodules and Engine\/'s checkout are as they were/);
      return true;
    });
    assert.deepEqual(observed(repo), before, `${step}: the game repository is exactly as before`);
    // Nothing left behind blocks the next attempt (no stray .git/modules/Engine, no submodule config).
    updateEngine({ version: '0.0.1', root: repo, rid: RID, git, log: quiet });
    assert.deepEqual(readPointer({ root: repo, git }), { gitlink: release.tags['0.0.1'], head: release.tags['0.0.1'] });
  }
});

test('B-00116: a switch whose staging fails moves Engine/ back to the pinned commit', () => {
  const release = releaseRepo([{ version: '0.0.1' }, { version: '0.0.4' }]);
  const repo = gameRepo(release.url);
  updateEngine({ version: '0.0.1', root: repo, rid: RID, git, log: quiet });
  must(['commit', '-q', '-m', 'engine: v0.0.1'], repo);
  const before = observed(repo);
  assert.throws(() => updateEngine({ version: '0.0.4', root: repo, rid: RID, git: failingGit(isStageEngine), log: quiet }), (error) => {
    assert.equal(error.restored, true, error.message);
    assert.match(error.message, /staging the Engine\/ pointer: injected failure/);
    return true;
  });
  assert.deepEqual(observed(repo), before);
  assert.deepEqual(readPointer({ root: repo, git }), { gitlink: release.tags['0.0.1'], head: release.tags['0.0.1'] });
});

test('B-00116: when the rollback itself cannot put the checkout back, the error says so and names what is still changed', () => {
  const release = releaseRepo([{ version: '0.0.1' }, { version: '0.0.4' }]);
  const repo = gameRepo(release.url);
  updateEngine({ version: '0.0.1', root: repo, rid: RID, git, log: quiet });
  must(['commit', '-q', '-m', 'engine: v0.0.1'], repo);
  const back = (args) => args[0] === 'checkout' && args.includes(release.tags['0.0.1']);
  assert.throws(() => updateEngine({ version: '0.0.4', root: repo, rid: RID, git: failingGit((args) => isStageEngine(args) || back(args)), log: quiet }), (error) => {
    assert.equal(error.restored, false);
    assert.doesNotMatch(error.message, /pointer unchanged/);
    assert.match(error.message, /Engine\/ was NOT fully restored\. Still changed: Engine\/'s checkout \(was [0-9a-f]{40}, now [0-9a-f]{40}\)/);
    assert.match(error.message, /git submodule update --init --depth 1 Engine/);
    assert.equal(error.stillChanged.length, 1);
    return true;
  });
  // The report matches the repository: the gitlink never moved, the checkout did.
  assert.deepEqual(readPointer({ root: repo, git }), { gitlink: release.tags['0.0.1'], head: release.tags['0.0.4'] });
});

const NESTED_ENGINE = 'games/101-bomber/Engine';
const SIBLING_ENGINE = 'games/202-sibling/Engine';
const SIBLING_NAME = `${NESTED_ENGINE}.extra`;

function nestedGameRepo(release) {
  const repo = mkdtempSync(join(tmpdir(), 'lumio-nested-game-repo-'));
  must(['init', '-q'], repo);
  const root = join(repo, 'games', '101-bomber');
  mkdirSync(root, { recursive: true });
  must(['submodule', 'add', '--name', SIBLING_NAME, release.url, SIBLING_ENGINE], repo);
  must(['checkout', '-q', '--detach', 'v0.0.1'], join(repo, SIBLING_ENGINE));
  must(['add', SIBLING_ENGINE], repo);
  must(['config', '-f', '.gitmodules', `submodule.${NESTED_ENGINE}.path`, NESTED_ENGINE], repo);
  must(['config', '-f', '.gitmodules', `submodule.${NESTED_ENGINE}.url`, release.url], repo);
  must(['config', '-f', '.gitmodules', `submodule.${NESTED_ENGINE}.shallow`, 'true'], repo);
  must(['add', '.gitmodules'], repo);
  must(['commit', '-q', '-m', 'register nested games'], repo);
  return { repo, root };
}

function observedNested({ repo, root }) {
  const config = git(['config', '--local', '--get-regexp', '^submodule\\.'], { cwd: repo });
  return {
    pointer: readPointer({ root, git }),
    sibling: readPointer({ root: join(repo, 'games', '202-sibling'), git }),
    index: must(['ls-files', '--stage'], repo),
    gitmodulesIndex: must(['ls-files', '--stage', '--', '.gitmodules'], repo),
    status: must(['status', '--porcelain', '--untracked-files=all', '--ignored=no'], repo),
    gitmodules: readFileSync(join(repo, '.gitmodules'), 'utf8'),
    localGitmodules: existsSync(join(root, '.gitmodules')),
    config: String(config.stdout).trim(),
    modules: existsSync(join(repo, '.git', 'modules', NESTED_ENGINE)),
    engine: existsSync(join(root, 'Engine', 'manifest.json')),
  };
}

const isStageNestedEngine = (args) => args.length === 2 && args[0] === 'add' && [NESTED_ENGINE, 'Engine'].includes(args[1]);

test('a nested game first pin and verified switch change only its Engine pointer', () => {
  const release = releaseRepo([{ version: '0.0.1' }, { version: '0.0.2', verifies: false }, { version: '0.0.4' }]);
  const fixture = nestedGameRepo(release);
  const { repo, root } = fixture;
  const initial = observedNested(fixture);
  updateEngine({ version: '0.0.1', root, rid: RID, git, log: quiet });
  assert.deepEqual(readPointer({ root, git }), { gitlink: release.tags['0.0.1'], head: release.tags['0.0.1'] });
  assert.equal(must(['diff', '--cached', '--name-only'], repo), NESTED_ENGINE);
  assert.equal(readFileSync(join(repo, '.gitmodules'), 'utf8'), initial.gitmodules);
  assert.equal(existsSync(join(root, '.gitmodules')), false);
  assert.equal(must(['config', '--local', `submodule.${NESTED_ENGINE}.url`], repo), release.url);
  must(['commit', '-q', '-m', 'engine: v0.0.1'], repo);

  const pinned = observedNested(fixture);
  assert.throws(() => updateEngine({ version: '0.0.2', root, rid: RID, git, log: quiet }), (error) => {
    assert.match(error.message, /sha256 mismatch/);
    assert.equal(error.restored, true, error.message);
    return true;
  });
  assert.deepEqual(observedNested(fixture), pinned);
  const lines = [];
  updateEngine({ version: '0.0.4', root, rid: RID, git, log: (line) => lines.push(line) });
  const switched = observedNested(fixture);
  assert.deepEqual(switched.pointer, { gitlink: release.tags['0.0.4'], head: release.tags['0.0.4'] });
  assert.deepEqual(switched.sibling, initial.sibling);
  assert.equal(switched.gitmodules, initial.gitmodules);
  assert.equal(switched.localGitmodules, false);
  assert.equal(switched.config, pinned.config);
  assert.equal(must(['diff', '--cached', '--name-only'], repo), NESTED_ENGINE);
  assert.equal(must(['ls-tree', 'HEAD', NESTED_ENGINE], repo), `160000 commit ${release.tags['0.0.1']}\t${NESTED_ENGINE}`);
  assert.ok(lines.some((line) => line.startsWith('Commit it:') && line.includes(NESTED_ENGINE)));
  assert.ok(lines.filter((line) => line.startsWith('Commit it:')).every((line) => !line.includes('.gitmodules')));
});

test('a failed nested first pin restores the parent metadata and sibling submodule, and can be retried', () => {
  const release = releaseRepo([{ version: '0.0.1' }]);
  for (const step of ['submodule absorbgitdirs', 'submodule add', 'add Engine']) {
    const fixture = nestedGameRepo(release);
    const { repo, root } = fixture;
    // Preserve separate staged and unstaged parent metadata through rollback.
    must(['config', '-f', '.gitmodules', `submodule.${SIBLING_NAME}.ignore`, 'dirty'], repo);
    must(['add', '.gitmodules'], repo);
    must(['config', '-f', '.gitmodules', `submodule.${SIBLING_NAME}.branch`, 'main'], repo);
    const before = observedNested(fixture);
    const fails = step === 'add Engine' ? isStageNestedEngine : (args) => args.join(' ').startsWith(step);
    assert.throws(() => updateEngine({ version: '0.0.1', root, rid: RID, git: failingGit(fails), log: quiet }), (error) => {
      assert.match(error.message, /injected failure/);
      assert.equal(error.restored, true, `${step}: ${error.message}`);
      assert.deepEqual(error.stillChanged, []);
      return true;
    });
    assert.deepEqual(observedNested(fixture), before, `${step}: parent and sibling state is unchanged`);
    updateEngine({ version: '0.0.1', root, rid: RID, git, log: quiet });
    assert.deepEqual(readPointer({ root, git }), { gitlink: release.tags['0.0.1'], head: release.tags['0.0.1'] });
    const retried = observedNested(fixture);
    assert.equal(retried.gitmodules, before.gitmodules);
    assert.equal(retried.gitmodulesIndex, before.gitmodulesIndex);
    assert.deepEqual(retried.sibling, before.sibling);
  }
});

test('a nested switch that fails after staging restores both the gitlink and checkout without touching siblings', () => {
  const release = releaseRepo([{ version: '0.0.1' }, { version: '0.0.4' }]);
  const fixture = nestedGameRepo(release);
  const { repo, root } = fixture;
  updateEngine({ version: '0.0.1', root, rid: RID, git, log: quiet });
  must(['commit', '-q', '-m', 'engine: v0.0.1'], repo);
  const before = observedNested(fixture);
  const failAfterStage = (args, options) => {
    const result = git(args, options);
    return isStageNestedEngine(args) && result.status === 0
      ? { status: 1, stdout: '', stderr: 'injected failure after staging' }
      : result;
  };
  assert.throws(() => updateEngine({ version: '0.0.4', root, rid: RID, git: failAfterStage, log: quiet }), (error) => {
    assert.match(error.message, /injected failure after staging/);
    assert.equal(error.restored, true, error.message);
    assert.deepEqual(error.stillChanged, []);
    return true;
  });
  assert.deepEqual(observedNested(fixture), before);
});

test('a nested gitlink without a checkout rolls back initialization after release verification fails', () => {
  const release = releaseRepo([{ version: '0.0.1' }, { version: '0.0.2', verifies: false }]);
  const fixture = nestedGameRepo(release);
  const { repo, root } = fixture;
  must(['update-index', '--add', '--cacheinfo', `160000,${release.tags['0.0.1']},${NESTED_ENGINE}`], repo);
  must(['commit', '-q', '-m', 'pin without checkout'], repo);
  const before = observedNested(fixture);
  assert.deepEqual(before.pointer, { gitlink: release.tags['0.0.1'], head: null });
  assert.throws(() => updateEngine({ version: '0.0.2', root, rid: RID, git, log: quiet }), (error) => {
    assert.match(error.message, /sha256 mismatch/);
    assert.equal(error.restored, true, error.message);
    assert.deepEqual(error.stillChanged, []);
    return true;
  });
  assert.deepEqual(observedNested(fixture), before);
});
