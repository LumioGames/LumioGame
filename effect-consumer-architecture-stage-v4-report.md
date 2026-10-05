# Effect consumer Architecture stage v4

2026-09-30. Bounded logical interpreter scratch correction delivered for root's independent combined v2-to-v4 review. This does not approve the package or promote readiness.

A = `C:/Work/LumioGames/LumioGameEngine-101-container-wire`; B = `C:/Work/LumioGames/LumioGame` (this request's explicit output directory); E = `C:/Work/LumioGames/LumioGameRuntime-101-effect-integrated-evidence/consumer-completion`. Historical scratch decisions, v3 report and four-finding review were found and read in `B/games/101-bomber/.run`; none were overwritten. All source references below are relative to immutable `E/architecture/stage-v4/after`.

## Changes and accounting

Seven source paths differ from v3: `eng/verify-effect-consumer.mjs`, `eng/verify-effect-consumer-schemas.mjs`, `eng/verify-effect-consumer.test.mjs`, `eng/generate-effect-lifecycle.mjs`, `eng/verify-effect-lifecycle.mjs`, `engine/wire/effect-lifecycle-v1.json`, and generated `engine/wire/generated/EffectLifecycleContract.g.cs`.

- Every program charges `8*declaredFields`, including root hook-expanded coverage and each active hook's own counters.
- Every declared rowClaim local charges local128 + header256 + `32*maxColumns(local)`. Maxima come from validated Claim syntax and actual schemas. All locals sum independently; unused local columns are zero; unrelated schemas add nothing. Branch reservation and lexical loop retirement/reuse remain intact. Checked u64 accumulation and scratch cap remain enforced.
- ClaimColumn32 is storage reference8 + fixed scalar16 + attempted-write count8. The general row schema, including multiple status columns, is unchanged.
- Facts derive `associationBindingBytes=8*row.columns.length` and `scratchBytes=certificateBytes+64+associationBindingBytes`. Added header64 explicitly covers six reference8 slots, extent4, index4 and lifecycle flags8; see the API note and authoritative `associationHeaderLayout`. Certificate encoding stays fixed84 + sum(8+V), result stays90. Only the newly added fact-scratch inequality changes to `settlementFactScratchBytes>=pendingRequests*max(fact.scratchBytes)`.
- Full certificate/header/binding slices and original admitted-snapshot credit stay reserved for the entire reducer round, including Rejected rows. Rejected admission now checks its complete per-request scratch envelope; completion does not debit/release that envelope as transient write credit. Oracle admission gains the fifth `budget` argument; no language opcode or tuple changes.
- Authoritative `scratchStorage` distinguishes immutable startup metadata, reusable dense arrays and logical payload slots from separately bounded Runtime allocator framing/stack. No hidden per-write allocations or unbounded maps are permitted in production F. Oracle identity/validation copies are explicitly not a production allocator model.

Exact constants/formulas and consumer API guidance: `B/effect-consumer-scratch-api-stable.md`. Supported generation projects both new plan constants and the association constants. The semantic-integrity pin covers the amended authoritative surface; semanticRevision2 and all tuple revisions1 remain unchanged.

## Red/green and final proof

Six new V4 tests were added before source edits and all six failed against otherwise unchanged v3: field counters; two claim instances; differing widths/per-local maximum/unused local; branch/loop reuse; association bindings; nested hook counters. Their red input differs from captured v3 only in the test file. Initial green passed all 44 consumer tests. A seventh retained-slice test then added Rejected exact/one-short admission and Applied completion retention; it passed in the final affected runs. All v3 tests/assertions remain; fixture reservations were raised to their corrected derived values and admission call sites supply the new envelope.

Final affected lifecycle/consumer/successor tests: **777 pass, 0 fail/cancel/skip**. Normal wire: **510 pass, 0 fail/cancel/skip**. Counts overlap, not additive. Supported generation and check-generated pass. Lint is **not clean**: report-only exit0 with the exact same **143 inherited finding lines** as v3; no new findings.

Every command used the existing exact `E/run-proof.cjs` wrapper: executable `C:/Program Files/nodejs/node.exe`, cwd A, synchronous child completion, recorded start/finish/exit/signal, input/after source manifests and log hashes. Originals remain in `E/verified-runs`; exact v4 copies are in `E/architecture/stage-v4/proofs`.

| Proof name | Exact child arguments | Exit |
| --- | --- | ---: |
| architecture-red-v4 | `--test --test-name-pattern=V4 eng/verify-effect-consumer.test.mjs` | 1 (six expected failures) |
| architecture-green-v4 | `--test eng/verify-effect-consumer.test.mjs` | 0 |
| architecture-generate-v4 | `eng/generate-abi.mjs` | 0 |
| architecture-tests-v4 | `--test eng/verify-effect-lifecycle.test.mjs eng/verify-effect-consumer.test.mjs eng/verify-successor-binding.test.mjs` | 0 |
| architecture-wire-v4 | `eng/verify-wire.mjs` | 0 |
| architecture-generated-v4 | `eng/check-generated.mjs` | 0 |
| architecture-lint-v4 | `eng/spec-lint.mjs` | 0 |

Generation ran 11:39:50.917–11:39:51.371 UTC. Final checks ran 11:40:19.378–11:40:39.495 UTC. All four final non-generation checks have identical unchanged input/after manifest SHA256 `58833e45d3e4ced24c757eeae6b4653aa66c209344b47030705acfc4bc1effdf`; all 890 path/hash pairs equal the delivered after snapshot. Generation changed only EffectLifecycleContract.g.cs to SHA256 `b077417d91fd8a64b5ba454a2551723e83c9e0ddbd91ad7f8bca5c89f23ff027`. `final-proof-association.json` independently verifies command/log/manifest associations and preserved invariants; `lint-comparison-verification.json` records the exact inherited comparison. Historical 763/503 counts are not v4 evidence.

## Capture, patches and replays

Before any A edit, copied all 890 current source files into new `E/architecture/stage-v4/input`; exact match to immutable v3 after, zero missing/extra/hash differences. `input-verification.json` and `input-manifest.json` record this; input manifest hash is `d9e612280f0a08eeaaa0f7de678587ac800d127a7058a4a0d9efc0e8a30a555e`. The original captured baseline remains 887 files.

- Narrow v3-to-v4 patch: `B/effect-consumer-architecture-v4-repair.patch`, 140120 bytes, SHA256 `6dcb4a9a0a7edc505a911f451db55d8c86cb9722eed75b4e90a531bd60e1a24b`.
- Full original-baseline-to-v4 patch: `B/effect-consumer-completion-architecture-stage-v4.patch`, 344681 bytes, SHA256 `29717164d041feeaa26d2f735bd2ddfdb9be432d637fe0f7f95a8eee00e3f436`.
- Authored narrow review filter: `B/effect-consumer-architecture-v4-review-authored.patch`, SHA256 `b2123de7ad2b4e5a3e9a45411f82e20e54e6f4537a2df990a282057cb7edf3a8`; excludes only the mechanical generated C# section.
- Frozen after: `E/architecture/stage-v4/after`, 890 files, manifest SHA256 `6206b7a5d38f23df90423e819c2c2f26ad3e74ce0da793b7bc28e1a062af60c6`.
- Independent actual replay trees: `stage-v4/repair-replay` from v3 input and `stage-v4/replay` from original baseline. Both `git apply --check` and actual `git apply` exited0; every after file matches, zero mismatches. `changes.json`, `repair-changes.json` and `replay-verification.json` preserve commands/cwds/exits/hashes. No live index was used for patch application.

`E/export-architecture-v4.cjs` and `E/verify-architecture-v4.cjs` preserve export/verification logic. Immutable v2 and v3 after trees were rehashed after export with zero drift. The original eleven D1 inequalities, result object, language tuples/opcodes, caps, row/hook schemas and false readiness were checked unchanged. Scalar28/indexed32/result90, frame65536, six codecs, full identity, schema/lease rules, one recompute/round and separate fact preflight remain preserved.

Reviewed successor hashes remain exact: JSON `1b84558e6e51ee6ed9504841eac18b350d736c582619e2f18cbc21e45cff2196`; C# `a611459b82be36f21b9302cb9709ea97e3d8df4e3b3b14ded2752e76ea4420ff`; Rust `be05545baba0c58b50171a18187acb9a1800028af12652fb462a7103472fbabe`.

## Boundaries and remaining integration gates

This completes Architecture's logical accounting correction; it is not evidence of real Runtime allocation layout. Runtime must implement bounded arrays and separately disclose/prove bounded allocator framing and actual stack behavior. The oracle models an already reserved per-request scratch envelope; it does not prove aggregate pool occupancy, zero allocation in F or whole-round disposal. Real Engine storage provenance/generations, actual Apply arithmetic, WorldManager.Tick integration, lease disposal and external generated fixture execution remain downstream gates. No fixed256-only completion claim is made.

No R/provider/Game source edits, Runtime builds/tests, services/browser, commits/reset/clean/index edits or subdelegation were performed. Root's requested independent review replaces a delegated review for this delivery; no independent review or package approval is claimed. No extra specification document/ADR was introduced for this authorized narrow accounting repair; the owning JSON and generated projection are the authority.
