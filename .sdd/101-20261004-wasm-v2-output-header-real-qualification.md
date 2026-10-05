# Official12 real WASM V2 output-header qualification

Verdict: CONFIRMED_OFFICIAL12_WASM_V2_HEADER_ROOT_CAUSE_WITH_REAL_PRODUCTION_PACKET. The unchanged official12 Client produces version1 for a V2 selective read trace. Its actual packet returns UnsupportedVersion2 from official12 WASM. Changing only that trace header to2 on the same actual world/session/token reads the loaded Ready cell successfully. No production, old package, browser, service, version or schema-pin changes were made.

Private evidence root: C:/Work/LumioGames/LumioGame/.run/wasm-v2-output-header-qualification-01. Complete12 source is C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-12; manifest704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766. The actual JS module, WASM binary and bridge/bindings are hashed against that manifest before execution; no Native build or simulated provider is used.

## Native contract result

The private fixture reuses the real Engine sdk-wasm bridge/render-world fixture's context/world/section-delivery mechanics, with current product context256MiB and prediction64MiB/512/4096/... budgets. A real world receives a Uniform section at revision41, and a real session supplies the live nonzero BeginUpdate token. Header sizes and layouts are the official generated ABI, not proposal DTOs.

C:/Work/LumioGames/LumioGame/.run/wasm-v2-output-header-qualification-01/native-header-03/result.json SHAfc57f3cf8259ae67acbd0665abd028c85ba8e99d2bca2c009da7f56a61846910:

- Header1: status2 UnsupportedVersion; payload and256-access sentinel buffers unchanged, trace header unchanged.
- Header2: status0; Ready, HasBlockId=true, BlockId65536, SectionRevision41; full trace written=required=1 and complete=1. Actual access contains section0/0/0, cell0, readKind1, presenceReady, reserved0, revision41, sourceJournalKey0. The remaining255-access sentinel tail is untouched.
- Header2 with zero access capacity: status5 BufferTooSmall, payload untouched, written0/required1/complete0. Native session remains healthy; CompleteUpdate, Close, world destruction and context close/release all succeed.

The actual Node test is1PASS/0FAIL/0skip, outer rawexit0. Each real packet/reply is saved as a binary with its hash, operation and status in result.json.

Private attempts01 and02 had test assertion errors: first read VoxelBlockReadResult.Presence at offset0 as if it were HasBlockId (actual byte4), then incorrectly assumed BufferTooSmall3 (actual official status5). Their original test bytes and Native packet/reply outputs remain preserved. They are not production behavior RED. The two real header statuses were already2/0 in those runs; only attempt03 supplies the complete correctly decoded contract qualification.

## Unchanged Client production method result

A small private CLR fixture directly references the official12 web/replica/netstandard2.1 assemblies. It invokes the unchanged internal EngineWasmVoxel constructor through a private DynamicMethod solely to access its existing constructor taking ReadOnlySpan<byte>; the constructor creates a real world through the official bridge. No private fields, bindings or session handles are fabricated. EngineWasmPrediction.Open and Begin supply the actual interface/session/token, followed by the real IVoxelSelectivePredictionSession.ReadSelected implementation. Its byte transport is a pipe to the actual official12 Node WASM bridge; all packets are preserved. This private dispatch is not browser JS marshalling or a real browser input/session run.

Build01 succeeded raw0/0warnings/0errors in2.66s, with no source graph, generator or Native rebuild. Its artifacts/cache/output are private. Run01 looked under the assembly name instead of the project's artifacts directory and therefore never executed the assembly; its raw failure remains administrative INVALID evidence.

Actual Run02 executes C:/Work/LumioGames/LumioGame/.run/wasm-v2-output-header-qualification-01/artifacts/bin/Fixture/release/Official12WasmV2HeaderQualification.dll. Functional expectation is Success0 on the actual loaded Ready cell; unchanged production ReadSelected returns2. The fixture closes all resources first, then throws the explicit functional assertion. **Actual dotnet rawexit is -532462766 (unhandled assertion exception,0xE0434352); the private PowerShell wrapper/tool returns1.** These must not be conflated. LogSHA11c8d72371f131cd0bc13eb601057918b4db874af69b9e42a20c160de34b8307; production-client-result.json SHAf6ecceca95efc3aaa23692f9eb2d88c4b60ca32060253a9f708659e60be68e3f.

Production packetSHA67a95faa8071a4cdf00900025aa92f6bd8939248eb3f62f5dbd8d4477821b423 contains actual32-byte trace output header/version1 and256×40bytes access capacity. A NEW comparison packet changes exactly byte168 from1 to2, SHAa621fb49331ee1295aa1689bb1e1cbf967daa3354a4c2bcc43778833480a79ca. All world/session/token/visible keys/cell/output sizes are identical; actual Native returns0 and the complete correct trace above. This is an explicitly labelled one-byte Native counterfactual, not a candidate compiled Client GREEN.

Actual Node production-packet-01/result.json SHA03bb0f9254c068321762bcb41cbcd36fde2a56a0016a2d73c903f0ad2a1c76cd. Production Open0/Begin0/Stats0/faulted0/Complete0/Close0 and Node exit0 are recorded. The unchanged actual Client assembly SHA535174274ef77c366a281b2405c8cafe7694459fc277f04fba33e1133ab27faf and its four loaded Lumio assemblies have explicit Default ALC identities/paths/hashes. The seal independently verifies all20 copied official web DLLs against the original complete12 manifest and source bytes; no old DLL, Native overlay or ignored AssemblyVersion is involved.

## Owning source cause and limits

C:/Work/LumioGames/.101-pack07/LumioClient12Composition/Client/Engine/Wasm/EngineWasmCall.cs:38–43 writes version1 for every Versioned<T>(). Its EngineWasmPrediction.Selective.cs:26 uses that method for PredictionQueryTraceResultV2; the other selective working queries and correction have the same header mismatch. C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure/engine/native/modules/sdk-native/src/voxel/prediction/selective.rs:250–259 requires version2 before accessing the session/query and returns UnsupportedVersion2 for1. Desktop VoxelFacade selective consumption uses the correct version2, explaining why native desktop regressions did not exercise this browser adapter defect.

In the formal Runtime, GasJointPrediction.Read calls QueryUnavailable; status2 goes through CheckStatus at GasJointPrediction.cs:388–403, sets failure status and Fault, closes joint publication and throws. Header rejection happens before the selective query's Native trace traversal. The previously identified722-cell/10KiB-per-call cost mechanism is source-real, but **this failed first selective read does not prove that722 successful traversals happened or that all-grid cost caused this first-input failure**.

Root's preserved real browser first-input fault and this original-method failure form a strong same-path causal explanation. This fixture did not capture the original browser packet or reproduce the browser logout/session lifecycle; those remain separate actual browser evidence. The later DS death-structure failure is also separate and is not explained by this Client header repair.

Source fix belongs only to Client: preserve V1 defaults, explicitly use version2 for the six V2 output callers, keep Native output header/size/token/trace/capacity guards. Author browser_perf_trace owns that independent TDD candidate; no production fix was written here. Its source-level tests and eventual official complete package/browser rerun must demonstrate the candidate. This report does not pass eight-player movement, reentry, continuous held-input or performance acceptance.
