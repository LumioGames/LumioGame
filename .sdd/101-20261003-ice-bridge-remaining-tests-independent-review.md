# IceBridge remaining 13 tests: independent source/spec review

Reviewer: `/root/capacity_schema`, nonauthor of both new draft classes. Date: 2026-10-03.

## Verdict and execution boundary

At the initial source-review stage no blocking source/spec/fixture defect was found. The actual execution closure is recorded below: Late4 passed4/4 and qualified Paired9 passed9/9, with two fixture-stage corrections and no Ice production change. This is the reviewed13-case slice, not full IceBridge acceptance. The reviewer did not compile, run Native/tests, generate, format, alter production/config/declarations, or edit either author's private/physical test source.

Resource-formula drafts remain frozen. Public budgets, M2 admission, Native ReservedSlot, and the old Resource10 assertions are outside this review and unchanged by the reviewer.

Reviewed manifest: `.run/ice-bridge-remaining-native-test-draft-01/manifest.json`, SHA256 `e500a392b6a24ee57f0e35bf9c05a3277c1dfef01be49971a26d2e18e73d3c30`.

| Input | SHA256 | Cases |
|---|---|---:|
| `BomberIceBridgeLateDeliveryTests.cs.draft` | `8ffcd982a51a6eaf12ea004a418ad9b590ff3e7c2557c1fd3d4d89ed880c8785` | 4: two Facts, one two-row Theory |
| `BomberIceBridgePairedRecoveryTests.cs.draft` | `77e65947bfdc1e439e1a282f3d540f8639b87e9c583b87c78effc324a7efe2a9` | 9: five/two/two-row Theories |
| Existing 12-case source/baseline | `93f2069ff42f47366f0710fa179aeaa1a4cf75f85d9eeedf904c28bf5c24a361` | Preserved |

During review Root published the two new physical classes. LateDelivery bytes still equal the reviewed draft. Physical PairedRecovery SHA256 is `78f613dbebf6fcc55bff605f889243f890aa230ff454bc3e037281cd0f53f605`; its only difference from the reviewed draft is `using VoxelPresence = Lumio.GameRuntime.Coordination.VoxelPresence;` at line16. The alias selects the Coordination enum already returned by the adapter; all bodies remain byte-identical. This mechanical delta is included in the source review, but successful binding/analyzer validation still belongs to Root's build.

## Spec correlation

ADR0048, “冰桥与狂暴”, and `docs/specs/bomber/design.md` §§5.1–5.3 require fixed eight-second bridge ownership from the accepted freeze, all Fuse occupants to extinguish only after accepted actual water/unbind, exact once-only ordinary stock/Frenzy credit settlement, no wrong-successor refund, no repeated-freeze extension, and persisted provenance across late delivery. `.sdd/101-20261003-regeneration-bridge-v14-plan.md`, Ice sequence items4–6, further requires Original-only activation, retained Unknown debt, full generation/source/cell correlation, and confirmed material/binding before retirement.

The new sources cover those late-delivery/recovery portions without changing the product's duration design. They add no table/DECL/guard changes. A supported fixture-only Remote enablement, and the old-life case's supported `death_drop_permille=1000`, are explicit and inherited from the already reviewed 93f helper.

## Four late-delivery cases

- LateDelivery lines29–132: Remote and actual Frenzy variants use real `PlaceBombAbility` admission/publication; the Frenzy variant also uses the existing actual pickup/Applied-health path. The original placed Tick, actual configured fuse, chain, full SourceLife/generation/Participant, and initialized Native HFSM identity are captured before withholding. Water is actually committed and its unbind/revision observed before delivery is withheld. Each normal Tick through `originalDue+2` asserts the original clocks, Fuse/Stationary state, no explosion/extinguishment/refund, exact pending transaction/debt, and actual Native water/binding. Delivery is an untouched saved Original, followed by duplicate delivery and one extinguishment occurrence. Remote stock returns once; Frenzy ordinary inventory does not change.
- Lines136–187: the source genuinely reaches its natural deadline and Danger at the adjacent dry cell; four Unstarted terrain continuations and the original explosion occurrence are checked. This verifies the ordinary pending-terrain gate's containment while a water occupant is held. As its own comment states, it does **not** prove execution of the separate `HoldsFuse` chain-admission branch. `BombSystem.Server.cs:348–352` contains that separate guard; a direct real-contact case remains a distinct coverage obligation.
- Lines189–312: the actual old-life Remote retains full old SourceLife/generation, original deadline/chain, and its one ordinary credit while a real landed successor exists. The sixteen normal spacing Ticks keep the second dry old-life Remote alive beyond delivery/duplicate. The old-life kill/transfer/landing/drop isolation, new capacity1 and stock0, dry Native ground/control identity, old Participant ownership, and original `Equal(before)` assertions remain. Only the original water occupant retires, with an occurrence attributed to its full old source; stock is not credited to the successor.

