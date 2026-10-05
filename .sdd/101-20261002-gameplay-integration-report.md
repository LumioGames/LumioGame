# 101 gameplay candidate integration — 2026-10-02

## Scope and current disposition

This handoff finishes the recovered GTCG schema-union/shared-producer subtask. **It does not approve the complete game for release.** The final complete Gameplay run is **566 passed / 574 total, 8 failed, 0 skipped, exit 2**. Those failures and follow-on work are below; none was removed or waived.

Sole writable candidate: `C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective` (GTCG). No root Game source edits, no full-tree copies, no repository commits/index changes. Parent retains integration ownership and must preserve its newer presentation, movement and WASM work.

All commands consume the existing complete P04 Engine junction: `C:/Work/LumioGames/probe/effect-delta-release-04`. Manifest SHA256 `5a5f34f5d8d7c8708009b9f29c8d091deb6b73799ae3939dbde932ec548300f6`; SDK package SHA256 `2a91cd295e29b6b1edcc183ebb5ee812bcca1b6d0cf3f07fe2d7328c97305c42`. This subtask does not incorporate the newer successor/finite/hydration upstream candidate.

Evidence root (E): `C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/games/101-bomber/.artifacts/resume-20261002`.

## Production change and proof

Only two authored production files changed in this continuation:

1. `games/101-bomber/Gameplay/BomberTerrainTransactions.Server.cs:30,253–317`: the existing per-Tick frame owns a set of queued pickup cells. `Occupied` counts live objects plus queued cells; `PickupCells` combines live and queued destinations; `ReservePickup` claims a queued credit/cell before structural creation or durable debt debit. `BeginFrame` clears only at the next Tick. Terrain materialization sees death's earlier queued output.
2. `games/101-bomber/Gameplay/BomberDeathDrops.Server.cs:85`: death materialization uses the same occupied count, terrain reservations and cell set. Both producers retain the existing persisted debt/provenance and object limits. No new cross-Tick truth, local gameplay substitute, larger object/transport budget, synthetic receipt or weakened assertion.

New `Server/Tests/Gameplay/BomberSharedProducerCreditTests.cs` has four real Native cases: free slots 3/4 × special-skill exchange off/on. Three real gold pickups pass through health Effects, six real bombs kill the original Life, Native water prevents landing, then one legal cell admits a partial death output on the terminal Wood-bomb Tick. Three free credits must refuse the terminal terrain mutation; four must accept the exact Native Applied/Original/TokenConsumed receipt. Later partial retries prove queued cell exclusivity, no object over-admission, exact original death/terrain identities, once-only terminal association, and persistent debt conservation. Exchange keeps the same item entity with the outgoing skill.

RED on unchanged production: **0/4 pass, 4 fail, exit 2**, `native-red-01`. Failures were over-admitted terminal mutation and terrain consuming the death producer's already queued landing cell. Final GREEN with strengthened receipt/provenance/credit assertions: **4/4, 0 skipped, exit 0**, `native-credit-final`.

## Schema and test-environment changes

