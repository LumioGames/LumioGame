# Browser Session pump scheduler: independent spec and code review

Date: 2026-10-04 (Asia/Shanghai). Reviewer: independent nonauthor `schema_pins_review`.

**Verdict: ACCEPT. No blocking P1/P2 finding in the selected scheduler change.** This acceptance covers the exact two tested source files below and Task 1 of `docs/plans/2026-10-04-bomber-browser-pump.md`. It does not accept prediction, reconnect behavior or complete browser experience.

The plan, actual task brief, implementation report, exact two-file diff, verification summary, original RED/GREEN process outputs and both complete frozen source pairs were read. The author evidence is physically under `games/101-bomber/.run/browser-pump-repair-01/`; independent evidence is under the parent `.run/browser-pump-independent-review-01/`. Production files were read only. No suite rerun, compiler, GEN, Native execution, staging or source write was performed by this reviewer.

## Exact reviewed source and scope preservation

| Source under `games/101-bomber/Client/UI/Spectator/` | Frozen before SHA256 | Frozen tested after and current SHA256 |
| --- | --- | --- |
| `main.js` | `79a74b6f796e0fc51e56784afeb2aa75841ddae88b650d95376c3306ece39974` | `25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c` |
| `main.test.mjs` | `050fc54b1ad044f2daad6843e11234c79a3eed11348afba199b8090c66b61896` | `8db0689dec60089f939ba7af0f577a6fa2dd1792e5eefa7c4393075c25831307` |

Current physical source bytes equal the complete tested after images. The independent start/end source fence shows zero drift. A separate in-memory forward/inverse reconstruction proves that `main.js` has only the deadline declaration, replacement timer scheduling block and new-attempt reset. The 7-added/1-removed production-line change exactly restores the complete before bytes when reversed; it does not replace prior uncommitted delivery work.

The entire old pump body is byte-identical after reversing only its timer block. Its order remains: one managed `csharp.tick()` → SessionState → terminal-state handling → current Native/world-handle and voxel refresh → map/dump/display projection → Self and section observations → visible status → one next timer. The real TickRateHz export is still read; no fixed replacement frequency is introduced. `releaseReplica`, `finish`, `refreshVoxelWorld` and `closeVoxelWorld` are unchanged complete source regions. This change introduces no world, position, terrain, prediction or gameplay cache and no alternate Tick path.

## Spec behavior

- **Work counted inside the period:** `start()` sets `nextPumpAt = performance.now()` immediately after successful Boot and its current-attempt/terminal check (`main.js:787`). After the synchronous pump work, the scheduler advances that anchor by the actual selected period and subtracts the monotonic current time (`main.js:713`). For a 30Hz selected period and 20ms work, the next delay is 13.333ms, rather than another full 33.333ms.
- **Repeated cadence:** callback deadlines advance from the previous anchor. Under within-period work, varying callback costs do not shift later start deadlines by those costs. The added real-page composition case checks five varying costs against the selected cadence.
- **Long work and suspension:** if the next deadline is already elapsed, integer period arithmetic advances it to the first future deadline. A 155ms-late callback still performs one managed Tick, then schedules one future timer. A 90ms overrun likewise skips deadlines. There is no catch-up Tick loop; only the original single Tick call exists in `pumpSession`.
- **New attempts:** each successful new Boot resets the anchor after cleanup and attempt checks. The 1000ms restart case verifies the same short work-adjusted delay from the new anchor and explicitly invokes the superseded callback to prove it cannot add a Tick or timer.
- **Closed/superseded ownership:** the existing entry gate rejects terminal or obsolete attempts before Tick (`main.js:692`). `finish` increments the attempt and clears the existing timer before replica release. Existing faulted/closed/superseded Session branches still finish and return before scheduling. The new retained-callback-after-close case confirms no extra Tick and no timer; this case already passed RED and preserves an existing lifecycle guarantee.

The scheduling block is small, uses the browser's existing monotonic clock, and keeps state within the existing sole pump owner. No blocking implementation or maintainability defect was found in this scope.

## Test quality and authenticated execution

The tests execute the production page source in the existing composition harness. The only new harness behavior is the controllable `performance.now()` clock and advancing that clock by the scheduled delay plus optional lateness before invoking an actual captured timer. The six behavioral cases inspect timer delay, callback start times, Tick counts and lifecycle retirement; they do not copy the scheduler implementation into a separate model.

Independent inverse reconstruction removes the six added cases and precisely reverses the clock, timer-advancement and two isolated startup scaffold adaptations. The resulting complete test file equals the frozen before bytes. Thus every pre-existing test body, assertion, expected value and test declaration is retained; no original test is skipped, relaxed or deleted. The isolated startup cases receive only the now-required `performance` and deadline variables, with their original ordering/cancellation assertions unchanged.

Original process evidence was independently hash-authenticated and its per-case output counted:

| Phase | Actual total/pass/fail/skip | Raw exit | Source correlation |
| --- | --- | ---: | --- |
| RED | 59 / 54 / 5 / 0 | 1 | Exact before production and after test hashes |
| GREEN | 71 / 71 / 0 / 0 | 0 | Exact after production/test hashes, stable after execution |

RED contains exactly five `AssertionError [ERR_ASSERTION]` failures: work-in-period, successive cadence, 155ms-late deadline, work-overrun deadline and new-attempt reset. The close-retirement new case and all pre-existing page cases pass. These are real failing assertions, not absent exports, syntax/import errors or skipped coverage. GREEN uses the same test-file hash and runs the complete page, player-controls and game-view command. Its 71 individual results match the summary, with no fail/cancel/skip/todo. Both phases' stderr files are empty. The command environment selects the official complete07 web modules.

## Independent evidence

Paths below are relative to `.run/browser-pump-independent-review-01/`.

| Evidence | SHA256 |
| --- | --- |
| `verify.mjs` | `1a0e965ef15a93adf560621c737239220d8203c211cef31038a38a76c4d21032` |
| `verification.json` | `93dc04efde89713bd3444283e6395fa8fcc0767f14146f72fbb18534a1cc32bc` |
| `source-fence-start.json` | `1ba8326a74b2f89c5000f82c65bc97386e9817df32ed860072c56e28dcf73b78` |
| `source-fence-end.json` | `2183aadf88b9f65d41e0b56e3d03830d6a7963e03b2d229791c4bee73fb4248a` |

`verification.json` also pins the plan, brief, report, exact diff, both source pairs, phase-result records and all original output logs. The exact author diff is `2b1573c3236828eed3deb45b729a40e31f2c359740b125d7d8440455c7fc7fe3`; RED stdout is `78a10488832562967c957bba45f1c39f964f1565b8a327f18535098ac6dd70c8`; GREEN stdout is `79dcef7ec733714ad6fe824429fb62ee6b446baa330868ec9aad12cfd362ea79`.

Root's normal browser publication and subsequent real eight-player timing/experience acceptance remain necessary. This report supplies no claim about actual browser FPS, managed Tick cost, input acknowledgement, prediction, negotiation, ten close/reopen cycles, shared bomb identity, release identity closure or any other formal-delivery requirement.
