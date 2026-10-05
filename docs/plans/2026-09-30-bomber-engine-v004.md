# Bomber Engine v0.0.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the actual 101-bomber engine dependency and product version to 0.0.4, with current restore, generation, build and test evidence before presentation work starts.

**Architecture:** Consume the complete immutable LumioEngineRelease tag through the existing Engine/ layout. Preserve the current dirty release tree before replacement. Keep SDK, native, hosts, web assemblies and Platform image on one release; preserve all published gameplay identities.

**Tech Stack:** PowerShell, .NET 10, C# 14, Node.js, TypeScript, Vite, Vitest, released Lumio SDK.

## Global Constraints

- User attachment controls scope and order: v0.0.4, presentation, skills, networking.
- No browser A/B or preview network sessions.
- Preserve existing dirty changes; no reset, checkout, clean, commit or push.
- The user's follow-up instructs repairing issues and continuing after the explicit release-installation clarification. Install only the complete official v0.0.4 release, preserving the original dirty tree and Git state. Do not patch Engine/Runtime implementation or public engine API.
- No uint workaround, M2 admission, or unsupported duration/period Effect implementation.
- Tests against the old engine or an isolated candidate do not prove installation into this workspace.
- Generated declarations, readers and exports must use their generators.

## Task 1: Identify and Verify the Release

**Files:** Read `games/101-bomber/Engine/manifest.json`, `Directory.Build.props`, `Directory.Packages.props`, `Directory.Build.targets`, `NuGet.config`, `Client/UI/Spectator/Directory.Build.props`, `Tools/engine-release.mjs`, `Tools/update-engine.mjs`, `Tools/schema-identity-read.mjs`, `Gameplay/Compatibility/schema-identities.json`, `Client/Presentation/package.json`, `Client/Presentation/pnpm-lock.yaml`, `Tools/compose/platform.env`, and `.github/workflows/bomber-101.yml`.

**Interfaces:** Existing MSBuild `LumioSdkVersion` comes from Engine/manifest.json; every runtime path comes from Engine/. No alternate SDK or host path is introduced.

- [x] Inspect root status, diff stat and diff; inspect Engine HEAD, gitlink and dirty status.
- [x] Resolve official tag v0.0.4: annotated tag `a1e2be6f0e6a286d7d16ba9f4bce6ac65eb12493`, commit `80ec8e9257d39856a90bbe430bcd511a3fd0bf06`.
- [x] Download candidate into `.run/LumioEngineRelease-0.0.4`; run its verifier for win-x64 and linux-x64. Both verify 233 manifest files.
- [x] Archive the original Engine/ tree to `.run/engine-before-v004-upgrade-20260930.tar`; extract separately and compare all 133 files including the .git pointer byte for byte.
- [x] Capture current-state input evidence with `node .run/audit-engine-v004-preflight.mjs`.
- [x] Resolve official-release replacement and gitlink update: after the explicit clarification, the user directed continuing repairs instead of stopping. Apply this to the immutable dependency installation only; preserve the original tree and Git state, and keep other constraints in force.

## Task 2: Install and Align Version Consumers

Game-owned metadata and mismatch guards can be prepared before installing the
release. This does not authorize Engine replacement or count as an installed
upgrade. The next bounded task is `.run/v004-game-version-brief.md`; root owns
provenance/generation follow-up and the final installed release gate.

**Files:** Official Engine/ release tree and parent gitlink only after authorization; game root and Spectator `Directory.Build.props`; `Client/Presentation/package.json`; `Tools/compose/platform.env`; `Tools/schema-identity-read.mjs`; `Tools/schema-identities.test.mjs`; generated `Gameplay/generated/{server,client}` and `Gameplay/Compatibility/schema-identities.json`; current version descriptions in game README, `.spec/AGENTS.md`, Tools README and parent Bomber CI.

**Interfaces:** Manifest version `0.0.4`; Engine source `54930d947a4432e83a45fa5215e38dc08aee12f5`; Runtime source `d287bcd009a740de45fb279f26aa145ea1d200d5`. Consumer paths remain Engine/.

- [x] Install the complete official release after preserving and rechecking the original dirty tree. Parent gitlink and Engine HEAD equal the peeled release commit. The custom reviewed installer preserved working files, submodule Git data and the parent index without running the prohibited updater operations.
- [x] Set product `Version` to `0.0.4` in both independent MSBuild property scopes, set Presentation package `version` to `0.0.4`, and set `Platform__Allocations__bomber__GameReleaseId=bomber-0.0.4`. Leave third-party versions, SDK managed compatibility `0.1.0`, base-map versions and historical fixtures alone.
- [x] Keep NuGet lock generation disabled as documented. The pnpm lock has no root product-version entry; regenerate only if actual dependency inputs change.
- [x] Audit the official candidate generator in scratch: 77 sources and 66 generated files match current bytes. Admit this exact provenance tuple in `reviewedPackages` (independent spec/quality review approved with no findings; `.run/v004-provenance-review.md`):

