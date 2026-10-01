using System;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Lumio.Config.Generated.Server;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Coordination;
using KernelHandle = Lumio.Engine.NativeLoader.KernelHandle;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class SkillAuthorityTests
{
    [Fact]
    public void BlinkFacingStartsDownAndResetsForRespawnAndNextMatch()
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(lifeId);
        NetEntityId participantId = player.Participant.Value;
        Assert.Equal((int)BomberDirection.Down, player.Facing.Value);
        player.Facing.Value = (int)BomberDirection.Up;
        player.LifePhase.Value = (int)BomberLifePhase.AwaitingRespawn;
        player.RespawnAtTick.Value = world.Tick;
        manager.Tick();
        manager.Tick();
        BomberParticipantState participant = world.Get<BomberParticipantState>(participantId);
        NetEntityId successorId = participant.CurrentLife.Value;
        Assert.NotEqual(lifeId, successorId);
        player = world.Get<BomberPlayerState>(successorId);
        Assert.Equal((int)BomberDirection.Down, player.Facing.Value);
        player.Facing.Value = (int)BomberDirection.Left;
        BomberMatchState match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick;
        manager.Tick();
        Assert.Equal((int)BomberDirection.Down, world.Get<BomberPlayerState>(successorId).Facing.Value);
    }

    [Fact]
    public void BlockedMoveUpdatesBlinkFacingButFrozenMoveCannot()
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        var abi = new BlinkVoxelAbi(BomberConfigBinding.For(world).Map);
        var adapter = new HostVoxelWorldAdapter(new KernelHandle { Generation = 1 }, abi) { World = world };
        using IDisposable binding = VoxelGameplayBinding.Bind(manager, adapter);
        AbilityComponent owner = world.Get<AbilityComponent>(lifeId);
        new PlaceBombAbility().Execute(default, owner);
        manager.Tick();
        var origin = world.Get<LogicTransform>(lifeId).LocalPosition;
        abi.SetGround(BomberMatchRules.CellX(origin), BomberMatchRules.CellZ(origin), 0);
        var ability = new MoveAbility();
        ability.Execute(new MoveAbility.Input { PrimaryDirection = BomberDirection.Right }, owner);
        Assert.Equal(origin, world.Get<LogicTransform>(lifeId).LocalPosition);
        Assert.Equal((int)BomberDirection.Right, world.Get<BomberPlayerState>(lifeId).Facing.Value);
        world.Get<BomberSkillState>(lifeId).FrozenUntilTick.Value = world.Tick + 10;
        var move = new MoveAbility.Input { PrimaryDirection = BomberDirection.Down };
        Assert.False(ability.CanActivate(move, owner, out string? reason));
        Assert.Equal("player_frozen", reason);
        ability.Execute(move, owner);
        Assert.Equal(origin, world.Get<LogicTransform>(lifeId).LocalPosition);
        Assert.Equal((int)BomberDirection.Right, world.Get<BomberPlayerState>(lifeId).Facing.Value);
    }

    [Fact]
    public void SelectionUsesConfiguredActiveAndPassiveBindingsWithoutChangingAttributeSeeds()
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        AbilityComponent owner = world.Get<AbilityComponent>(lifeId);
        var ability = new SelectCharacterAbility();
        BomberSkillState state = world.Get<BomberSkillState>(lifeId);
        AttributeComponent attributes = world.Get<AttributeComponent>(lifeId);
        long health = attributes.GetBaseValue(BomberAttributeNames.HealthPoints);
        long power = attributes.GetBaseValue(BomberAttributeNames.BombPower);
        BomberMatchState match = world.Single<BomberMatchState>();
        BomberParticipantState seat = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(lifeId).Participant.Value);
        uint previous = state.CharacterId.Value;
        foreach (uint alias in new[] { 1u, 2u, 3u, 4u, 5u })
        {
            uint id = 118000u + alias;
            CharactersRow row = BomberConfigBinding.For(world).Tables.Characters.Rows.Single(entry => entry.Id == id);
            match.Phase.Value = (int)BomberMatchPhase.Results;
            match.PhaseEndTick.Value = world.Tick + 10;
            ability.Execute(new SelectCharacterAbility.Input { CharacterId = alias }, owner);
            Assert.Equal(previous, state.CharacterId.Value);
            Assert.Equal(checked((int)id), seat.NextCharacterId.Value);
            match.PhaseEndTick.Value = world.Tick;
            manager.Tick();
            Assert.Equal(id, state.CharacterId.Value);
            Assert.Equal(checked((int)id), seat.SelectedForMatchCharacterId.Value);
            Assert.Equal(row.BoundSlot == "Active" ? row.BoundSkillId : 0u, state.ActiveSkillId.Value);
            Assert.Equal(row.BoundSlot == "Passive" ? row.BoundSkillId : 0u, state.PassiveSkillId.Value);
            Assert.Equal(row.BoundSlot == "Active", state.ActiveSkillBound.Value);
            Assert.Equal(row.BoundSlot == "Passive", state.PassiveSkillBound.Value);
            Assert.Equal(health, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Equal(power, attributes.GetBaseValue(BomberAttributeNames.BombPower));
            previous = id;
        }
        Assert.False(ability.CanActivate(new SelectCharacterAbility.Input { CharacterId = 118006 }, owner, out string? unknown));
        Assert.Equal("character_unknown", unknown);
        world.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Running;
        Assert.False(ability.CanActivate(new SelectCharacterAbility.Input { CharacterId = 118001 }, owner, out string? closed));
        Assert.Equal("character_selection_closed", closed);
    }

    [Fact]
    public void BubbleUsesGeneratedMillisecondsAtWorldTickRateAndPrivateCooldown()
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        BomberSkillState state = world.Get<BomberSkillState>(lifeId);
        BindRole(world, lifeId, 118002);
        IBomberConfig config = BomberConfigBinding.For(world);
        SkillLevelsRow row = config.SkillLevel(2, 1);
        ulong start = world.Tick;
        var ability = new UseActiveSkillAbility();
        ability.Execute(default, world.Get<AbilityComponent>(lifeId));
        Assert.Equal(start + Ticks.FromMilliseconds(row.DurationMs, config.Game.TickRateHz), state.BubbleUntilTick.Value);
        Assert.Equal(start + Ticks.FromMilliseconds(row.CooldownMs, config.Game.TickRateHz), state.CooldownUntilTick.Value);
        Assert.Equal(start, state.CooldownFromTick.Value);
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        using JsonDocument cast = SingleCast(journal);
        JsonElement data = cast.RootElement.GetProperty("data");
        Assert.Equal(state.BubbleUntilTick.Value.ToString(System.Globalization.CultureInfo.InvariantCulture), data.GetProperty("untilTick").GetString());
        Assert.False(data.TryGetProperty("cooldownUntilTick", out _));
        ability.Execute(default, world.Get<AbilityComponent>(lifeId));
        Assert.Equal(1, CastCount(journal));
    }

    [Fact]
    public void InvalidPassiveUnknownUnavailableAndUnbackedBlinkCannotCommit()
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        BomberSkillState state = world.Get<BomberSkillState>(lifeId);
        AbilityComponent owner = world.Get<AbilityComponent>(lifeId);
        var ability = new UseActiveSkillAbility();
        AssertRejected(1, 1, "active_skill_invalid");
        AssertRejected(999, 1, "active_skill_invalid");
        AssertRejected(2, 0, "active_skill_level_invalid");
        AssertRejected(2, 99, "active_skill_level_invalid");
        AssertRejected(4, 1, "active_skill_unavailable");
        AssertRejected(8, 1, "active_skill_unavailable");
        AssertRejected(3, 1, "active_skill_not_bound");
        BindRole(world, lifeId, 118003);
        AssertRejected(3, 1, "skill_terrain_unavailable");
        Assert.Equal(0UL, state.TeleportSequence.Value);
        Assert.Equal(0UL, state.CooldownUntilTick.Value);
        Assert.Equal(0, CastCount(world.Single<BomberPresentationJournal>()));

        void AssertRejected(uint id, int level, string expected)
        {
            state.ActiveSkillId.Value = id;
            state.ActiveSkillLevel.Value = level;
            var before = world.Get<LogicTransform>(lifeId).LocalPosition;
            Assert.False(ability.CanActivate(default, owner, out string? reason));
            Assert.Equal(expected, reason);
            ability.Execute(default, owner);
            Assert.Equal(before, world.Get<LogicTransform>(lifeId).LocalPosition);
        }
    }

    [Fact]
    public void BlinkScanSkipsSoftAndBombsButStopsAtIron()
    {
        using WorldManager manager = StartedMatch(out _);
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        int width = config.Map.Width;
        int area = width * config.Map.Depth;
        var cells = new VoxelCellQuery[area * 2];
        for (int i = 0; i < area; i++)
        {
            cells[i] = new VoxelCellQuery(true, VoxelPresence.Ready, 1022u << 8, 1);
            cells[area + i] = new VoxelCellQuery(true, VoxelPresence.Ready, 0, 1);
        }
        cells[area + 3 * width + 4] = new VoxelCellQuery(true, VoxelPresence.Ready, 1025u << 8, 1);
        cells[area + 3 * width + 7] = new VoxelCellQuery(true, VoxelPresence.Ready, 1023u << 8, 1);
        Assert.True(UseActiveSkillAbility.FindBlinkLanding(config, cells, 3, 3, BomberDirection.Right,
            5, (x, z) => x == 5 && z == 3, out int x, out int z));
        Assert.Equal((6, 3), (x, z));

        cells[area + 3 * width + 6] = new VoxelCellQuery(true, VoxelPresence.Ready, 1023u << 8, 1);
        Assert.False(UseActiveSkillAbility.FindBlinkLanding(config, cells, 3, 3, BomberDirection.Right,
            5, (bx, bz) => bx == 5 && bz == 3, out _, out _));
    }

    [Fact]
    public void BoundVoxelBlinkCommitsOnlyWhenTheLandingIsKnown()
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        IBomberConfig config = BomberConfigBinding.For(world);
        var abi = new BlinkVoxelAbi(config.Map);
        var adapter = new HostVoxelWorldAdapter(new KernelHandle { Generation = 1 }, abi) { World = world };
        using IDisposable binding = VoxelGameplayBinding.Bind(manager, adapter);
        BomberSkillState state = world.Get<BomberSkillState>(lifeId);
        BindRole(world, lifeId, 118003);
        world.Get<BomberPlayerState>(lifeId).Facing.Value = (int)BomberDirection.Right;
        LogicTransform transform = world.Get<LogicTransform>(lifeId);
        var origin = transform.LocalPosition;
        int fromX = BomberMatchRules.CellX(origin);
        int fromZ = BomberMatchRules.CellZ(origin);
        SkillLevelsRow level = config.SkillLevel(3, 1);
        var ability = new UseActiveSkillAbility();
        AbilityComponent owner = world.Get<AbilityComponent>(lifeId);
        Assert.True(ability.CanActivate(default, owner, out string? reason), reason);
        Assert.True(ability.CanActivate(default, owner, out reason), reason);
        ability.Execute(default, owner);
        Assert.Equal(config.Map.Width * config.Map.Depth * 2, abi.ReadCount);
        Assert.Equal(fromX + level.RangeCells, BomberMatchRules.CellX(transform.LocalPosition));
        Assert.Equal(fromZ, BomberMatchRules.CellZ(transform.LocalPosition));
        Assert.Equal(1UL, state.TeleportSequence.Value);
        Assert.Equal(world.Tick + Ticks.FromMilliseconds(level.CooldownMs, config.Game.TickRateHz), state.CooldownUntilTick.Value);
        Assert.Equal(1, CastCount(world.Single<BomberPresentationJournal>()));
        using (JsonDocument cast = SingleCast(world.Single<BomberPresentationJournal>()))
        {
            JsonElement data = cast.RootElement.GetProperty("data");
            Assert.Equal(fromX, int.Parse(data.GetProperty("fromX").GetString()!, System.Globalization.CultureInfo.InvariantCulture));
            Assert.Equal(fromX + level.RangeCells, cast.RootElement.GetProperty("x").GetInt32());
        }

        state.CooldownUntilTick.Value = 0;
        state.TeleportSequence.Value = 0;
        MoveAbility.WritePosition(world, lifeId, origin, nameof(MoveAbility));
        abi.SetObstacle(fromX + 1, fromZ, 1023u << 8);
        manager.Tick();
        Assert.False(ability.CanActivate(default, owner, out reason));
        Assert.Equal("skill_no_landing", reason);
        ability.Execute(default, owner);
        Assert.Equal(origin, transform.LocalPosition);
        Assert.Equal(0UL, state.TeleportSequence.Value);
        Assert.Equal(0UL, state.CooldownUntilTick.Value);
        Assert.Equal(1, CastCount(world.Single<BomberPresentationJournal>()));

        abi.SetPending(fromX + 1, fromZ);
        manager.Tick();
        Assert.False(ability.CanActivate(default, owner, out reason));
        Assert.Equal("skill_terrain_unavailable", reason);
        Assert.Equal(config.Map.Width * config.Map.Depth * 6, abi.ReadCount);
    }

    [Theory]
    [InlineData(BomberBombPhase.Fuse, 2)]
    [InlineData(BomberBombPhase.Danger, 3)]
    public void BlinkOnlyTreatsUnexplodedBombsAsLandingObstacles(BomberBombPhase phase, int expectedDistance)
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        IBomberConfig config = BomberConfigBinding.For(world);
        var abi = new BlinkVoxelAbi(config.Map);
        var adapter = new HostVoxelWorldAdapter(new KernelHandle { Generation = 1 }, abi) { World = world };
        using IDisposable binding = VoxelGameplayBinding.Bind(manager, adapter);
        AbilityComponent owner = world.Get<AbilityComponent>(lifeId);
        new PlaceBombAbility().Execute(default, owner);
        manager.Tick();
        BomberBombState bomb = world.Each<BomberBombState>().Single();
        var origin = world.Get<LogicTransform>(lifeId).LocalPosition;
        MoveAbility.WritePosition(world, bomb.Entity, origin + new System.Numerics.Vector3(3, 0, 0), nameof(MoveAbility));
        bomb.Phase.Value = (int)phase;
        BomberSkillState state = world.Get<BomberSkillState>(lifeId);
        BindRole(world, lifeId, 118003);
        world.Get<BomberPlayerState>(lifeId).Facing.Value = (int)BomberDirection.Right;
        new UseActiveSkillAbility().Execute(default, owner);
        Assert.Equal(BomberMatchRules.CellX(origin) + expectedDistance,
            BomberMatchRules.CellX(world.Get<LogicTransform>(lifeId).LocalPosition));
        Assert.Equal(1UL, state.TeleportSequence.Value);
    }

    [Fact]
    public void DisabledSkillFlagRejectsBeforeCooldownOrOccurrence()
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        IBomberConfig config = BomberConfigBinding.For(world);
        GameRow original = config.Game;
        var disabled = new GameRow(original.Id, original.Name, original.TickRateHz, original.PlayerCount,
            original.MapSize, original.WarmupMs, original.MatchDurationMs, original.PodiumMs,
            original.ResultsMs, false, original.DefaultBotProfile, original.SourceStatus, original.SourceRef);
        FieldInfo gameField = config.GetType().GetField("<Game>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)!;
        gameField.SetValue(config, disabled);
        BomberSkillState state = world.Get<BomberSkillState>(lifeId);
        BindRole(world, lifeId, 118002);
        var ability = new UseActiveSkillAbility();
        AbilityComponent owner = world.Get<AbilityComponent>(lifeId);
        Assert.False(ability.CanActivate(default, owner, out string? reason));
        Assert.Equal("skills_disabled", reason);
        ability.Execute(default, owner);
        Assert.Equal(0UL, state.CooldownUntilTick.Value);
        Assert.Equal(0, CastCount(world.Single<BomberPresentationJournal>()));
    }

    [Theory]
    [InlineData(118002u, 2u, 3u)]
    [InlineData(118003u, 3u, 2u)]
    [InlineData(118005u, 13u, 2u)]
    public void SupportedActiveSkillsRejectMismatchedBindingsBeforeMutation(
        uint character, uint boundSkill, uint otherSkill)
    {
        using WorldManager manager = StartedMatch(out NetEntityId lifeId);
        World world = manager.World;
        BomberSkillState state = world.Get<BomberSkillState>(lifeId);
        AbilityComponent owner = world.Get<AbilityComponent>(lifeId);
        BomberStatistics statistics = world.Get<BomberStatistics>(
            world.Get<BomberPlayerState>(lifeId).Participant.Value);
        var ability = new UseActiveSkillAbility();

        BindRole(world, lifeId, character);
        Assert.Equal(boundSkill, state.ActiveSkillId.Value);
        state.ActiveSkillBound.Value = false;
        AssertRejected("active_skill_not_bound");

        BindRole(world, lifeId, character);
        state.CharacterId.Value = 118001;
        AssertRejected("active_skill_not_bound");

        BindRole(world, lifeId, character);
        state.ActiveSkillId.Value = otherSkill;
        AssertRejected("active_skill_not_bound");

        BindRole(world, lifeId, character);
        state.ActiveSkillLevel.Value = 2;
        AssertRejected(boundSkill == 13u ? "active_skill_level_invalid" : "active_skill_not_bound");

        void AssertRejected(string expected)
        {
            Assert.False(ability.CanActivate(default, owner, out string? reason));
            Assert.Equal(expected, reason);
            ability.Execute(default, owner);
            Assert.Equal(0UL, state.CooldownUntilTick.Value);
            Assert.Equal(0, statistics.SkillCasts.Value);
            Assert.Equal(0, CastCount(world.Single<BomberPresentationJournal>()));
        }
    }

    private static void BindRole(World world, NetEntityId lifeId, uint character)
    {
        CharactersRow row = BomberConfigBinding.For(world).Tables.Characters.Rows.Single(entry => entry.Id == character);
        SelectCharacterAbility.BindCharacter(world.Get<BomberSkillState>(lifeId), row);
    }

    internal static WorldManager StartedMatch(out NetEntityId lifeId)
    {
        WorldManager manager = BomberTestWorld.Start();
        EntityOrder[] players = Enumerable.Range(0, 8).Select(i => BomberTestWorld.QueuePlayer(manager.World, "skill-" + i)).ToArray();
        manager.Tick(); manager.Tick(); manager.Tick();
        lifeId = players[0].AssignedId;
        return manager;
    }

    private static int CastCount(BomberPresentationJournal journal)
    {
        int count = 0;
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            using JsonDocument occurrence = JsonDocument.Parse(journal.Entries[i]);
            if (occurrence.RootElement.GetProperty("kind").GetString() == "skill_cast") count++;
        }
        return count;
    }

    private static JsonDocument SingleCast(BomberPresentationJournal journal)
    {
        JsonDocument? cast = null;
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            JsonDocument occurrence = JsonDocument.Parse(journal.Entries[i]);
            if (occurrence.RootElement.GetProperty("kind").GetString() == "skill_cast")
            {
                if (cast is not null) { occurrence.Dispose(); cast.Dispose(); throw new InvalidOperationException("Duplicate cast."); }
                cast = occurrence;
            }
            else occurrence.Dispose();
        }
        return cast ?? throw new InvalidOperationException("Missing cast.");
    }

    internal sealed class BlinkVoxelAbi : INativeVoxelAbi
    {
        private readonly System.Collections.Generic.Dictionary<(ulong, int), VoxelCellQuery> _cells = new();
        private readonly MapRow _map;
        internal int ReadCount { get; private set; }

        internal BlinkVoxelAbi(MapRow map)
        {
            _map = map;
            for (int z = 0; z < map.Depth; z++)
            for (int x = 0; x < map.Width; x++)
            {
                Set(x, map.GroundLayer, z, 1022u << 8);
                Set(x, map.ObstacleLayer, z, 0);
            }
        }

        internal void SetObstacle(int x, int z, uint blockId) => Set(x, _map.ObstacleLayer, z, blockId);
        internal void SetGround(int x, int z, uint blockId) => Set(x, _map.GroundLayer, z, blockId);
        internal void SetWater(int x, int z) => Set(x, _map.GroundLayer, z, 1027u << 8);
        internal void SetUnknown(int x, int z) => _cells[Key(x, _map.ObstacleLayer, z)] =
            new VoxelCellQuery(false, VoxelPresence.Ready, 0, 0);
        internal void SetPending(int x, int z) => _cells[Key(x, _map.ObstacleLayer, z)] =
            new VoxelCellQuery(false, VoxelPresence.Pending, 0, 0);

        private void Set(int x, int y, int z, uint blockId) => _cells[Key(x, y, z)] =
            new VoxelCellQuery(true, VoxelPresence.Ready, blockId, 1);

        private static (ulong, int) Key(int x, int y, int z) =>
            (VoxelPackedSection.Encode(x >> 4, (byte)(y >> 4), z >> 4),
                ((y & 15) << 8) | ((z & 15) << 4) | (x & 15));

        public VoxelCellQuery Read(KernelHandle _, ulong sectionKey, int cellOffset)
        {
            ReadCount++;
            return _cells.TryGetValue((sectionKey, cellOffset), out VoxelCellQuery cell) ? cell : default;
        }
        public VoxelSweepHit Sweep(KernelHandle _, VoxelWorldPoint center, VoxelWorldPoint halfExtents, VoxelWorldPoint displacement) => throw new NotSupportedException();
        public VoxelRaycastHit Raycast(KernelHandle _, VoxelWorldPoint origin, VoxelWorldPoint direction, float maxDistance) => throw new NotSupportedException();
        public VoxelOverlapHit Overlap(KernelHandle _, VoxelWorldPoint center, VoxelWorldPoint halfExtents) => throw new NotSupportedException();
        public VoxelApplyReceipt Apply(KernelHandle _, in VoxelApplyBatch batch) => throw new NotSupportedException();
        public string? BindingGet(KernelHandle _, ulong sectionKey, int cellOffset) => throw new NotSupportedException();
        public VoxelSweepHit SweepMiss(KernelHandle _) => throw new NotSupportedException();
        public VoxelSweepHit SweepUnresolved(KernelHandle _) => throw new NotSupportedException();
    }
}
