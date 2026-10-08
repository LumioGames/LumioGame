# Bomber Admission Read Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve the last public field-query classification so the failed eight-Bot admission can be diagnosed without changing its acceptance rules.

**Architecture:** Capture detached metadata from the two existing SDK field reads in each Step. Emit only the retained final snapshot from Assert, which runs after the host closes the connection. Root then runs the unchanged protected eight-Bot admission and classifies the evidence.

**Tech Stack:** C# 14/.NET 10, System.Text.Json, official Engine v0.0.4 Bot SDK.

## Global Constraints

- Engine/ is an immutable official v0.0.4 release; no Engine/Runtime/API implementation changes.
- Keep every admission assertion and the completion predicate unchanged; issue zero uplinks.
- Diagnostics contain no field values, account names, passwords or tickets.
- One final diagnostic line per Assert; no per-frame logging or unbounded collection.
- Preserve the dirty worktree; no commit, push, checkout, reset, clean or release change.
- Only root starts DS/Platform/Bots. No browser, M2 admission or long campaign.
- Root owns source/artifact evidence; implementer owns the single C# build/test slot until handback.

## Task 1: Retain Public Field Classification

**Files:**
- Modify: `games/101-bomber/Client/Bots/BomberAdmissionScenario.cs`.
- Validate existing: `games/101-bomber/Client/Tests/Application/BomberAdmissionScenarioTests.cs`.
- Report: `games/101-bomber/.run/admission-read-diagnostic-report.md`.

**Interfaces:**
- Consumes: `BotDriverContext.Tick`, `BotWorldView.InputEnabled/HasSelf/Self`, `ReplicaFieldObservation` public metadata.
- Produces: one `BOMBER_ADMISSION_READ ` line followed by JSON in each Bot log at final assertion.

- [x] Preserve the original scenario at `.run/admission-read-diagnostic-before.cs` and record its SHA256 before editing.
- [x] Add the following imports and state to the existing scenario:

```csharp
using System.Text.Json;
using Lumio.Client.Gameplay.ECS;

private object? lastReadDiagnostic;
```

- [x] Hoist the existing two query results to defaults before the self guard, then assign the existing queries without changing their arguments:

```csharp
var name = default(ReplicaFieldObservation);
var nextCharacter = default(ReplicaFieldObservation);
// Inside the existing guard:
name = world.Fields[self.NetEntityId, "IdentityComponent.name"];
nextCharacter = world.Fields[self.NetEntityId, "BomberPlayerState.nextCharacterId"];
```

- [x] Immediately before the existing `observed = ...Evaluate(...)`, store this detached metadata object:

```csharp
var worldIdentity = world.WorldEntity;
var position = world.WorldPositions[self.NetEntityId];
var identityField = world.Fields[self.NetEntityId, "EntityIdentity.entityType"];
lastReadDiagnostic = new
{
    OwnerFrame = context.Tick,
    world.InputEnabled,
    world.HasSelf,
    Self = new { self.RoomId, self.NetEntityId, self.EntityType, self.ConnectionGeneration },
    WorldIdentityFound = worldIdentity.Found,
    Position = new { position.Found, position.ObservedTick, position.ObservedRevision },
    Identity = DescribeField("EntityIdentity.entityType", identityField),
    Name = DescribeField("IdentityComponent.name", name),
    NextCharacter = DescribeField("BomberPlayerState.nextCharacterId", nextCharacter),
};
```

The WorldIdentity and Position checks share the public confirmed-publication
gate but do not use the Runtime field query. They distinguish an unavailable
confirmed view from a field-specific rejection. Only metadata is retained;
do not log position coordinates or access Manager/internal replica state.
The synthetic identity field is documented in the pinned
`entity-binding-and-query-v1.json` and bypasses per-Game-field declaration,
scope and delivery checks. It helps separate Runtime query-global gates from
field-specific rejection. Its value is not logged and it is not an assertion.

- [x] Add this private projection and emit the retained object once after the null sink check in Assert. Do not query the world again in Assert.

```csharp
private static object DescribeField(string requestedAttributeId, ReplicaFieldObservation field) => new
{
    RequestedAttributeId = requestedAttributeId,
    field.Found,
    field.Status,
    field.Code,
    field.NetEntityId,
    field.RoomId,
    field.AttributeId,
    field.ObservedTick,
    field.ObservedRevision,
    Kind = field.Value.Kind,
};

Console.WriteLine("BOMBER_ADMISSION_READ " + JsonSerializer.Serialize(lastReadDiagnostic));
```

- [x] Build the Bot assembly and run the existing admission tests. No new behavior-mirroring tests are required for this reversible diagnostic-only change; the real run will validate emitted data.

```powershell
dotnet build Client/Bots/Lumio.Bomber.Bots.csproj -c Debug
dotnet test --project Client/Tests/Application/Lumio.Bomber.Client.Application.Tests.csproj -- --filter-class '*BomberAdmissionScenarioTests' --minimum-expected-tests 1
```

Use the supported test executable filter if this runner rejects that syntax; preserve actual output and count, never claim a zero-test pass. Capture a task-only before/after diff, final hash, build/test exit and counts in the report. No commit.

- [x] Independent task review checks unchanged assertions, metadata-only output, correct SDK fields and no post-disconnect reads. Root checks the reviewed source hash before live execution.
- [x] Root runs a fresh eight-account admission under normal Defender protection using `.run/run-v004-network-diagnostic.mjs`, then parses exactly one diagnostic per finished scenario alongside process/result evidence. Root cleans only the owned run/project and records the actual failure classification. This is a diagnostic task, not a substitute for fixing the demonstrated cause or completing the original goal.

Run `.run/v004-network-field-diagnostic-d` completed with admission FAIL:
Bots 1/2 have no public World identity, position or any of the three queried
fields at frame 3000; Bots 3-8 pass. Every Bot emitted exactly one valid
diagnostic and zero uplinks. DS remained alive until cleanup; no new Defender
events occurred. All nine owned PIDs and project containers were absent at
the final check. Detailed evidence is in
`games/101-bomber/.run/v004-admission-read-diagnostic-result.md`.
