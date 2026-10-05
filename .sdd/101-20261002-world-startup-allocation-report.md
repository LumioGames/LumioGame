# Runtime World startup allocation corrective slice

## Frozen source and scope

Runtime isolated tree `C:/Work/LumioGames/LumioGameRuntime-101-world-startup-allocation`, commit `6de14fda44733b6cd46ad60fc177db61a14068d9`, parent `4c9e654f36e935a6ac8ddec42284556b388b7696`.

Only two changed paths: `modules/simulation/src/Lumio.GameRuntime.Simulation/Warmup/TickPathWarmup.cs` and `modules/simulation/tests/Lumio.GameRuntime.Simulation.Tests/TickPathWarmupAllocationTests.cs`.

The four virtual-dispatch enumeration sites now pass reason kind/source without formatting. Dispatch retains the same array exclusion, assignability, implementation resolution, generic eligibility and MethodKey deduplication. Only the first real edge formats its original diagnostic. No receiver is skipped, no cache lifetime/public contract/JIT preparation is changed. Native ABI and wire/schema are unchanged.

## Reproduction and cause

Frozen formal a5fa SDK, Resume6 authority Gameplay DLL and host04; diagnostic carrier only. Root Game evidence directory is `games/101-bomber/.run/20261002-client-session-integration`.

- Browser21: 15-second initial character confirmation timed out. Engine/registry/config/assets finished507ms. World finished13187ms; allocation increased4.97MB→21,204,464,008 bytes. CPU growth12.3s, GC pause719ms.
- Repeat22: World7837ms, same21,204,114,712 allocated bytes; input/explosion passed. Timing variation did not remove allocation defect.
- Repeat23: diagnostic-only existing internal BeforeInitialize hook measured step tick at864ms/6.68MB, World8533ms/21.204GB. Hook uses reflection only in private diagnostic producer, never production Game or Runtime code.
- Repeat24: actual dotnet-stack attachment exited0 and captured `TickPathWarmup.Run → WorldTickBinding.Bind → LumioEngine.CreateWorld`. The preheat IL analysis formatted long strings for the full virtual-slot × receiver cross product before discarding unrelated/already-reached pairs.

## Actual verification

Evidence in Runtime `.run/startup/` unless stated otherwise.

- Focused real Tick graph RED `allocation-red-02`:1 test,1 failure,0 skipped,exit1;1,132,154,344 bytes. First attempt had an incorrect expected delegate-only coverage target; corrected before taking resource RED, retained logs.
- Isolated baseline tree `C:/Work/LumioGames/LumioGameRuntime-101-startup-baseline/.run/allocation-red-graph`: same frozen test,1 failure,exit1;1,132,280,464 bytes,8426 reachable methods.
- Candidate `allocation-green-graph`:1/1,0fail/skip,exit0;68,621,384 bytes,8426 reachable methods.
- Both complete sorted method-signature sets SHA256 `79db121106a2524a3614af1937615f30283d21323ab0e1916f4327ea1018fbfa`. Allocation guard remains512MiB; no wall-clock tolerance introduced.
- `prime-green-01`:12/12,0fail/skip,exit0; actual cold-process first Tick and first admission JIT zero-extra invariant, complete phase/admission target coverage, reuse, concurrent success/failure and collectible identities.
- `simulation-full-02`:252/252,0fail/skip,exit0,23.105s.
- `all-tfm-build-01`: complete Runtime solution allTFM build exit0,0warnings/errors.
- `format-02`: correct explicit Engine root, narrow two-file official format verification exit0,0changed. `format-01` returned0 with workspace warning due missing explicit root; retained.
- `simulation-full-01`:168pass/84fail/0skip; setup failures from missing LUMIO_TEST_NATIVE and private output layout incompatible with PrimeProbe locator, not ignored. Correct conventional isolated build and explicit verified native fixed both; full02 above passes.
- New Engine test Native built officially from isolated clean ef9 source with NativeCore c93b/Voxel2ba. `C:/Work/LumioGames/LumioGameEngine-101-startup-test-native/.run/ef552fc6b3ece282ed3988f40c60fa3a/win-x64/run-bgVY6e/lumio_engine_native.dll`; SHA256 `f959d1e69a2dc2ed38759c0986465a5e9dda2caf9fd1666d7b25dcfaa1e78250`, both hfsm and voxel prediction test support, matching build-info. It is a test artifact, not production SDK Native.

## Official package and repeated browser verification

Full Runtime suite `runtime-full-01`:2689/2689,0fail/skip,exit0,2m26.723s on exact frozen source and verified same-source test Native. Root independently reviewed the two-file commit and reran12/12 allocation/Prime/collectible tests; report `101-20261002-world-startup-allocation-independent-review.md`.

Official `eng/pack-sdk.mjs` from Engine ef9, NativeCore c93b, Voxel2ba and readonly Runtime6de14 produced `C:/Work/LumioGames/LumioGameEngine-101-startup-test-native/.run/101-startup-sdk/sdk/identity.json`, version `0.1.0-dev.beb9f5d0f863e13f3a86c7230b00618151b74c37062baf755a755863ea6f120f`, exit0. NuGet SHA256 `17fdf3d9c4cd0d0de6bba227dd1497d194b704da22740b92c307659baa391def`; official production Native SHA256 `9e6ea95ebdcbd4b24c136e39b04a17cddc963dd51bf4854cddc5d2402f8e8634`. The package consumer verifies its recorded SHA512 and Native sidecar; it references the package, not Runtime source or loose replacement DLLs.

Single-variable authority experiment uses unchanged frozen Resume6 Gameplay/host04 and the new officially packaged Runtime. Browser25 and26 both exit0 with actual slow choice, authoritative confirmation, movement, bomb and replicated explosion; no console/page/network errors. World creation25:4280.7ms/383,569,784 allocated bytes;26:3449.9ms/383,580,584 bytes. Original15second confirmation timeout unchanged. Evidence `browser-native-authority-25*` and `browser-native-authority-26*` under the Game evidence directory above. Diagnostic consumer source/build/provenance: `C:/Work/LumioGames/probe/101-startup-sdk-consumer`.

No Root Gameplay generation or product waiting timeout changed. These are diagnostic Native/realWS/formalWASM experiments, not formal Platform/DS admission/full-match proof or an all-new-SDK browser release. Root will compose the approved Runtime slice with its pending provider and Gameplay work before final delivery. Entry04 lifecycle corrections are tracked separately as entry05.