- Official P04 generator freshly reproduced **41 server + 41 client files, all byte-identical** to the existing generated candidate. `generator-reproducibility.json` identifies exact decoded plan differences: composed schema hash and merged field ordinals. `Tools/schema-identity-read.mjs` changes only the four exact generated reducer/operation-plan body pins; canonical mismatch rejection remains.
- `Tools/compose-terrain-growth-schema.mjs --check` independently rebuilds the union from checked-in immutable predecessor ledgers. Current v6: **578 active, 3034 retired, 10 transitions, zero diagnostics for O4224/terrain/growth histories, freezeEligible=false**. Slot migration matches logical component identity; the removed bound-Chest Observer slot stays a permanent tombstone rather than being redirected to the new ordinal-zero component.
- Added exact immutable branch inputs `Gameplay/Compatibility/schema-identities.before-terrain-growth-{terrain,growth}.json` (SHA256 respectively `936a34dc8913b968c25ae81634281f63d7fd586c38521a93d82edcce167193dd`, `3ca71dcbecd294417198f5e825ec1cb502ccd35203a077bda4624189820ea5b8`). `schema-identities.json` is the complete composed union, SHA256 `ad044dc1a153ca4032bbe469e49ebc3d07e0328dfd6ca4be089d2ea86af1277b`.
- `Tools/schema-identity-growth.test.mjs` retains exact pre-growth checks against the real immutable growth checkpoint and adds exact branch-edge/input-byte assertions for the final union. `Tools/schema-identity-migration.test.mjs` tests the preserved v3→v4 checkpoint instead of pretending the current v6 ledger is v4; its only discharged historical pending domain is the demonstrated typed Effect inventory. All other old pending records stay exact.
- Parent explicitly authorized an isolated **TEST ONLY** Git history because the existing CLI tests require an independently readable baseline commit. `schema-test-fixture.json` records actual immutable growth, actual v6 baseline and empty descendant. It is not a formal committed release history. No working repository's index/history was changed. Existing incomplete-history fixture was reused read-only.
- `DeclarationShapeTests.cs`, `SourceHygieneTests.cs`, `SdkPackConsumeTests.cs` now locate source through the already-existing `EngineRelease.RepoRoot` solution discovery, instead of assuming a fixed private build-directory depth. Their assertions are unchanged.
- `BomberBoundedObjectStorageTests.cs` uses actual current/historical Tick identities for three positive fixtures. Previously its supposedly valid inputs were in the future and source-generation negative tests could pass for the wrong reason. Full bounded class now **20/20**.

## Actual validation

Each named E entry has its command, actual exit and source/package input hashes in `.json` plus output in `.log`. Earlier failures were retained.

| Evidence | Executed result |
|---|---|
| `generator-server-check`, `generator-client-check`, `generator-reproducibility.json` | Official generator exit 0 each; 82 outputs identical |
| `schema-all-01` | 17/21 pass, 4 failures, exit 1, no skip; before missing body pins/union repaired |
| `schema-all-02` | 84/88 pass, 4 failures, exit 1, no skip; missing test history fixture + stale checkpoint expectation |
| `schema-all-03` | **88/88**, no failure/skip, exit 0 |
| `schema-growth-final` | **4/4**, no failure/skip, exit 0; strengthened immutable branch hashes |
| `schema-compose-final` | Exact canonical union bytes, all three histories zero diagnostics, exit 0 |
| `config-readers-check` | **54 files** regenerated and identical, exit 0 |
| `config-exports-check` | Default + **48 profiles**, two clean exports each, both end projections/readers identical, exit 0 |
| `gameplay-final-build-03`, `client-gameplay-build-01` | Server test/client gameplay builds, **0 warnings, 0 errors**, exit 0 |
| `native-red-01` | **0/4**, 4 failures, no skip, test process exit 2 |
| `native-credit-final` | **4/4**, no failure/skip, exit 0 |
| `bounded-final` | **20/20**, no failure/skip, exit 0 |
| `gameplay-all-01` | **543/574**, 31 failures, no skip, exit 2 |
| `gameplay-all-02` | **563/574**, 11 failures, no skip, exit 2 |
| `gameplay-all-final` | **566/574**, 8 failures, no skip, exit 2; final source version of this handoff |

Real observer wire regression is included in final full run: **8 observers, 2352 frames, 16 placements and 16 explosions; peak 41657 bytes < unchanged 65536 limit; 88 journal writes**. `LUMIO_BOMBER_CLIENT_GAMEPLAY` pointed to this candidate's freshly built `.artifacts/resume-20261002/client/bin/Lumio.Bomber.Gameplay/Debug_client/Lumio.Bomber.Gameplay.dll` (not another source's assembly).

This is Native/SDK gameplay verification, not Platform admission, browser acceptance, 30-minute stability, raw deterministic replay or full multi-seed completion. Those remain parent-wide required gates.

## Exact remaining 8 failures and newly confirmed selection defect