Mechanical assertion audit: all 42 original assertion-containing lines in `old-life-93f-original.cs.fragment` occur in their original order in the expanded body; the expanded body has52 such lines. The LateDelivery helper is an exact byte copy of the original helper, SHA256 `9ff2045ae034582e5b62d1c726431f1a4cbaf40895b17aa418b579f5a9a9982b`.

These cases deliberately retain the existing geometry fixture boundary: a bomb is genuinely placed on dry ground and its live `LogicTransform` is then positioned on the actual bridge. They do not claim to test public placement on ice, real kicking/sliding into water, or public acquisition of the Remote special slot. Initial fixture lives use the pre-existing controlled scene qualification; only the successor case proves actual later successor landing. None of these boundaries are disguised as end-to-end Platform/Host admission.

The Frenzy assertion on `FrenzyBombPromises.Count==0` alone is not a maximum-six saturation proof. Here the live full-ID Fuse hold and later retirement prove the tested primary's membership/removal, matching the real helper's live-Fuse census (`BomberFrenzy.Server.cs:217–225`). Six-way pressure and other-owner interleaving remain separate requirements.

## Nine official paired recovery cases

### Five real owner cuts

PairedRecovery lines35–113 cover Birth/FrozenPending/Active/WaterPending/Retiring (1..5) through the actual producer and normal ticks. For Retiring, full bridge ID/token/generation are captured at lines40–42 **before** the Tick that destroys the row; later checks use the captured ID/owner JSON, not a detached component read.

The cuts use `WorldPersistenceSubsystem.Capture()`, save the actual Runtime-with-receipts packet and Native snapshot, and restore with public `Engine.CreateWorld` using both immutable byte arrays. `WorldRestoreCompletion.PairedCheckpoint`, instance/Tick, complete owner JSON/source tuple, actual material/binding, pending clearing, exact bridge generation/token, fixed original Applied+8000 deadline, and no second birth/token are asserted. Phase2/4 source queues must contain actual results; the other cuts must be empty.

The Paired helper is the same 93f helper after exactly three declared fixture changes: expose the actual authored export path; accept `persistence` and `receiptLimit`; pass those arguments to the existing real Scene. Normalizing only those changes reconstructs the original helper byte-for-byte. No shared old helper was edited.

### Two real history-Unknown cuts

Lines118–171 configure Native history retention1, save the original real commit result, and execute an unrelated real SDK `PrepareWriteV2`/`CommitV3` via `Scene.Write`. This evicts the original completed entry before lookup. Ice transactions use the real `bomber-terrain:` namespace (`BomberTerrainTransactions.Server.cs:348`), so `HostVoxelWorldAdapter.QueryTransaction` does **not** take the special logical-dig empty-queue branch: it calls the actual Native query (`HostVoxelWorldAdapter.cs:310–321`, `VoxelFacadeNativeAbi.cs:466–477`). Unknown is explicitly checked both before capture and after official paired restore; empty delivery queues are asserted separately.

The retained Original is captured before eviction. Four actual restored Ticks must preserve the exact owner/debt/header/live bridge. Fresh actual Original delivery then either activates the freeze or completes water retirement; its duplicate cannot recreate pending debt or repeat retirement.

The Native completed ledger is bounded in-process history and is deliberately not captured/restored (`receipt_ledger.rs:1–5`, terminal overflow at513ff). Therefore post-restore Unknown alone would not prove eviction. The **pre-capture** real Native Unknown assertion after the independent commit is essential and is present. The test retains this distinction correctly.

### Two real revision-abort cuts

Lines176–236 enqueue an earlier independent real adapter write in the same section before the actual freeze/water mutation. The normal Tick consumes the section revision in real commit order. The pending bridge transaction's actual returned row must be Aborted, non-Original; ground and binding are checked against the uncommitted outcome before paired capture.

Official restoration must retain that actual Abort delivery. Consumption removes the rejected transaction. Freeze abort retires only its unpublished/unbound bridge; water abort retains exact generation/token/deadline and permits a genuine later latched-expiry retry. No fake receipt, no protection/phase/revision mutation, and no relaxed old assertion is involved. This remains a candidate until actual Native execution reaches those assertions.

## Critical public API checks

