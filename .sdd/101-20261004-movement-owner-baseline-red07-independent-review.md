# Movement owner baseline — independent actual RED07 qualification

Date: 2026-10-04. Reviewer: `/root/browser_perf_trace`, not the test author. Read-only review; no compilation, test execution, service or browser operation, or Game source changes.

Verdict: **ACCEPT_ACTUAL_BEHAVIOR_RED_ONLY_FOR_PROJECTION_AND_CURRENT_LIFE**. This supplements the preflight review of `abdbba0434ce4785dfb55ae77479f08f0ee6e7b25af7bad6f194f412667b4eed`; it qualifies only the corrected source `9b1023080619a77adc7c6b376136fcbd40c47adcd912de39fe955c276568209c` and actual baseline07. It does not reuse an old test-source approval as a new-source approval.

## Exact test-only correction

The reviewer checks original bytes from `fixture-controller-correction-01/before.cs`, corrected bytes from `after.cs`, baseline07 `test-source.cs`, and the current file. The only permitted byte replacement is:

```text
RegisterTransformController(life.AssignedId, "movement-baseline-test")
RegisterTransformController(life.AssignedId, nameof(MoveAbility))
```

The ordinary `MoveAbility.WritePosition` uses this same public controller source. Runtime rejects a competing second source on the entity; reusing the existing source does not bypass a controller guard. The evidence seal script asserts the whole-file replacement equals the new bytes, not merely that a displayed diff contains one line. Existing public helper, production and component declarations are unchanged by this test correction.

## Actual run and reached boundary

Evidence lives at `games/101-bomber/.run/browser-experience-repair-01/movement-owner-baseline/baseline-07/`. Its `build-result.json` records raw exit 0; the log records 0 warnings/errors and generated client Gameplay. The runner records raw exit 1. The original TRX records total/executed 2, failed 2, error/notExecuted/skipped 0; the test log agrees.

The first failure is `CurrentServerLifeCanActivateTheClientMovementAbilityBeforeNewAuthority`, source line 41: `move_source_invalid; player generation=3, participant generation=0`. Its earlier assertions confirm the projected participant's actual CurrentLife equals the controlled life, player Participant equals the actual participant, and player generation is 3. `BomberInputMemory.IsCurrent` also requires matching participant generation; that declaration remains `Scope.None`, so its projected value is 0. `InputMemoryMatchId` is not part of that predicate.

The second failure is `OwnerBaselineRetainsMovementMemoryFromTheActualServerProjection`, line 20: Expected 55, Actual 0 for `InputMemoryMatchId`. This is a true omitted owner-memory baseline failure. The six later memory assertions did not execute after that first failure. Their current declarations are also `Scope.None`, but this run alone must not be reported as seven individually observed assertion failures.

Both failures occur after `ProjectOwner()` returns. Its shared preceding assertions therefore reached real Native World initialization/ID assignment, actual server memory and participant generation values, ordinary server projection, exact controlled-life Welcome and test authorization, real WebSocket replica application, connection `active`, input enabled, and unchanged actual Logic position `(7.5,1.5,7.5)`. This removes the earlier conditional fragmentation risk for this exact run: ordinary `owner.Apply` succeeded. It does not establish an encoded size for future larger baselines.

The carrier is explicit test authority with the actual participant and Welcome generation; it is not a DS admission or a signed Platform scenario. No client memory is injected. Reflection changes only real server fields in the separate server Gameplay load context. `ProjectionRegistry` preserves the actual component, wire, config/service and declaration registry but excludes world systems, as independently reviewed in the prior preflight. This isolates ordinary field projection, not the complete Game simulation.

## Environment and artifact bounds

`release.props` selects actual complete-release-11, SDK `0.0.5-main.523c3d3`. Result metadata identifies Native SHA256 `ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`, server Gameplay `925d7bac9ca9f3d9df9f0b0f39d0c0945ead2489622c5d7f0f97c28bcd0e7210`, manifest `f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867`. The seal records the actual runner DLL, client Gameplay, SDK/NativeLoader/Hfsm/Hosting/Ecs DLLs and deps file without altering any of them. This review does not replace Root's complete-package PE closure qualification or claim a new independent PE parser run. Unlike attempts03/05, the actual07 runner reached both target assertions under the default CLR; no missing-version constructor failure is counted as behavior RED.

Attempts01–05 remain INVALID runner/compile/load attempts. Baseline06 is **INVALID_FIXTURE**: both cases stopped at a real `TransformWriteException` requesting `movement-baseline-test` when `MoveAbility` already owned the life; it reached neither Welcome nor target behavior. Its raw exit 1 and original source/log are retained. The correction result explicitly states zero production changes.

## Accepted next boundary, not acceptance of prediction

The evidence supports reviewing the smallest Game field visibility repair after Root's reentry regression. Ordinary Runtime `Scope.Owner` is `entityId == observerId`; the participant and the controlled life differ. Seven owner-life movement-memory fields may be considered for Owner visibility; participant generation needs a visibility decision compatible with its existing Room CurrentLife/MatchId. No Runtime predicate or current-life guard should change. A new Game schema/release/generation/migration/source-pin review is still required.

This RED did not send a movement input, apply an actual Section group, attach Native joint prediction, call the empty client movement body through GAS, publish a predicted result, or display Model movement. It cannot qualify collision, completed prediction, continuous walking, input-to-screen latency, browser reentry, or the real eight-player acceptance. Those remain separate boundaries and tests.

Seal: `games/101-bomber/.run/movement-owner-baseline-red07-independent-review-01/manifest.json`; its script captures exact source/log/results bytes and validates the correction. No rerun was performed.
