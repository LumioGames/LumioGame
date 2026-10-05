# Formal12 browser movement prediction: read-only performance interpretation

Qualification: READONLY_PERFORMANCE_INTERPRETATION_PREPARATION_NOT_MEASURED_COST_OR_BROWSER_ACCEPTANCE. No production, input, quota, wire, world, service or browser changes; no build/test execution. The only executed scripts read existing files and write new private audit evidence. No actual v6 scene timings had been provided at this seal.

Official complete12 manifest is 704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766 at C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-12. Its Client source is 38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a, Runtime520ffe482e1c48fb6e48187925eecec986cdb9c8, Engine523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0, Native source81b2501a621db2657bd087db2afa808ecfb9e846. The source/ABI inventory below binds22 exact file bytes and the actual published web bridge; this is source attribution, not a new complete-consumption audit.

## Browser operation identity

The actual Game importer is C:/Work/LumioGames/LumioGame/games/101-bomber/Client/UI/Spectator/host/Program.cs:16–17: `Invoke(string operation, byte[] packet)`, passed directly to EngineWasmTransport at line43. C:/Work/LumioGames/.101-pack07/LumioClient12Composition/Client/Engine/Wasm/EngineWasmCall.cs:12–13 preserves the string. Game main.js:510 installs the function as the `bomber-engine` module's `invoke` import. Both v5 and v6 measure the actual first argument without translating it: `browserProbe.native[operation]` and tickNative.operations[operation].

The actual complete12 `web/engine-wasm.mjs:12–15` looks up operations[operation] and `lumio_engine_${operation}`. Its generated `web/engine-wasm-bindings.mjs` supplies string keys, not numeric browser opcodes. Do not infer an opcode from dictionary insertion order. If an observed JSON genuinely contains numeric native keys, it must first be traced to its exact probe/version and parameter source.

The official C ABI does have the following numbers, but they are **64-bit API root-structure byte offsets**, a different domain from the browser first argument:

| rootSlotOffset64Bytes | Browser operation string | Native export suffix |
|---:|---|---|
| 560 | voxel_prediction_session_open | same string |
| 568 | voxel_prediction_session_close | same string |
| 576 | voxel_prediction_session_stats | same string |
| 584 | voxel_prediction_begin_update | same string |
| 592 | voxel_prediction_stage | same string |
| 600 | voxel_prediction_undo | same string |
| 608 | voxel_prediction_complete_update | same string |
| 616 | voxel_prediction_read_cell | same string |
| 624 | voxel_prediction_binding_get | same string |
| 632 | voxel_prediction_raycast | same string |
| 640 | voxel_prediction_sweep | same string |
| 648 | voxel_prediction_overlap | same string |
| 656 | voxel_prediction_release_covered | same string |
| 664 | voxel_prediction_correction_reset | same string |
| 672 | voxel_prediction_working_read_cell | same string |
| 680 | voxel_prediction_working_binding_get | same string |
| 688 | voxel_prediction_working_raycast | same string |
| 696 | voxel_prediction_working_sweep | same string |
| 704 | voxel_prediction_working_overlap | same string |

Native exports add `lumio_engine_`. The progress-output `operation_kind` values1–5 are a third domain and do not identify a browser string argument. Exact26 relevant operation signatures and argument counts are in C:/Work/LumioGames/LumioGame/.run/native-movement-perf-readonly-01/source-abi-evidence.json SHA107eb9aea621c999acab487d7cb53644d8b9f480ed3802a335dc90e3a683aeaf, sourced from official complete12 bindings and Engine engine/abi/native-abi.json. These numbers must not be used as wasm32 function pointers or root offsets.

## Actual movement query and replay chain

C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/Abilities/MoveAbility.Movement.cs:14–40 executes the real shared ability, prepares actual owner movement memory, then (when speed and TickRate permit) obtains terrain and derives danger before choosing a movement. C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberTerrainRead.Client.cs:10–34 builds two full layers of addresses and calls the actual HostVoxelWorldAdapter.Read. The default actual client map at C:/Work/LumioGames/LumioGame/games/101-bomber/Client/Config/Tables/client/map.json is19×19, ground0/obstacle1: **722 distinct cells across four sections**. It accepts only real block IDs with Ready/Unchanged presence. It does not cache a terrain frame across authority/replay.

