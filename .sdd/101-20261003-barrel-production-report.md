# M2 real initial barrels and persistent bomb promises — v13 freeze

2026-10-03. Scope: actual initial barrel producer and destruction-to-bomb obligation, plus ordinary round cleanup. This is a Game subsystem result, not full M2 delivery or formal release approval.

## Result and exact freeze

Final private complete06 build `barrel-green-build-08`: exit0, 0 warnings/errors. One final execution `barrel-final-matrix-01`: 97 passed, 0 failed/skipped (Barrel27 + TerrainProduction31 + TerrainCorrective28 + RoundRollover4 + Layout7). Official catalog12 passed, 0 failed/skipped; generated catalog check exit0.

Freeze: `games/101-bomber/.run/resume-capacity-20261003/barrel-freeze-01/manifest.json`, SHA256 **304281bfc4c25eb530f3385442f9e68e4219c97e6fe779b2e3310192cd2eb867**. The manifest hashes 370 snapshots: scoped source files, officially generated v13 files, config readers/exports, consumed binaries, original RED/failed fixture logs and final proof. Whole-file snapshots contain earlier shared work; they are not an authorship claim over every line. No commit, reset, cleanup or broad staging was performed.

| Identity | SHA256 |
| --- | --- |
| Final barrel test source | b810f45264ae286fe8737bc65cbecb01b74552741f351954b98252cdea43b519 |
| Final promise helper source | 347150bfbb01e035f72240f6a224fc1813c713e3cdcf4f1d896731c1cd04975e |
| Final Game DLL | b61b7aef8cbafc04b7fdb04dbed96cd74f5ccbe42d4c0ccfcea0206b56c45ce1 |
| Final tests DLL | 05161e26e1839bf188b6b32845b39bc9a69e256c956d5a18badb648e661d0bf9 |
| Consumed ECS DLL | 74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def |
| Consumed GAS DLL | 09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc |
| Consumed Coordination DLL | f91410e97148fa45dbc4710bc4c2e7b3996beea38844c2536eed948289d51a54 |
| Final matrix log | 8fa08e24bc5e2e61a3c1e9be4905ed6a69fa410ea06a318a64c3380ac3cf604e |

Final matrix command and start/end times are in frozen `evidence/barrel-final-matrix-01.json`; final build input is in `evidence/barrel-green-build-08.json`. Test/production DLLs were copied before releasing the shared artifact window, so later capacity builds cannot replace this proof.

## Exact consumption and declarations

All builds used `games/101-bomber/.run/20261003-controlled-game/complete-release-06`, through private selection.props, NuGet/cache/locks/artifacts, single process compilation, shared compiler/node reuse disabled. No sibling source reference, generated output patch or package DLL replacement.

- SDK manifest SHA256: `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`.
- SDK nupkg SHA256: `0b1657ec29ec83c4281549ebf787fe0b9187b5d30780b6bc513151bf75dd9c3b`.
- Consumed Native SHA256: `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed` (copied binary also independently recorded in freeze).

Exact barrel additions submitted before capacity's one official two-side v13 generation:

1. `[EcsComponent] BomberBarrelState` with `[Persist] Sync<ulong> ResourceGeneration`.
2. `[Persist] Sync<ulong> InitialResourceMatch`.
3. `[Persist] Sync<int> InitialResourceCell`.
4. `[EntityType(Mode.CS)] [BlockEntity] [Has(typeof(BomberBarrelState))] BomberBarrelEntity`.
5. `[Persist] BomberWorldRuntime.Sync<string> BarrelBombPromises`, default empty.

All four fields use Scope.None/Authority.Server. No invented Engine string-length attribute. Helper Encode/Hydrate checks at most8 records and UTF8<=16384; the already coordinated bomb PromiseToken checks UTF8<=128. Internal Promise record and enum DestroyBarrel=8 are business encoding, not additional ECS declarations.

Capacity separately owns its five appended bomb fields, admissions, Split methods, scalar ordinal movement and schema audit. Official v13 generation completed on both sides (52 files/side including gen.hash); capacity reports active680, retired7743/pages33 and full schema152/152. This report does not independently replace that schema evidence.

## Production behavior

Initial phase1 allocates actual barrel BlockEntities with generation1, match and authored-cell provenance. Phase2 installs real Native1032 cells and exact bindings alongside soft/chest cells, batches<=128, preserves existing binding policy entries and validates all Native cell/binding identities before phase3. Native remains sole current-position authority; authored indices do not form a second cell store. 19-cell package proof confirms4 distinct barrels and all four correct real bindings. Static 23/27 plans retain8/8 barrels, mirroring and the existing65% destructible limit.

The official catalog appended permanent1032 `lumio.bomber.barrel`; author compiler minted row109012. Firecracker1030 retains its historical identity. Source patch, mint audit, disabled update and two-pass deterministic export logs are frozen. Barrel enabled remainsfalse while the formal M2 admission guard is closed. Root separately owns the barrel visual descriptor and client projection; catalog validation checks the descriptor/textures exist.

Explosion contact verifies exact bound barrel identity/generation and reserves the entire inherited shape liability before Native submission: Split=5 (primary1+future4), other supported shapes0..7=1. Persistent row retains original transaction, complete barrel/source bomb/family/participant/source life/life generation, match, chain, shape and input coordinates. The transaction is persisted before stage; rejected stage or confirmed abort removes only the exact unaccepted promise. Staged/unknown results preserve it. Destruction stops the current ray and creates no reward/pierce continuation.

