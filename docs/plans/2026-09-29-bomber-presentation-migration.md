# Bomber Presentation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Migrate the existing prototype's complete scene, characters and UI into the production browser client, then integrate skills, and only then resume multiplayer validation.

**Architecture:** The production client owns a Three.js presentation package under `games/101-bomber/Client/Presentation`. It consumes immutable presentation snapshots projected from the C# replica and the Engine voxel reader. Prototype simulation, local host, bots and gameplay input polling are excluded.

**Tech Stack:** TypeScript, Three.js, Vite, .NET browser WASM, released Engine replica/voxel modules, Playwright.

## Global Constraints

- Priority: scene, characters, UI; skills next; networking last. Do not reopen visible browsers for review now.
- Reuse the prototype's existing visual work; do not replace it with circles, flat markers or a new art direction.
- Source is the latest reviewed main prototype at `af385a9cd0f261317e97240a7e55accdda8d01d5` (`origin/main`), including the fifth character and growth visuals. The current branch's prototype folder is older; export source from Git without overwriting that folder.
- DS remains authoritative. Presentation may interpolate and animate, but cannot run movement, bomb, damage, pickup, skill or terrain rules.
- Consume `games/101-bomber/Engine` release layout only. Do not add Runtime source references.
- Preserve the M2 admission rejection and other users' work. No commits, pushes, reset, clean or rollback.
- No M2 freeze, long stability/replay/seed campaign, uint migration or Engine Effect work.

## Task 1: Migrate The Presentation Package

**Files:** Create `games/101-bomber/Client/Presentation/{src,package.json,tsconfig.json,vite.config.ts,README.md}`. Reuse prototype `view`, `hud`, `audio`, `present`, and their display data/math dependencies only.

**Interface:** export `createPresentation(options)` with `{ stage, labels, hud, localPlayerId, config, rules, callbacks }`. Return `{ push(frame, now), resize(), toggleOverview(), dispose() }`. `frame` is `{ snapshot: WorldSnapshot, events: BomberEvent[] }`. Also export presentation config/types, and `createReplicaAdapter` from `src/replica-adapter.ts` when available. Build `dist/presentation.js` and `dist/presentation.css`.

```ts
const presentation = createPresentation({ stage, labels, hud, localPlayerId, config, rules, callbacks });
presentation.push({ snapshot, events: [] }, performance.now());
```

- [x] Copy display source mechanically; exclude app/local-host, sim, bots and input.
- [x] Add the production mount, frame loop, lifecycle cleanup, audio gesture and responsive full-screen styles.
- [x] Remove local pause/character commands from production UI unless a real callback exists; settings only alter presentation.
- [x] Build and typecheck; run migrated display tests and assert forbidden dependencies cannot enter the bundle.
- [x] Independent task review and fixes.

## Task 2: Project The Replica Into Display Data

**Files:** Create `Client/UI/Spectator/PresentationDump.cs`; modify `SpectatorDump.cs`, `host/Program.cs`, project compile includes and focused C# tests. Create `Client/Presentation/src/replica-adapter.ts` and its tests.

**Interface:** C# `PresentationState()` returns JSON containing string entity IDs, string ticks, game config, match state, players, bombs, pickups, hats, chests, fire zones and skill state. The JS adapter maps these to render-only integer handles and the migrated view model. Terrain comes from `voxelGrid.readSurface` for each ground/obstacle layer; Pending/Unavailable never becomes known floor.

```ts
const snapshot = adapter.project(JSON.parse(api.PresentationState()), terrain);
presentation.push({ snapshot, events: [] }, performance.now());
```

- [x] Export replicated public/owner state without manufacturing missing fields.
- [x] Map stable string IDs to collision-free presentation handles and reset at world boundaries.
- [x] Read formal configuration and terrain catalogs, map states explicitly, retain unknown terrain.
- [x] Wire production mount into `main.js`, publish bundle and display content through the WASM host.
- [x] Test health, life/respawn, hats, skills, bombs, circles, large IDs and reconnect cleanup.
- [x] Independent task review and fixes.

## Task 3: Complete Skills After Presentation

**Files:** Existing GAS abilities, browser player input exports/controls, production skill HUD and projected skill data.