C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/coordination/src/Lumio.GameRuntime.Coordination/Voxel/HostVoxelWorldAdapter.cs:538–548 delegates to Prediction.Read(cells) when the real GAS driver is bound. C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.cs:257–286 reserves **64+count×128 =92,480 transient bytes**, allocates the result array, and reads each cell. Data-unavailable status26 may stop early; the static722 count is therefore not a claim that every incomplete input completes722 Native calls.

During input execution, GasJointPrediction.SelectiveQueries.cs:45–50 invokes ReadSelected with the real live token and visible journal keys. C:/Work/LumioGames/.101-pack07/LumioClient12Composition/Client/Engine/Wasm/EngineWasmPrediction.Selective.cs:24–28 sends `voxel_prediction_working_read_cell` once per cell. In GasJointPrediction.SelectiveQueries.cs:10–29, complete actual Native trace accesses become input-owned observations. For722 unique complete one-access-per-cell traces, the observation charge is **722×96=69,312 bytes**; insertion searches the previous observation list, implying **260,281 prior-address comparisons** in that exact distinct-access scenario. These are static formulas, not measured browser milliseconds or a claim about all returned trace shapes.

GasJointPrediction.DataWait.cs:19–33 remembers availability evidence **per section**, not per cell. Four sections imply three extra128-byte records (=384bytes); the first witness is inline. This path is not a722-cell quadratic search.

Authority rebuilds are separate: GasJointPrediction.Selective.cs:258–320 starts the Native update, removes inputs covered by actual ACK authority, refreshes typed authority, checks surviving input witnesses, corrects actual drift, executes only affected/waiting-ready inputs, projects and publishes. Its WitnessMatches at345–353 calls the same working_read_cell with **empty visible keys** for each surviving read observation. Thus722 calls can occur for **witness validation with no replay**. `working_read_cell count ÷722` is not a replay count, nor is begin_update count an input count.

The shared danger calculation at C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberMovementDanger.cs rebuilds finite per-world scratch from current bomb rows for each input; arrays are reused, the queue admits each real fuse once, and blast rays consult the terrain array. Its CPU cost is outside the Native bridge measurement. Reads, danger derivation and collision/own-bomb checks must remain tied to the real authoritative world and input history.

## Full-buffer browser bridge cost boundary

The real product SpectatorReplicaHost.cs:46–53 keeps Native64MiB, managed prediction128MiB,512 input capacity. It does not override the Runtime WorldIngressBudget predictionTraceCapacity default256. Runtime GasJointPrediction.Selective.cs:52–62 allocates a256-entry trace scratch; VoxelPredictionCellAccess is40 bytes (the actual Runtime reserve is traces×40).

Every current browser ReadSelected allocates and copies **the full accesses.Length**, not only trace.AccessesWritten. That gives a10,240-byte trace output buffer for each cell, and **7,393,280 bytes of trace capacity across722 reads in each full bridge direction**. This is separate from meaningful trace visits. It can also recur during witness validation. The current Client copies output across the entire caller-owned span; no capacity or protocol change has been made here.

EngineWasmCall.cs:56–64 prepares the packet and its buffers in managed C# before engineInvoke. The published JS bridge then allocates/copies every full buffer into actual wasm memory and returns every full buffer in the reply; the Client performs managed readback/copies afterwards. v6 engineInvoke elapsed measures **JS ABI work plus the synchronous Native call**. It excludes C# preparation, marshalling/readback and Runtime trace-list processing. The 722-calls and256-entry facts are therefore plausible cost amplifiers, not proof of which part dominates. A low total native.ms alone cannot rule out this surrounding work.

Native presentation/meshing uses engineInvoke.createVoxelPresentation and direct `lumio_engine_presentation_*` calls at actual web/engine-wasm.mjs:61–91. These bypass the measuredInvoke function. The v6 native totals do not cover all renderer Native activity or GPU work.

## Existing formal telemetry and what is currently readable

Runtime GasJointPrediction.Metrics.cs exposes actual per-generation InputExecutions, Replays, NativeStageAttempts, corrections/discards/covered releases, NativeTraceVisits and RetainedBytes. TraceVisits increments execution RecordTrace, **not** the witness-validation calls above. Its OutstandingCount is the real retained input count.

