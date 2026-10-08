# Per-bomb continuation geometry and source-power production review

2026-10-03, client_correlation_review, non-author of this eleven-case test class and Root's production fix. This review first traces the spec/producer, then reviews the exact geometry change. Scope is read-only source and actual evidence inspection, plus this report and private low-memory audit evidence. No production/test/generated/table/index changes, build, test, Native, GEN or commit was performed here.

## Current verdict and actual prior evidence

**Current two-domain Spec PASS / Quality PASS; original eleven cases plus149 related cases =160/160 scoped execution PASS, zero skips, no actionable finding in the reviewed deltas.** The staged geometry and literal6 defect investigation below is preserved. The closure addenda identify the second source change, actual11/11 run and fifteen exact related runs. Full Game solution, full UGC, tight per-bomb chest bound, all pending-row corruption, paired active-world resume, and Goal101 remain outside this closure.

The test class is `games/101-bomber/Server/Tests/Gameplay/BomberTerrainContinuationProofTests.cs`, SHA `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de`. It has one Fact plus two Theory methods/ten InlineData rows = eleven cases. Its pre-run independent test review is `.sdd/101-20261003-per-bomb-continuation-proof-independent-review.md` and was read in full.

Root's `build22-ice-fixture-and-continuation` is raw0. `terrain-continuation-proof-red-01` is actual eleven total, two succeeded, nine failed, zero skipped, raw2, duration8.851 seconds. The eight one-column accepted-frontier corruptions were all admitted by direct storage validation or official hydration (the latter failed because the expected owner exception was never thrown). They first completed the same real accepted Native frontier and positive original snapshot restore. Power8 completed actual public placement, actual first Native destruction, original receipt checks and Remaining7, then faulted on the next normal Tick in `BomberTerrainTransactions.Validate:645` through `Begin:58`. Power7/Remaining6 and the unchanged accepted-frontier restore are the two positive cases. This is business RED, unlike the earlier unrelated binding/HFSM fixture blockers.

Private audit `.run/per-bomb-continuation-production-independent-review-01/verification.json`, SHA `23c94006f7911080455384b9c9304e5dc5927c5a3fc6bec8e16ef2ac564b2a3c`, records complete historical JSON/log/exit and six assembly identities. Its actual low-memory audit exited0, matched the physical recorded log hashes and raw exit files, found zero changes across all375 start/end source entries, and matched build22/test's complete recorded DLL set. Original raw evidence was not changed. This static/evidence verification is not a replacement Native run.

## Causal contract from the real producer

The directions in `BomberBlastTerrain.Server.cs:14` are0=up(0,-1),1=right(1,0),2=down(0,1),3=left(-1,0). Let `(ox,oz)` be the source bomb's current explosion-origin cell from its real LogicTransform, P its persisted Power, and `(x,z)` the saved arm cursor. The minimum accepted-cursor geometry is:

| Direction | Required axis | Signed distance d |
|---|---|---|
|0|x=ox|oz-z|
|1|z=oz|x-ox|
|2|x=ox|z-oz|
|3|z=oz|ox-x|

For `Unstarted=false`, d must be positive and no greater than P. A mere Manhattan distance without direction/axis checks admits the wrong axis or opposite arm. Existing map bounds, direction range/uniqueness, nonnegative Remaining≤P, full local Source Participant/Life/generation, exact Family and Occurred must remain in force.

In the current actual producer, a positive PierceLayers always passes the per-step `remaining-step` to a destruction detail; there is no later consumption or decrement of PierceLayers. Thus every ordinary accepted Pierce cursor satisfies `d+Remaining=P`, including Remaining0 at the last reachable cell. A non-Pierce destruction passes Remaining0 even if it hit before the end of P. Therefore a universal equality is incorrect: **current ordinary accepted Pierce records require equality, while non-Pierce accepted records require Remaining0**. This distinction is by actual PierceLayers, not BombKind, preserving existing qualified fixture sources and all actual creation paths.

`Unstarted=true` is different: x=ox, z=oz and Remaining=P, with a legal direction. Trace records all four original arms when the complete terrain photo is unavailable. Initial frame competition also records the same original cursor. It is legal even when another arm already has a contact or accepted history; the current declarations do not store per-arm irreversible history allowing a stronger assertion. Power0 has a legitimate unavailable-read origin/Remaining0 shape and must not acquire a new blanket P>0 rule.

