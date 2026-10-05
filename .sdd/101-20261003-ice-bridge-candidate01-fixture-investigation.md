# Ice bridge candidate01: actual failure classification and private fixture correction

Date: 2026-10-03. This is an author-side investigation, not an independent review of my Ice production candidate. Scope is read-only production/SDK/evidence inspection and a private helper-order draft. No compiled source, production, declaration, generated output, config, index, or original assertion was changed. No build, Native execution, test, or GEN was run by this agent.

## Evidence identity

Root's `games/101-bomber/.run/v14-fullpack07-native-20261003/build17-ice-bridge-production` recorded raw exit 0. The following `ice-bridge-production-candidate-01` recorded 12 total, 8 succeeded, 4 failed, zero skipped, raw exit 2, duration 14.578 seconds. The log SHA is `4cc345b437a9612002f5eba782344f720cdc0eaa1f5fc21b9108eb153719aa79`; build log SHA is `5c40076dc3e51e2ab77a140fe86651944f1f8c7eaa902c4732c630e75c9b9a1b`. The independent low-memory evidence check matched physical log hashes, raw exit files, all 373 start/end source hashes, and the complete six-assembly recorded build/test identity. Both runs recorded zero source drift.

The exact historical test class SHA is `b6bbda1f6d5ccda6dae975b37e6db904b0a361a00de034757f4d6537efe36e90`. Gameplay DLL SHA is `e1df5023fd54d1b332af7613a6c5e9ea939e1e8804a41acad416559136d9899a`, Tests DLL `91cdbeeba79e08a0771ceec5db77076a5564a6def57a67790d4242e9256f6c89`. Official07 manifest SHA is `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`. Later source edits are not retroactively attributed to this run. Historical originals were not overwritten.

The SDK contract inspected is the exact07 source `C:/Work/LumioGames/.101-pack07/LumioGameRuntime`, HEAD `d8ae3da3793d5d95785606be319668a4318af85a`; current main was not used to decide its semantics.

## Failure classification

| Actual failed case | Actual stage | Classification |
|---|---|---|
| ExpiryOriginalExtinguishesEveryStationaryRemoteAndFrenzyFuseExactlyOnce | `DeliverAndTick` → `BindCandidate` line561, `restore_target_not_fresh` | Fixture API-order error; retained Original never reached the consumer on this call. |
| RetainedOldWaterOriginalCannotMeltOrRetireTheReplacementGeneration | Same helper and SDK refusal | Same fixture error; this result does not establish a replacement-generation business defect. |
| ARealOldLifeRemoteCannotReturnItsMeltCreditToAnActuallyLandedSuccessor | After actual water Original delivery and actual remote retirement, line243 Expected0 Actual1 | Test expectation conflicts with existing Participant inventory continuity; not evidence of an old result being rebound. See full chain below. |
| WithheldWaterOriginalKeepsTheActualStationaryFusePastItsUnchangedDeadline | line318 Native HFSM snapshot read immediately after Place publication | New fixture precondition failure before the long-withheld deadline. P2-2 has not yet reached its business RED. Root separately added one normal Tick; this agent did not implement that change. |

Eight actual passes reached production Native paths, but they do not close the four failed cases, the long-withheld P2-2, full bridge feature, or Goal101.

## Fresh adapter restore: narrow private correction

`HostVoxelWorldAdapter.Checkpoint.cs:25–32` rejects restore after `_frozen`, previous restore, queued transactions/results, or fault. `BindingContext.cs:48` calls `EnsureMutation` before policy validation; `HostVoxelWorldAdapter.cs:100–116` sets `_frozen=true`. Hence the original helper's SetBindingPolicy then RestoreResultCheckpoint always violates freshness for non-null retained delivery. Assigning the same scene World in the fresh constructor does not freeze it (`HostVoxelWorldAdapter.cs:71–80`). Official Native restoration reference at `VoxelNativeBridgeIsolationTests.cs:730–737` likewise restores delivery on a fresh adapter before entering its business frames.

The private draft changes only these two statements' order:

```csharp
if (original is not null) candidate.RestoreResultCheckpoint(original);
candidate.SetBindingPolicy(scene.Adapter.BindingPolicy);
```

The real Native handle/ABI, real scene owner, existing binding policy, exact captured Original checkpoint, binding, Tick callbacks, and three normal delivery Ticks remain identical. No checkpoint facts, receipts, tokens, revision, clock, phase, success outcome, or bindings were manufactured. The full SDK checkpoint validation remains active; setting policy afterward still derives actual current entity candidates. This is a source-ready repair hypothesis, not a executed GREEN claim.

