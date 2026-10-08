# Bomber Journal Wire Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the journal wire-budget failure through the released authority and preserve an executable acceptance gate for its repair.

**Architecture:** Admit eight real observer entities with EntityBindingQuery, restore the production voxel snapshot through DedicatedServerHostBinding, and submit PlaceBombAbility through GAS. Measure actual WorldChangeMessage objects from WorldManager.DrainOutbox with WireCodec.EncodePack, preserving occurrence identity and retention assertions.

**Tech Stack:** Official Engine v0.0.4, C# net10.0, xUnit v3, native voxel snapshot.

## Global Constraints

- Official Engine v0.0.4 is immutable. No Engine/Runtime/API implementation edits.
- Preserve the dirty worktree. No commit, push, reset, checkout or clean.
- No private reflection, generated remote-write batching, uint workaround, fabricated game input, forced fuse/tick value, or weakened assertion.
- WorldManager.Tick() is the only simulation path. Use actual released native bindings and the production catalog/base map.
- Retain MaxEntries=128, MaxEntryChars=2048 and RetentionTicks=200 semantics and the production transport ceiling of 65536 bytes.
- No browser, M2 admission, stability or replay campaign. This task is an in-process authority regression, not network acceptance.
- A red regression is evidence only; production repair and overall match acceptance remain open.

### Task 1: Reproduce And Review Actual Journal Output

**Files:**
- Create: `games/101-bomber/Server/Tests/Gameplay/BomberJournalWireBudgetTests.cs`
- Create: `games/101-bomber/.run/journal-wire-regression-report.md`
- Update after review: `.sdd/progress.md`

**Interfaces:**
- Consume `BomberGameplay.CreateWorld`, `KernelConfigurationFixture.Create`, `DedicatedServerHostBinding.TryAttach`, `WorldTickBinding.Bind`, `EntityBindingQuery.Create/Admit/ResolveByConnection`, GAS activation, and `WireCodec.EncodePack` from official packages.
- Produce an independently runnable regression; keep helpers local to the new test.

- [x] Establish a native authority using the production assets before starting it:

```csharp
using WorldManager manager = BomberGameplay.CreateWorld(101);
using DedicatedServerHostBinding host = DedicatedServerHostBinding.TryAttach(
    manager, KernelConfigurationFixture.Create(),
    File.ReadAllBytes(Path.Combine(EngineRelease.RepoRoot, "Server", "Assets", "Maps", "official-catalog.json")),
    File.ReadAllBytes(Path.Combine(EngineRelease.RepoRoot, "Server", "Assets", "Maps", "bomber.voxel")))
    ?? throw new InvalidOperationException("Released native authority binding is required.");
manager.World.Single<WorldSaveComponent>().TickRate.Value = manager.World.Registry.DeclaredTickRateHz;
manager.Start(Thread.CurrentThread);
WorldTickBinding.Bind(manager);
using EntityBindingQuery bindings = EntityBindingQuery.Create(manager);
```

- [x] Admit eight connections using `bindings.Admit(connection, account, room, "PlayerEntity")`, assert accepted, tick to materialize, resolve each live binding and assert distinct identities. Advance ordinary ticks until the production match permits player input; bound this wait and fail if readiness never occurs.
- [x] Submit real `PlaceBombAbility` activations for all eight players and collect assigned bomb identities from authority state. Advance ordinary ticks through configured fuses. Prefer the minimum number of nonlethal waves that reproduces the failure; do not make the test rely on broken damage persistence or change health/inventory/fuse values. Establish actual placement/explosion counts and source attribution, not just a byte counter.
- [x] Observe each Tick with the supported outbox API:

```csharp
manager.Tick();
foreach (WorldChangeMessage frame in manager.DrainOutbox().Frames.OfType<WorldChangeMessage>())
{
    int bytes = WireCodec.EncodePack(frame).Length;
    // Record the maximum, tick, observer and duplicate journal writes.
    // Delay budget failure until event completeness and expiry checks run.
}
```

- [x] Track all unique occurrence sequence/identity pairs from public journal updates across frames. Assert ordered, unchanged payloads for repeated identities; assert all expected placements/explosions are observed. Advance through RetentionTicks and verify the expected events expire naturally and expiry publications are measured. Avoid asserting entire global journals are empty when unrelated supply events can occur.
- [x] Assert measured frame bytes are at most 65536, reporting maximum/tick and journal write count. Keep the expected red failure if immutable release cannot meet it.
- [x] Run `dotnet test --project Tools/Lumio.Bomber.Gameplay.Tests -- --filter-class '*BomberJournalWireBudgetTests*' --minimum-expected-tests 1` from `games/101-bomber`; retain actual counts/exit/output in the report. If filter syntax requires the csproj filename, use the supported existing runner syntax and record the exact command.
- [x] Package the new test diff and report for independent spec and code-quality review; resolve fixture defects and rerun only covering tests. Update this plan and the durable ledger after review. No commit.

### Repair Follow-Up

The regression must inform a separate concrete repair design. Current public SyncList mutations publish complete lists for every write. The parallel source audit must assess supported Game representations, schema identity/migration, snapshot recovery, late joins, ordering and source attribution before production edits. A transport cap increase or event loss is not an acceptable repair.

Checkpoint: independent test review found and then approved the fix for an
intermediate-write expiry assertion gap. The test now verifies final observer
state on every tick, including no-write ticks, through three ticks after the
last expiry. Final run: 1 failed, 0 passed, 0 skipped, with 291408 bytes at tick
89, 656 journal writes across 2352 frames, after all semantic assertions.
Rereview: `.run/journal-wire-regression-expiry-rereview.md`, spec PASS and quality
APPROVED with no findings. Independent source/wire audit passes separately and
identifies an upstream implementation gap against the pinned container-delta
contract. Production repair remains open under the Engine/Runtime restriction.