1. Fresh target ordering is correct in copied `BindCandidate` (LateDelivery463–464; PairedRecovery473–474) and `DeliverStoredOriginal` (PairedRecovery281–282). Official `RestoreResultCheckpoint` rejects `_frozen`/prior-results/active-txn targets at `HostVoxelWorldAdapter.Checkpoint.cs:24–27`; setting policy freezes mutation configuration. Every repeated delivery creates a new adapter, restores original bytes first, then sets policy/binds. No restoration into a previously frozen adapter.
2. Actual receipt queue selection is correct. Official `WorldPersistenceSubsystem.Initialize` stores a port with the **boot** adapter (`WorldPersistenceSubsystem.cs:19–22,29–37`); temporary gameplay rebinds do not replace it. The history-Unknown cases therefore call the public `DualCutCheckpoint.Capture(scene.Manager,new ActualCapturePort(scene,held))` at PairedRecovery135. That port forwards Native Capture and the **currently bound** adapter's `CaptureResultCheckpoint` (lines305–308). It does not fabricate outcomes/receipt bytes or rewrite captured payloads. The other seven paired cases do not temporarily rebind before capture, so the ordinary persistent service is appropriate.
3. `DualCutCheckpoint.Capture` actually captures Runtime and Native, then officially wraps the copied results at the same owner barrier (`DualCutCheckpoint.cs:51–72`). `RestoreOfficial` passes both arrays; SaveCut writes their exact bytes and checks returned SHA256 values. Source-only Runtime captures are not mislabeled as paired restore.
4. Restored candidate delivery is bounded by `using` binding and a `finally` that restores the original actual tick adapter (lines277–287). Scene bindings likewise restore the existing actual callbacks on Dispose. Public Native resources own the world; the tests do not replace or forge Native state.
5. Original helper validates success Status0, Applied, Original, TokenConsumed, nonempty original receipt bytes, exact pending section, and revision advancement (PairedRecovery385–399). This is materially stronger than a historical query alone. Checkpoint APIs copy retained original bytes and validate the complete public result envelope before accepting it.

No claim is made that the source-count comparison at PairedRecovery69 alone proves every receipt field. Actual Original helper checks, official packet validation, retained complete owner/source tuple, and the subsequent genuine transition all contribute; Root's saved packets permit further byte-level correlation after the run.

## Evidence and next gates

Independent lightweight audit: `.run/ice-bridge-remaining-independent-review-01/verify.mjs`, SHA256 `7a032796ec0ec38bc5db31c79813b806eb66cb63bd03222a21986211472d7be2`; output `verification.json`, SHA256 `994532b65c3939ee9eed818c8e959998c2c78cbfe7adffc9f6ee8c12a049a63e`. It verifies all eight declared private inputs, all eight old physical-source fences, exact 4+9 case counts, original assertion order, copied helper boundaries, restore ordering/current adapter port, and hashes seven actual official07 API/source files. Node checks are mechanical evidence, not C# or business pass evidence.

The prior independent Case12/93f/NativePhoto3 review is `.sdd/101-20261003-ice-bridge-test-delta-independent-review.md`, SHA256 `bfae7de17fcd367113736c9c9b38bc1b2c4de6410686eff37c7b8ed1a479166a`. Prior actual12/12 and Photo3/3 refer to their existing sources/DLLs; neither is credited to these new13 drafts. Root's fresh official build must first establish compiler/analyzer validity, then preserve actual raw outcomes, Native+Runtime packet hashes, DLL/package identities, zero skips, and full source drift evidence per class. Any precondition/compile failure remains such; it is not a product RED or permission to relax assertions.

These 13 cases do not cover all same-Tick competing melts, every multi-bridge interleaving, maximum-row pressure, unknown unpublished create checkpoint behavior, old-generation replacement rejection, direct held-Fuse chain contact, all next-round cleanup cuts, formal M2 producer admission, browser/Platform integration, or all-source whole-world budget acceptance. Those remain Root's separate gates. No new production change is justified solely by this source review.

## Actual execution closure and retained first failures

Evidence root: `games/101-bomber/.run/v14-fullpack07-native-20261003/`. All execution was Root's official07 runner; the reviewer only decoded/hash-verified the saved raw evidence. Build33 `build33-ice13-fire4-tests` and build34 `build34-ice-paired-cut-qualification` both have raw0, zero warnings/errors and `sourceChanges=[]`.

| Run | Actual outcome | Exact reviewed source/stage |
|---|---|---|
| `ice-late-delivery-first-01` | 4/4 pass, 0failed/0skip, raw0, 10s728ms | Original LateDelivery `8ffcd982…` reached long Remote/Frenzy/pending gate/old-life assertions |
| `ice-paired-recovery-first-02` | 9 total, 7pass/2failed/0skip, raw2, 14s841ms | Paired `78f613db…`; all five official cuts plus both actual history-Unknown cuts passed |
| `ice-paired-recovery-qualified-03` | 9/9 pass, 0failed/0skip, raw0, 14s584ms | Paired `6016a7009a88a4731042c921d5077c969b1944b3f8abf6ea5a229fe334951e15`; both true Native Abort cuts now reached and passed |