Private directory: `.run/ice-bridge-fixture-investigation-01/`. Current physical before SHA `7c62a3bb0abba8b59890640701e2f6b2d8320b3a281ecc7c279bdc2181976e99`; draft SHA `cb955df78a50d8b5b41e4ecc53412a8ddb60709421c2c81cca7aba4a136b3ddd`. Root's separate normal next-Tick initialization in case12 is already in this baseline and is preserved. All 182 assertion lines remain byte-identical and ordered. Static class count: eight Fact methods plus two Theory methods with two InlineData rows each = 12 cases. Manifest SHA `43e93ca952834ab1133b50fec3b3f6919ce070b1be2cd33f0e118beadd9130fc`. Apply only this narrow helper reorder after verifying the current production test baseline; do not replace a later Root source with this whole-file draft.

## Old Life Remote: complete observed and source chain

The natural-eight-second-retirement explanation is excluded by this actual execution: it passed `AwaitWater` and then `AssertAllFuse` before line243. That helper asserts the remote remains live, in Fuse, at the bridge cell, with FuseEndTick strictly greater than current Tick. It also passed unchanged old SourceLife and SourceLifeGeneration, actual old death, actual new Life creation, landing, and restore checks. Thus the observed inventory change follows actual water settlement and remote retirement, not an unobserved early expiry.

1. `BomberSuccessorLifecycle.Server.cs:199–210` restores successor Available using `BomberInventory.Available` for the Participant. `BomberInventory.Server.cs:12–14` subtracts every ordinary unreturned Fuse owned by that Participant, including old-life Fuses. With one old remote and new capacity1, successor Available0 is correct.
2. Ice's actual accepted Native Original drives `CompleteWaterRetirementAfterNativeValidation` (`BomberIceBridges.Server.cs:487–505`) through actual `BomberBombLifecycle.Ensure/Send(Extinguish)` for all Fuse occupants. The real Native HFSM later retires this remote.
3. `BombSystem.Server.cs:658–678` direct ReturnBombCapacity checks current full SourceLife and SourceLifeGeneration, original life liveness/type and participant identity. This old Life fails that guard; the method cannot directly refund into the successor.
4. The same normal system execution calls `BomberInventory.ReconcileSuccessors` (`BombSystem.Server.cs:58`). With the last old Fuse gone, Participant ownership occupancy is now zero and its current successor capacity1 legitimately yields Available1.
5. That method submits a fresh actual 10109 `BomberInventoryEffect` with Source=Target=current Life, current full Participant/Match/Generation/Capacity. Its CanSettle rechecks all identities, real PreparedRevision, current positive health/legal phase, current capacity, and the current owner ledger. This is a new current-life effect, not retargeting an old receipt.

Existing `BomberInventoryContinuityTests.OldFuseExitReconcilesCurrentInventoryAcrossActualRespawn(true):177–211` explicitly requires successor Available0 while the old Fuse is live, then1 after it exits and stays1 across repeated normal ticks. `CapacityLossKeepsOldFusesAndOpensInventoryOnlyAfterTheExcessLeavesFuse:127–172` requires0 until the last excess old Fuse exits, then1, and rejects a stale old-life effect. Those preexisting rules would regress if production reconciliation were disabled simply to satisfy this new pair of Equal(before) assertions.

ADR0046 requires old result correlation never rebind CurrentLife. ADR0048 requires each bomb refund only its own stock/credit once, never attributed to a wrong new Life. Neither implies permanently losing Participant capacity when a genuine old-owned Fuse retires; the existing producer/CanSettle and existing actual-respawn test distinguish fresh reconciliation from stale result retargeting. This investigation therefore identifies an expectation/isolation conflict, not an authorized production patch.

Both original equalities at current lines243/246 remain unchanged in the private draft. No actual P2 repair, inventory suppression, capture-after-melt trick, or manufactured debit was added. A possible assertion-preserving fixture is a genuinely capacity-saturated successor with an additional actually placed old-life dry remote remaining live after the bridge remote melts; then correct ownership reconciliation stays0. It requires actual supported capacity pickup, actual Place/Native initialization, proven death carry/capacity loss and dry occupancy through every assertion. Current default random death carry is not a guaranteed capacity-loss fixture. This alternative is only a proposed fixture design, not implemented or tested, and does not alone prove that no transient stale effect occurred. For provenance-focused coverage, an additive assertion on fresh current-life10109 versus retained old full identity is more direct, but changing this case's quantity expectation requires a separate scope decision; this agent did not change it.