- [x] Audit all five existing character skills, bomb forms, cooldown/status fields and character selection against formal config and existing gameplay.
- [x] Connect available authoritative skills/selection to keyboard, pointer and migrated HUD; validate rejection and release cleanup.
- [ ] Resolve game-owned missing behavior with focused tests. Record any upstream limitation explicitly; never substitute prototype simulation.
- [x] Complete the authoritative terrain-movement foundation for skill interaction: two-layer batch reads, cell-center blocking, water speed, dual-direction fallback and life-safe own-bomb exit. Advanced turn assistance/buffering and passive candy follow separately; do not claim full movement completion from this slice.
- [x] Complete authoritative bomb placement admission: released terrain reads, zero-cost water/blocked rejection, centered placement, bounded same-Tick cell/participant reservations, and source-safe committed occurrences.
- [ ] Complete authoritative single-slot pickup/exchange and config-driven placement identity, including exact-life dropper exclusion until leaving the cell. Preserve character binding and cooldown, reject unsupported/legacy forms, and keep accepted bomb kind immutable.
- [ ] Migrate six-form catalog and two-chip no-level HUD with tool-issued content identities; disabled forms stay unavailable until their effects and producer budgets are complete.
- [x] Author dormant Fire/Remote/Split identities through the official tool and filter production Presentation by enabled supported content; requirements in `.run/dormant-bomb-catalog-brief.md`.
- [ ] Review skill behavior and presentation evidence.

## Task 4: Verify And Resume Networking Last

- [x] Headless browser fixture review on desktop/mobile: complete scene, five dolls, hats, HUD, bombs/explosion, status/skill FX, results and settings; nonblank moving canvas and no text overlap. Current supported presentation fixture and final independent layout review passed on 2026-09-30; unsupported Effect authority remains a separate gameplay limitation.
- [ ] Build production WASM bundle, then verify real replica render and authoritative input.
- A/B preview is cancelled by the user's later instruction; do not start it unless explicitly requested again.
- [x] Attempt bounded non-preview v0.0.4 eight-Bot admission after supported pickup review. Result FAIL: Defender quarantined Windows DS; five scenarios passed, two lack results, one failed field reads. Full-match acceptance remains blocked.
- [ ] Record exact commands, screenshots, remaining limitations and review results; mark completion only with evidence.

## Progress

- 2026-09-30 current checkpoint: official v0.0.4, supported presentation/HUD, character boundaries and automatic collection have reviewed evidence; 31 upstream uint tests remain open. Defender recovery passed after intelligence update to 1.459.471.0 with unchanged official bytes and no protection bypass. Prediction-budget and Game peer-input repairs passed independent review; eight-Bot admission now passes. Full-match H timed out, and later legal-input probes exposed repeated full journal replication beyond the 64 KiB transport budget. Raising only a diagnostic frame ceiling delayed the DS runtime failure and is not a production fix. Damage-persistence regression is RED with unchanged health; production Effect integration and distinct successor respawn remain incomplete. All 81 recorded H/I/J/L/M/N/O/P/Q processes and the isolated Platform are cleaned up, with no new Defender events. See `.run/v004-network-report.md`, `.run/journal-wire-audit.md`, and `.sdd/progress.md`. Entries below describe earlier checkpoints, not the current pending-work queue.

