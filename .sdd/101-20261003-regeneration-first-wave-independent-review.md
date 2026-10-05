# Regeneration first-wave independent review — 2026-10-03

Reviewer: registry_bounds_review, non-author of the four Regen cases and execution plan. Read-only source/evidence inspection; no build, test, GEN, Native execution, source/index changes or provider changes. This report is the sole write.

## Verdict

**Spec PASS / quality PASS for the scoped four-case RED and bounded ordinary-producer plan.** No blocking test-fixture defect found. Root may authorize the narrow Gameplay implementation below after considering the explicit settlement and capacity requirements. This is approval of the proposed implementation boundary, not approval of an unseen production diff or a claim that regeneration, M2, Supply17 or the whole game passes.

The actual RED is missing first-wave production, rather than an admission/census/warmup/config failure. All three positives reach their Native additions assertion and observe zero new cells. The one-water negative passes. The stop case fails its initial growth prerequisite, so its later 105-second assertions have **not yet executed successfully**.

## Reviewed identities and actual execution

Paths below are relative to `C:/Work/LumioGames/LumioGame`.

| Item | SHA256 |
|---|---|
| `games/101-bomber/Server/Tests/Gameplay/BomberRegenerationProductionTests.cs` | `1430ca00bfdf3c792b97e5ca5a89d570ccc000be4cfa6a26d9d3403400ca4b1f` |
| `.sdd/101-20261003-regeneration-first-wave-execution-plan.md` | `3203667ec1274db9bc57caa249567299eeb452cb6e39c2111f2766d831f638b8` |
| `.run/v14-native-production-20261003/build-18.json` under 101 | `df7f3c353f098e066dbb7e4f24e9beb7f857d595713fba997e66b5666a6dbcd7` |
| Same directory `build-18.log` | `05f488bbc8e8a4c33e6a186e1431be04c6f1cd0f8e2b65a12804305ce9803dd6` |
| Same directory `regeneration-first-wave-red-01.json` | `0a3d4a67abd2bf74beb46d300a8b188d19595ce954fe7379a8a27e5e63e6f30f` |
| Same directory `regeneration-first-wave-red-01.log` | `bc3d58be03d2ef526bbcb2eae12bc100d3262f4cbc478b3bd08ebdb16e276c62` |

Independent physical hashes match the RED JSON's source hash and log hash. Root build18 succeeded with 0 warnings/0 errors, raw child exit0. RED ran 06:21:09.1600389Z–06:21:19.2415355Z; raw `.exit` and JSON both say2. Its actual argv was:

```text
dotnet C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/artifacts/bin/Lumio.Bomber.Gameplay.Tests/release/Lumio.Bomber.Gameplay.Tests.dll --filter-class *BomberRegenerationProductionTests --minimum-expected-tests 1
```

Actual summary is **4 total, 3 failed, 1 succeeded, 0 skipped**. The plan requests minimum4; this run used minimum1, but its raw total4 still establishes execution of all four cases. Preserve this distinction; use minimum4 for the closing run.

| Actual failure | Location | Result |
|---|---|---|
| FirstEightSecondWaveAddsOnlyWholeSafeOrbitsWithinTheSharedCap | line31 | required4..8, actual0 |
| ACompleteOrbitIsRequiredEvenWhenOnlyOneMirrorMemberIsWater(false) | line67 | required4, actual0 |
| OneHundredFiveSecondStopPreventsTheNextWaveWhileTheMatchIsStillRunning | line88 | initial growth required4, actual0 |
| Same Theory, true | remaining case | passed; total proves one success |

RED assembliesAtEnd were independently rehashed and match the still-present physical DLLs:

| Assembly | SHA256 |
|---|---|
| Tests | `373a0adeb6446b1353ccd014a453476ba13940c395399a967df2c4b091bdea7c` |
| Gameplay | `9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685` |
| Ecs | `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def` |
| Gas | `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc` |

The run records official06 manifest SHA `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`. These are evidence identities; this review does not create a new official package or validate every manifest member.

