# Old14 current CLR successor-credit analysis and lawful RED design

Status: grounded current-state defect candidate; no new build, fixture, production change, target collection, Game/Native query or service/UI operation.

## Current evidence

Root's single successful collection is `C:/Work/LumioGames/LumioGame/.run/live14-current-clr-root-collect-03/current-state-03.json`, actual run raw0 at 2026-10-04T07:48:31.8384521Z–07:48:32.3087886Z. The reader reports a 9.0229ms PSS capture and current World Tick266335. It is not a death13560 historical return-code trace.

| Fact | Actual current output |
| --- | --- |
| Participant | `0000000000000001000000000000000f`, live, Observer disconnected/gen61 |
| Current body | `000000000000000100000000000003a2`, live/LogicTransform present, Observer connected/gen64, admissionGeneration64 |
| Current route | target-body route present, exact-reference profile join5; opaque reference IDs are not string equality evidence |
| Committed body bounds | present, finite and ordered, min=max `(1.5,1.5,9.5)` |
| Retained reservation | world `e9cb441982554d1599c27bdd33707029`, slot3/allocation26, participant0f, consumed/orderAttached, cleanup/proofRetired false |
| Reservation history | original body383/gen59; retained controlled attachment3a2/gen62, creationLifeGeneration27; reservation Connected=false |
| Remaining credit | same token, request18/reattach, actual result.NewAttachment gen61,217047B |
| Credit flags | ResultDrained/GameConsumed/WelcomeDrained true; PublicationComplete/PublicationDrained/BaselineDrained/Abandoned false; BaselineClosedTick null |
| Aggregate | resultDebt1/publicationDebt217047B, operationFaulted=false, no Host parkedCut/pendingDrain |

The snapshot does not contain the complete generated association, credit result CommitFact/Kind, original account/room values or death-tick return code. It deliberately does not expose secrets. `successorPlanning=false` is an outside-ProcessorPlan snapshot fact. No claim is made that invoking Prepare outside that phase is valid.

## Source-grounded current refusal condition

Actual old14 Runtime is formal520ffe. In `C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.Successor.cs:181–195`, a consumed same-participant/current-controlled-life record is replaceable only when cleanup is absent and `HasSuccessorCredits(token)` is false. Current token3/allocation26 still has its exact reattach61 credit. Therefore, **if ordinary legal ProcessorPlan execution passes the earlier full association/binding/profile/epoch/bounds guards**, that record cannot enter the reusable branch; participant equality then yields `successor_reservation_invalid`. This is a conditional current-code conclusion, not an invented13560 error.

The amount is below the unchanged16MiB publication limit; this is a lifecycle retirement blocker, not evidence of exhausted total capacity.

## Exact missing transition candidate

1. Successful `ActivateDeferredSuccessors` in `WorldManager.Successor.cs:499–520` passes original attachment, restoration, generated association, Connected, epoch and activation-publication-budget validation. It then stops the participant Observer at `previous.ConnectionGeneration`, changes the current attachment from observing61 to controlled62, commits the actual adapter route, consumes the reservation and publishes the transfer result. It does **not** call the existing `CancelSuccessorPublication` for that exact previous61.
2. `WorldManager.Visibility.cs:118–128` excludes disconnected observers and discards their views. The old participant can no longer complete its61 census. `RecordSuccessorProjection` (`Successor.cs:681–689`) only records PublicationComplete and BaselineClosedTick when that exact observer/epoch census is complete; `Visibility.cs:345` supplies that fact.
3. Natural paging is already production behavior: `Visibility.cs:194–252` uses the unchanged configured world-change budget/2 and leaves CensusComplete false until every eligible entity create has been projected. An initial Welcome and first WorldChange do not assert full census completion.
4. `RecordSuccessorPublicationDrain` (`Successor.cs:692–709`) can mark old61 WelcomeDrained from its actual frame, but cannot mark BaselineDrained until BaselineClosedTick exists. `ReleaseDrainedSuccessorCredits` (`640–657`) keeps its217047B credit, even though its result was drained and its non-transfer GameConsumed flag is already true.
5. Later actual Disconnect (`Successor.cs:525–541`) and consumed-route reconciliation (`WorldManager.SuccessorProjection.cs:216–226`) call existing cancellation for the then-current62. `CancelSuccessorPublication` (`674–679`) intentionally matches only the result's exact attachment generation. It cannot retroactively cancel unrelated older61. Fresh controlled admission63/64 does not replace the immutable61 credit or fabricate its baseline.

That chain explains why the **current** orphan publication cannot finish and why it blocks the next lawful reservation reuse. The remaining question is an actual normal Native/Host reproduction of an unfinished census before a valid transfer, rather than assuming every transfer has this outcome.

## Host legality: no required full-census wait was found

Formal Server008861 source is `C:/Work/LumioGames/.101-pack07/LumioServer11PreparedReentry`.