`ice-paired-recovery-first-01.log` is the separate first Windows PowerShell stderr/Stop launcher interruption, with no complete result JSON. It is retained and is not counted as a nine-case business RED. The actual first02 raw2/JSON/log/exit are retained unchanged.

First02 phase2 failed at Tick5 / Ice.End224 / test195 on `Voxel binding policy cannot change with pending mutations`, before it obtained the desired Native Abort cut. Official `TrySetBindingPolicy` forbids policy replacement when `_txns.Count!=0`. The earlier independent staged transaction is genuine/legal SDK input; the source's first ice-policy installation and that already-staged transaction are incompatible. For the claimed revision-abort experiment this is a missing initial policy qualification, not proof that Native rolled back incorrectly. It also exposes a separately bounded producer-composition behavior: first-ever policy installation with an externally staged mutation still throws in unmodified Ice3e7. The qualified test does **not** fix or cover that composition. Do not reclassify its GREEN as a production policy fix.

First02 phase4 reached the actual Native Abort, official paired Restore, and exact retained deadline/token/generation assertions. It then completed the genuine later retry and destroyed the entity, but test234 immediately expected no Retiring record. `Ice.Begin:94–99` removes a submitted Retiring owner only when it observes the bridge already nonlive on the **next** ordinary Tick. The loop stopped at the Tick whose structural flush destroyed the entity; cleanup was not yet observed. This is a fixture observation-cut error, not a failed refund or incorrect Native water acceptance.

Root qualification is exactly two additions to first02 preimage `78f613db…` (preserved at `.run/ice-bridge-remaining-native-test-draft-01/BomberIceBridgePairedRecoveryTests.cs.first02-before`):

1. Before the independent staged transaction, if ice's policy is absent, install its true `BlockType1031 → Registry.WireName(BomberIceBridgeEntity)` policy via the public adapter. Runtime supplies actual live candidates; there is no authored entity list, fake binding, Native phase or revision.
2. After the phase4 loop and existing `Assert.False(World.IsLive(id))`, perform one ordinary Tick to observe already-flushed Retiring cleanup, then retain the original empty-promise/water assertions.

The independent audit compares all **136** assertion-containing lines: exact equality and order before/after. No old source assertion, Native state/result, token/deadline, tick loop, or production body is relaxed. Source Ice `3e7a8f8ecf7b6952c630dab715b296f884d12185ed29091ed615b39ad4be25b8` is the same in both actual runners and current reviewed source.

Actual assembly identities from the raw runner records:

- Game DLL both builds/runs: `378e8e61e89436fbc3e54de20ca0c6f83da636dd7ae20cb17cd23e3368069556`.
- Original Tests DLL: `794334659c7d17edf63d58b43b3118e321f9ee3868729fab2ff3cec095d7a23e`.
- Qualified Tests DLL: `27792aa6791bf37281c585e1b7c11f9ed028e0c8f495031e8ce8f246540ebafe`.
- Ecs `aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`; Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`.
- Native `c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`; build-info `f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`.
- Complete07 manifest `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`.

The Game/SDK/Native identities are unchanged while only Tests differs. Later Root builds have overwritten the live artifact paths; the audit records those current hashes separately and does not claim those files still equal either historical DLL. Raw runner identity evidence is retained, not silently replaced by the newest files.

`verify-actual.mjs` and `actual-qualified-proof.json` in the independent review evidence directory verify JSON/log/exit hashes, zero source drift, all eight actual first02 and all nine qualified paired Runtime+Native files against the logged SHA256, compiler/test stages and the full assertion preservation. Qualified proof SHA256: `debbf7592b2d101a4ecd94092e8355842b02e2de9112d19f45879868bb6c5827`. UTF-8 BOM JSON and UTF-16LE raw logs are decoded for reading without altering their bytes. The audit's first BOM/encoding precondition failures are not product failures. The initial source-only report is preserved as `review-source-only.before.md` (original SHA256 `1f8dc8c6a6848ca446f8019756b31ffaff0fdfe1aa87b31bd6049436d311700e`).

Root's broader179-case current regression is context only. This report's nonauthor verdict covers Ice13 and the two qualification changes, not the reviewer's authored Continuation11 or Resource formula/tests and not all semantics of the other regression classes.
