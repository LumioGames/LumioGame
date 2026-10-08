# Candidate Client V2 header: real official12 WASM GREEN

Verdict: `ACCEPT_PRIVATE_CANDIDATE_CLIENT_SOURCE_TO_OFFICIAL12_REAL_WASM_GREEN_ONLY`.

The actual candidate `EngineWasmPrediction.ReadSelected` sent its unchanged production packet to the unchanged official12 WASM bridge. Native returned status 0, Ready/block 65536/revision 41, one correct access, required=written=1, complete=1. Managed typed payload/access readback matched. Stats, Complete, Close and Node/context/world cleanup all returned 0. Narrow standalone managed build and functional execution each returned raw 0; build had zero warnings/errors. No Native build or quota/protocol alteration occurred.

The actual candidate packet SHA256 is `a621fb49331ee1295aa1689bb1e1cbf967daa3354a4c2bcc43778833480a79ca`; this equals the original RED proof's header2 counterfactual packet, but this GREEN packet came directly from the candidate production method and was never rewritten. Actual reply SHA256 is `147cc3793b34965cd31710fce9a58209e545d8a0614d5c66cf7393671d7bf276`.

The original qualification at `C:/Work/LumioGames/LumioGame/.run/wasm-v2-output-header-qualification-01` remains unchanged. It proved actual original Client header1 returns UnsupportedVersion=2 and only header2 succeeds. Its complete sealed report is `C:/Work/LumioGames/LumioGame/.sdd/101-20261004-wasm-v2-output-header-real-qualification.md`, SHA256 `46efa906ffdcda37accfe81a2e5dd4f85c009acc3233e76556ff365fd71fdc19`.

NEW GREEN evidence is `C:/Work/LumioGames/LumioGame/.run/wasm-v2-output-header-candidate-green-01`. Its verification SHA256 is `4679047f07cc4537f21ce6ed8e61e8b540d46f8f22e99334d7ef8715b427405c`; manifest SHA256 is `6b6ce59b619570879032d0ded8c1466b101df4eb35583a3ef971de1daf16a02b`. The manifest holds 43 private raw/proof records and a separately checked eleven-assembly dependency graph. Four actually loaded Lumio assemblies were recorded, not inferred from package names:

| Assembly | Actual version | SHA256 |
| --- | --- | --- |
| Lumio.Client.Engine.Wasm | 1.0.0.0 | d3c94a2e0e0de4fc5708afa8e4ad9c16ea5c7bf2c029ff9b633cab85dc2feabc |
| Lumio.Engine.NativeLoader.Hfsm | 1.0.0.0 | 6f55f2405b0921b0c809202c424221cccee34e1c19336c5fb69ef377d93d2fd0 |
| Lumio.GameRuntime.Coordination | 0.1.0.0 | a12f01f4eaca45ed0c478496747fda60599e3d8a7f3dfb67d98886f90a3c2b3f |
| Lumio.GameRuntime.Ecs | 0.1.0.0 | 7ba0ff0b711afa9bf2a427dfd069a70f2a3b416d3dd907b4979ebad680a93eec |

All eleven copied assemblies exactly match the author candidate's complete matching graph at `C:/Work/LumioGames/.101-pack07/LumioClientWasmV2HeaderRepair/.run/wasm-v2-header-repair-01/artifacts/bin/Lumio.Client.Engine.Wasm/release`. No formal12 DLL was substituted in place. Actual Client DLL CodeView matches its portable PDB and that PDB binds both production source checksums:

| Candidate source | SHA256 |
| --- | --- |
| Client/Engine/Wasm/EngineWasmCall.cs | f625b6300c0d15d088aa2687f439b381aade2db25ddc12b9d0e38df644abdfdf |
| Client/Engine/Wasm/EngineWasmPrediction.Selective.cs | 97530c17ae99cb842931100739e1e013c4067e2815fcd6381fe374b0336d50f6 |
| Client/UI/Spectator/tests/EngineWasmPredictionHeaderTests.cs | d8a79c8753f33f3715a46e3164c7c5691a5632f71601a24b7f63360c1618f919 |

The official12 WASM/JS/bindings remained byte-bound to manifest `704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766`. Candidate graph AssemblyVersion1.0.0.0 is its normal private source-build identity; formal release package identity remains Root's responsibility. This is a source-candidate/native ABI functional GREEN, not complete13 consumption or eight-player browser acceptance. Source files, original failure records, shared Game files and packages were not changed by this qualification.
