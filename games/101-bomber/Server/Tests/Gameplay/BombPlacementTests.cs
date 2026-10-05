using System;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.Reflection;
using System.Text.Json;
using Lumio.Config.Generated.Server;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BombPlacementTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void AbilityInputCreatesBombAtPlayerPositionAndRefundsOnlyItsSourceLife(bool advanceGeneration)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder[] players = Enumerable.Range(0, 8)
            .Select(i => BomberTestWorld.QueuePlayer(manager.World, "bomb-placement-" + i)).ToArray();
        manager.Tick();
        manager.Tick();
        manager.Tick();

        World world = manager.World;
        using IDisposable terrain = Bind(manager);
        NetEntityId lifeId = players[0].AssignedId;
        Vector3 start = world.Get<LogicTransform>(lifeId).LocalPosition;
        MoveAbility.WritePosition(world, lifeId,
            new Vector3(BomberMatchRules.CellX(start) + 0.23f, start.Y,
                BomberMatchRules.CellZ(start) + 0.71f), nameof(MoveAbility));
        BomberPlayerState player = world.Get<BomberPlayerState>(lifeId);
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        AttributeComponent inventory = world.Get<AttributeComponent>(lifeId);
        Vector3 position = world.Get<LogicTransform>(lifeId).LocalPosition;
        ulong generation = player.LifeGeneration.Value;
        Assert.Equal(lifeId, participant.CurrentLife.Value);
        Assert.True(generation > 0);

        // Match Sample's test path: use the released encoder without duplicating its wire format.
        MethodInfo encode = typeof(WireCodec).GetMethod("EncodeServerRpc", BindingFlags.Static | BindingFlags.NonPublic,
            null, new[] { typeof(string), typeof(string), typeof(object[]) }, null)!;
        byte[] payload = (byte[])encode.Invoke(null, new object[] { nameof(AbilityComponent), "Activate",
            new object?[] { nameof(PlaceBombAbility), "1" } })!;
        manager.Enqueue(new InputCommandMessage(1, WireCodec.ServerRpc, lifeId, payload));
        byte[] repeated = (byte[])encode.Invoke(null, new object[] { nameof(AbilityComponent), "Activate",
            new object?[] { nameof(PlaceBombAbility), "2" } })!;
        manager.Enqueue(new InputCommandMessage(2, WireCodec.ServerRpc, lifeId, repeated));
        manager.Tick();

        BomberBombState bomb = Assert.Single(world.Each<BomberBombState>());
        Assert.Equal(new Vector3(BomberMatchRules.CellX(position) + 0.5f, position.Y,
            BomberMatchRules.CellZ(position) + 0.5f), world.Get<LogicTransform>(bomb.Entity).LocalPosition);
        Assert.Equal(new BomberSourceIdentity(participant.Entity, lifeId, generation), bomb.ReadSource());
        Assert.Equal(1, world.Get<BomberStatistics>(participant.Entity).Bombs.Value);
        Assert.Equal(0, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0, inventory.GetCurrentValue(BomberAttributeNames.AvailableBombs));
        manager.Tick();
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        int placed = 0;
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            using JsonDocument occurrence = JsonDocument.Parse(journal.Entries[i]);
            if (occurrence.RootElement.GetProperty("kind").GetString() != "bomb_placed") continue;
            placed++;
            Assert.Equal(participant.Entity.ToHex(), occurrence.RootElement.GetProperty("participantId").GetString());
            Assert.Equal(bomb.Entity.ToHex(), occurrence.RootElement.GetProperty("entityId").GetString());
        }
        Assert.Equal(1, placed);

        if (advanceGeneration)
        {
            participant.LifeGeneration.Value++;
            player.LifeGeneration.Value = participant.LifeGeneration.Value;
        }
        bomb.FuseEndTick.Value = world.Tick;
        manager.Tick();
        int placementCount = 0;
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            using JsonDocument occurrence = JsonDocument.Parse(journal.Entries[i]);
            if (occurrence.RootElement.GetProperty("kind").GetString() == "bomb_placed") placementCount++;
        }
        Assert.Equal(1, placementCount);

        Assert.Equal(advanceGeneration ? 0 : 1,
            inventory.GetCurrentValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void QueuedSameCellPlacementsWithSpareCapacityCommitOnlyOnce()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life);
        using IDisposable terrain = Bind(manager);
        World world = manager.World;
        AttributeComponent inventory = world.Get<AttributeComponent>(life);
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 2);
        QueuePlacement(manager, life, 1);
        QueuePlacement(manager, life, 2);
        manager.Tick();
        Assert.Single(world.Each<BomberBombState>());
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        BomberWorldRuntime reservation = world.Single<BomberWorldRuntime>();
        Assert.Equal(1, reservation.BombPlacementCells.Count);
        Assert.Equal(world.Tick - 1, reservation.BombPlacementTick.Value);
    }

    [Fact]
    public void CompetingParticipantsInSameCellCommitOnlyOneBomb()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life);
        using IDisposable terrain = Bind(manager);
        World world = manager.World;
        NetEntityId other = world.Each<BomberPlayerState>().Select(p => p.Entity).First(id => id != life);
        Vector3 position = world.Get<LogicTransform>(life).LocalPosition;
        MoveAbility.WritePosition(world, other, position, nameof(MoveAbility));
        world.Get<AttributeComponent>(life).SetBaseValue(BomberAttributeNames.AvailableBombs, 2);
        world.Get<AttributeComponent>(other).SetBaseValue(BomberAttributeNames.AvailableBombs, 2);
        QueuePlacement(manager, life, 1);
        QueuePlacement(manager, other, 1);
        manager.Tick();
        Assert.Single(world.Each<BomberBombState>());
        Assert.Equal(1, world.Single<BomberWorldRuntime>().BombPlacementCells.Count);
    }

    [Fact]
    public void QueuedParticipantsInDifferentCellsBothPlace()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life);
        using IDisposable terrain = Bind(manager);
        World world = manager.World;
        NetEntityId other = world.Each<BomberPlayerState>().Select(p => p.Entity).First(id => id != life);
        Vector3 position = world.Get<LogicTransform>(life).LocalPosition;
        MoveAbility.WritePosition(world, other, position + Vector3.UnitX, nameof(MoveAbility));
        QueuePlacement(manager, life, 1);
        QueuePlacement(manager, other, 1);
        manager.Tick();
        Assert.Equal(2, world.Each<BomberBombState>().Count());
        Assert.Equal(2, world.Single<BomberWorldRuntime>().BombPlacementCells.Count);
    }

    [Theory]
    [InlineData("water")]
    [InlineData("hard")]
    [InlineData("soft")]
    [InlineData("unknown")]
    [InlineData("pending")]
    [InlineData("air")]
    [InlineData("unknown-ground")]
    public void QueuedPlacementRejectsUnavailableOrForbiddenTerrainWithoutEffects(string terrainKind)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life);
        World world = manager.World;
        var abi = new SkillAuthorityTests.BlinkVoxelAbi(BomberConfigBinding.For(world).Map);
        var adapter = new HostVoxelWorldAdapter(new Lumio.Engine.NativeLoader.KernelHandle { Generation = 1 }, abi)
            { World = world };
        using IDisposable binding = VoxelGameplayBinding.Bind(manager, adapter);
        Vector3 position = world.Get<LogicTransform>(life).LocalPosition;
        int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
        switch (terrainKind)
        {
            case "water": abi.SetWater(x, z); break;
            case "hard": abi.SetObstacle(x, z, 1023u << 8); break;
            case "soft": abi.SetObstacle(x, z, 1024u << 8); break;
            case "unknown": abi.SetUnknown(x, z); break;
            case "pending": abi.SetPending(x, z); break;
            case "air": abi.SetGround(x, z, 0); break;
            default: abi.SetGround(x, z, 65000u << 8); break;
        }
        AttributeComponent inventory = world.Get<AttributeComponent>(life);
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        ulong chain = runtime.NextChainId.Value;
        QueuePlacement(manager, life, 1);
        manager.Tick();
        Assert.Empty(world.Each<BomberBombState>());
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(chain, runtime.NextChainId.Value);
        Assert.Equal(0, world.Get<BomberStatistics>(world.Get<BomberPlayerState>(life).Participant.Value).Bombs.Value);
        manager.Tick();
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            using JsonDocument entry = JsonDocument.Parse(journal.Entries[i]);
            Assert.NotEqual("bomb_placed", entry.RootElement.GetProperty("kind").GetString());
        }
    }

    [Theory]
    [InlineData("inventory")]
    [InlineData("current-inventory")]
    [InlineData("frozen")]
    [InlineData("bubble")]
    [InlineData("stale-life")]
    [InlineData("stale-match")]
    [InlineData("match")]
    [InlineData("unbound")]
    public void RejectedAdmissionsDoNotReserveOrCharge(string caseName)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life);
        World world = manager.World;
        IDisposable? binding = caseName == "unbound" ? null : Bind(manager);
        using (binding)
        {
            BomberPlayerState player = world.Get<BomberPlayerState>(life);
            BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
            AttributeComponent inventory = world.Get<AttributeComponent>(life);
            BomberSkillState skill = world.Get<BomberSkillState>(life);
            switch (caseName)
            {
                case "inventory": inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 0); break;
                case "current-inventory": inventory.SetCurrentValue(BomberAttributeNames.AvailableBombs, 0); break;
                case "frozen": BomberFiniteFreezeTests.FreezeForInputFixture(manager, life); break;
                case "bubble":
                    SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
                    new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(life));
                    manager.Tick(); manager.Tick();
                    Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
                    break;
                case "stale-life": player.LifeGeneration.Value++; break;
                case "stale-match": participant.MatchId.Value++; break;
                case "match": world.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Results; break;
            }
            var ability = new PlaceBombAbility();
            AbilityComponent owner = world.Get<AbilityComponent>(life);
            Assert.False(PlaceBombAbility.CanPlace(owner, out string? refusal));
            if (caseName is "inventory" or "current-inventory")
            {
                Assert.Equal("bomb_capacity_empty", refusal);
                Assert.True(ability.CanActivate(default, owner, out _));
            }
            else Assert.False(ability.CanActivate(default, owner, out _));
            long before = inventory.GetBaseValue(BomberAttributeNames.AvailableBombs);
            ulong chain = world.Single<BomberWorldRuntime>().NextChainId.Value;
            ability.Execute(default, owner);
            Assert.Equal(before, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
            Assert.Equal(chain, world.Single<BomberWorldRuntime>().NextChainId.Value);
            Assert.Equal(0, world.Single<BomberWorldRuntime>().BombPlacementCells.Count);
        }
    }

    [Fact]
    public void DisabledSkillsIgnoreStaleBombSkillSlot()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life);
        using IDisposable terrain = Bind(manager);
        World world = manager.World;
        IBomberConfig config = BomberConfigBinding.For(world);
        GameRow old = config.Game;
        var disabled = new GameRow(old.Id, old.Name, old.TickRateHz, old.PlayerCount,
            old.MapSize, old.WarmupMs, old.MatchDurationMs, old.PodiumMs, old.ResultsMs,
            false, old.DefaultBotProfile, old.SourceStatus, old.SourceRef, old.InitialSeed,
            old.CentralSupplyEnabled, old.CentralSupplyAnnounceMs, old.CentralSupplyOpenMs,
            old.CentralSupplyStrengtheningCount, old.CentralSupplyHealthCount, old.CentralSupplyFrenzyCount,
            old.CentralSupplySpecialCount, old.CentralSupplyGoldenHeartCount, old.FrenzyEnabled,
            old.FrenzyDurationMs, old.FrenzyFuseMs, old.FrenzyConcurrentLimit, old.FrenzyMinPlacementTicks);
        FieldInfo field = config.GetType().GetField("<Game>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)!;
        field.SetValue(config, disabled);
        world.Get<BomberSkillState>(life).BombSkillId.Value = 6;
        QueuePlacement(manager, life, 1);
        manager.Tick();
        BomberBombState bomb = Assert.Single(world.Each<BomberBombState>());
        Assert.Equal((int)BomberBombKind.Standard, bomb.BombKind.Value);
        Assert.Equal(0, bomb.SkillLevel.Value);
    }

    private static IDisposable Bind(WorldManager manager)
    {
        var abi = new SkillAuthorityTests.BlinkVoxelAbi(BomberConfigBinding.For(manager.World).Map);
        var adapter = new HostVoxelWorldAdapter(new Lumio.Engine.NativeLoader.KernelHandle { Generation = 1 }, abi)
            { World = manager.World };
        return VoxelGameplayBinding.Bind(manager, adapter);
    }

    private static void QueuePlacement(WorldManager manager, NetEntityId life, uint sequence)
    {
        MethodInfo encode = typeof(WireCodec).GetMethod("EncodeServerRpc", BindingFlags.Static | BindingFlags.NonPublic,
            null, new[] { typeof(string), typeof(string), typeof(object[]) }, null)!;
        byte[] payload = (byte[])encode.Invoke(null, new object[] { nameof(AbilityComponent), "Activate",
            new object?[] { nameof(PlaceBombAbility), sequence.ToString(CultureInfo.InvariantCulture) } })!;
        manager.Enqueue(new InputCommandMessage(sequence, WireCodec.ServerRpc, life, payload));
    }
}
