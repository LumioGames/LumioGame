# Bomber v0.0.4 Network Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Verify the current supported Bomber build with real v0.0.4 Platform, DS and eight independent Bot clients, and preserve precise evidence for any remaining failure.

**Architecture:** Consume the immutable Engine release and existing Game launcher/scenarios. Run a new isolated WSL Docker Compose project, then invoke the Windows launcher with its explicit Platform origin. Root owns service lifecycle, builds and evidence; the independent reviewer reads the resulting evidence without starting services.

**Tech Stack:** PowerShell, WSL Ubuntu-24.04, Docker Compose, .NET 10, Node.js, released Bot.Host.

## Global Constraints

- Continue after automatic pickup has passed its bounded independent review.
- Engine v0.0.4 digest: `sha256:40542bc045f6255d8788a974536018636f832ad40206ed765081587310931d77`.
- No Engine/Runtime/API edits, uint workaround, M2 admission, browser A/B or preview sessions.
- No long stability/replay/seed campaign, commit, push, reset, checkout or clean.
- Preserve existing services and dirty files. Clean up only this verification's processes and Compose project.
- Known 31 scalar-uint tests and unsupported duration/period Effects stay open; admission success is not full-match acceptance.

## Task 1: Verify Current Launch Inputs

**Files:** Read existing `games/101-bomber/{Tools/launcher.mjs,Client/Bots/BomberAdmissionScenario.cs,Client/Bots/BomberMatchScenario.cs,Engine/platform/docker-compose.yml}`. Write only reports under `games/101-bomber/.run/` unless a demonstrated Game defect requires a scoped reviewed fix.

**Interfaces:** Consumes the reviewed automatic-pickup source. Produces current Debug server/client Gameplay and Bots assemblies for the launcher.

- [x] Complete automatic-pickup review and collect C# build-lock release.
- [x] Run sequentially from `games/101-bomber`:

```powershell
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Debug -p:LumioEcsSide=server --nologo
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Debug -p:LumioEcsSide=client --nologo
dotnet build Client/Bots/Lumio.Bomber.Bots.csproj -c Debug --nologo
node --test Tools/launcher.test.mjs Tools/ds-ready.test.mjs Tools/ds-config.test.mjs Tools/account-client.test.mjs Tools/verify-evidence.test.mjs
```

- [x] Record assembly hashes and exact Engine/Platform identity. Three builds passed with zero warnings/errors; focused tests 130/130 passed.

## Task 2: Run Bounded Real Network Verification

**Files:** Create `.run/v004-network-admission/`, `.run/v004-network-match/`, and `.run/v004-network-report.md`. No browser or production changes planned.

**Interfaces:** Consumes current artifacts and official Compose; produces launcher `verification.json`, DS logs and each Bot's complete `result.ndjson`.

- [x] Verify port 18084 is free and project `lumio-bomber-v004-verify-0930` does not exist.
- [x] Start the isolated project with the official compose file:

```powershell
wsl.exe -d Ubuntu-24.04 -- env LUMIO_GAME_PLATFORM_DIR=/mnt/c/Work/LumioGames/LumioGame/games/101-bomber/Tools/compose LUMIO_PLATFORM_HOST_PORT=18084 docker compose -p lumio-bomber-v004-verify-0930 -f /mnt/c/Work/LumioGames/LumioGame/games/101-bomber/Engine/platform/docker-compose.yml up -d
```

- [x] Verify Platform health, seed completion and running container image digest before admission.
- [x] Run eight independent admission scenarios. Result FAIL: eight connected, five completed passing scenarios; Defender quarantined and terminated the DS.

```powershell
node Tools/launcher.mjs --admission-only --bots 8 --seed 101 --origin http://127.0.0.1:18084 --login-prefix VerifyV004Admission --spectator false --player false --evidence-dir .run/v004-network-admission
```

- [x] Run one real full-match scenario after admission recovery. H completed with FAIL: 8/8 admitted, primary result missing after timeout. Later scoped peer input repair passed review; legal eight-Bot probes exposed journal wire amplification and DS runtime failure. The default configuration gives 442000 ms of capped phases; 31375 owner frames and 687500 ms timeout include the scenario margins. Explicit 1000 ms duration avoids an additional timeout-length resident hold:

```powershell
node Tools/launcher.mjs --bots 8 --seed 101 --origin http://127.0.0.1:18084 --login-prefix VerifyV004Match --scenario-dll Client/Bots/bin/Debug/net10.0/Lumio.Bomber.Bots.dll --tour-ticks 31375 --timeout-ms 687500 --duration-ms 1000 --spectator false --player false --evidence-dir .run/v004-network-match
```

- [x] Preserve logs and diagnose DS interruption from Defender events 1116/1117. Independent field-read audit found no demonstrated Game lookup defect. Missing query-classification evidence and unavailable DS prevent further diagnosis.
- [x] Inspect per-Bot outcomes, uplinks, DS events, release bindings and steps 01-14; independent review at `.run/v004-network-failure-review.md`. Bot 2/3 results are missing.
- [x] Stop only `lumio-bomber-v004-verify-0930` using `down`. No matching Windows launcher children remain; the old browser stack was not touched.

## Task 3: Close The Supported Checkpoint

**Files:** Update `.sdd/progress.md`, the presentation plan, and `.run/{v004-network-report.md,two-chip-hud-fix-report.md}`; regenerate the existing cumulative HUD diff/inputs.

- [x] Run HUD audit: 3311 baselines, 306 paths, 695845 bytes, hashes unchanged. Automatic pickup has its separate native-baseline task package.
- [x] Run identity verifier: zero diagnostics, inventory consistent, freeze=false. No ledger edit required.
- [x] No client source changed during automatic pickup/network verification; the existing published visual checkpoint remains attributed to its unchanged client.
- [x] Record supported behavior and limitations in `.run/v004-network-report.md` and `.sdd/progress.md`. Full migration remains incomplete.

## Latest Diagnosis

Defender recovery: unchanged official EXE, supported intelligence update to
1.459.471.0, two clean scans, protected runs without new quarantine. Microsoft's
classification cause remains unconfirmed. Admission budget and Game peer input
repairs are independently reviewed. Damage regression is intentionally RED;
production Effect repair and successor respawn are still incomplete.

Root measured repeated complete `BomberPresentationJournal.entries` values in
the same WorldChange; actual frames exceed the production 65536-byte ceiling.
A diagnostic 262144-byte ceiling only delayed DS failure, and was not adopted.
See `.run/journal-wire-audit.md` for exact wire/source evidence, repair boundaries
and limits. Overall full-match acceptance remains FAIL.

All 81 recorded processes from H/I/J/L/M/N/O/P/Q are absent, 72 ticket headers
redacted, and the isolated Compose project has been removed with an empty final
filtered container query. No browser, M2, stability campaign or Engine edit.