The existing retry fix at `BomberBlastTerrain.Server.cs:97–106` saves this Ray call's x/z/remaining. A first call from the origin is Unstarted=true; retry after an accepted frontier retains its cursor and Remaining and is Unstarted=false. Consequently the geometry relationship stays unchanged on retry. Resume first checks the saved accepted cell for a newly destructible replacement and stops rather than reattacking it; this behavior must remain intact. A new guard must not reset the cursor to the origin or allow another accepted prefix replay.

All production writes of bomb Power/PierceLayers found by repository search occur during bomb creation: Place, Barrel, Frenzy or Split child. None changes these fields during Danger/continuation processing. Kick Advance moves only Fuse bombs before their fuse deadline (`BomberBombKick.Server.cs:64–69`); Danger arms use the now-fixed real transform. Therefore the source is the actual bomb snapshot's P and explosion position, not the player's current attributes, a placement position from before a legitimate kick, or a config default/maximum. This does not prove immunity to coordinated corruption of all persisted witness fields; the eleven tests cover specific single-column mutations and exact ordinary production paths.

## Exact geometry candidate reviewed

Before `.run/per-bomb-continuation-geometry-fix-01/BomberBombState.Server.cs.before` SHA `cf1e28598ba270d816a3d1e89b60c799c3c683946f20116d933714549efa0ff1`; current after `Gameplay/Components/Bomber/BomberBombState.Server.cs` SHA `392b919fc6db7002b793be019681d0b46544ca8b56b2ffef0e7858a06ef8e59b`. Root's after.json and the physical source agree.

The only change is a sixteen-line `else` block after the existing Unstarted guard, current lines154–169. The audit removed that exact block and recovered every before byte. No existing rule, field, limit, Unstarted check, error path, declaration or negative assertion was weakened. The new block computes a signed long distance with same-axis switch conditions, rejects distance≤0 or greater than Power, then requires the current Pierce/ordinary Remaining rule. The cast happens before subtraction, avoiding int difference overflow; distance plus Remaining is safely evaluated as long. It uses no new terrain reads, source-current-Life authority assumption, side effect, or mutable bookkeeping.

The four actual negative shapes `(origin5,5,P4,cursor6,5,right,R3)` are rejected by specific causal failures: axis Z4 fails same-axis; directionleft3 yields negative distance; Remaining4 gives d+R5≠4; X10 gives d5>P4. Their legal positive cursor remains d1+R3=4. Ordinary non-Pierce accepted destruction before maximum distance remains allowed with Remaining0. Existing origin Unstarted and actual accepted retry paths remain valid.

No actionable defect was found in this exact geometry candidate. The expected narrower execution outcome may still have Power8 fail in a different unchanged source file; it must not be labelled eleven-case GREEN until actual results exist.

## Separate remaining≤6 finding and minimum source-bound replacement

**Current actionable defect:** `BomberTerrainTransactions.Server.cs:643` imposes a literal Remaining≤6 on ordinary destructive pending details. Real authored P8 creates exact Native Original with d1/Remaining7, then cannot consume it. The supported authoring schema does not impose a public BombPower maximum6, and the real reader/world already admitted actual P7 and P8. Enlarging that literal, silently clamping Remaining or adding a private maximum is not a causal fix.

The smallest source-bound replacement for the ordinary DestroySoft/terminal-chest branch should obtain and validate the exact pending SourceBomb **before** using its P:

1. The SourceBomb full ID must be a live BomberBombEntity. `HoldsSource:224–230` prevents retirement while it owns a pending row or continuation; Original settlement already requires this source live/type at lines141–143. Ordinary details should consistently reject its absence at Validate, including soft rows and already-Native-retired chest rows. Historical SourceLife may already be destroyed; do not require it live or equal to Participant.CurrentLife.
2. Compare the real source bomb's Owner, SourceLife, SourceLifeGeneration and ChainId with the pending columns; Family and ExplodedAtTick must equal detail Family/Occurred. Keep the original full local identity, match/submittedTick, cell/address/revision, rewards/reservation and unique `(SourceBomb,Direction)` checks.
3. Bound nonnegative Remaining by this source P; use the ordinary same-axis, positive signed-distance≤P and Pierce/ordinary relationship described above. This rejects a pending row whose absolute Remaining is “within P” but whose cursor plus Remaining exceeds its original ray. Use long/checked-safe arithmetic rather than int subtraction/addition. It must not derive authority or Power from the surviving new Life.
4. Preserve full Original-only receipt/null operation/null batch/priorTick/section/raw-byte/revision checks in Begin before publishing rewards, contact memory or continuations. Unknown/duplicate must neither consume nor rewrite the pending source. Batch validation must finish before accounting mutations.

