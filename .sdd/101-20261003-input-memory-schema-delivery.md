# v11 input-memory identity audit

The input-memory schema migration and its Tools regressions are complete; compatibility approval and final product acceptance remain explicit pending gates. This report does not mark Fire/Split/Remote or the whole game complete.

## Exact inputs and freeze

- Official full release: `games/101-bomber/.run/20261003-controlled-game/complete-release-04`, version `0.0.4-main.734622f`. **Release** manifest SHA256 `2916b4eb4eb3823fef67828128ca2cd186855e68a461b09b215bb9919da31d61`; SDK nupkg SHA256 `443b8876db65c93bbf83eca0acfd492b57764838bef1ba306575b84aac2015ab`.
- Actual manifest source tuple: Engine `734622fd2767e42f4f3f91373f90ec792c0dcc06`, Runtime `668993f4f26be13581768558f98f3bb317c25081`.
- **Schema ledger** manifest SHA256 `fedb3e9bdfde5c2af9e59c633768147d06e129e6f5a3b2b03ee5d597fdf2b121`. It has 661 active identities and 6,415 retirements across 27 pages.
- **Review freeze**: `.run/movement-input/schema/freeze-01/manifest.json`, SHA256 `8021874cc7f81d557e98f44d44a8026d9b5e0bbc698a813ddc5575ae2e6813d3`. Its 16 named copies are immutable in `source/`.

The 16 files comprise the reader/model/local-history; explicit v11 migration and its two test files; historical durable migration and durable test; storage/identity tests; migration-plan documentation; active ledger, exact before-input-memory snapshot and three new v11 pages. No old snapshot or retirement page is rewritten.

## Evidence

All paths below are relative to `games/101-bomber/.run/movement-input/`.

- `schema-migration-green-01`: real fixed 8 MiB index capacity refusal on the larger history. `schema-migration-green-02`: all six old/new migration tests pass after compacting only internal full SHA256 keys to base64.
- `schema-fullpack-red-01`: old pinned SDK selection refuses the new full-package input. `schema-fullpack-green-01`: 3/3 official observation checks, zero skips.
- `schema/tools-full-01`: 425 tests, 424 pass / 1 fail / 0 skip, exit 1. The only failure was a test expecting each shared authenticated page twice when two immutable snapshots reference it. The production physical reader correctly reports it once.
- `schema/tools-full-02`: **425/425, zero failures/skips, exit 0**. The corrected expectation validates every reference agrees on its hash before comparing the exact unique physical-file inventory. Existing mutation, capacity, identity reuse and historical deletion negatives remain.
- `schema/bootstrap-01.json`: original **127 Git blobs** plus 32 authenticated local physical files; zero diagnostics, exit 0.
- `schema/predecessor-cli-01.json`: actual isolated immutable v10 Git baseline to current v11, zero diagnostics, exit 0. The test does not use a self-approving current baseline.
- `schema/protected-proof.json`: all 32 historical local files hash-identical, prior 24 page descriptors unchanged, actual comparison index peak **7,779,870 / 8,388,608 bytes**. No memory or file limits increased.
- `schema/generated-replay-proof.json`: packaged official generator independently reproduces all **98 generated files**, exact byte equality. Its CLI does not create the existing empty `gen.hash` MSBuild invalidation sentinel; that sentinel is explicitly checked empty and unchanged.
- `schema-apply-idempotent-02`: rerunning the reviewed migration produces the same ledger manifest, exit 0.

Reproduce the complete Tools run from the game directory with `node .run/movement-input/schema/run.mjs review-tools tools`. This runner sets the exact release root and isolated read-only history fixtures from `schema/history-inputs.json`, runs all 39 test files sequentially and records actual counts/exit status. `node .run/movement-input/schema/replay.mjs` uses the package-installed generator in a private output directory, never edits generated source.

Subsequent special-bomb production work changes current source evidence. For an independent v11 read after that work begins, `schema/review-inputs/` preserves every successful bootstrap input at its recorded SHA (including all 223 current inputs). Clear `BOMBER_SCHEMA_ENGINE_ROOT`, then run the current verifier with `--repo-root .run/movement-input/schema/review-inputs --history-root C:/Work/LumioGames/LumioGame --bootstrap-ref fab6f08ebe717614c04383a71d1e25ea6c071711`. `schema/review-inputs-bootstrap-01.json` verifies this exact copy with zero diagnostics/exit 0. Do not substitute later active Game source for the frozen v11 observation.

The generated operation plan changes are fully explained: eight private scalar descriptors append at ordinals 15..22, 25 existing references map to the identical old descriptors, and the registry digest updates. Normalizing precisely these changes yields the exact complete old plan. All 653 old identity structural shapes remain unchanged; only approved external package provenance refreshes.

The full SHA256 digest retains all 256 bits in 44 base64 characters instead of 64 hexadecimal characters inside the comparison index. File/page/snapshot hashes remain hexadecimal. Existing 512-byte row and `80 + 2 × UTF16 length` string accounting continues unchanged. This audit does not make a new collision assumption or remove a historical obligation.
