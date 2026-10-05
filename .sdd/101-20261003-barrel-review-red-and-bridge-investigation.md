# Prepared review REDs and supported bridge mutation investigation

2026-10-03. No Game build, generation or production/source-table/schema edit after v13 freeze. Client/Runtime own the heavy window. Root approved the v14 private declaration list and capacity received all10 persisted fields plus bridge BlockEntity; this note does not claim they are already generated.

## Barrel independent-review follow-up

New test-only `games/101-bomber/Server/Tests/Gameplay/BomberBarrelPromiseReviewTests.cs`, SHA256 `e7bba071cffab34c186a6bc3f6418be5851f2f67ea65144aa2b9d28ce8029544`.

Four prepared cases, **not compiled/executed yet**, awaiting Root's batch RED window:

1. True Native-produced publication, retain its exact promise, change current transform from birth center6.5/1.5/5.5 to7.5/1.5/5.5; paired hydration must refuse first-publication credit transfer.
2. Actual inherited Pierce publication, retain exact promise, change PierceLayers1→2; ordinary storage remains structurally valid, but promise transfer must refuse.
3. Actual inherited Split publication, retain exact promise, change submitted/resolved masks0→1 and future4→3. This satisfies generic `4-popcount(resolved)` storage, but a still-untransferred original birth must not already be a resolved mother.
4. Actual older Native-produced row paired with next MatchId and participant MatchIds. Production Encode must refuse oldMatch; raw corrupted row hydration must refuse and leave source snapshot unchanged. Normal Round Prepare/StartNextGeneration forbids all such outstanding debt.

Production helper remains v13 SHA256 `347150bfbb01e035f72240f6a224fc1813c713e3cdcf4f1d896731c1cd04975e`. The narrower checks are **not implemented before observing these REDs**. v13's97/97 snapshot remains historical focused GREEN and awaits closure of these review findings.

Owning SDK evidence: World.Attach marks the entity live before AppearBatch.Awake, which runs inside EcsCommandBufferCommit. Barrel Awake consumes the exact row then; ordinary later movement/kick sees no retained row. ProcessBombs also observes first, then Kick.Advance. The future fix should validate only unsettled first publication/recovery, not continually compare every living bomb's moved position to its old birth input. Actual supported100ms normal publication has its fixed deadline one ordinary frame later; the existing kick target gate refuses expired Fuse bombs.

## Actual source-authoring RED

New `games/101-bomber/Tools/m2-regeneration-source.test.mjs`, SHA256 `aaf4776d0c42926152dfeb3fe0429c22a958b949d298cfa08ab0612f14a47c59`.

Executed with Node against the real checked-in source/schema and effective named overlay rows, no config writer. Evidence `.run/resume-capacity-20261003/m2-regeneration-source-red-01.log` SHA256 `a241cba7956deab40cc6d8858fa7746f9e20fac1a07c5ac886fe404d2bf8198f`; process exit1; **7 total,1pass,6fail,0skip**. Current deficiencies:

- author schema/source does not expose barrel_roll_denominator32 and chest_roll_denominator6;
- all three effective M2 profiles inherit stop_before_final_ms60000 rather than20000;
-23 and27 inherit max_mirror_orbits2 rather than3/4;19 correctly remains2.

First8s/interval8s/target600 are already correct. This is an explicit source-authoring test, not a compiled profile/admission or Native gameplay proof. Root is the sole config/schema/table author and can choose base or overlay correction; effective profile expectations remain the same.

## Ice bridge return-to-water path

Read-only investigation of exact public freeze0e `engine/wire/voxel-runtime-results-v1.json` (entrypoints and bindingMutations), owning Runtime HostVoxelWorldAdapter and actual Native integration tests:

- TryStageMutation accepts block writes plus explicit binding ops through the ordinary bounded channel; both carry the caller's exact expected section revision. Native uses the same atomic batch. A clear op can be `new VoxelBindingOp(section,offset,null)` together with a replacement unbound block write.
- DigThrough exclusively means air+binding-clear+automatic exact ECS destroy. The public contract explicitly disallows overriding a dig with a nonair write; it cannot be repurposed as a water rewrite.
- Binding-only/block+binding mutation does not produce DigApplied or automatic ECS destruction. Host adapter builds `destroyIds` only from batch.Digs. An explicit clear alone cannot make an existing block remain binding-required: actual `BindingOnlyUsesTheAtomicNativeBatch` proves Native1016 until policy is optional. Correct water replacement changes the cell to a type whose binding policy is none, in the same mutation.
- Actual owning test `ConflictingBlockAndBindingExpectationsRefuseBeforePublication` confirms a real combined block-clear/null-binding atomic batch succeeds only with the same exact revision; stale/conflicting versions abort. `RealCombinedSetAndDigClearPublishEcsDestroyAndGameplayRewardExactlyOnce` proves automatic retirement belongs specifically to dig semantics.

Supported candidate route, inferred from those primary contracts/code and awaiting an exact ice→water Native fixture: **ordinary TryStageMutation writes actual1027 water and clears the actual1031 bridge binding atomically**; retain the exact bridge identity/generation as durable Game retirement debt. Only on confirmed retained Original Applied, verify current Native water/no binding, then use ordinary World.Commands.Destroy for that exact now-unbound entity. Keep the debt until actual structural retirement, never destroy an entity while Native still points to it, never release/replace unknown debt, and never synthesize water in a Game shadow or presentation. Extinguish every Fuse occupant once from that accepted actual water fact, not from stage or the intent to retire ECS.

This uses an existing atomic Native material+binding mutation plus a later ordinary, owned ECS retirement; it is **not** a claim of same-call atomic ECS retirement. Native/bridge output remains charged until both obligations settle. If the Game's invariant requires the automatic ECS destroy to be atomic in the same Native call for a nonair replacement, the present public API has no such dig entrypoint and that is an upstream contract gap. Do not pretend DigThrough returns water, temporarily publish fake water, remove policy globally, or bypass the bridge guard to conceal it. The exact supported candidate must receive a real Native regression before bridge implementation is accepted.

No Runtime/Engine source edits or extra builds/tests were performed in this investigation. Root decides this retirement discipline before actual bridge production. Parent can resume this agent later for preserved barrel RED→fix→re-freeze and regeneration implementation.
