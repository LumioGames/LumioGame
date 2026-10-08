# Bomber online Prepare refusal diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the existing `PrepareSuccessor` refusal that leaves a real online player's death pending, without changing the result or clearing the pending death.

**Architecture:** Root owns one private Game diagnostic source derived from the current ordinary source. The existing component read is bound to a local variable and the existing non-null error branch prints at most sixteen records when explicitly enabled. An independent agent reviews the inverse source equality and actual baseline/diagnostic execution before this source is used in a separate real browser scene.

**Tech Stack:** Existing .NET 10 Game project, official complete-release-14 SDK and Native, existing real Platform/DS/browser harness, Windows PowerShell and Node evidence scripts.

## Global Constraints

- Preserve branch `feat/101-bomber-engine-foundation`, all staged/uncommitted source, all older evidence and the running DS18316/A73/B74 scene.
- Do not reset, clean, stage all changes, replace a DLL inside an old execution graph, lower player/Bot counts, disable voxels, lower simulation rate, weaken quotas or bypass protocol guards.
- Ordinary `Gameplay/BomberSuccessorLifecycle.Server.cs` SHA256 remains `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de`.
- Official complete14 manifest is `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9`; Native is `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`.
- No new public semantics, owner authorization, Runtime query, gameplay state, gameplay clock, input, token, AUTH or Welcome is introduced. Original failure remains a failure.
- Existing ordinary schema16 pins/ledger are not updated for a diagnostic. Every new output is labelled private measurement, not a qualified formal release.
- No credentials, tickets, account names or network payloads are written by the probe. Log only existing error code and Game/Observer identities already read in this method.

---

### Task 1: Bounded private refusal source and paired real execution

**Files:**

- Create private root: `.run/live14-online-prepare-refusal-01/`.
- Create exact input manifest and isolated Game input beneath that root. Copy normal source/build/config inputs, excluding `.run`, `bin`, `obj`, `.git`, `node_modules` and the read-only `Engine` checkout; consume complete14 through `eng/select-engine-release.mjs`.
- Modify only the isolated `game-input/Gameplay/BomberSuccessorLifecycle.Server.cs`.
- Reuse unchanged actual fixture source `.run/offline-controlled-death-reproducer-01/candidate-game-02/OfflineControlledDeathExpiryTests.cs`, SHA256 `223fe1f28cef3246721796e7ace29ebf07d5ce432cc8e97312968e271eb6afdc`, through normal `Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj` inputs. Record its deliberately unresolved offline baseline separately from the online healthy case. This fixture covers death and expiry, not restoration or controlled readmission.
- Create preparation, build, source-inverse and evidence scripts beneath the private root; normal repository production source is read-only.

**Interfaces:**

- Consumes unchanged `WorldManager.PrepareSuccessor(participant, oldLife, generation, out token)` result and the existing `world.Get<ObserverComponent>(oldLife)` read.
- Produces only bounded stderr records headed `BOMBER_SUCCESSOR_PREPARE_REFUSAL_V2`; no function exposed outside this private Game type.

- [ ] **Step 1: Freeze and test the source transform before constructing the private candidate.** Assert the original two replacement sites occur once, assert a candidate inverse is byte-for-byte the original, and assert original ordinary hash is still exact. A wrong original hash or repeated replacement site must stop preparation. Store original and transformed source plus per-file manifest in this new root.

- [ ] **Step 2: Add exactly these private declarations and substitutions.** At the start of the existing class add:

```csharp
private static readonly bool PrepareRefusalDiagnosticEnabled = string.Equals(
    Environment.GetEnvironmentVariable("LUMIO_BOMBER_DIAG_SUCCESSOR_PREPARE"), "1", StringComparison.Ordinal);
private static HashSet<(NetEntityId Participant, NetEntityId Life, ulong ObserverGeneration, bool Connected, string Code)>?
    _prepareRefusalDiagnosticKeys;
```

Replace the existing inline Observer read with the same single read:

```csharp
ObserverComponent observer = world.Get<ObserverComponent>(oldLife);
controlled = observer.ConnectionGeneration != 0;
```

Replace only `if (error is not null) return false;` with:

```csharp
if (error is not null)
{
    if (PrepareRefusalDiagnosticEnabled)
    {
        _prepareRefusalDiagnosticKeys ??= new();
        if (_prepareRefusalDiagnosticKeys.Count < 16 &&
            _prepareRefusalDiagnosticKeys.Add((participant.Entity, oldLife, observer.ConnectionGeneration, observer.Connected, error)))
            Console.Error.WriteLine(FormattableString.Invariant($"BOMBER_SUCCESSOR_PREPARE_REFUSAL_V2 tick={world.Tick} participant={participant.Entity.ToHex()} life={oldLife.ToHex()} generation={participant.LifeGeneration.Value} connected={observer.Connected} observerGeneration={observer.ConnectionGeneration} lifePhase={participant.LifePhase.Value} deathTick={participant.DeathStructureTick.Value} lastLife={participant.LastLife.Value.ToHex()} intent={state.IntentGeneration.Value} nextLife={state.NextLifeGeneration.Value} eligible={state.Eligible.Value} code={error}"));
    }
    return false;
}
```

The original successful reservation assignments and every return remain unchanged. The probe is default-off, and a disabled/error-free call does not allocate the set, format a log string or read the environment again. The at-most-sixteen-entry set is diagnostic metadata only and never selects gameplay behavior. Full typed IDs are retained as keys; a repeated offline error cannot consume all sixteen lines, and a changed Observer epoch or connected state can receive its own record. One DS executes this owner-bound method serially, matching its existing World owner access; the probe adds no second scheduling path.

