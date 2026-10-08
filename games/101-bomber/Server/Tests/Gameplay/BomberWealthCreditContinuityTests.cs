using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberWealthCreditContinuityTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void ImmediateSkillPickupTransfersItsCreditBeforeSameTickNativeMint(int freeCredits)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        int capacity = BomberConfigBinding.For(world).ObjectBudgets.PickupCapacity;
        NetEntityId chest = scene.Chest("Wood");
        NetEntityId life = scene.Lives[2];
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(12.5f, 1.5f, 12.5f));
        for (int i = 0; i < capacity - freeCredits - 1; i++) world.Commands.Create<BomberPickupItemEntity>();
        var pickup = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Skill);
        pickup.Get<BomberPickupItem>().SkillId.Value = 7;
        pickup.Get<BomberPickupItem>().SkillLevel.Value = 1;
        scene.Bomb();
        scene.Manager.Tick();
        Assert.Equal(capacity - freeCredits, world.Each<BomberPickupItem>().Count());
        world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = pickup.AssignedId });
        Assert.Equal(7u, world.Get<BomberSkillState>(life).BombSkillId.Value);
        Assert.Equal(1, BomberDeathDrops.HeldOutputs(world));
        scene.Manager.Tick();
        Assert.False(world.IsLive(pickup.AssignedId));
        Assert.Equal(freeCredits == 0, world.IsLive(chest));
        var runtime = world.Single<BomberWorldRuntime>();
        Assert.Equal(freeCredits, runtime.TerrainReservedPickups.Value);
        Assert.Equal(capacity, world.Each<BomberPickupItem>().Count() + BomberDeathDrops.HeldOutputs(world) + runtime.TerrainReservedPickups.Value);
        if (freeCredits == 0) Assert.Empty(scene.Adapter.CaptureResultCheckpoint().Results);
        else
        {
            var receipt = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results);
            Assert.Equal(Lumio.GameRuntime.Coordination.VoxelCommitDisposition.Original, receipt.Outcome.Disposition);
            Assert.True(receipt.Outcome.TokenConsumed);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void AppliedPickupTransfersItsCreditBeforeSameTickNativeMint(int freeCredits)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        NetEntityId chest = scene.Chest("Wood");
        NetEntityId life = scene.Lives[2];
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(12.5f, 1.5f, 12.5f));
        int capacity = config.ObjectBudgets.PickupCapacity;
        for (int i = 0; i < capacity - freeCredits - 1; i++) world.Commands.Create<BomberPickupItemEntity>();
        var pickup = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Speed);
        scene.Manager.Tick();
        Assert.Equal(capacity - freeCredits, world.Each<BomberPickupItem>().Count());
        world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = pickup.AssignedId });
        var terminal = scene.Bomb();
        scene.Manager.Tick();
        Assert.Equal(1, world.Get<BomberHealthFacts>(life).Status[0]);
        Assert.Equal(1, BomberDeathDrops.HeldOutputs(world));
        Assert.True(world.IsLive(pickup.AssignedId));
        Assert.True(world.IsLive(chest));
        // Consume now retires the settled source, while the same Tick's terminal
        // explosion needs the one remaining producer credit.
        scene.Manager.Tick();
        Assert.False(world.IsLive(pickup.AssignedId));
        var runtime = world.Single<BomberWorldRuntime>();
        if (freeCredits == 0)
        {
            Assert.True(world.IsLive(chest));
            Assert.Equal(0, runtime.TerrainReservedPickups.Value);
            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            Assert.Empty(scene.Adapter.CaptureResultCheckpoint().Results);
            Assert.Equal(capacity, world.Each<BomberPickupItem>().Count() + BomberDeathDrops.HeldOutputs(world));
            return;
        }
        Assert.False(world.IsLive(chest));
        Assert.Equal(1, runtime.TerrainReservedPickups.Value);
        Assert.Equal(capacity, world.Each<BomberPickupItem>().Count() + BomberDeathDrops.HeldOutputs(world) + runtime.TerrainReservedPickups.Value);
        var receipt = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results);
        Assert.Equal(Lumio.GameRuntime.Coordination.VoxelCommitDisposition.Original, receipt.Outcome.Disposition);
        Assert.True(receipt.Outcome.TokenConsumed);
        scene.Manager.Tick();
        Assert.Equal(1, world.Get<BomberBombState>(terminal.AssignedId).ContactedChests.Count);
    }

    [Fact]
    public void ThreeActualMatchesAccumulateThenPlaceEveryOriginalDeathCohort()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(scene.Lives[0]).Participant.Value);
        var origins = new System.Collections.Generic.List<(ulong Match, NetEntityId Life, ulong Generation, ulong Occurred)>();
        for (int round = 0; round < 3; round++)
        {
            BlockLandings(scene);
            if (world.Single<BomberMatchState>().Phase.Value == (int)BomberMatchPhase.Warmup)
            {
                world.Single<BomberMatchState>().PhaseEndTick.Value = world.Tick;
                scene.TickControlled(); scene.TickControlled();
            }
            NetEntityId life = participant.CurrentLife.Value;
            ulong match = participant.MatchId.Value, generation = participant.LifeGeneration.Value;
            TakeHearts(scene, life);
            KillAndTransfer(scene, participant, checked((ulong)(10000 + round * 100)));
            origins.Add((match, life, generation, participant.DeathTick.Value));
            Assert.Equal((round + 1) * 3, BomberDeathDrops.PendingOutputs(world));
            Assert.Equal(3, world.Each<BomberPickupItem>().Count());
            Assert.All(world.Each<BomberPickupItem>(), item =>
            {
                Assert.Equal((int)BomberPickupKind.Health, item.Kind.Value);
                Assert.True(item.DropParticipant.Value.IsDefault);
            });
            Assert.Equal(generation + 1, participant.LifeGeneration.Value);
            if (round != 2)
            {
                BomberRoundRolloverTests.EndRound(scene);
                Assert.Equal(match + 1, participant.MatchId.Value);
                Assert.Equal((round + 1) * 3, BomberDeathDrops.PendingOutputs(world));
            }
        }
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.Equal(2, carry.DeferredDeathDebts.Count);
        using (WorldManager restored = BomberTestWorld.Restore(scene.Manager.CaptureSnapshot(), GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
            Assert.Equal(9, BomberDeathDrops.PendingOutputs(restored.World));
        // Keep the living successor away from the release area: this assertion
        // counts materialized original cohorts before a subsequent real pickup.
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(participant.CurrentLife.Value), new Vector3(1.5f, 1.5f, 1.5f));
        for (int z = 9; z <= 15; z++)
        for (int x = 9; x <= 15; x++)
        {
            scene.Write(x, 0, z, 1022u << 8);
            scene.Write(x, 1, z, 0);
        }
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(0, BomberDeathDrops.PendingOutputs(world));
        Assert.False(participant.DeathDropPending.Value);
        Assert.Equal(0, carry.DeferredDeathDebts.Count);
        var drops = world.Each<BomberPickupItem>().Where(item => item.DropParticipant.Value == participant.Entity).ToArray();
        Assert.Equal(9, drops.Length);
        foreach (var origin in origins)
        {
            var originalDrops = drops.Where(item => item.DroppedBy.Value == origin.Life).ToArray();
            Assert.Equal(3, originalDrops.Length);
            Assert.All(originalDrops, item =>
            {
                Assert.Equal(origin.Match, item.DropMatchId.Value);
                Assert.Equal(origin.Generation, item.DropLifeGeneration.Value);
                Assert.Equal(origin.Occurred, item.DropOccurrenceTick.Value);
                Assert.Equal((int)BomberPickupKind.GoldenHeart, item.Kind.Value);
            });
        }
        scene.TickControlled();
        Assert.Equal(12, world.Each<BomberPickupItem>().Count());
    }

    [Fact]
    public void NativeMintCannotReuseHeldWealthCreditsAfterAnActualPreviousMatchDeath()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        IBomberConfig config = BomberConfigBinding.For(world);
        BlockLandings(scene);
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(scene.Lives[0]).Participant.Value);
        NetEntityId first = participant.CurrentLife.Value;
        TakeHearts(scene, first);
        KillAndTransfer(scene, participant, 9800);
        Assert.Equal(3, BomberDeathDrops.PendingOutputs(world));
        ulong originalMatch = participant.MatchId.Value;
        BomberRoundRolloverTests.EndRound(scene);
        Assert.Equal(originalMatch + 1, participant.MatchId.Value);
        // Cleanup advances normally with the old original-match debt still outstanding.
        BlockLandings(scene);
        world.Single<BomberMatchState>().PhaseEndTick.Value = world.Tick;
        scene.TickControlled(); scene.TickControlled();
        NetEntityId second = participant.CurrentLife.Value;
        Assert.NotEqual(first, second);
        Assert.True(world.IsLive(second));
        TakeHearts(scene, second);
        Assert.Equal(3, world.Get<BomberPlayerState>(second).GoldenHeartCount.Value);
        Assert.Equal(3, BomberDeathDrops.PendingOutputs(world));
        // An initial population at the exact shared boundary is a fixture premise;
        // all ownership transfers and the subsequent mint attempt use real production code.
        int capacity = config.ObjectBudgets.PickupCapacity;
        int existing = world.Each<BomberPickupItem>().Count();
        for (int i = existing; i < capacity - 6; i++) world.Commands.Create<BomberPickupItemEntity>();
        scene.TickControlled();
        scene.Write(5, 0, 5, 1022u << 8);
        scene.Write(6, 0, 5, 1022u << 8);
        NetEntityId chest = scene.Chest("Wood");
        var bomb = BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], second, 9890);
        BomberEffectIntegrationTests.Position(bomb.Get<LogicTransform>(), new Vector3(5.5f, 1.5f, 5.5f));
        bomb.Get<BomberBombState>().Power.Value = 1;
        scene.TickControlled(); scene.TickControlled();
        var runtime = world.Single<BomberWorldRuntime>();
        Assert.True(world.IsLive(chest), "Held wealth must retain its credit until consumed or explicitly retired; an extra Native mint would over-issue.");
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0, runtime.TerrainReservedPickups.Value);
        Assert.Equal(0, runtime.TerrainRewards.Count);
        KillAndTransfer(scene, participant, 9900);
        Assert.Equal(6, BomberDeathDrops.PendingOutputs(world));
        Assert.Equal(capacity, world.Each<BomberPickupItem>().Count() + BomberDeathDrops.PendingOutputs(world));
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.Equal(1, carry.DeferredDeathDebts.Count);
        var oldDebt = BomberDeathDebt.Decode(carry.DeferredDeathDebts[0]);
        Assert.Equal(originalMatch, oldDebt.Match);
        Assert.Equal(first.ToHex(), oldDebt.Life);
        Assert.Equal(3, oldDebt.Pending);
        Assert.Equal(originalMatch + 1, carry.DropMatchId.Value);
        Assert.Equal(second, carry.DropLife.Value);
        Assert.Equal(3, carry.PendingGoldenHearts.Value);
    }

    internal static void BlockLandings(BomberTerrainProductionTests.Scene scene)
    {
        var map = BomberConfigBinding.For(scene.World).Map;
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++) scene.Write(x, 0, z, 1027u << 8);
        // The old fixture combined an all-water map with an operable respawn,
        // contradicting the approved no-legal-spawn policy. A real clear L now
        // permits birth; full-health pickups occupy its three landing cells so
        // the original wealth cohorts still cannot materialize there.
        foreach (var cell in new[] { (X: 11, Z: 11), (X: 12, Z: 11), (X: 11, Z: 12) })
        {
            bool present = scene.World.Each<BomberPickupItem>().Any(item =>
                BomberMatchRules.CellX(scene.World.Get<LogicTransform>(item.Entity).LocalPosition) == cell.X &&
                BomberMatchRules.CellZ(scene.World.Get<LogicTransform>(item.Entity).LocalPosition) == cell.Z);
            if (!present)
            {
                var order = scene.World.Commands.Create<BomberPickupItemEntity>();
                order.Get<BomberPickupItem>().Kind.Value = (int)BomberPickupKind.Health;
                BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(cell.X + .5f, 1.5f, cell.Z + .5f));
            }
        }
        scene.Manager.Tick();
        foreach (var cell in new[] { (X: 11, Z: 11), (X: 12, Z: 11), (X: 11, Z: 12) })
        {
            scene.Write(cell.X, 0, cell.Z, 1022u << 8);
            scene.Write(cell.X, 1, cell.Z, 0);
        }
    }

    private static void TakeHearts(BomberTerrainProductionTests.Scene scene, NetEntityId life)
    {
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(life), new Vector3(12.5f, 1.5f, 12.5f));
        for (int i = 0; i < 3; i++) BomberGrowthHealthTests.Take(scene.Manager, life, (int)BomberPickupKind.GoldenHeart);
        Assert.Equal(3, scene.World.Get<BomberPlayerState>(life).GoldenHeartCount.Value);
    }

    private static void KillAndTransfer(BomberTerrainProductionTests.Scene scene, BomberParticipantState participant, ulong chain)
    {
        NetEntityId life = participant.CurrentLife.Value;
        var player = scene.World.Get<BomberPlayerState>(life);
        player.ProtectedUntilTick.Value = 0;
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        var outcomes = new System.Collections.Generic.List<string>();
        for (ulong i = 0; i < 6; i++) BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], life, chain + i);
        var config = BomberConfigBinding.For(scene.World);
        ulong wait = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz) + 20;
        for (ulong i = 0; i < wait && participant.CurrentLife.Value == life; i++)
        {
            scene.TickControlled();
            if (i < 3)
                foreach (var fact in scene.World.Each<BomberDamageFacts>())
                    for (int row = 0; row < fact.Status.Count; row++)
                        outcomes.Add($"{i}:{fact.Entity.Counter}:{fact.Status[row]}:{fact.HandleInstance[row]}:{fact.Before[row]}:{fact.After[row]}");
        }
        if (scene.World.IsLive(life))
            Assert.Fail($"Old life remained: tick={scene.World.Tick}, phase={participant.LifePhase.Value}, hp={scene.World.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints)}, deathPending={participant.DeathStructurePending.Value}, bombs={scene.World.Each<BomberBombState>().Count()}, damageEvents={BomberEffectIntegrationTests.Events(scene.World, "damage_applied").Length}, outcomes={string.Join(" / ", outcomes)}");
        Assert.NotEqual(life, participant.CurrentLife.Value);
        Assert.True(scene.World.IsLive(participant.CurrentLife.Value));
        Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out NetEntityId controlled, out _));
        Assert.Equal(participant.CurrentLife.Value, controlled);
        Assert.Equal(6, scene.World.Get<AttributeComponent>(controlled).GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Equal((int)BomberLifePhase.Protected, participant.LifePhase.Value);
    }
}