- 2026-09-29: User replaced browser preview priority with presentation migration, skills second, networking last. Earlier player connectivity evidence remains valid but is not completion of this goal.
- Package evidence: 604 migrated tests and dependency guard passed; desktop/mobile fixture WebGL screenshots are under `.run/presentation-evidence` and `.run/presentation-integrated-*`. Published WASM build passed, C# projection 32 tests and spectator JS 46 tests passed. Fixtures are presentation evidence, not live multiplayer evidence.
- Independent review `.run/presentation-review.md` found same-tick terrain loss, missing input callbacks, AOI/dead-seat conflation, skill parameter projection gaps, circle row-ID misuse, server teleport sequence missing, and focused-control Space bubbling. Feed/projection/control fixes are in progress; 53 focused presentation tests pass. Authority journal, full skill implementation and re-review remain open.
- The published browser voxel API lacks binding lookup, so exact ECS chest-to-cell projection is currently unavailable. Do not decode Section payloads or invent positions. Upstream read-only binding API is needed; `.run/skills-gap-audit.md` separately records skill/Effect and M2 gaps without enabling M2 admission.
- Integration update: actual chest voxel cells now render the migrated chest model without associating an invented ECS identity. Unknown hit counts remain hidden. Public/owner projection, stable life handles, same-tick terrain refresh, AOI disappearance, circle-stage mapping, authoritative statistics and committed occurrence translation are implemented.
- Current verification: presentation 622/622 across 49 files; dependency guard 1/1; browser controls/main 51/51; spectator C# 34/34; journal focused 12/12 before subsequent skill corrections; production presentation build and WASM publish pass. Desktop/mobile fixture checks report 2416/3482 canvas colors and no page errors or horizontal overflow. These are authored fixture checks, not live networking evidence.
- Re-review `.run/presentation-rereview.md` identified owner-only cooldown disclosure and same-tick brick attribution. Producer/adapter cooldown visibility and timeline attribution have been corrected; focused JS 11/11 passed. Final narrow re-review is pending.
- Identity reconciliation `.run/presentation-identity-report.md`: exact installed Engine package accepted, original 452 identities and 343 retired entries retained, five additive identities recorded, 51/51 tests and actual verifier pass. Existing bomb ordinals are preserved; `freezeEligible=false`. Continuing skill source edits require a final evidence-hash refresh.
- Skill work remains in progress. Complete duration/period Effect support is absent from the installed release; this is distinct from the game-owned missing voxel-read integration. Root verified public `World.Manager`, `VoxelGameplayBinding.Resolve`, and `IVoxelGameplayQueries.Read` in the installed release for continued blink implementation. Fifth character, growth/supply and M2 rule production are not marked complete. Networking remains deferred.
- Latest skill checkpoint: character selection reads generated active/passive bindings; passive regeneration is no longer placed in the active slot. Activation validates flag, kind and level, and rejects unsupported production paths. Blink now uses the released voxel batch API, shares one full-map read per tick, selects a legal farthest landing, commits teleport sequence/cooldown only on success, and preserves public occurrence visibility. Spawn/respawn/next-match facing is Down; blocked input updates facing and frozen input does not. Focused skills 10/10, journal 7/7; full Gameplay 219/249 with only the same 30 scalar uint failures; Client Application 41/41, Spectator 34/34. Final browser Gameplay and WASM publish passed. Details: `.run/skill-authority-report.md`.
- Desktop/mobile integration additionally verifies canvas changes after movement and camera interaction. Latest visual proof has 2417/3484 colors with no page errors. No visible browsers or live A/B networking were launched.
- Fifth-role continuation: official config now binds kangaroo 118005 to flyKick 13 at level row 116031. Default plus 48 profiles and both readers are generated from source. FlyKick uses terrain-aware targeting and the existing bomb Native HFSM, 8 cells/s slide, source-preserving fuse and water extinction, original-life capacity return, and fixed 4s/3s successful cooldown. Frozen input and authoritative SkillCasts review findings are fixed. Full skills remain incomplete.
- Independent skill review and cast-identity re-review: `.run/fly-kick-review.md` and `.run/fly-kick-rereview.md`. Same-entity respawn now separates public cast state by exact participant/entity/generation. Both narrow spec/quality verdicts pass after the correction; nonblocking test/comment notes were addressed. Final committed kick/water FX hooks also passed separate spec/quality review in `.run/fly-kick-fx-review.md`; emitted-identity and four-direction test coverage remain optional notes. The reviewer could not run Vitest because of sandbox `spawn EPERM`; successful root test runs are separate evidence.
- Latest verification: FlyKick authority 19/19; Presentation 626/626 in 49 files; Client Application 41/41; Spectator 35/35; browser controls/main 51/51; all Tools 303/303 and final schema identity 51/51. Full Gameplay 266/296, with only the same 30 uint snapshot failures and zero skipped. Official browser build and WASM publish pass; existing Command/Observability warnings remain. Authored desktop/mobile fixture includes all five characters and public kick/water effects, with 2648/3588 sampled colors, motion/camera changes and no page errors. This is not networking evidence.
- Final identity evidence retains 457 active identities, 343 retired entries and all eight pending domains; 124 current inputs, 127 historical inputs, `freezeEligible=false`. Config row allocation separately preserves prior IDs. No Engine/Runtime workaround, M2 admission change, long replay/stability campaign, commits or pushes.
- 2026-09-30 movement continuation: server movement now consumes the shared released voxel batch, stops at blocked cell centers, applies water speed across exact cell boundaries, supports perpendicular fallback and full-life own-bomb exit. Independent review found unbudgeted retreat and delayed water-speed switching; both are fixed and queued GAS/Tick tests added. Re-review `.run/movement-terrain-rereview.md` passes spec/quality. Advanced assistance and buffers remain open; client position prediction stays closed until a terrain binding exists.
- Placement continuation: queued GAS tests reproduced water/terrain admission failures and two participants creating bombs in the same cell before deferred creates commit. The released command buffer has no public pending-create enumeration. ADR0046-backed bounded persisted placement reservations now use four additive world-component identities; this is not a schema freeze. A fresh single-slot audit is recorded in `.run/bomb-slot-scope-audit.md`; special-bomb effects, issuance, transfer and automatic pickups remain incomplete. Installed Gas XML still states duration/period are unimplemented.
- Latest evidence: movement authority 50/50 plus MoveAbility/SkillAuthority/FlyKick 36/36; full Gameplay 316/346 with the same 30 uint snapshot failures and zero skips (`.run/movement-gameplay-final.log`). Identity 51/51, 128 current inputs including the four new movement source/generated files, 127 historical inputs, unchanged identity inventory and pending domains. Release browser Gameplay build and WASM publish pass; prior Command/Observability reference warnings persist. FX optional identity/direction coverage is addressed (19/19 authority, 7/7 JS). Runtime PR244 remains OPEN at `4962f660a53136ea6263b1fc2fde82a41910e497` in the latest read-only check. No preview server or owned review terminal remains running.
- Placement verification and independent review are complete (`.run/placement-authority-report.md`, `.run/placement-authority-review.md`). Placement 21/21, world snapshots 8/8, related skills/movement/kick 79/79; latest full Gameplay 338/368, same 30 `BomberScalarUIntSnapshotTests` failures and zero skips (`.run/placement-gameplay-final.log`). Root confirmed official generation, 52/52 identity tests, exactly four additions with all 457 earlier identities preserved, 461 active/343 retired, 132 current/127 historical inputs, unchanged pending domains and `freezeEligible=false`. Client Application 41/41, Spectator 35/35, Release browser build and WASM publish pass; existing Command/Observability reference warnings remain. No visible browser, preview server or A/B session was started. Overall Tasks 3/4 remain incomplete.
- Single-slot exchange continuation: configured forms, same-kind rejection, conserved in-place exchange, exact-life exclusion and immutable placement identity are implemented. Independent review is conditional because restored outgoing SkillId becomes 0 under the released SDK uint defect. Loadout 37/38 and Gameplay 375/406 with 31 failures, zero skips; Client Application 41/41, Spectator 35/35, identity 53/53, browser build and final WASM publish pass. Exactly two private fields added, 463 active/343 retired, 133 current/127 historical inputs, freeze=false. Persistence is NOT complete; cross-cell pickup scan cost is a P2 review note before larger-room admission. Continue independent catalog/UI work without a Game serialization workaround or networking validation.
- Dormant catalog implementation and integration corrections are complete, awaiting independent spec/quality review. Official content IDs are Fire/Remote/Split 40003/40004/40005, Remote kind 119008/code 7 and levels 116032-116034; all remain disabled with zero candy weight. Production projection filters unsupported/disabled content and legacy combos. Root actual C# fixture projects five characters and eight skills; replica-config 4/4, rebuilt BomberTables 8/8, typecheck/build pass. Implementer reports config 19/19, budgets 81/81, Spectator 35/35, Presentation 633/633 and generator checks. Root full Gameplay before the obsolete table-count fix was 384/416 with 32 failures, zero skips; the count assertion is now covered by focused passing tests and the other 31 failures remain the known uint blocker. Identity 53/53 with unchanged inventory. Review package is `.run/dormant-bomb-catalog-review.diff`; active reviewer is `term_eb72050a-467c-4325-ab73-6818d9f817ce`. Two-chip HUD is scoped but not yet dispatched; automatic pickup scope is complete.
- Dormant catalog review is now complete. Initial review found bound character skills leaking as collectible candy; the fix introduces one explicit eligible-candy set used by both entities and pickup notices. Focused projection tests 25/25, typecheck/build and root actual C# fixture pass. Independent `.run/dormant-bomb-catalog-rereview.md` passes both spec and quality and verifies final input hashes. Two-chip HUD is the next sole implementation task; automatic pickup and character selection boundary follow. Full Effects and uint persistence remain open.
- Two-chip HUD implementation and root integration are complete, pending independent review in `term_fb93f12a-75b0-4c37-b0e3-bdee0e929477`. Exactly two chips, fixed display parameters, one five-pair favorite mapping, two-second pickup/exchange notices and removal of old progression text are implemented. Root caught and resolved zero-weight held-form visibility and passive cast-button rendering. Full Presentation 630/630 before final fixes; final covering tests 61/61 and 12/12, build/typecheck and guard pass. Browser build and WASM publish pass with prior warnings. Desktop/mobile headless fixture has 2652/3588 sampled colors, five loaded portraits, motion/camera changes, correct button/callback transitions and no page errors/overflow; screenshots inspected. Root verified 173 native baseline and 21 final source hashes. Temporary server and implementer terminal are closed. Evidence `.run/two-chip-hud-root-integration.md`; automatic pickup and character selection remain next.