- [ ] **Step 3: Build the complete new consumer outputs.** Use original official selection, isolated NuGet/lock/artifact outputs and the normal server, Bot/client, browser Gameplay and browser publish projects. Preserve every raw build result, including warnings/errors. Compile baseline and diagnostic Game test executions independently against the same complete14 SDK/Native; no copying an old DLL into either graph. Put each test artifact/execution tree beneath its own `game-input/.run/` so original `EngineRelease.FindRepoRoot` walks to that exact `LumioBomber.slnx` and its Server assets. Verify the produced normal `runtimes/win-x64/native/lumio_engine_native.dll` and sidecar are complete14 `e15c…`; the normal test ModuleInitializer selects that asset and can override a shell Native path.

- [ ] **Step 4: Run the unchanged two actual Native fixture cases in baseline, diagnostic-off and diagnostic-on processes.** Use the full `Lumio.Bomber.Gameplay.Tests.OfflineControlledDeathExpiryTests` class filter, `--minimum-expected-tests 2 --fail-skips on`, and each newly built execution's actual apphost. Set `BOMBER_OFFLINE_DEATH_EVIDENCE` to a different new evidence directory for each process; the unchanged fixture requires it. Set/unset `LUMIO_BOMBER_DIAG_SUCCESSOR_PREPARE` before process launch because its static readonly flag is read only once. Preserve raw counts/TRX/stdout/stderr. Require the same per-test outcomes and same actual Game death/full entity IDs/expiry/health/pending behavior in all three; compare logical tuple equality within each run, not independently random World incarnations/tokens. Expect one connected PASS and one offline FAIL on official14, but treat that as an expectation until actual execution confirms it. The official14 unresolved offline case is a qualified RED, not an acceptance claim. Require zero probe records off, a real non-null refusal record on for that unresolved case, zero queries added by the new probe, and no probe-dependent state differences. The unchanged fixture itself already has a test-only additional Prepare call; that remains byte-for-byte the same in all executions. Diagnostic success is capturing the refusal while preserving the original behavior.

- [ ] **Step 5: Freeze and dispatch independent review.** Save source inverse equality, manifests, PDB/PE source binding, complete managed graph identities, exact package/Native and paired test outcomes. A non-author reviewer must reject changed guards, mixed graphs, incomplete fixtures, credential logs or unbounded logging. Private scripts/probe have no formal commit or ordinary pin migration; this diagnostic-only work is not a delivered gameplay fix.

### Task 2: Real online refusal capture in a separate coherent scene

**Files:**

- Create new private profile/runner/scene beneath `.run/live14-online-prepare-refusal-01/` and `games/101-bomber/.run/browser-experience-repair-01/live-14-online-refusal-01/`.
- Reuse exact reviewed complete14 runner operations and original Platform quotas. Use a separate trusted local test profile with Platform18089, DS18317 and page18104; verify those exact ports are unused before setup. Existing 18081/82/84/85/88, 18101/02 and 18316 remain untouched.
- Create normal launch response binding evidence for all six release/room/allocation/endpoint/audience/contract fields, real source/PDB/package inventories and default-off/on diagnostic identity.

**Interfaces:**

- Consumes independently reviewed Task 1 outputs, a full copy of official complete14 runtime, normal signed launch responses and two distinct real players plus six real Bots.
- Produces actual browser screenshots/DOM probes, actual DS refusal logs, real close/new-page inventory, and correlated death/connection/binding times.

- [ ] **Step 1: Create the separate local registration using original provisioning tools and unchanged quotas.** Set the exact local endpoint `ws://127.0.0.1:18317/` and a unique room/allocation in this profile. Verify Platform health and all actual signed response bindings before starting the new DS. This is local diagnostic registration, not public publishing approval.
- [ ] **Step 2: Start the whole new consumer graph with `LUMIO_BOMBER_DIAG_SUCCESSOR_PREPARE=1`.** Verify the actual DS process environment and logged private source hash; the launcher environment alone is not evidence of browser inheritance. Use unchanged ordinary14 browser payload initially so this probe cannot be mistaken for a movement optimization.
- [ ] **Step 3: Use actual browser UI to enter both players, perform normal inputs, and truly close/reopen one player around genuine death and life transitions.** Save each real inventory and first visible screen. Correlate the earliest refusal record to the actual admitted connection and native/Game death checkpoint. A healthy counterpart is retained; no artificial death, state clearing, rule simulator or reduced-player test substitutes for this observation.
- [ ] **Step 4: Give the exact first refusal and preceding normal sequence to the existing online Runtime investigation.** Only a reproduced failure with the same code and tuple can justify a production fix. Continue normal performance measurement independently; this probe does not establish the lag root cause.
- [ ] **Step 5: Preserve the diagnostic scene/evidence and keep formal acceptance open.** A final ordinary production build must exclude this private probe and complete actual bilateral movement/bombs and ten real close/reopens. The old scene, old failures and remaining delivery gaps stay available.

## Self-review

The scope is one diagnostic subsystem. The code consumes an existing result without a new query, its exact inverse is defined, the enabled bound is sixteen, off/on paired actual fixture outcomes are required, and a separate coherent real scene preserves current evidence. No owner decision or formal release identity is inferred from this diagnostic.
