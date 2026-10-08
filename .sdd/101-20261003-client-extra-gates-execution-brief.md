# Client Spectator / BrowserReplica extra gates — read-only execution brief

Date: 2026-10-03. Reviewer: registry_bounds_review. This brief reads actual CI, project files and Root's current runner; it runs no build/test/format/restore/GEN/Native and changes no source/index/ref. Root owns execution.

## Decision and evidence scope

Three additional invocations are needed: Spectator test-project build, that project's independent test run, and ECS build with `LumioBrowserReplica=true`. `LumioClient.slnx` does not contain Spectator projects. Root's current runner always selects the solution and does not set BrowserReplica; its prior 12-project/1260-result evidence cannot cover these entries. Current CI explicitly builds both extra project paths, but its test jobs select the solution: the separate Spectator test run below is the requested complementary local gate, not an assertion that CI already executes it.

The ECS flag selects Runtime Coordination/Gas/Hosting/Ecs/Replication/Simulation references at netstandard2.1. Spectator tests target net10.0 and explicitly select Simulation net10.0. Their output graphs must be isolated from each other and from the existing solution artifacts. BrowserReplica compilation needs no wasm workload; it does not prove a browser/WASM host ran.

Primary sources read under `C:/Work/LumioGames/LumioClient-101-successor-correlation`:

| Source | SHA256 |
|---|---|
| `.github/workflows/dotnet-test.yml` (extra builds lines 72–76) | `c5c74579307b7536538df25373c11e31f6d32ea9a493b1b1ae76c913ff7730f3` |
| `global.json` | `c39786ab1a147662bbe4db015f900165178875ec4a872ddae53bc0c90771ac34` |
| `Client/UI/Spectator/tests/Lumio.Client.Spectator.Tests.csproj` | `4add1fdcfb3509fea78dd2507e01c816316eecce9e8e8116fb603d4f5687583c` |
| `Client/Gameplay/ECS/src/Lumio.Client.Gameplay.ECS.csproj` | `3663658ff00889173c5479ff969ed22a461f4a4f8607c02a00303d61e5439a06` |
| `eng/assert-no-skipped-tests.mjs` | `5ef80b8ecdf5cc08f5ef7b9ab87eaa2dd150311629d457629b91bf057fa8f224` |

Root runner `C:/Work/LumioGames/LumioGame/.run/client-correlation-full-20261003/runner-build01.ps1` SHA `08110e6d442999ff41c14d6fb8edd0cb1fa0f40a903508d42000ac4ee0148171`. Formal compiler/pack brief `.sdd/101-20261003-config-compiler-formal-rebuild-brief.md` SHA `f592eb2f68d50047468172012d1478f5a791e70c3a1da7886dfc249d532e0247`; these gates add local evidence, not a formal provider package or DLL replacement.

## Environment and prerequisites

Working directory: `C:/Work/LumioGames/LumioClient-101-successor-correlation`. Resolved executables were read, not invoked: `C:/Users/g923/.dotnet/dotnet.exe` and `C:/Program Files/nodejs/node.exe`. `global.json` requires stable SDK **10.0.400**, rollForward `disable`; Root must record actual SDK/tool identity when executing. Current CI requests Node 22.16.0; this review does not claim the resolved local Node has that version.

Use owning Runtime `C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity` and Engine `C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e` through both explicit root properties below. Preserve Root runner's environment:

| Variable | Required value |
|---|---|
| `LUMIO_ENGINE_ROOT`, `LUMIO_ENGINE_SDK_ROOT` | owning Engine path above |
| `LUMIO_NATIVE_TEST_PATH`, `LUMIO_ENGINE_NATIVE_PATH` | `C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e/.run/98f0b5cc59921aee988143d9c99b26ba/win-x64/run-lefheR/lumio_engine_native.dll` |
| `LUMIO_NATIVE_TEST_BUILD_ID` | `98f0b5cc59921aee988143d9c99b26ba` |
| `LUMIO_NATIVE_TEST_ABI_HASH` | `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3` |
| `LUMIO_CONTRACT_REQUIRED` | `1` |
| `MSBUILDDISABLENODEREUSE` | `1` |
| `DOTNET_CLI_UI_LANGUAGE` | `en` |
| `DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE` | `true` |

Revalidate actual Native SHA `d69b728b2b90954655bbad157f19e1e1000fcefc0183dd4f660576a410ea6806` and adjacent build-info.json `buildId`, `rid=win-x64`, `abiHash`, `testSupport` containing `hfsm-test-support` before execution. This is existing **test-support Native**, not a production Native replacement. Record it as such. Do not reproduce CI's checkout-local overwrite of Engine Directory props on the owning frozen Engine tree.