```js
['54930d947a4432e83a45fa5215e38dc08aee12f5', 'd287bcd009a740de45fb279f26aa145ea1d200d5', '0.0.4', true]
```

- [x] Update manifest-provenance negative tests using parsed JSON values instead of assuming the old prerelease string exists. Keep unknown engine revision, unknown runtime revision, mixed provenance and unknown version rejection.
- [x] Independently review game-side metadata/guards and provenance preparation; verify the unchanged installed tree against its 133-file backup and run the standalone read-only identity verifier (exit 0, zero diagnostics, freezeEligible=false). These checks do not establish installed v0.0.4 acceptance.
- [x] Regenerate both sides through the actual installed Engine after replacement; all 66 outputs equal the reviewed release audit.
- [x] Refresh identity provenance and evidence with the existing observation/history comparison APIs. Preserved owners, values, shapes, retired/pending/transitions and `freezeEligible=false`; preserved Ability ID 5 and character IDs 118001 through 118005.
- [x] Update current version descriptions to the verified installed version. Historical audit results remain historical.

## Task 3: Verify the Installed Workspace

Run from `games/101-bomber` unless a command says otherwise. Do not advance on zero tests, missing outputs or a candidate-only pass.

```powershell
node Engine/tools/verify-release.mjs --root Engine --rid win-x64
dotnet msbuild eng/ResolveLumioSdk.proj -getProperty:LumioSdkVersion,LumioEngineRoot,LumioSdkResolved
dotnet restore LumioBomber.slnx --force-evaluate
dotnet build LumioBomber.slnx --no-restore
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Release -p:LumioEcsSide=client
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Release -p:LumioEcsSide=client -p:LumioBrowserReplica=true
dotnet build Client/UI/Spectator/tests/Lumio.Bomber.Client.Spectator.Tests.csproj -c Release
dotnet test LumioBomber.slnx --no-build -- --minimum-expected-tests 1
node --test Tools/engine-release.test.mjs Tools/foundation-boundaries.test.mjs Tools/schema-identities.test.mjs
node Tools/verify-schema-identities.mjs --bootstrap-ref fab6f08ebe717614c04383a71d1e25ea6c071711
npm --prefix Client/Presentation run typecheck
npm --prefix Client/Presentation run build
npm --prefix Client/Presentation run guard
node eng/spec-lint.mjs
```

- [x] Check restored SDK version/content hash, generated registries, output deps.json and .NET assembly product version in both MSBuild scopes. SDK archive, 91 consumed cache files, registries and four product assemblies verified. Server, client, browser and Spectator deps.json each contain exactly Gameplay/0.0.4 and SDK/0.0.4 for the two product dependency names.
- [x] Run the existing scalar uint snapshot and outgoing-candy restore cases on this release; final full run is 390/421 with exactly those 31 known failures and zero skips. No field types changed.
- [ ] Run the engine updater tests only after resolving their use of prohibited git operations in temporary fixture repositories. Do not silently broaden the authorization.
- [ ] The identity suite also has two CLI fixtures that create commits. Until that operation is authorized, run the remaining identity checks with those two cases explicitly filtered and report the reduced scope; do not label it a full-suite pass.
- [x] Record exact passed/failed/skipped counts and exit codes in `.run/v004-installed-report.md`; current expected and actual engine version is exactly `0.0.4`.
- [x] Have a separate reviewer check version propagation, generated identity preservation and dirty-change preservation. Installed-stage recovery review approved the bounded task; its Release server evidence gap remains below.
- [x] Rebuild `Gameplay` with `-c Release -p:LumioEcsSide=server` and inspect its actual deps/assembly versions. The character worker rebuilt this configuration on 2026-09-30; root directly verified both dependency names are 0.0.4 and the product version is 0.0.4+0ecaf6e3b66a116f98f464131066039467a5393d. The prior stale Release output is replaced.

## Downstream Requirements Remain Open

Current status: active. Official installation and actual restore/builds are
verified. The user directed recording issues, repairing and continuing; proceed
with independent Game work while keeping the 31 known SDK uint failures open.
Installed-stage independent review approved the bounded task; its Release-server
verification gap was repaired and directly verified on 2026-09-30. The full goal and full functional
acceptance are not complete; no uint workaround or M2 admission is permitted.

The full objective is unchanged. After Task 3 passes, resume presentation using the existing presentation plan plus `.run/character-selection-boundary-brief.md`: real Tick boundary locking, both browser guards, five characters, scene/UI/assets, movement/camera, desktop/mobile fixtures, focused/full tests, build and identity checks. Then complete HUD input regression/config evidence and `.run/automatic-pickup-{brief,scope}.md` strictly within its ownership. Networking is last and requires current release evidence without M2 admission or canceled browser previews.

The v0.0.4 candidate still documents `EffectFrameOrder.OnDuration` and `OnPeriod` as unimplemented. Supported slices may not be represented as complete duration/period skills. No stage has been accepted by this plan.
