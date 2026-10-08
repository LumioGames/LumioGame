# Durable results schema observation and history migration

2026-10-03. Author: capacity_resume. Scope: Game-owned schema observation, bounded paginated identity ledger, migration and tests. No Gameplay implementation, generated file, public Engine contract, input/index limit, or release decision was changed by this slice.

## Delivered identity inventory

Current schema: `bomber-v10-durable-results-candidate`, 653 active identities. The 638 predecessor identities retain their original structural shapes and ordinals; only the schema label, source evidence and the independently pinned external SDK provenance advance. Added identities are thirteen durable Stats/Results fields, `ResourceCrateOpened`, and its unique canonical `crate_opened` event. Event totals are 60 = 44 Typed + 14 Derived + 2 Excluded; 75 event types. Root owns the resource-crate event correction and its independent C# contract tests.

Current ledger SHA-256: `42b3a730285ad0eb23703887b578545147a6839f89927ae17981c6d48d723109`.

Exact v9 predecessor is now `Gameplay/Compatibility/schema-identities.before-durable-results.json`, SHA-256 `207837ed3450081b3cf639dc24f09791000e4c490e7a265f4ab8092b7017ca0b`. All 47 captured pre-existing Compatibility files retain their exact bytes; the former current manifest is preserved at this new snapshot path. All original 21 v9 page descriptors and bytes remain unchanged. Existing 5,124 retired records (4,490 + 634) are followed by 638 exact predecessor identities: 5,762 total. The three new pages are 466,207 / 450,975 / 228,441 bytes. The existing 8 MiB input/index limits and all historical root/local snapshots remain intact.

`schema-identity-durable-migration.mjs --apply` authenticates the exact predecessor, validates every existing page and all independent required histories, constructs only the three new pages, then atomically replaces the current manifest. Re-execution is byte-identical; conflicts refuse to overwrite artifacts. Older flat-output migration scripts were not used.

## Official inputs and generated audit

Explicit package root: `games/101-bomber/.run/20261003-unified668/browser-candidate/selection`.

- Official SDK: `0.1.0-dev.cdabf562751de6e6cbc42bbc4497f0ea391f2e147c4d948598aabc3647c85ea2`.
- Manifest SHA-256: `a9dfd30352d92ed6661278408e4d6806d6babc52b6ccd7a60cb59aecef5edd2b`.
- SDK SHA-256: `b8bb051e698815d674c819467e1e57af3271ff5f0831e485ce13651c5aec56c2`.
- Engine: `6f625e83e29543a53ae621b92d5cdbbf27e73945`; Runtime: `668993f4f26be13581768558f98f3bb317c25081`.

Compared all 98 generated files against Client's official replay proof after the new event record was added: no drift. Updated four exact Effect output byte pins only after decoding their differences. Twelve typed binding rows append; no previous binding is removed. The 25 changed fact-row indices resolve to exactly the same prior binding rows. Reducer programs change only their full-registry digest; all other plan contents and four pinned reducer source files remain unchanged. The thirteenth added schema field is the Results string-list history and is not an additional typed Effect binding. Evidence: `.run/durable-schema/generated-pin-diff.json`, `effect-bindings-diff.json`, `effect-other-diff.json`, `protected-proof.json`.

## Actual validation

All paths below are under `games/101-bomber/.run/durable-schema/` unless stated otherwise.

| Run | Result |
|---|---|
| `durable-test-red-01`, `durable-test-red-02` | Each one real failing observation test: obsolete 189 SDK filename, then obsolete exact generated-byte pin. Gates retained. |
| `migration-red-01` → `migration-green-01` | 3 failing new migration cases → 3/3, no skips, exit 0. |
| `schema-full-01` | 136/137, zero skips, exit 1. Only old CLI expected-hash list omitted the newly required snapshot's 21 authenticated pages. |
| `tools-full-02` | Complete 36-file Tools suite: **416/416**, zero failures/skips/cancellations, exit 0. Includes all 137 schema cases and real CLI mutation/history tests. |
| `observation-final-02` | 2/2, zero skips, exit 0; strengthened external-origin comparison preserves assembly/kind and permits only three pinned provenance fields to advance. |
| `predecessor-cli-01` | Actual independent v9 Git baseline `4f2d3f8dbe7d02b47ebe8a6ad6d12eeb4104e719` → current v10: consistent, zero diagnostics, exit 0. |
| `migration-idempotent-01` | Same exact final manifest and page bytes, exit 0. |

The full suite also ran the real immutable bootstrap audit of 127 historical Git blobs, every required root/local snapshot and all 21 referenced historical pages. Damaged/missing/reordered pages, wrong revisions, later-commit substitution, old identity/ordinal removal, replaced SDK bytes, generated drift and altered retirement evidence remain rejection cases. The CLI assertion was extended to authenticate every referenced page; no assertion, limit or failure path was removed.

Reproduction: `node .run/durable-schema/run.mjs <new-label>` loads the exact package and three isolated read-only Git fixture roots from `history-inputs.json`. It records arguments, actual total/pass/fail/skip counts and exit status. These fixture repositories are isolated evidence only; no parent repository commit or index was changed.

## Frozen review boundary

15 exact source/artifact files: `.run/durable-schema/freeze-01/manifest.json`, SHA-256 `7b00b97595b809afa24ceb8800c1f8e679ba693d90ea020c4fb9be7a1c2b549c`. Copies are under its `source/` directory. The manifest names the exact current tool sources, three new tests/migration files, evolved history assertions, current/predecessor manifests and three appended pages.

This closes the durable-results schema migration only. The package remains `fullRelease:false`; the ledger remains `audit-draft`, `freezeEligible:false`, with unchanged pending contract/release domains. This evidence does not replace full multiplayer/browser/game acceptance or approve pending public contracts.
