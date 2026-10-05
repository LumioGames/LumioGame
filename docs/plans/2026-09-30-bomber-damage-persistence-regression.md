# Bomber Damage Persistence Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reproduce the released full-match health failure with a real authoritative Tick regression and preserve the exact repair prerequisites.

**Architecture:** Use the existing BomberTestWorld and official v0.0.4 Native binding. Queue ordinary bomb entities at a vulnerable player's position and observe both health ledgers after explosion and a quiet Tick. Production repair remains pending because the released Effect API drops typed source parameters and lacks the required settlement-result integration.

**Tech Stack:** C# net10.0, xUnit v3, Microsoft Testing Platform, official Engine v0.0.4.

## Global Constraints

- Preserve the dirty worktree. No commit, push, reset, checkout or clean.
- Official Engine v0.0.4 stays immutable. No Engine/Runtime/API implementation edits.
- WorldManager.Tick() is the only simulation path; no private settlement calls, forced Tick values or direct health writes in the regression.
- No assertion weakening, skipped tests, uint workaround or encoding source identity in FxKey/Magnitude.
- Do not build or modify running gameplay artifacts until run v004-network-match-h has ended and its owned processes have exited.
- No browser, M2 admission, stability campaign or external upload.

## Task 1: Capture Durable Explosion Health

**Files:**
- Create: `games/101-bomber/Server/Tests/Gameplay/BomberDamagePersistenceTests.cs`
- Create: `games/101-bomber/.run/damage-persistence-regression-report.md`
- Reference: `games/101-bomber/.run/live-damage-audit.md`

**Interfaces:**
- Consume `BomberTestWorld.Start()`, `BomberTestWorld.QueuePlayer(World, string)`, `WorldManager.Tick()`, `AttributeComponent.GetBaseValue(string)` and `GetCurrentValue(string)`.
- Produce one unskipped regression, `SeparateExplosionsPersistAcrossAuthoritativeTicks`, with expected health 4, 2, 0 from initial 6.

- [x] Add this test using existing declarations and fixture APIs:

```csharp
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberDamagePersistenceTests
{
    [Fact]
    public void SeparateExplosionsPersistAcrossAuthoritativeTicks()
    {
        using WorldManager manager = BomberTestWorld.Start();
        World world = manager.World;
        EntityOrder[] players = Enumerable.Range(0, 8)
            .Select(i => BomberTestWorld.QueuePlayer(world, "damage-persistence-" + i)).ToArray();
        manager.Tick();
        manager.Tick();
        manager.Tick();
        NetEntityId life = players[0].AssignedId;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        player.ProtectedUntilTick.Value = 0;
        AttributeComponent health = world.Get<AttributeComponent>(life);
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        var observations = new List<(long Base, long Current)>();

        for (int blast = 0; blast < 3; blast++)
        {
            EntityOrder order = world.Commands.Create<BomberBombEntity>();
            BomberBombState bomb = order.Get<BomberBombState>();
            bomb.Owner.Value = player.Participant.Value;
            bomb.SourceLife.Value = life;
            bomb.SourceLifeGeneration.Value = player.LifeGeneration.Value;
            bomb.Phase.Value = (int)BomberBombPhase.Fuse;
            bomb.Power.Value = 2;
            bomb.ChainId.Value = (ulong)(blast + 1);
            bomb.FuseEndTick.Value = world.Tick;
            bomb.PlacedAtTick.Value = world.Tick;
            var position = world.Get<LogicTransform>(life).LocalPosition;
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
                FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);
            manager.Tick();
            manager.Tick();
            observations.Add((health.GetBaseValue(BomberAttributeNames.HealthPoints),
                health.GetCurrentValue(BomberAttributeNames.HealthPoints)));
            manager.Tick();
            observations.Add((health.GetBaseValue(BomberAttributeNames.HealthPoints),
                health.GetCurrentValue(BomberAttributeNames.HealthPoints)));
        }

        Assert.Equal(new (long Base, long Current)[]
        {
            (4, 4), (4, 4), (2, 2), (2, 2), (0, 0), (0, 0),
        }, observations);
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, player.LifePhase.Value);
    }
}
```

Include `using System;` if required by the project's implicit-using setting. Inspect actual bomb/journal observations to ensure three distinct explosions occurred; a fixture failure is not the intended regression.

- [x] After the live run exits, run `dotnet test Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj -- --filter-class Lumio.Bomber.Gameplay.Tests.BomberDamagePersistenceTests --minimum-expected-tests 1` from `games/101-bomber` and retain output.
- [x] Expected current failure: each observed Base/Current pair is `(6, 6)`, instead of `(4, 4)`, `(2, 2)`, `(0, 0)`. Report real counts and exit status; do not change expected values to match the defect.
- [x] Record Engine identity, source hashes, command and result. Production fix prerequisites are typed Effect payload propagation, explicit result/source association, and same-Tick lethal/final-circle integration. Require durable respawn/healing and exact attribution coverage when the repair becomes possible.
- [x] Obtain independent spec and code-quality review, including whether the fixture actually causes separate explosions and quiet Ticks.
- [x] Update `.sdd/progress.md` with completed evidence work and pending production repair. Do not mark the broader gameplay goal complete.