| Case | Current evidence / next action |
|---|---|
| `BomberTablesTests.EveryDeclaredProfileLoadsThroughTheReleaseLoaderAndTypedAdapter` | Effective capacity formula requires 2912 bombs while one profile provisions 2784. Correct approved source profile and regenerate official exports; do not weaken the calculator/assertion. |
| `BomberGrowthHealthTests.GoldDeathWealthSurvivesNoLandingRolloverAndPartialPlacementExactlyOnce(false/true)` (2) | Fails line 331 at old one-Tick next-match assumption. Fixture has no real Native initial-resource lifecycle, while current terrain rules gate rollover on completed resource state. Replace the old fixture with real Native phase progression while retaining exact wealth invariants. |
| `PlayerLifecycleTests.NextMatchRestoresExistingLifeThroughAnAppliedEffect` | Fails line 100 for the same no-Native single-Tick rollover assumption. Exercise real map/round progression and real restore Effect. |
| `BomberTerrainProductionTests.DelayedOriginalAfterSourceDeathKeepsOriginalAttribution(true)` | P04 does not complete required real successor. `false` case passes. Must integrate the owned upstream Runtime/Engine successor package; no Game-side same-body revival. |
| `FlyKickAuthorityTests.SnapshotRestoresMovingBombWithoutRestartingMachineOrChangingTrajectory` | Existing active-coupled-state guard throws `bomber_active_resume_unsupported`. Retain protection until complete coupled host restore/hydration works through released upstream seam. |
| `SkillAuthorityTests.BlinkFacingStartsDownAndResetsForRespawnAndNextMatch` | Old test directly writes `LifePhase=AwaitingRespawn` and expects same-body reset. Rewrite fixture to real lethal Effect, successor and Native rollover; do not reintroduce stale authoritative behavior. |
| `BomberPresentationJournalTests.ExplosionDamageAndDeathRetainChainSourceFacts` | Fails line 149; old fixture writes the managed health seed directly before expecting authoritative lethal settlement. Replace with real damage Effects and preserve chain/actual death assertions. |

Confirmed additional production issue (not fixed in this handoff): `SelectCharacterAbility.cs:45–53` writes `NextCharacterId`; `BombSystem.Server.cs:314–318` moves Warmup→Running without calling `LatchCharacter`. Calls currently exist only at initial EnsureMatch and next-match reset. Warmup selection after initial setup therefore applies late. At the authorized Warmup deadline, iterate participants in deterministic slot/full-ID order and call existing `LatchCharacter` before opening Running, with last-allowed-Tick/closed-phase tests. UI must not write local authoritative character state. Parent also notes the Browser `PlaceBomb` export lacks long-press/remote input fields needed by the six-bomb implementation; preserve formal input semantics when implementing those abilities.

## Review artifacts and integration directions

- Narrow **three-path** patch with exact pre-resume production bytes (verified against the recorded RED hashes): `E/resume-shared-producer-only.patch`; SHA256 `dfc9327fc1b61c3e7c63ae8876cdbf2a8b571dd2af485b3c0cd58186c959870d`, 17611 bytes. Includes the two production files and final four-case test. `git apply -p1 --check` succeeds against the changed-path before fixture.
- Complete candidate delta relative to immutable **O4224**: `E/original4224-to-current.patch`; SHA256 `32780ac909c8e3b39bd0b55112151856a6e2215a164824a4751b5765a1f8372e`, 19844434 bytes, **661 changed paths**. `original4224-changes.json` names every path and before/after SHA256. `git apply -p1 --check` succeeds. Only changed files were staged once for constructing the patch; no full source trees were recopied. This patch is an integration input, not permission to overwrite parent's newer UI/movement/WASM.
- `E/patches.json` contains patch checks/hashes. `E/resume-before-locations.json` identifies exact immutable source predecessors for fixture/schema test files; the closed reader's pre-resume hash is recorded even though no standalone original copy was recovered. The complete candidate tree and full delta contain the final file.
- Continuation plan: `C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/docs/plans/2026-10-02-bomber-shared-credit-resume.md`.
- Parent read the production narrow diff and four Native cases and requested a formal independent-review record. That approval is owned by the parent, not self-issued here.

Parent has now authorized the next sole-writer task in the same GTCG: fix Game-owned effective budgets, authoritative warmup character latching and outdated fixtures using real Native/Effect progression. Upstream successor/hydration stays explicitly separate. The patch and test evidence above preserve this reviewed handoff state before further edits.