Special producer kinds already branch to their own validation before the ordinary detail check: Initialize/Clear/CircleClear/SpawnClear, StrongChest construction, DestroyBarrel, Regenerate and Freeze/MeltBridge. Barrel intentionally creates its own zero-Remaining detail and does not use the ordinary accepted-continuation append. Do not apply an ordinary Pierce equality blindly across those specialized encodings. A terminal strong resource chest that reaches the ordinary DestroySoft branch, however, uses Ray's ordinary remaining calculation and should retain the ordinary causal checks along with its current chest provisional-contact validation.

The literal6 replacement has not yet been independently reviewed as code in this report. It needs Root's exact source diff, then actual P8 Original consumption and the existing regression groups. These two production defects are distinct and their RED/GREEN evidence must stay separately attributable.

## Limits and pending closure

Runtime-only positive/corrupted snapshot hydration is the tested restoration cut. It does not tick a paired Native restore or certify complete active-resume behavior. The fields currently witness geometry and full source, not arbitrary UGC power performance, a tight lifetime bound on distinct ChestId, all synchronized corruption/replay patterns, or full formal M2 admission. Test source and Root production source are disjoint from my own Ice fixture/producer work and were not authored by me.

Source writes remain prohibited for this agent. Await exact pending-source fix and actual build23/eleven-case geometry results before execution closure; preserve actual prior nine failures and their raw evidence.

## Final two-domain source and staged execution closure

Root supplied the second exact production diff and completed actual execution after the preceding first-stage review. Ordinary pending file before is `.run/per-bomb-pending-power-fix-01/BomberTerrainTransactions.Server.cs.before`, SHA `4d9d2767e2fa2250a345b25a76d429e0178edc4427bc3585f499bdc14afc05c5`; after is `fa49897dd9af6cabc27fca02ac991e6124347f1c915b667b6b540d675969c8c7`. Geometry source remains exactly `392b919fc6db7002b793be019681d0b46544ca8b56b2ffef0e7858a06ef8e59b`; test class remains exactly `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de`.

The second diff removes only the early `>6` test and inserts eleven lines after the existing exact-cell/nondefault-source guard (current lines673–683): require live BomberBombEntity SourceBomb and reject Remaining≥its Power or any mismatch of Owner, SourceLife, SourceLifeGeneration, ChainId, Family or ExplodedAtTick. The audit removes this exact block, restores the original literal6 expression, and recovers every before byte; all specialized producer branches and Original settlement guards remain intact. It does not move or drop reward/accounting validation.

The strict Remaining<P bound is correct for this ordinary pending producer: a destructive cell is reached only at step≥1, so a positive-Pierce pending row has Remaining=P-distance≤P−1; ordinary non-Pierce has Remaining0 with P≥1. A P0 bomb cannot produce such a destructive arm detail. Thus actual P8/Remaining7 is admitted without inventing a new author maximum or discarding causal provenance.

No introduced source-live invariant failure was found in the normal production paths: `HoldsSource` pins ordinary pending/continuation sources; ProcessBombs tests that hold before any deadline-based transition/retirement; round transition explicitly waits for pending voxel debt and continuations before global bomb cleanup. Water retirement/extinguishment operates on Fuse occupants, while ordinary destructive pending rows originate after explosion in Danger. Begin already required the same source live/type on successful settlement. The new guard enforces that existing ownership requirement earlier and for soft rows as well as live-chest rows. It deliberately does not demand a historical SourceLife remain live or equal CurrentLife. Source identity is read from existing fields and no extra Native read is introduced. This does not certify untested active section eviction of pending sources or every restoration cut; an input lacking its required live source must be rejected rather than receive an invented source Power.

This second patch does not add ordinary **pending** axis/distance/Pierce equality guards. Those guards exist on the settled component continuation; a standalone pending-column corruption matrix was not part of this actual RED. The broader minimal causal recommendation earlier remains a future boundary to prove, not a claim that this narrowly reviewed fix now rejects all malformed pending rays. The literal6 fix itself introduces no actionable finding; neither the code nor this review declares that wider matrix passed.

| Exact stage | Actual result | Raw child / source drift |
|---|---|---|
|build23-continuation-geometry|successful fresh build|0 / zero across375 sources|
|terrain-continuation-geometry-green-01|11 total,10 pass,1 fail(Power8),0 skip,8.711s|2 / zero|
|build24-pending-source-power|successful fresh build,0 warnings/0 errors|0 / zero across375 sources|
|terrain-continuation-production-green-01|11 total,11 pass,0 fail,0 skip,8.384s|0 / zero|

