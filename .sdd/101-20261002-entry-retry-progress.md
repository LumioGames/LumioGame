# Entry retry / first admission performance — resumable work

Evidence root `games/101-bomber/.run/20261002-client-session-integration` (E). This work is not a Platform/DS/full-match acceptance claim.

## Frozen successful prerequisite

Runtime cold-world allocation fix6de14 is independently reviewed, complete2689/2689 and officially packaged as beb9. Exact provenance and two real browser repeats are in `101-20261002-world-startup-allocation-report.md`. Root owns later provider/Gameplay composition. This Game work must not change authoritative Warmup duration or admit an initial character during Running.

## Entry05 fixes and evidence

Three changed files: Spectator main.js/main.test.mjs/spectator.css. Failure now exposes the real retry button; start claims its attempt before awaiting cleanup; pending Boot completes before Close; failed Close retains the owner for retry; cancellation aborts the actual pending launch fetch and rejects stale completion. No manual sockets, authority substitute or extra world introduced.

Freeze `E/game-entry-review-05/manifest.json`, SHA256 `341f6343bcee06ba9f60995161bba7a80e63fa5854bc8ccd62658cdc80969fd9`,12 source/before paths (11 prior entry files + CSS), exactly3 changed. Root source review found no blocking issue, actual acceptance remains separate.

- Browser `entry-failure-red-01`: actual503 with CSS-hidden retry button, exit1.
- Unit RED/GREEN: entry-retry, entry-ownership and entry-abort logs retained. Pending cleanup/Boot/Close failure and abort each failed first. `entry05-js-all-01`:63/63,0fail/skip,exit0.
- `entry05-publish-01`: official private Debug publish exit0 with a5fa selector and frozen Root Resume7 Debug_browser Gameplay DLL. `entry05-before.json/after.json`:98 generated files unchanged,11 entry files stable during publish; only anticipated main/test differ from entry04.
- `browser-entry05-refresh-01`: actual pending HTTP launch canceled on refresh; after5.5second fresh selection no new launch and no socket, old response cannot revive it, all five choices present, console/page errors0, exit0.
- Actual retry01/02/03/04 are retained failures. Real retry action sends second launch and opens the real WS, but first character input arrives after authority Warmup, not a false login failure.

## Hidden classic view defect (entry06)

Isolated window was coordinated with Root/capacity/gameplay. Process inventory found no remaining owned browser/producer; user's Edge and tool servers retained.50 CPU/RSS samples `entry05-isolated-process-*` show no other major test workload. These failures cannot be dismissed as competition.

`browser-entry05-retry-04-profile-cpu.json` showed4.07seconds in managed ReadBox for the CSS-hidden classic canvas. It fetched19×19×16 cells before initial choice and on every Tick, duplicating the visible GameView's own terrain read. Native input reachedTick63 (Warmup ended). `entry-hidden-read-red-01`49pass/1fail, then `entry-hidden-read-green-01`64/64: formal GameView retains positions/identity but does not repaint/read hidden classic canvas. Classic/blocks paths keep their real reads; GameView/ReplicaTerrain still read the same authoritative replica world. No visual reduction.

`publish-entry06-01` is the official Debug output with that fix, immutable. Actual retry01 still failed: firstinputTick70. Private diagnostic `browser-entry06-stages-01` did confirm rabbit and actual movement/bomb, firstinputTick57, but failed its network assertion because it originally counted the intentionally aborted body of the injected503 as an unrelated failure. It is NOT a green acceptance result. Network probe now correlates request identities and permits only the abort of that exact intentional503 request, not any successful launch/other request failure.

## Release configuration and remaining investigation

The old host csproj unconditionally enabled hot reload and disabled optimization for all configurations. `host-build-mode-red-01` uses actual MSBuild evaluation and fails Release. Host csproj now keeps Debug unchanged and sets Release Optimize=true/HotReload=false; AOT/trim remain unchanged. `host-build-mode-green-01` passes both configurations. Official `entry06-release-publish-01` exit0, `publish-entry06-release-01` retains exact entry04 Presentation asset hash246eb75d..., frozen Resume7 Gameplay, same a5fa Client/WASM closure.

Actual `browser-entry06-release-01` remains RED: firstinputTick63. Release configuration alone does not remove the remaining managed authority-apply cost. No timeout changed (15seconds), no Warmup rule changed. Main source hidden-read fix remains valid and64JS tests pass.

Private only: `managed-stages-host` copies Game host sources and decorates the existing IClientRuntimePort and IClientJointPrediction seams with Stopwatch logging, still calling their actual owners unchanged. Official SDK DLLs are consumed, not replaced. Setup failures01–03 (wrong Directory.Build.targets/central-package inheritance and copied source outside original platform-analysis path) are retained;04 supplies the original Spectator build props/targets/package policy and an accurate browser assembly platform annotation, publish succeeds. `publish-managed-stages-01` is diagnostic only, never formal product output. Current actual browser probe `browser-managed-stages-01` will separate runtime commit, joint publication overhead and other Client staging; continue root-cause work in the owning upstream once measured.

The diagnostic `browser-managed-stages-01` has now finished: exit0, seven checks, actual503 retry followed by confirmed rabbit, real movement and bomb, no unexpected console/network errors. This is the decorated diagnostic host only, not proof that the plain Release entry is stable. The first runtime commits cost274.5/172.5/146.7/137.6ms; joint totals353.3/190.4/150.6/139.4ms. Later commits fell to4/2.8/3.7/2.6ms while joint totals remained89.2/88.4/76.4/39.1ms. The residual performance investigation therefore continues in actual managed joint prediction/commit, not by enlarging the15s deadline. No upstream performance implementation has yet been made for this residual cost.

Root may change Presentation dist for the independently owned resource-circle1→4 correction and integrate Resume8 Gameplay. Do not rebuild those or overwrite its generated outputs. Use frozen Resume7 DLLs under `.run/resume7-root-integration/artifacts` for this single-variable investigation. Root prioritized the formal Server CLR binding blocker next. Active write scope is new `Engine/src/admission_binding.rs`, `clr/admission_bind.rs`, narrow `clr.rs`/RuntimeSurface/window accessors; Root owns admission_attempt/Owner and all publication grant lifetime. Implementation plan is `.sdd/101-20261002-controlled-bind-lane-plan.md`. Entry06 four-path source freeze remains unchanged while this task runs.