The historical `regeneration-first-wave-test-source-01` test copy remains SHA `ca8102a7b94e25cd30850c6d50da1db298faca58ae5e19e5fbf02e2f6148abda`. Exact comparison with current1430 shows only: correct SDK `Ticks` qualification; two non-enumerable SyncList empty assertions expressed as Count==0; and extraction of the same Wood/Iron/Gold array into a static readonly field. Case count, growth, timing, water, identity, generation and safety assertions are preserved. The historical copy is not the source identity of build18/RED.

## Configuration, Native fixture and timing

Reviewed root/101 core and navigation, architecture/testing, design §§5/7.3/8.4, ADR0026/0035/0046/0047/0048, actual regeneration schema/table and generated Reader usage. `AuthoredFixture` copies real schema/registry/tables and invokes the existing Config exporter; it does not replace the simulator. Four retained fixture directories from the run window are `14d058e21e46418e922f66ab7ec6fa61`, `59cc80ffe21e4f7e92c120155033e9a1`, `b3837a1b95154c09b60e1ef0a96ac92a`, `f1c209f7022942e69e53bcaa9d63b161` under `games/101-bomber/.artifacts/authored-config`. All four compile logs report split-export OK27 tables, followed by the Python prefix diagnostic; the later Native assertion failures establish that config compilation/loading did not abort these cases. Timestamps associate these four with the run window; no per-case GUID provenance is invented.

All four exports have identical inspected files: server/game.json SHA `5d6124f322d25dd6c9f9cc90390e5bb60ddef0b595ab1eec29e834dd8ed02575`; map.json `91e8227738966a7bd708f227dea6365ae473bd8d8c164110e421251b33b2f003`; regeneration.json `a04bc57868c59e03e015f1f8efb34e7a935d4310a29ba013f0fade10e3e97bb1`; final_circle.json `ba939d7f61ad8b72d7828ddb6d4881852037ac6598e256336904d87754950d8f`.

Actual values: LegacyPillars19/8, tick20Hz, warmup3000ms, match240000ms, first/interval8000ms, max2 groups, threat3, target600permille, barrel denominator32, chest6, final115000ms, stop lead20000ms, resource threshold200permille. Only the four declared private overrides are authored; production defaults and maxima stay intact. Final-circle production derives the immutable census and stop from actual Native terrain and the actual match deadline. Thus `(240000-115000-20000)*20/1000 = 2100` ticks from StartTick is the exclusive105s stop. The last scheduled in-time opportunity is104s;112s is beyond it.

The fixture legitimately supplies the static Legacy capture's missing random resources: sixteen whole reflected groups/64 actual soft cells, actual floor/air checks and configured65% cap, before ordinary gameplay ticks. Real PrepareWriteV2/CommitV3 status0 authors the Native input, then actual player admission/warmup reaches Running. Initial census64, phase0 and empty Native-pending list are asserted. No synthetic phase, StartTick, stop, resource counter or regeneration success receipt is assigned. Initial resources are later changed through actual Native authoring; the denominator remains production-owned.

Whole-orbit witnesses reserve canonical reps below center9, producing four distinct reflections. The legal theory leaves exactly one safe actual orbit; the negative changes one ground cell to actual catalog water. No spare legal orbit can make the negative vacuous. First-wave checks wait until the exact logical deadline, assert unchanged Native state before that tick is processed, then allow four actual ticks for staging/commit/consumption before the second opportunity. Bound chest/barrel results require a parsed full Native binding, live correct entity type and generation>1. Native fixture commits are setup evidence, not producer settlement evidence.

The stop setup retains16/64 real soft resources, above20% and below60%, preventing resource-triggered FinalCircle from explaining a later no-growth result. It opens a new orbit only after105s and observes through112s+4 ticks. This is an appropriate stop witness after initial growth passes; current RED does not establish its later prerequisites or outcome.

## M2 safety under the Legacy fixture

`M2InitialLayout.IsSafetyCell(19,...)` protects the same eight corners/edge-midpoint anchors as current `BombSystem.SpawnPosition` for boundary1 Legacy19, with Manhattan distance≤1, plus central3x3/cross access. Tests author no M2 layout/phase or moat. The helper's conservative exclusions do not turn this input into an admitted M2 map. All actual lives are explicitly positioned at center using the existing test position helper, and growth checks use each actual LogicTransform. The Manhattan metric agrees with the existing formal spawn distance transform. This is legitimate fixture setup, not evidence of public movement or dynamic-spawn completeness.