Each build/run pair has the same recorded complete six-DLL identity. Geometry-only Gameplay DLL is `9d82055c8a01a2c72a1f86766dd1cfb3d541ca3d82735a121ce1f1a7db28b567`; final two-domain Gameplay DLL is `d380dcf0ffc76ea1397ccb069c3ce5142366220a224ee6d56ceb3b469b19b376`. Tests DLL stays `1a18d1b1e5ed779ff9ade7be356cb1385201e530f875928c80e9ad5c4a340a57`. The final three physical source hashes equal the final run start/end identities. At audit time, all six physical DLL/build-info files also matched that final run. The audit checks physical log hashes, raw exit and all375 start/end sources rather than treating the green label as success. All earlier actual9-failure and geometry-only1-failure artifacts remain preserved.

Closure proof `.run/per-bomb-continuation-production-independent-review-01/closure-verification.json` SHA `f10be19247ee3f04e3169475fc06da751b99bbfae8586c91f9013264fa6fc248`. Low-memory closure verification exited0 after correcting its own comparison to compare path/hash pairs regardless of JSON property order, and accepting mixed existing line endings in the exact added block before byte reconstruction; those audit-script corrections changed no tested or production source. Complete historical JSON/log/exit hashes and DLL identities are in that proof, which chains the preserved first-stage proof.

Current verdict closes only the two reviewed bugs and the original eleven-case actual test run: four single-column accepted geometry corruptions through both direct storage and official Runtime-only hydration, real legal accepted frontier round-trip, and actual public P7/P8 Pierce Native Originals. Relevant terrain/frontier/continuity regression groups are not yet independently closed by this report. No assertion, fixture, source-power rule, successful receipt, Native terrain, generated output or official pack was fabricated or edited by this reviewer.

## Related execution audit: final current160 scoped cases

Subsequently supplied actual `continuation-regression-batch-01.json` contains fifteen completed serial filtered runs. The reviewer read each real raw log summary and verified its JSON and physical log/exit hashes, filter-class identity, actual count against the batch's expected minimum, source start/end maps and all six recorded DLLs. Every run uses the same complete375-source snapshot and six-DLL set as final build24/eleven-case run, not an earlier green label. All are raw0, all have no failed cases and zero skipped cases.

| Actual class | Exact label suffix after `terrain-continuation-` | Passed |
|---|---|---|
|BomberTerrainProductionTests|terrain-regression-01|31|
|BomberTerrainCorrectiveTests|corrective-regression-01|28|
|BomberMultiArmTerrainTests|multiarm-regression-01|2|
|BomberTerrainNativeBoundsTests|bounds-regression-01|6|
|BomberSplitBombProductionTests|split-regression-01|11|
|BomberSplitPromiseLifecycleWitnessTests|split-lifecycle-regression-01|4|
|BomberRegenerationProductionTests|regeneration-regression-01|6|
|BomberFireBombProductionTests|fire-regression-01|2|
|BomberTerrainFrontierRetryTests|frontier-regression-01|2|
|BomberInventoryContinuityTests|inventory-regression-01|6|
|BomberRoundRolloverTests|round-regression-01|4|
|RemoteBombProductionTests|remote-regression-01|13|
|FlyKickAuthorityTests|kick-regression-01|19|
|BomberIceBridgeProductionTests|ice-regression-01|12|
|BomberIceBridgeNativePhotoTests|ice-photo-regression-01|3|

These sum to149 actual related passes. Combined with the unchanged original eleven-case final run, the current scoped result is160/160, zero skips, all child exits0. Source and all six DLL identities are independently matched per run; they are not counted repeatedly as separate whole-Game acceptance. For the Ice-related class whose fixture/producer work this reviewer previously contributed to, this section audits executed evidence/count identity only and makes no independent review claim about my own Ice implementation.

Batch SHA `44fdc55b82a4d84bd8956d16f94e79a1c15d8a8c393fe9bbb26a0862c4bb6ebd`; private `.run/per-bomb-continuation-production-independent-review-01/regression-verification.json` SHA `9e420acee53abc0439fefe9a501b7458dc9e21b587b24f5aba1d76c1159eebb7`. The actual lightweight verifier exited0. Every individual raw log/JSON/exit identity and class filter is preserved in that proof, chained to the two-stage closure proof.

The two reviewed production domains are closed for this scoped source/Native matrix. Broader limitations above remain explicit. No heavy action or source modification was made by the reviewer; report/private evidence writes are now STOP.