`Client/UI/Spectator/Directory.Build.props` supplies C#14, warnings-as-errors, nonproduction project status, non-CPM and no lock-file generation for that subtree. Preserve those settings. Do not force their exceptions globally onto production dependencies. CLI `RestoreLockedMode=false` and fresh lock paths below follow Root's existing isolated runner policy; do not edit tracked locks or dependency declarations. Record/inspect inherited MSBuild environment and any `CustomAfterMicrosoftCommonProps` override so an old lock-paths.props cannot redirect fresh outputs. The explicit BrowserReplica false/true below protects each graph from an inherited flag.

## Exact local execution argv

Proposed fresh proof root `C:/Work/LumioGames/LumioGame/.run/client-extra-gates-20261003-01` did not exist at review. Recheck immediately before use; if occupied, select a new numbered root and record it. Use serial execution under Root's heavy-process fence. The following is a preparation snippet, **not executed by this review**. Each external command must have its own saved log, immediate `$LASTEXITCODE`, start/end source manifest and output identities; do not run the test after a failed build.

```powershell
$taskDotnet='C:/Users/g923/.dotnet/dotnet.exe'
$taskNode='C:/Program Files/nodejs/node.exe'
$taskClient='C:/Work/LumioGames/LumioClient-101-successor-correlation'
$taskEngine='C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e'
$taskRuntime='C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity'
$taskProof='C:/Work/LumioGames/LumioGame/.run/client-extra-gates-20261003-01'
Set-Location -LiteralPath $taskClient
$taskCommon=@("-p:LumioArchRoot=$taskEngine","-p:LumioRuntimeRoot=$taskRuntime",
  '-p:UseSharedCompilation=false','-p:RestoreLockedMode=false',
  '-m:1','-nodeReuse:false','--nologo')
$taskSpectator=@("-p:ArtifactsPath=$taskProof/spectator/artifacts",
  "-p:NuGetLockFilePath=$taskProof/spectator/locks/`$(MSBuildProjectName).packages.lock.json",
  '-p:LumioBrowserReplica=false')+$taskCommon
$taskReplica=@("-p:ArtifactsPath=$taskProof/browser-replica/artifacts",
  "-p:NuGetLockFilePath=$taskProof/browser-replica/locks/`$(MSBuildProjectName).packages.lock.json",
  '-p:LumioBrowserReplica=true')+$taskCommon

& $taskDotnet build Client/UI/Spectator/tests/Lumio.Client.Spectator.Tests.csproj -c Release @taskSpectator
# Capture build child exit immediately; only continue on success + unchanged inputs.
& $taskDotnet test Client/UI/Spectator/tests/Lumio.Client.Spectator.Tests.csproj -c Release --no-build --no-restore --logger 'console;verbosity=normal' --logger trx --results-directory "$taskProof/spectator/results" @taskSpectator
# Capture test child exit immediately, independently of the following ledger exit.
& $taskNode eng/assert-no-skipped-tests.mjs "$taskProof/spectator/results"

& $taskDotnet build Client/Gameplay/ECS/src/Lumio.Client.Gameplay.ECS.csproj -c Release @taskReplica
```

The test's `--no-build --no-restore` is valid only after this exact Spectator build succeeds with identical properties, inputs and its private artifacts intact. A solution build alone does not establish that precondition. Both explicit builds restore their own graph; no separate restore gate is necessary. Save expanded argv, raw child exits and tool identities rather than treating this illustrative command block as evidence of execution.

## Required closure evidence and remaining limits

* Freeze current Client/Runtime/Engine tracked source plus every relevant untracked input (including correlation fixtures/new source), project/props/package files, preexisting status and Native identities before execution; compare actual bytes afterwards. Current runner's tracked-files plus one fixture-directory enumeration is useful precedent, but does not automatically cover any other untracked input.
* For Spectator: build raw exit 0; separate test raw exit 0; fresh flat results-directory TRX counts with failures 0 and skipped/ignored/notexecuted 0, plus actual test DLL and loaded dependency hashes. The Node ledger rejects missing TRX and skips, but does **not** independently reject failed test outcomes: retain test exit and failed count. Do not import the old solution's 1260 results or guess a new count.
* For BrowserReplica: build raw exit 0 and actual diagnostic counts; record ECS netstandard2.1 output and Runtime reference output hashes/TFMs under its separate artifacts. Confirm the property was true in the recorded argv. Do not reuse those assemblies for a previous solution/Spectator run without rebuilding and re-establishing identity.
* This closes the additional managed compilation/test entries only after actual evidence arrives. It establishes neither actual browser-host execution nor new official package identity. The separate Spectator browser host project and `eng/run-browser-tests.mjs` have their own portable EngineWasm/WASM/Playwright/Chromium prerequisites; the two CI extra build commands do not prove them. Full provider packaging still needs final owning commit/clean gates and the formal controlled pack procedure; no DLL swapping.

No execution result is claimed in this brief. Existing 1260/1260 and subsequent format/build/test rounds retain their own exact input and DLL scope.
