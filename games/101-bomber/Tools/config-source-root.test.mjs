// R-00767: the architecture repo's repo-layout.json declares, in
// `repos.GameWorkspace.configSourceRoot`, which directory of a game workspace holds
// the config table source (repository-layout.md §5). This repo is the ground truth
// that field describes — `Gameplay/Tables/` is the directory that actually carries
// `repository.yaml` — so this test is this repo's half of keeping the two in sync:
// if a future directory move (like the one from `config/source` to `Gameplay/Tables`,
// LumioBomber PR #53) forgets to update the architecture-repo field, this test is
// what catches the drift from this side, instead of only downstream in a consumer's
// CI job (LumioGameRuntime PR #211 was that failure mode before the field existed).
//
// This intentionally does not change `Tools/sync-config-readers.mjs`'s own default
// source path: that script already knows its own repo's layout directly and has no
// reason to round-trip through a cross-repo lookup just to find a directory next to
// itself. The field exists for *other* repos that do not otherwise know this repo's
// layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineCheckout, LAYOUT_JSON } from '../.spec/tools/engine-checkout.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('repo-layout.json GameWorkspace.configSourceRoot names this repo\'s real config source directory', () => {
  const { base, invalid } = engineCheckout(root);
  if (invalid) {
    console.error(`BLOCKED_ENV: ${invalid}`);
    return;
  }
  if (!base) {
    // Development-only cross-check against the architecture repository's layout contract; a
    // clone without that checkout (every external one) has nothing to compare with.
    console.error('BLOCKED_ENV: no LumioGameEngine checkout with repo-layout.json found (.spec/tools/engine-checkout.mjs lookup).');
    return;
  }

  const layout = JSON.parse(readFileSync(join(base, LAYOUT_JSON), 'utf8'));
  const configSourceRoot = layout.repos?.GameWorkspace?.configSourceRoot;
  assert.ok(configSourceRoot, 'repos.GameWorkspace.configSourceRoot must be declared in repo-layout.json (R-00767)');

  const manifestPath = join(root, configSourceRoot, 'repository.yaml');
  assert.ok(
    existsSync(manifestPath),
    `repo-layout.json declares configSourceRoot=${configSourceRoot}, but ${manifestPath} does not exist in this ` +
    'repository — the field has drifted from this repo\'s actual layout',
  );
});