No blocking reason to reject these four tests merely because the predicate is named M2. Production must still use actual Native ground and occupancy and protect current dynamic spawn reservations/L-shaped clearances where applicable; static anchors alone cannot prove those. Do not require phase3 on Legacy: existing initial producer explicitly treats Legacy phase0 as terminal, while unresolved M2 phases1/2 remain blocked. Do not import M2 water/pillar template truth into the Legacy terrain reader, widen the six-shape admission guard, or claim bridges/center connectivity from these cases.

## Minimal production authorization recommendation

Authorize only new `Gameplay/BomberRegeneration.Server.cs` and narrow edits to `Gameplay/BombSystem.Server.cs`, `Gameplay/BomberTerrainTransactions.Server.cs`, `Gameplay/Components/Bomber/BomberWorldRuntime.Server.cs`; add the existing `Gameplay/BomberRoundTransition.Server.cs` only if needed to gate unresolved promises before round transfer/reset. Root retains heavy validation. No declaration/generated/table/budget/Runtime/Native writes are required by this RED.

1. Add a once-per-tick ordinary hook before Terrain.End, after current player/bomb updates. Use existing Persist scheduler/generation/promises. Initialize from exact match StartTick+first; consume absolute opportunities once without past-wave replay. Require Running, real positive immutable census, actual now<stop, below target, legitimate terminal initial state, available actual Native observation, no conflicting frame/pending obligation. Density near60% must admit only whole groups without crossing the selected target policy; four tests do not cover that edge.
2. Admit each full four-cell group against actual floor/water/obstacle/binding, live player and bomb transforms, other occupying objects and protected reservations. Preserve distance≥3 equality and shared2-group cap. Select deterministically using existing Engine context. Honor ADR0048 barrel eligibility/capacity fallback to ordinary regen, then chest/soft; do not force soft or alter denominators just to pass a seed. Closed profiles/products stay closed and their gap remains explicit.
3. Add explicit **Regenerate kind3** validation, settlement and rejection handling. The enum exists, but current owner otherwise treats kind3 as bomb destruction: demands causal bomb/source identities, empty new block, ray/family provenance and destruction accounting. Reuse the real single terrain transaction protocol, while separating ownerless creation from Initialize/Destroy. Validate the whole cohort before writes/accounting. Keep existing Original/status0/Applied/TokenConsumed/full-section/full-revision evidence and exact submitted-tick/transaction correlation intact.
4. Record bounded obligations before births/submission; structural create/binding ownership must survive Staged/Unknown and restore. Accepted matching Original activates the cohort once. Duplicate/rejection cannot mint a second birth or retire a reused identity; retire only proven unbound/unpublished owned identities. The expiry boundary prevents new out-of-time opportunities; it must not discard an unresolved correctly submitted pre-stop Native obligation or manufacture a replacement wave. Reuse existing transaction/generation allocators, checked arithmetic and actual all-four object credit. Prove worst-case encoded bytes against the planned16384-byte bound; this number is not automatically validated by a Sync<string> declaration.
5. Wire bounded decode/shape checks and cross-row identity validation into the appropriate hydrate/resume/round owner, respecting hydration ordering. Preserve active paired-restore gates. The four first-wave cases alone do not cover recovery, Unknown, Duplicate, rejection, target overshoot, exact threshold equality, all products/rings, pending births or worst-case structural/byte budgets. Those require additional focused witnesses and independent review before broader closure.

## Closing gate and limits

Root should build the authorized production diff, retain exact source/DLL/Native identities, then run the unchanged four cases with minimum4 and zero skips. Require the stop case to reach and pass its post105s assertions. Preserve the existing tests and Native receipt guards. A subsequent production review must check all-row validation and failure ownership rather than infer correctness from four green cells tests.

This review neither executed commands beyond lightweight file/hash/Git reads nor validated a production candidate. No full-game, M2 admission, product distribution, bridge lifecycle, next round, all Native producers, release package or long-run acceptance is closed.
