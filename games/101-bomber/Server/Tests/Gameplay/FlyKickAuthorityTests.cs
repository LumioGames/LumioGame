using System;
using System.Linq;
using System.Numerics;
using Lumio.Config.Generated.Server;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Simulation;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class FlyKickAuthorityTests
{
    [Theory]
    [InlineData(1, false)]
    [InlineData(2, true)]
    public void BoundKickKeepsBombSourceAndFixesCooldownAtSuccessfulCast(int distance, bool favorite)
    {
        using var scene = new Scene();
        BomberBombState bomb = scene.Place(3 + distance, 3, otherOwner: true);
        BomberSourceIdentity source = bomb.ReadSource();
        ulong fuse = bomb.FuseEndTick.Value, chain = bomb.ChainId.Value;
        bomb.BombKind.Value = (int)BomberBombKind.Freeze;
        scene.Skills.BombSkillId.Value = favorite ? 7u : 0u;
        ulong castTick = scene.World.Tick;
        Assert.True(scene.Ability.CanActivate(default, scene.Owner, out string? reason), reason);
        scene.Ability.Execute(default, scene.Owner);
        Assert.Equal((int)BomberDirection.Right, bomb.KickDirection.Value);
        Assert.Equal(BomberHfsmDefinitions.State.BombKicked, Leaf(scene.World, bomb.Entity));
        Assert.Equal(castTick + Ticks.FromMilliseconds(favorite ? 3000u : 4000u, scene.Config.Game.TickRateHz), scene.Skills.CooldownUntilTick.Value);
        scene.Skills.BombSkillId.Value = favorite ? 0u : 7u;
        scene.Ability.Execute(default, scene.Owner);
        Assert.Equal(1, scene.Stats.SkillCasts.Value);
        var kick = Assert.Single(Occurrences(scene.World, "bomb_kicked"));
        Assert.Equal(scene.World.Get<BomberPlayerState>(scene.Life).Participant.Value.ToHex(), kick.GetProperty("participantId").GetString());
        Assert.Equal(scene.Life.ToHex(), kick.GetProperty("lifeId").GetString());
        Assert.Equal(scene.World.Get<BomberPlayerState>(scene.Life).LifeGeneration.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),
            kick.GetProperty("lifeGeneration").GetString());
        Assert.Equal(bomb.Owner.Value.ToHex(), kick.GetProperty("sourceParticipantId").GetString());
        Assert.Equal(bomb.SourceLife.Value.ToHex(), kick.GetProperty("sourceLifeId").GetString());
        Assert.Equal(bomb.Entity.ToHex(), kick.GetProperty("entityId").GetString());
        Assert.NotEqual(kick.GetProperty("participantId").GetString(), kick.GetProperty("sourceParticipantId").GetString());
        Assert.Equal((3 + distance, 3), (kick.GetProperty("x").GetInt32(), kick.GetProperty("z").GetInt32()));
        Assert.Equal("2", kick.GetProperty("data").GetProperty("direction").GetString());
        scene.Manager.Tick();
        Assert.Equal(castTick + Ticks.FromMilliseconds(favorite ? 3000u : 4000u, scene.Config.Game.TickRateHz), scene.Skills.CooldownUntilTick.Value);
        Assert.Equal(source, bomb.ReadSource());
        Assert.Equal(fuse, bomb.FuseEndTick.Value);
        Assert.Equal(chain, bomb.ChainId.Value);
        Assert.Equal((int)BomberBombKind.Freeze, bomb.BombKind.Value);
    }

    [Theory]
    [InlineData("empty")]
    [InlineData("far")]
    [InlineData("blocked")]
    [InlineData("water_gap")]
    [InlineData("pending")]
    [InlineData("moving")]
    [InlineData("unbound")]
    public void RejectedKickHasNoCooldownStatisticsOrCastOccurrence(string scenario)
    {
        using var scene = new Scene();
        BomberBombState? bomb = scenario == "empty" ? null : scene.Place(scenario == "far" ? 6 : 5, 3);
        if (scenario == "blocked") scene.Terrain.SetObstacle(4, 3, 1025u << 8);
        if (scenario == "water_gap") scene.Terrain.SetWater(4, 3);
        if (scenario == "pending") scene.Terrain.SetPending(4, 3);
        if (scenario == "moving") BomberBombKick.Start(scene.World, bomb!, BomberDirection.Right, scene.Life);
        if (scenario == "unbound") scene.Skills.ActiveSkillBound.Value = false;
        Assert.False(scene.Ability.CanActivate(default, scene.Owner, out _));
        scene.Ability.Execute(default, scene.Owner);
        Assert.Equal(0UL, scene.Skills.CooldownUntilTick.Value);
        Assert.Equal(0, scene.Stats.SkillCasts.Value);
        Assert.False(HasOccurrence(scene.World, "skill_cast"));
    }

    [Theory]
    [InlineData(2u)]
    [InlineData(3u)]
    [InlineData(13u)]
    public void FrozenInputCannotCastAndAcceptedCastIsCountedOnce(uint skill)
    {
        using var scene = new Scene();
        scene.Place(4, 3);
        uint character = skill == 2u ? 118002u : skill == 3u ? 118003u : 118005u;
        CharactersRow row = scene.Config.Tables.Characters.Rows.Single(entry => entry.Id == character);
        SelectCharacterAbility.BindCharacter(scene.Skills, row);
        EffectHandle frozen = BomberFiniteFreezeTests.FreezeForInputFixture(scene.Manager, scene.Life);
        Vector3 before = scene.World.Get<LogicTransform>(scene.Life).LocalPosition;
        Assert.False(scene.Ability.CanActivate(default, scene.Owner, out string? reason));
        Assert.Equal("player_frozen", reason);
        scene.Ability.Execute(default, scene.Owner);
        Assert.Equal(before, scene.World.Get<LogicTransform>(scene.Life).LocalPosition);
        Assert.Equal(0UL, scene.Skills.CooldownUntilTick.Value);
        Assert.Equal(0, scene.Stats.SkillCasts.Value);
        Assert.True(Effects.Remove(scene.World, frozen).Succeeded);
        scene.Manager.Tick();
        scene.Ability.Execute(default, scene.Owner);
        scene.Ability.Execute(default, scene.Owner);
        if (skill == 2u)
        {
            Assert.Equal(0, scene.Stats.SkillCasts.Value);
            scene.Manager.Tick();
            scene.Manager.Tick();
        }
        Assert.Equal(1, scene.Stats.SkillCasts.Value);
    }

    [Fact]
    public void SlideMovesAtConfiguredSpeedIgnoresPlayersAndStopsBeforeTerrain()
    {
        using var scene = new Scene();
        BomberBombState bomb = scene.Place(4, 3);
        scene.Terrain.SetObstacle(8, 3, 1028u << 8);
        NetEntityId otherLife = scene.World.Each<BomberPlayerState>().First(player => player.Entity != scene.Life).Entity;
        MoveAbility.WritePosition(scene.World, otherLife, new Vector3(5.5f, 1.5f, 3.5f), nameof(MoveAbility));
        scene.Ability.Execute(default, scene.Owner);
        scene.Manager.Tick();
        for (int tick = 0; tick < 5; tick++) scene.Manager.Tick();
        Vector3 halfway = scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition;
        Assert.InRange(halfway.X, 6.499f, 6.501f);
        for (int tick = 0; tick < 5; tick++) scene.Manager.Tick();
        Assert.Equal(7.5f, scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition.X);
        Assert.Equal(0, bomb.KickDirection.Value);
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.Equal(BomberHfsmDefinitions.State.BombStationary, Leaf(scene.World, bomb.Entity));
        Assert.Equal(0, scene.Inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void AnotherBombBlocksSlideWithoutChangingEitherOwner()
    {
        using var scene = new Scene();
        scene.Inventory.SetBaseValue(BomberAttributeNames.BombCapacity, 2);
        scene.Inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 2);
        BomberBombState kicked = scene.Place(4, 3);
        BomberBombState blocker = scene.Place(6, 3);
        scene.Ability.Execute(default, scene.Owner);
        for (int tick = 0; tick < 6; tick++) scene.Manager.Tick();
        Assert.Equal(5.5f, scene.World.Get<LogicTransform>(kicked.Entity).LocalPosition.X);
        Assert.Equal(6.5f, scene.World.Get<LogicTransform>(blocker.Entity).LocalPosition.X);
        Assert.Equal(kicked.Owner.Value, blocker.Owner.Value);
        Assert.Equal(0, kicked.KickDirection.Value);
        Assert.Equal(0, blocker.KickDirection.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void FirstWaterCellExtinguishesWithoutExplosionAndNeverCreditsAnotherLife(bool nextLife)
    {
        using var scene = new Scene();
        BomberBombState bomb = scene.Place(4, 3);
        NetEntityId bombOwner = bomb.Owner.Value;
        NetEntityId sourceLife = bomb.SourceLife.Value;
        ulong sourceGeneration = bomb.SourceLifeGeneration.Value;
        NetEntityId bombId = bomb.Entity;
        scene.Terrain.SetWater(5, 3);
        scene.Ability.Execute(default, scene.Owner);
        if (nextLife)
        {
            BomberPlayerState player = scene.World.Get<BomberPlayerState>(scene.Life);
            scene.World.Get<BomberParticipantState>(player.Participant.Value).LifeGeneration.Value++;
            player.LifeGeneration.Value++;
        }
        for (int tick = 0; tick < 4; tick++) scene.Manager.Tick();
        Assert.False(scene.World.IsLive(bomb.Entity));
        Assert.Equal(nextLife ? 0 : 1, scene.Inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.False(HasOccurrence(scene.World, "bomb_exploded"));
        var extinguished = Assert.Single(Occurrences(scene.World, "bomb_extinguished"));
        Assert.Equal((5, 3), (extinguished.GetProperty("x").GetInt32(), extinguished.GetProperty("z").GetInt32()));
        Assert.Equal(bombOwner.ToHex(), extinguished.GetProperty("participantId").GetString());
        Assert.Equal(sourceLife.ToHex(), extinguished.GetProperty("lifeId").GetString());
        Assert.Equal(sourceGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture),
            extinguished.GetProperty("lifeGeneration").GetString());
        Assert.Equal(bombId.ToHex(), extinguished.GetProperty("entityId").GetString());
        scene.Manager.Tick();
        Assert.Single(Occurrences(scene.World, "bomb_extinguished"));
        Assert.Equal(nextLife ? 0 : 1, scene.Inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void FuseContinuesDuringSlideReturnsCapacityOnExitAndExpiresThroughNativeMachine()
    {
        using var scene = new Scene();
        BomberBombState bomb = scene.Place(4, 3);
        bomb.FuseEndTick.Value = scene.World.Tick + 2;
        scene.Ability.Execute(default, scene.Owner);
        scene.Manager.Tick();
        scene.Manager.Tick();
        Vector3 position = scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition;
        scene.Manager.Tick();
        Assert.Equal(position, scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition);
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        Assert.Equal(0, bomb.KickDirection.Value);
        Assert.Equal(1, scene.Inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.True(bomb.CapacityReturned.Value);
        ulong dangerUntil = bomb.DangerUntilTick.Value;
        while (scene.World.Tick <= dangerUntil) scene.Manager.Tick();
        Assert.False(scene.World.IsLive(bomb.Entity));
        Assert.Equal(1, scene.Inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void SnapshotRestoresMovingBombWithoutRestartingMachineOrChangingTrajectory()
    {
        using var scene = new Scene(native: true);
        BomberBombState bomb = scene.Place(4, 3);
        scene.Ability.Execute(default, scene.Owner);
        scene.Manager.Tick();
        scene.Manager.Tick();
        ulong machineKey = scene.World.Get<BomberHfsmState>(bomb.Entity).MachineKey.Value;
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using WorldManager restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        restored.RequireBoundSpatialIndex();
        // The Native owner gets a fresh local generation on restore (ADR-063).
        // Compare actual terrain cells and revisions, not that owner's capture header.
        var originalTerrain = BomberTerrainRead.For(scene.World);
        var restoredTerrain = BomberTerrainRead.For(restored.World);
        Assert.NotNull(originalTerrain);
        Assert.NotNull(restoredTerrain);
        Assert.Equal(originalTerrain, restoredTerrain);
        for (int i = 0; i < 6; i++)
        {
            scene.Manager.Tick();
            restored.Tick();
            Assert.Equal(scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition,
                restored.World.Get<LogicTransform>(bomb.Entity).LocalPosition);
            Assert.Equal(machineKey, restored.World.Get<BomberHfsmState>(bomb.Entity).MachineKey.Value);
            Assert.Equal(bomb.FuseEndTick.Value, restored.World.Get<BomberBombState>(bomb.Entity).FuseEndTick.Value);
            Assert.Equal(bomb.ReadSource(), restored.World.Get<BomberBombState>(bomb.Entity).ReadSource());
        }
    }

    [Fact]
    public void TerrainBecomingUnavailableStopsSlideWithoutInventingAPath()
    {
        using var scene = new Scene();
        BomberBombState bomb = scene.Place(4, 3);
        scene.Ability.Execute(default, scene.Owner);
        scene.Manager.Tick();
        scene.Manager.Tick();
        Vector3 position = scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition;
        scene.Terrain.SetPending(5, 3);
        scene.Manager.Tick();
        Assert.Equal(position, scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition);
        Assert.Equal(0, bomb.KickDirection.Value);
        Assert.Equal(BomberHfsmDefinitions.State.BombStationary, Leaf(scene.World, bomb.Entity));
        Assert.Equal(0, scene.Inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    private static uint Leaf(World world, NetEntityId entity)
    {
        BomberHfsmState machine = world.Get<BomberHfsmState>(entity);
        return machine.ActiveStates[machine.ActiveStates.Count - 1];
    }

    private static bool HasOccurrence(World world, string kind) => Occurrences(world, kind).Length != 0;

    private static System.Text.Json.JsonElement[] Occurrences(World world, string kind)
    {
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        var result = new System.Collections.Generic.List<System.Text.Json.JsonElement>();
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            using var occurrence = System.Text.Json.JsonDocument.Parse(journal.Entries[i]);
            if (occurrence.RootElement.GetProperty("kind").GetString() == kind) result.Add(occurrence.RootElement.Clone());
        }
        return result.ToArray();
    }

    private sealed class Scene : IDisposable
    {
        internal readonly WorldManager Manager;
        internal readonly NetEntityId Life;
        internal readonly IBomberConfig Config;
        internal readonly SkillAuthorityTests.BlinkVoxelAbi Terrain;
        internal readonly UseActiveSkillAbility Ability = new();
        private readonly IDisposable? binding;
        internal World World => Manager.World;
        internal AbilityComponent Owner => World.Get<AbilityComponent>(Life);
        internal BomberSkillState Skills => World.Get<BomberSkillState>(Life);
        internal AttributeComponent Inventory => World.Get<AttributeComponent>(Life);
        internal BomberStatistics Stats => World.Get<BomberStatistics>(World.Get<BomberPlayerState>(Life).Participant.Value);

        internal Scene(bool native = false)
        {
            Manager = SkillAuthorityTests.StartedMatch(out Life, withMap: native, persistence: native);
            Config = BomberConfigBinding.For(World);
            Terrain = new SkillAuthorityTests.BlinkVoxelAbi(Config.Map);
            var adapter = new HostVoxelWorldAdapter(new Lumio.Engine.NativeLoader.KernelHandle { Generation = 1 }, Terrain) { World = World };
            if (!native) binding = VoxelGameplayBinding.Bind(Manager, adapter);
            MoveAbility.WritePosition(World, Life, new Vector3(3.5f, Config.Map.ObstacleLayer + 0.5f, 3.5f), nameof(MoveAbility));
            World.Get<BomberPlayerState>(Life).Facing.Value = (int)BomberDirection.Right;
            Skills.CharacterId.Value = 118005;
            Skills.ActiveSkillId.Value = 13;
            Skills.ActiveSkillLevel.Value = 1;
            Skills.ActiveSkillBound.Value = true;
        }

        internal BomberBombState Place(int x, int z, bool otherOwner = false)
        {
            var before = World.Each<BomberBombState>().Select(bomb => bomb.Entity).ToHashSet();
            AbilityComponent placer = otherOwner
                ? World.Get<AbilityComponent>(World.Each<BomberPlayerState>().First(player => player.Entity != Life).Entity) : Owner;
            new PlaceBombAbility().Execute(default, placer);
            Manager.Tick();
            BomberBombState bomb = World.Each<BomberBombState>().Single(row => !before.Contains(row.Entity));
            MoveAbility.WritePosition(World, bomb.Entity, new Vector3(x + 0.5f, Config.Map.ObstacleLayer + 0.5f, z + 0.5f), nameof(BombSystem));
            bomb.FuseEndTick.Value = World.Tick + 100;
            return bomb;
        }

        public void Dispose() { binding?.Dispose(); Manager.Dispose(); }
    }
}