- `Engine/src/owner.rs:5475–5598` independently validates a ready request and its real reservation history. A new reattach in the same committed drain is planned from the correlated observing transition and its actual pending signed socket, without early Session promotion. It enqueues the original typed transfer control for the next ordinary Runtime tick. There is no census-complete or predecessor-publication-fence predicate in this path.
- `Engine/src/successor.rs:640–679` preserves actual token/incarnation/participant/original old ID+epoch/current observing attachment/current eligibility/restoration/account/room/request guards. The protocol's readiness gates actual restoration and policy, not completion of the observing baseline's future pages.
- `Engine/src/owner.rs:5608–5638` can hold on a parked Runtime delivery or failed correlation. It does not wait for every future old census page before the next Runtime tick.
- `owner.rs:6205–6248,6256–6292` appends a real writer fence for the current routed publication group and settles the corresponding Host-side records only when Written. This is the actual group, not a promise that a future full census has completed.
- HostEntry's destructive ordinary drain preserves a batch until encoding (`HostEntry.cs:2207–2244`). Its separate frozen controlled admission ACK/Reconcile (`HostEntry.Admission.cs:271–304`) owns that exact Native initial plan/cursor. Neither can be borrowed as an ACK for an older61 Runtime successor credit.

Schema independently read these paths and found no opposite full-census gate. This is static legality evidence; actual Rust signed socket order and writer-fence completion must still be recorded in the RED.

## One proposed natural-paging regression

Use formal Runtime520ffe and Server008861, original official14 Native/SDK/HostEntry identity. Do not use OfflineDeath7 or its pending public DRAFT. Keep default `CreatesPerPack=0`, existing65536 configured projection budget,16MiB publication allowance, original caller policies and full typed control guards.

Use existing legal room payload declarations (`modules/gas/tests/fixtures/successor/AdmissionCensusEntity.cs` and `AdmissionCensusPayload.cs`, 1024-byte Room field) to make the original default census require multiple pages; this declaration is already used by the normal Native publication-growth tests. The chosen amount must be measured from real encoded pages and remain under all original Native/publication/Host limits; no reduced quota or magic branch is used to force a refusal.

Flow:

1. Original C1 controlled admission publishes its real Native frozen frames; all original cursor ACK, writer fence and settlement must complete. Apply the actual lethal GAS effect, Prepare/Destroy and the observing transition normally.
2. Create the actual dormant successor and apply the approved real restoration, recording the actual witness. Keep Ready under the existing fixture phase control until C2 is selected. Close the actual C1 WebSocket with1001; use its genuine disconnect and original retained observation history.
3. Fresh signed C2 admission reattaches the actual observing participant. Record its actual authorization/Welcome and first correctly delivered/ACKed world-change page. Demonstrate from encoded creates and existing credit/census bookkeeping that its original full census is unfinished. Do not omit any ordinary tick drain or ACK.
4. Execute actual Ready with that target/witness/policy. Let the unmodified Host validate/correlate/enqueue its actual grant. Transfer to the actual new body on an ordinary tick while the older observation still has future census pages. Record the transfer's actual result and ordered authorization/Welcome/full baseline; consume the transfer normally. Continue normal ticks/drains until the new controlled baseline really finishes, so its own credit cannot confound the retained older credit.
5. Close C2 only after its true controlled baseline/fence is complete, then use fresh signed C3 normal controlled admission for the same live new body. Publish/ACK/settle its actual frozen initial plan normally.
6. Apply the actual lethal effect to that new body, update only the fixture's registered Game lifecycle policy through its ordinary processor, and call Prepare at the legal ProcessorPlan point. The meaningful behavior expectation is success and actual next observation/destruction. RED must retain the real error and old token/request/epoch credit facts; no fabricated binding, missing drain, fake ACK, state clearing or premature credit release.

A narrow Runtime normal replication test can first prove the same Native source path with the existing partial `SuccessorBindingTests`/`HostedAdmissionFixture`; it must be labelled Runtime/provider control, not a signed Rust socket test. The signed Host test should then use an independently isolated test-only Server tree with the same fixture policy/room payload and ordinary real Host credentials. The normal Runtime fixture currently settles small baselines completely before reentry; its four+one prior PASS controls remain valid and unchanged.

Expected owning implementation, **only if the lawful RED confirms this chain**: within successful activation, after all existing authority/restoration/budget validations and at the committed prior-observer retirement boundary, cancel only the exact previous attachment's existing publication using the existing owner cancellation path. Do not alter Prepare's credit guard, mark false baseline completion, cancel the new transfer credit, synthesize Host settlement, weaken packet correlation, change limits, or include OfflineDeath semantics. The abandoned old publication still retires through the original actual result/Game/drain debt rules.

No test source or production source has been written for this new candidate, and no heavy build has started. Root's active15 measurement remains undisturbed.