Existing GasJointPrediction.ExecutionTelemetry.cs provides a bounded window that must be enabled on the idle owner **before any input admission**, with a nonzero unique window ID and finite capacity/bytes/time/attempts. Records distinguish first/replay attempt, elapsed validity and DataWait/BudgetWait/CorrectionRetry/Faulted outcomes; `Returned` does not mean publication. The separate finite causal telemetry requires that execution window and its own work/byte/record limits. Both drain at idle owner boundaries, preserve terminal/drop information, and do not authorize hidden reflection or synthetic world access.

The current normal Game JSExport surface does not expose these driver metrics or telemetry. RuntimeJointPrediction.cs keeps its GasJointPrediction _driver private. v6 does not enable/drain those APIs, so its data cannot supply actual Replays, exact trace visits or pending input count by inference. Existing normal exports, actual sent InputCommand sequences/ACK authority, Native operation calls, completed draw callbacks and LongTasks remain readable via the approved passive probe.

## v6 independent observer qualification

Verdict: **ACCEPT_PRIVATE_COMPLETED_GAME_DRAW_CALLBACK_CPU_OBSERVER_ONLY**. C:/Work/LumioGames/LumioGame/.run/native-movement-perf-readonly-01/v6-verification.json SHA b3c73b474b56cc2cd814bb45ec337946c40a300f67141d167e77d10a296f067e; audit-v6.mjs actual exit0. Generator0f9927196556e6bd7c6d1a9db7510a7449be2f857b2a37d7b29775cdd67ee7ef reverses its exact success/error deltas to preservedv5 SHA08aacabe1713484e44a876adc1df4b4fe5cf49cf008509810babc3e97077e238. Measured mainb38f5c21a5429035409d25315deec802d01225ce8a08a363af63522affad6f52 reverses its prefix and three declared seams to ordinary main25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c. Actual835 file inventories are identical; all834 non-main files are byte-identical, no extra files.

Native GL wrappers count draws only after the original function returned normally; the rAF wrapper counts a game-stage draw callback only after its callback returned normally and records callbackCompleted=true. Failure counters remain. Neither guard proves GL getError success, valid pixels, GPU completion, compositor delivery or scanout. Async promises returned by a callback are not awaited; the qualifier is synchronous callback return. Global draw/failed callback counters are not exclusively gameplay. The independent heartbeat `renders` is not game FPS. Multiple draw callbacks can share a rAF timestamp; use timestamp grouping and completed-count deltas with explicit window/visibility when assessing callback cadence.

The wrappers call the original functions with the original arguments and return the original results; export and Native exceptions are rethrown, fetch returns the original response, WebSocket.send is invoked before observational parsing. No input injection, wire/body/world rewrite was found. The observation history/DOM is bounded and its projection, GL bookkeeping and serialization are recorded separately; the Native per-call bookkeeping is not separately timed and is still part of overall Tick cost. Use an ordinary unmeasured scene comparison before acceptance.

## Required interpretation of incoming real windows

Use matching foreground/visibility intervals and actual timeOrigin/performance.now; distinguish cumulative counts from600/80-tail samples and dropped records. Report Tick p50/p95/max and start gaps, working_read_cell counts/ms by Tick, begin/complete/correction/release counts, actual InputCommand-to-authority ACK delay and pending sequence gap, completed game-draw timestamps/duration and global LongTask windows. Multiple authority groups in one Tick and changing backlog are material confounders.

A completed eligible movement normally needs the full-grid query; matching722-call blocks and high surrounding Tick time supports **query-volume correlation**. It does not isolate execution from witness checking, nor assign the managed remainder to terrain, danger, fingerprint, typed authority or packet copying. Strong attribution needs actual existing execution/causal telemetry or a separately reviewed bounded phase probe in the owning source, on the same official complete-consumption path. CPU callback cadence is not a presentation correctness claim; actual positions, ACKs, life/generation and authority must still be checked.

No production optimization is selected by this report. If actual windows identify this chain as the bottleneck, the first review should compare demand-driven actual Native reads against full-grid reads and inspect full-capacity per-cell trace marshalling. Any candidate needs a genuine failing regression with the real Native provider, current quotas, exact trace/pending/authority/replay behavior, water/obstacle/own-bomb/blast-chain cases, relevant unloaded data and unchanged functional outputs. Do not introduce a shadow terrain frame, cached gameplay world, reduced trace correctness or relaxed quotas. Readiness semantics must be preserved explicitly; unrelated unknown cells must not silently become air.

All audit output is private. The main goal's eight-player movement/bomb/reentry/performance acceptance, V16 review gate and publishing identity remain Root-owned and are not passed by this report.