Only retained Original Applied with complete section/revision/token-consumption evidence accepts the promise. Exact source provenance and bound-entity retirement are checked first. Accepted promise is marked structural-submitted before CreateFromPromise; a missing publication does not trigger retries or release capacity. Actual bomb Awake/normal processing or hydrated matching publication transfers credits and removes exactly its row. Wrong produced identity/shape/life generation fails hydration without changing source bytes. Matching retained row does not double-count the already live bomb. Barrel bombs have power3, inherited shape0..7, original life/participant/chain, correct Pierce layer1 or Split future4, and CapacityReturned=true, so they do not refund player inventory.

Round Prepare waits for outstanding barrel promises, ordinary exact Native DigThrough retires actual chest/barrel bindings, ValidateClear checks the configured binding block, and StartNextGeneration refuses outstanding Native debt/promises/live barrels. Four round regressions and seeded Native second-generation placement pass.

## Real 100ms clock and late delivery

The outcome contract exposes no AppliedTick. This implementation uses Submitted only for the selected, manager-owned **HostVoxelWorldAdapter**, justified by its actual execution:

- Owning Runtime `modules/coordination/src/Lumio.GameRuntime.Coordination/Voxel/VoxelGameplayBinding.cs`: Resolve returns HostVoxelWorldAdapter, checks the exact authority-world ownership; documentation stages for normal frame-end commit.
- `HostVoxelWorldAdapter.cs` Stage stores the accepted transaction; CommitVoxel (line510) prepares and synchronously commits the pending plan in the same VoxelCommit phase; Original confirmation publishes exact bound retirement in that call (line406). It does not advance World.Tick.
- Owning `modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs` advances World.Tick at line468 after the pipeline. The test therefore reads persisted submitted Tick rather than returned post-frame World.Tick.

Actual Native test `ActualBarrelExplodesTwoTicksAfterNativeAppliedAndPreservesSourceShapeWithoutInventoryRefund` proves the retained checkpoint is Original Applied, the Native cell is air and binding/entity gone, submittedTick equals source.ExplodedAtTick, returned tick=submitted+1, inherited publication placed=submitted+1, and **actual Danger/ExplodedAtTick=submitted+2**. At20Hz this is100ms from application, not100ms from a delayed creation. Inventory remains1 and no loot appears. The all-shapes test also proves Remote7 actually explodes on its inherited due.

Withheld-original test uses a fresh owner-bound adapter which can query Native historical Applied but has Disposition.None and cannot settle. Eight actual ticks retain credit and produce no active barrel bomb. Restoring the saved Original on a fresh adapter publishes with the original fixed deadline already past; the next legal ProcessBombs immediately records its real current explosion tick. Re-delivery on another fresh adapter does not duplicate. This explicitly records delivery delay; it does not fabricate damage in an earlier tick. An arbitrary provider that may commit across ticks would require an upstream AppliedTick contract and cannot reuse this Submitted rule.

## RED → GREEN and failures retained

| Evidence label | Observed result |
| --- | --- |
| barrel-native-red-02 | real initial Native case expected4 barrel entities, actual0; separate unminted Native fixture failure not counted as trigger proof |
| barrel-trigger-native-red-02 | actual Native barrel contact expected retired binding/entity, remained live; real trigger RED |
| barrel-current-native-red-01 |7 cases: true initial4 pass, six trigger/memory validation failures; 0skip |
| barrel-remote-native-red-01 | **final barrel test source**27 cases:26pass, Remote7 fails promise validation |
| barrel-green-native-05 |same final barrel source27/27 after range correction; 0skip |
| barrel-final-matrix-01 |same final build08 DLL97/97; 0skip |
| barrel-catalog-green-02 |catalog12/12; 0skip |

Synchronous budget rejection, real Native revision Aborted, ordinary/full and Split4-vs5 capacity, all inherited shapes0..7, corrupted/oversize/count9 hydration, exact/wrong publication recovery, withheld Native Original, late fixed fuse and no inventory/loot are covered. `SubmittedUnknownCreationWithoutActualPublicationKeepsCreditAndDoesNotRetry` is explicitly a retained structural-outcome **fault injection** after real Native destruction and natural bomb retirement; it is not a reproduced Engine structural exception or proof of a full Host restart.

Original intermediate failures remain frozen: enabled-barrel guard correctly rejected unsupported formal config; early enum/fixture compilation errors; incorrect use of post-frame Tick; QueryTransaction historical fact does not provide Original; RestoreResultCheckpoint requires fresh target; a128byte adapter admission first rejected unrelated policy authoring; direct test deletion conflicted with real pending GAS facts. Round fixture had chosen a previously empty barrel origin and Native1017 correctly refused orphaning the new binding; it now chooses a cell without chest/barrel binding. Seeded-layout assertion changed old placeholder0 to real1032. No failed business assertion was discarded to obtain GREEN.

## Remaining scope and handoff

- Formal M2 guard stays closed and barrel enabledfalse. Actual23/27 Native boot is not yet proven because those formal configs still refuse incomplete producers; static counts are not substituted for that acceptance.
- Regeneration, ice bridges, supply and full M2 acceptance remain separate work. Frenzy v14 will append a default-false business Promise.Frenzy witness and validate/propagate the source self-immunity bit after the agreed generation freeze; v13 intentionally has no such declaration/encoding change.
- A fresh independent review is still needed for this subsystem. Parent integrates browser/visual/full presentation and full Game release proofs.
- Earlier HFSM intermittent Native status1 remains unresolved; it did not recur in this97-case run. A passing focused run does not close that historical issue.
- Heavy build/test window and source fence were explicitly released to Root/capacity after the binary freeze. Subsequent work here is reporting and v14 regeneration/bridge planning only until coordinated approval of the next source/generation window.
