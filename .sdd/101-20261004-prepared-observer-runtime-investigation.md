# Official10 prepared observer reconnect — Runtime facts

Author investigation, 2026-10-04. Verdict: `THREE_REAL_NATIVE_CASES_GREEN_NO_RUNTIME_RED`. This report does not accept the live10 browser experience or identify the Host hold stage.

## Exact scope

- Isolated owning Runtime worktree: `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeObserverReconnect`, branch `codex/101-prepared-observer-reconnect`, base/HEAD `8afdffdd6d5de3a6bde9ba4ec57c22d5549aa1d9`.
- Only added test source: `modules/replication/tests/Lumio.GameRuntime.Replication.Tests/PreparedObservationReattachOwnerFactsTests.cs`, SHA256 `a97d9329095d8a2a662a2c2ca376e38ab1bda7ebd8a3414d801e0feed32cd3a1`. It extends the existing `SuccessorBindingTests` partial class and uses its actual `Harness`, GeneratedRegistry, WorldManager, EntityBindingQuery and Native GAS fixture. The fixture and production sources are unchanged.
- Native: actual `games/101-bomber/.run/20261004-browser-experience/complete-release-10/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`, SHA256 `ecd86e78bc66a94bdf49d4bc4bee9abef6f1329cba8a1dd4c0e96a9e5944cefd`, sidecar buildId `d595e2c77e6943ecbbf43ea3994b8367`, ABI `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`.
- Architecture freeze `0e2fc74783f9f186d59909b38d4ee70887a21137`; strict analyzers and normal declaration generation remained enabled. Independent NuGet/artifacts paths; no DLL replacement, service operation, browser operation, reset/restore, staging or commit.

## Actual scenarios and results

1. `PreparedObservationWithNativeWitnessReattachesCurrentOwnerFacts`: actual Prepare/Destroy/observe is drained; actual Create is committed; actual Restore effect produces nonzero Native witness for the dormant successor; Ready has not been requested. `DisconnectConnectionMessage(c1)` runs, then authenticated reattach to c2 runs. New reattach is Applied, Welcome is c2/participant/current epoch3/previous epoch2, aligned ownerFacts are non-null and retain account/room/profile/world-incarnation/token/original old-life epoch1/capture/destruction/creation history. Current c2 snapshot is Observing; c1 has no current snapshot; prepared life remains disconnected. Eligibility is true. **PASS**.
2. `PreparedObservationPendingReadyGrantReattachesCurrentOwnerFacts`: actual Native restored life issues real Ready before eligible tick8. Existing formal test ingress order is used: exact Transfer control, c1 disconnect, c2 reattach in one Tick. Old transfer is NotApplied and its ownerFacts are legitimately null. New reattach is Applied with actual c2 Welcome/current epoch3 and the same complete ownership/history correlation assertions as case1. Prepared successor remains disconnected. **PASS**.
3. `PreparedObservationDisconnectBeforeDeathDoesNotRetainOrdinaryLifeRoute`: ordinary controlled c1 disconnect occurs while old life is still live. Account-to-life mapping, life entity and original connection generation1 survive, but Observer.Connected becomes false and ordinary connection route is removed. Actual Stage1 PrepareSuccessor returns `binding_not_found`; the fixture therefore does not queue Destroy. No successor result, Ready or Welcome is emitted. **PASS**. This is a precise boundary observation, not proof that the live Host delivered that same disconnect ingress.

Raw bounded JSON from these actual test runs is retained in `actual-runtime-observations.json`; current reattach facts are captured directly from `DrainOutbox().SuccessorResultOwnerFacts` at the matching result index, not reconstructed from a fake authorizer. Strong assertions preceding facts validate Applied result, legal observing attachment, Welcome and live history.

## Build/test evidence

Evidence directory: `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeObserverReconnect/.run/prepared-observer-reconnect`.

- `attempt-01-build.log` / input/source/result are preserved. Raw exit1 consists solely of two xUnit2031 errors in the new test (`Assert.Single(Where(...))`). It is **INVALID_FOR_BEHAVIOR_RED**. The test was mechanically corrected to `Assert.Single(collection, predicate)`; no analyzer setting or production source changed.
- `attempt-02-build.log`: raw exit0, 0 warnings/0 errors, 7.75s after first dependency build completed.
- `attempt-02-test.log`: raw exit0, total3/passed3/failed0/skipped0, reported duration4.288s. No unrelated full suite was run.
- `run-tests.ps1` contains the exact commands/env/paths. Each attempt stores exact source hashes, Native sidecar/identity, start/end timestamps and final DLL hashes. Build completed before executing the test binary. No TRX was requested; the retained log contains the runner's actual summary.
- `candidate-seal-01.json` SHA256 `79f5b17cf57b9d140923c8e67ece9ddeae4a52b6d6bfafa93c29ecd8d2e66c0e`: eight relevant source/fixture files unchanged, all34 package locks byte-identical, tracked content diff empty, exact new test and attempt evidence hashes. Generator output was left in place; no restoration was used.

## Source boundaries relevant to live10

`EntityBindingQuery.Disconnect` calls `WorldManager.Unbind`, then removes `_connectionToEntity`, `_roomByConnection` and `_profiles`. The entity/account and generation are retained. `TryCaptureSuccessorBinding` requires `TryResolveConnection`; PrepareSuccessor invokes this strictly before reserving/publishing observe. Therefore an actually processed ordinary disconnect prevents the old c1 route from being captured later in this fixture.

For an already reserved observing attachment, `DisconnectSuccessor` retains the reservation but sets Connected=false, cancels publication and refuses a pending request. Legal reattach binds the new connection, increments current attachment epoch, updates the real observer, creates a new Welcome, and captures facts for that new Applied result. The two prepared/Ready tests demonstrate this path currently succeeds in the official10 Runtime baseline.

`ReadResultOwnerFacts` intentionally requires current owner validation and current attachment equality with the result's NewAttachment. A historical Applied result whose attachment was replaced may no longer authorize the current owner. These tests do not weaken that contract or require facts for refused transfers.

## Relation to actual browser failure, and limits

The immutable live10 prefix used by the Server investigator is `live-10/server-hold-independent-01/ds-prefix-01.log`, SHA256 `fd2dc9444fb26ee385bb25284e27eb0d28716d85561a0c8cb1decc650f465f5a`, 6043827 bytes. The source DS log remains mutable; no final source hash is asserted.

Actual A38 close occurred at20:02:36.106Z; new A39 tab opened at20:02:36.566Z. Last server commit3998 at20:02:38.095418Z had7 frames; reconnect admission at20:02:38.126300Z was staged at3998/gen0; first host3999 at20:02:38.156033Z retained applied3998/frames0. B31's last replica observation3997 contains actual participant `0000000000000001000000000000000f`, current/last life `00000000000000010000000000000121`, lifeGeneration7, AwaitingRespawn. This is distinct from the previously repaired falseEligible terminal observe. A39 has no received socket messages, first identity or first world; its stall precedes Welcome.

These real Runtime tests provide **no failure/RED** supporting a new eligibility/owner guard change. They exclude the simplest current prepared-reattach facts-null hypothesis in this exact Native fixture. They do not reproduce authenticated Rust sessions, transport close timing, snapshot escrow, Server planner ordering, receipt queues, Host current-owner requests or the same Game declarations/respawn timing. Server-only signed real-CLR/socket cases are still needed. In particular, if Host removes a session without processing the formal ordinary disconnect before Game death, that is a distinct ingress/ownership fact which this test does not simulate.

No production fix is proposed from these GREEN results. The eight-cycle hold and unfinished continuous-walking/performance/ten-reentry acceptance remain open.