## Handoff and limits

Root may publish the narrow fresh-order delta and rebuild/rerun the same twelve-case class, preserving candidate01 and the new12 initial-precondition failure. The two restore failures must be reevaluated after they actually deliver the retained Original. New12 must reach a normal initialized Native HFSM before diagnosing long-withheld Fuse expiry. OldRemote must be explicitly classified as the current test isolation conflict until an actual contract-compliant fixture/provenance decision is made. No production fix is justified by its available-count equality alone.

Private writes have stopped. The only executed validation here is low-memory evidence/hash/delta verification (raw0); it is not a C# compile or Native acceptance. Ice production candidate, published source and original assertions remain untouched by this agent in this task.

## Authorized private revision02: preserve the quantity assertions with real occupied stock

After the preceding investigation, Root explicitly authorized both narrow private deltas: fresh checkpoint restoration order and a real second dry old-life Remote, including a single-case supported `death-drop-1000` authoring value. This addendum supersedes only the preceding “not implemented” status of the proposed fixture; the original candidate01 failure evidence and findings are retained.

Revision02 directory is `.run/ice-bridge-fixture-investigation-02/`. Physical before SHA remains `7c62a3bb0abba8b59890640701e2f6b2d8320b3a281ecc7c279bdc2181976e99`. Complete private draft SHA is `93f2069ff42f47366f0710fa179aeaa1a4cf75f85d9eeedf904c28bf5c24a361`; manifest SHA `0b55a39469769b1929c1a3c7de77b6df3649249fc88d2bd636885955fb61418a`. Static cases remain exactly12. The low-memory verifier preserved all182 original assertion lines, in order, and adds30 assertion lines. Root's separate new12 normal Tick remains unchanged. Compiled source writes are zero.

Only the old-Life test calls `new Fixture(dropAllCapacity: true)`. The optional fixture API otherwise retains the exact original Remote-enabled authoring; the eleven other cases keep default death-drop500. That one case adds only `drops.default.death_drop_permille=1000` through the existing `AuthoredFixture.Compile()` official authoring path. The preexisting supported `death-drop-1000/server/drops.json` confirms the exact valid row/value. No M2 admission, enabled ice flag, budgets, maxima, seed, rule, or generated table was edited. Actual official compile/export occurs only when Root executes the test.

Its actual capacity input is a fixture-created Capacity item using the existing `BomberGrowthHealthTests.Item`; inventory/health outcomes are obtained by real `PickupAbility.Activate` and three normal controlled Ticks, with item consumption, pickup admission, real capacity2 and Available2 asserted. Two original-life Remote bombs then use the existing real `Place` helper: one at13,13 moved to the actual bridge, and one remaining at dry15,13. An extra normal Tick initializes both actual Native bomb paths. Old Life is positioned13,11 before the original three real hit loops (900–902), avoiding a two-cell death-blast ray through dry15,13. If the old Life genuinely remains live, a fourth real hit903 and three normal Ticks are permitted; no health, clock, or phase is manually changed. The original actual-death, successor landing/restore and old remote full-source assertions are retained.

After actual death the successor is required to have capacity1 and Available0. The dry control requires its full Entity/SourceLife/Generation/Owner identity, original PlacedAtTick/FuseEndTick, Remote code7, non-Frenzy/unreturned stock, live Fuse with future unchanged deadline, exact15.5/1.5/13.5 geometry, actual Native ground neither Water nor Ice, and no extinguishment event. The same complete control is checked before death, before melt delivery, after Native Water but before Original, after Original, and after duplicate delivery. The original bridge remote's retirement and unique journal full identity checks remain unchanged. Participant owner inventory is additionally required to remain zero after Original and duplicate because the genuine dry Fuse still occupies its sole capacity.

This makes both original `Equal(before)` assertions applicable without changing production reconciliation or treating a released Participant occupancy slot as a stale receipt write. It retains actual baseline debit, actual melt identity, all preexisting assertions and duplicate checks. It does not replace the existing separate InventoryContinuity six cases that prove legitimate0→1 behavior when the last old Fuse exits. It also does not by itself instrument transient effect provenance; that limitation remains explicit.

Private verification exited0 and source before/after re-read remained exact. Build/Native execution has not occurred for revision02, so capacity pickup, actual death carry, dry Fuse retention and all twelve resulting outcomes remain runtime verification requirements. Root's later long-withheld/Photo results were reported in messages and are not independently closed by this addendum. STOP applies to all private and compiled source writes after this handoff.
