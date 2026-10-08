using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.Reflection;
using Lumio.Config.Generated.Server;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using KernelHandle = Lumio.Engine.NativeLoader.KernelHandle;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class MovementAuthorityTests
{
    public static IEnumerable<object[]> CrossingCases()
    {
        foreach (BomberDirection direction in new[] { BomberDirection.Up, BomberDirection.Right,
                     BomberDirection.Down, BomberDirection.Left })
        foreach (bool sourceWater in new[] { false, true })
        foreach (bool multipleCells in new[] { false, true })
            yield return new object[] { direction, sourceWater, multipleCells };
    }

    [Theory]
    [MemberData(nameof(CrossingCases))]
    public void TerrainCrossingsSpendTimeAtEachCellsSpeed(BomberDirection direction, bool sourceWater,
        bool multipleCells)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 delta = DirectionVector(direction);
        Vector3 center = new(10.5f, Position(world, player).Y, 10.5f);
        Vector3 origin = center + delta * 0.4f;
        MoveAbility.WritePosition(world, player, origin, nameof(MoveAbility));
        SetTickRate(world, 20);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli,
            multipleCells ? 100000 : 10000);
        for (int step = 0; step < 8; step++)
        {
            Vector3 cell = center + delta * step;
            if ((step % 2 == 0) == sourceWater)
                fixture.Abi.SetWater(BomberMatchRules.CellX(cell), BomberMatchRules.CellZ(cell));
        }
        Assert.Equal(700, BomberConfigBinding.For(world).Movement.WaterSpeedPermille);
        // At 10/s: 0.1 source cell then destination. At 100/s: four full
        // alternating cells after that 0.1, followed by the remaining time.
        double distance = multipleCells
            ? sourceWater ? 4.1 + (0.05 - 2.1 / 70 - 2.0 / 100) * 100
                          : 4.1 + (0.05 - 2.1 / 100 - 2.0 / 70) * 70
            : sourceWater ? 0.1 + (0.05 - 0.1 / 7) * 10
                          : 0.1 + (0.05 - 0.1 / 10) * 7;
        Move(world, player, direction);
        AssertPosition(origin + delta * (float)distance, Position(world, player));
    }

    [Theory]
    [InlineData(BomberDirection.Up)]
    [InlineData(BomberDirection.Right)]
    [InlineData(BomberDirection.Down)]
    [InlineData(BomberDirection.Left)]
    public void NewBlockerBetweenInputTicksDoesNotPushOrTunnel(BomberDirection direction)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 delta = DirectionVector(direction);
        Vector3 center = new(10.5f, Position(world, player).Y, 10.5f);
        MoveAbility.WritePosition(world, player, center, nameof(MoveAbility));
        SetTickRate(world, 20);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 8000);
        QueueMove(manager, player, direction, 1);
        manager.Tick();
        Vector3 before = Position(world, player);
        AssertPosition(center + delta * 0.4f, before);
        Vector3 blocked = center + delta;
        fixture.Abi.SetObstacle(BomberMatchRules.CellX(blocked), BomberMatchRules.CellZ(blocked), 1023u << 8);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 1000);
        QueueMove(manager, player, direction, 2);
        manager.Tick();
        Assert.InRange(Vector3.Distance(before, Position(world, player)), 0, 0.050001f);
        Assert.Equal(before, Position(world, player));
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 100000);
        QueueMove(manager, player, direction, 3);
        manager.Tick();
        Assert.Equal(before, Position(world, player));
        Assert.Equal(BomberMatchRules.CellX(center), BomberMatchRules.CellX(Position(world, player)));
        Assert.Equal(BomberMatchRules.CellZ(center), BomberMatchRules.CellZ(Position(world, player)));
        Assert.Equal(BomberConfigBinding.For(world).Map.Width * BomberConfigBinding.For(world).Map.Depth * 6,
            fixture.Abi.ReadCount);
    }

    [Theory]
    [InlineData(BomberDirection.Up)]
    [InlineData(BomberDirection.Right)]
    [InlineData(BomberDirection.Down)]
    [InlineData(BomberDirection.Left)]
    public void PartialOwnBombExitCannotReenterOrPushBack(BomberDirection direction)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 delta = DirectionVector(direction);
        Vector3 center = new(10.5f, Position(world, player).Y, 10.5f);
        MoveAbility.WritePosition(world, player, center, nameof(MoveAbility));
        QueueAbility(manager, player, nameof(PlaceBombAbility), 1, new PlaceBombAbility.Input());
        manager.Tick();
        Assert.Single(world.Each<BomberBombState>());
        SetTickRate(world, 20);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 12000);
        QueueMove(manager, player, direction, 2);
        manager.Tick();
        Vector3 before = Position(world, player);
        AssertPosition(center + delta * 0.6f, before);
        BomberDirection reverse = direction switch
        {
            BomberDirection.Up => BomberDirection.Down, BomberDirection.Down => BomberDirection.Up,
            BomberDirection.Left => BomberDirection.Right, _ => BomberDirection.Left,
        };
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 1000);
        QueueMove(manager, player, reverse, 3);
        manager.Tick();
        Assert.InRange(Vector3.Distance(before, Position(world, player)), 0, 0.050001f);
        Assert.Equal(before, Position(world, player));
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 100000);
        QueueMove(manager, player, reverse, 4);
        manager.Tick();
        Assert.Equal(before, Position(world, player));
    }

    [Theory]
    [InlineData(BomberDirection.Up)]
    [InlineData(BomberDirection.Right)]
    [InlineData(BomberDirection.Down)]
    [InlineData(BomberDirection.Left)]
    public void SweepApproachesStoppingCenterWithinBudget(BomberDirection direction)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 delta = DirectionVector(direction);
        Vector3 center = new(10.5f, Position(world, player).Y, 10.5f);
        Vector3 blocked = center + delta;
        fixture.Abi.SetObstacle(BomberMatchRules.CellX(blocked), BomberMatchRules.CellZ(blocked), 1023u << 8);
        Vector3 origin = center - delta * 2.25f;
        MoveAbility.WritePosition(world, player, origin, nameof(MoveAbility));
        SetTickRate(world, 20);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 100000);
        Move(world, player, direction);
        AssertPosition(center, Position(world, player));
        Assert.InRange(Vector3.Distance(origin, Position(world, player)), 0, 5);
    }

    [Theory]
    [InlineData(BomberDirection.Left, false)]
    [InlineData(BomberDirection.Left, true)]
    [InlineData(BomberDirection.Up, false)]
    [InlineData(BomberDirection.Up, true)]
    public void NegativeExactBoundaryUsesDestinationSpeedWithoutEnteringBlocker(BomberDirection direction, bool blocked)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 delta = DirectionVector(direction);
        Vector3 center = new(10.5f, Position(world, player).Y, 10.5f);
        Vector3 origin = center + delta * 0.5f;
        Vector3 destination = center + delta;
        fixture.Abi.SetWater(BomberMatchRules.CellX(destination), BomberMatchRules.CellZ(destination));
        if (blocked) fixture.Abi.SetObstacle(BomberMatchRules.CellX(destination), BomberMatchRules.CellZ(destination), 1023u << 8);
        MoveAbility.WritePosition(world, player, origin, nameof(MoveAbility));
        SetTickRate(world, 20);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 10000);
        Move(world, player, direction);
        AssertPosition(blocked ? origin : origin + delta * 0.35f, Position(world, player));
    }

    [Fact]
    public void QueuedMoveAndBlinkExecuteInSameTickWithOneTerrainBatch()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = new(10.5f, Position(world, player).Y, 10.5f);
        MoveAbility.WritePosition(world, player, origin, nameof(MoveAbility));
        NetEntityId blinker = world.Each<BomberPlayerState>().Select(p => p.Entity).First(id => id != player);
        MoveAbility.WritePosition(world, blinker, origin, nameof(MoveAbility));
        world.Get<BomberPlayerState>(blinker).Facing.Value = (int)BomberDirection.Down;
        BomberSkillState skill = world.Get<BomberSkillState>(blinker);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows
            .Single(row => row.Id == 118003u));
        SetTickRate(world, 20);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 1000);
        QueueMove(manager, player, BomberDirection.Right, 1);
        QueueAbility(manager, blinker, nameof(UseActiveSkillAbility), 1, new UseActiveSkillAbility.Input());
        manager.Tick();
        AssertPosition(origin + Vector3.UnitX * 0.05f, Position(world, player));
        AssertPosition(origin + Vector3.UnitZ * BomberConfigBinding.For(world).SkillLevel(3, 1).RangeCells,
            Position(world, blinker));
        Assert.Equal(1ul, skill.TeleportSequence.Value);
        Assert.Equal(BomberConfigBinding.For(world).Map.Width * BomberConfigBinding.For(world).Map.Depth * 2,
            fixture.Abi.ReadCount);
        fixture.Abi.SetWater(10, 10);
        Vector3 before = Position(world, player);
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 1000);
        QueueMove(manager, player, BomberDirection.Right, 2);
        manager.Tick();
        AssertPosition(before + Vector3.UnitX * 0.035f, Position(world, player));
        Assert.Equal(BomberConfigBinding.For(world).Map.Width * BomberConfigBinding.For(world).Map.Depth * 4,
            fixture.Abi.ReadCount);
    }

    private static Vector3 DirectionVector(BomberDirection direction) => direction switch
    {
        BomberDirection.Up => -Vector3.UnitZ, BomberDirection.Right => Vector3.UnitX,
        BomberDirection.Down => Vector3.UnitZ, _ => -Vector3.UnitX,
    };

    private static void AssertPosition(Vector3 expected, Vector3 actual) =>
        Assert.InRange(Vector3.Distance(expected, actual), 0, 0.00001f);

    private static void QueueMove(WorldManager manager, NetEntityId player, BomberDirection direction, uint sequence) =>
        QueueAbility(manager, player, nameof(MoveAbility), sequence,
            new MoveAbility.Input { PrimaryDirection = direction });

    private static void QueueAbility(WorldManager manager, NetEntityId player, string ability, uint sequence, IAbilityInput input)
    {
        var args = new List<object?> { ability };
        input.Write(args);
        args.Add(sequence.ToString(CultureInfo.InvariantCulture));
        MethodInfo encode = typeof(WireCodec).GetMethod("EncodeServerRpc", BindingFlags.Static | BindingFlags.NonPublic,
            null, new[] { typeof(string), typeof(string), typeof(object[]) }, null)!;
        byte[] payload = (byte[])encode.Invoke(null, new object[] { nameof(AbilityComponent), "Activate", args.ToArray() })!;
        manager.Enqueue(new InputCommandMessage(sequence, WireCodec.ServerRpc, player, payload));
    }

    [Theory]
    [InlineData("solid")]
    [InlineData("unknown")]
    [InlineData("pending")]
    [InlineData("air")]
    public void UnwalkableOrUnreadableTerrainStopsMovement(string terrain)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        int x = BomberMatchRules.CellX(origin) + 1;
        int z = BomberMatchRules.CellZ(origin);
        switch (terrain)
        {
            case "solid": fixture.Abi.SetObstacle(x, z, 1023u << 8); break;
            case "unknown": fixture.Abi.SetUnknown(x, z); break;
            case "pending": fixture.Abi.SetPending(x, z); break;
            case "air": fixture.Abi.SetGround(x, z, 0); break;
        }
        Move(world, player, BomberDirection.Right);
        Assert.Equal(origin, Position(world, player));
        Assert.Equal((int)BomberDirection.Right, world.Get<BomberPlayerState>(player).Facing.Value);
    }

    [Fact]
    public void MissingAdapterFailsClosedAndFrozenInputPreservesFacing()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        Vector3 origin = Position(world, player);
        Move(world, player, BomberDirection.Right);
        Assert.Equal(origin, Position(world, player));
        Assert.Equal((int)BomberDirection.Right, world.Get<BomberPlayerState>(player).Facing.Value);
        BomberFiniteFreezeTests.FreezeForInputFixture(manager, player);
        Move(world, player, BomberDirection.Down);
        Assert.Equal(origin, Position(world, player));
        Assert.Equal((int)BomberDirection.Right, world.Get<BomberPlayerState>(player).Facing.Value);
    }

    [Fact]
    public void PendingVoxelTransactionStopsMovementBeforeReadingTheAdapter()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Add("movement-test");
        Move(world, player, BomberDirection.Right);
        Assert.Equal(origin, Position(world, player));
        Assert.Equal(0, fixture.Abi.ReadCount);
    }

    [Fact]
    public void WaterUsesCurrentCellSpeedAndZeroSpeedDoesNotMove()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        Move(world, player, BomberDirection.Right);
        float dryDistance = Position(world, player).X - origin.X;
        Assert.True(dryDistance > 0);
        MoveAbility.WritePosition(world, player, origin, nameof(MoveAbility));
        fixture.Abi.SetWater(BomberMatchRules.CellX(origin), BomberMatchRules.CellZ(origin));
        manager.Tick();
        Move(world, player, BomberDirection.Right);
        float waterDistance = Position(world, player).X - origin.X;
        Assert.InRange(waterDistance / dryDistance,
            BomberConfigBinding.For(world).Movement.WaterSpeedPermille / 1000f - 0.001f,
            BomberConfigBinding.For(world).Movement.WaterSpeedPermille / 1000f + 0.001f);
        MoveAbility.WritePosition(world, player, origin, nameof(MoveAbility));
        world.Get<AttributeComponent>(player).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 0);
        Move(world, player, BomberDirection.Right);
        Assert.Equal(origin, Position(world, player));
    }

    [Fact]
    public void SweepStopsAtCenterBeforeWallEvenWhenOneStepCrossesMultipleCells()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        int x = BomberMatchRules.CellX(origin);
        int z = BomberMatchRules.CellZ(origin);
        fixture.Abi.SetObstacle(x + 2, z, 1023u << 8);
        SetTickRate(world, 1);
        Move(world, player, BomberDirection.Right);
        Assert.Equal(x + 1.5f, Position(world, player).X);
        Assert.Equal(origin.Z, Position(world, player).Z);
    }

    [Fact]
    public void PerpendicularFallbackPreservesPrimaryFacingButOppositeDoesNotFallback()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        fixture.Abi.SetObstacle(BomberMatchRules.CellX(origin) + 1, BomberMatchRules.CellZ(origin), 1023u << 8);
        Move(world, player, BomberDirection.Right, BomberDirection.Left);
        Assert.Equal(origin, Position(world, player));
        Move(world, player, BomberDirection.Right, BomberDirection.Down);
        Assert.True(Position(world, player).Z > origin.Z);
        Assert.Equal(origin.X, Position(world, player).X);
        Assert.Equal((int)BomberDirection.Right, world.Get<BomberPlayerState>(player).Facing.Value);
    }

    [Fact]
    public void OffLaneTurnDoesNotCreateDiagonalMovement()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        var offLane = origin + new Vector3(0.15f, 0, 0);
        MoveAbility.WritePosition(world, player, offLane, nameof(MoveAbility));
        Move(world, player, BomberDirection.Up, BomberDirection.Right);
        Assert.Equal(offLane.Z, Position(world, player).Z);
        Assert.True(Position(world, player).X > offLane.X);
        Assert.Equal((int)BomberDirection.Up, world.Get<BomberPlayerState>(player).Facing.Value);
    }

    [Fact]
    public void OtherPlayersDoNotBlockMovement()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        NetEntityId other = world.Each<BomberPlayerState>().Select(p => p.Entity).First(id => id != player);
        MoveAbility.WritePosition(world, other, origin + Vector3.UnitX, nameof(MoveAbility));
        Move(world, player, BomberDirection.Right);
        Assert.True(Position(world, player).X > origin.X);
    }

    [Fact]
    public void OwnBombCanBeExitedButBlocksReentryAndOtherGenerationCannotUseExit()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        new PlaceBombAbility().Execute(default, world.Get<AbilityComponent>(player));
        manager.Tick();
        BomberBombState bomb = Assert.Single(world.Each<BomberBombState>());
        BomberPlayerState state = world.Get<BomberPlayerState>(player);
        BomberParticipantState participant = world.Get<BomberParticipantState>(state.Participant.Value);
        state.LifeGeneration.Value++;
        participant.LifeGeneration.Value = state.LifeGeneration.Value;
        Move(world, player, BomberDirection.Right);
        Assert.Equal(origin, Position(world, player));
        state.LifeGeneration.Value--;
        participant.LifeGeneration.Value = state.LifeGeneration.Value;
        for (int i = 0; i < 5; i++) { Move(world, player, BomberDirection.Right); manager.Tick(); }
        Assert.Equal(BomberMatchRules.CellX(origin) + 1, BomberMatchRules.CellX(Position(world, player)));
        Move(world, player, BomberDirection.Left);
        Assert.Equal(BomberMatchRules.CellX(origin) + 1, BomberMatchRules.CellX(Position(world, player)));
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
    }

    [Theory]
    [InlineData(BomberBombPhase.Fuse, false)]
    [InlineData(BomberBombPhase.Danger, true)]
    [InlineData(BomberBombPhase.Expired, true)]
    public void OnlyFuseBombsBlockEntry(BomberBombPhase phase, bool shouldMove)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        new PlaceBombAbility().Execute(default, world.Get<AbilityComponent>(player));
        manager.Tick();
        BomberBombState bomb = Assert.Single(world.Each<BomberBombState>());
        MoveAbility.WritePosition(world, bomb.Entity, origin + Vector3.UnitX, nameof(MoveAbility));
        bomb.Phase.Value = (int)phase;
        Move(world, player, BomberDirection.Right);
        Assert.Equal(shouldMove, Position(world, player).X > origin.X);
    }

    [Fact]
    public void AutomaticFallbackDoesNotEnterCommittedDangerFromSafeCell()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Vector3 origin = Position(world, player);
        fixture.Abi.SetObstacle(BomberMatchRules.CellX(origin) + 1, BomberMatchRules.CellZ(origin), 1023u << 8);
        new PlaceBombAbility().Execute(default, world.Get<AbilityComponent>(player));
        manager.Tick();
        BomberBombState bomb = Assert.Single(world.Each<BomberBombState>());
        MoveAbility.WritePosition(world, bomb.Entity, origin + Vector3.UnitZ, nameof(MoveAbility));
        bomb.Phase.Value = (int)BomberBombPhase.Danger;
        bomb.DangerUntilTick.Value = world.Tick + 10;
        Move(world, player, BomberDirection.Right, BomberDirection.Down);
        Assert.Equal(origin, Position(world, player));
        MoveAbility.WritePosition(world, bomb.Entity, origin, nameof(MoveAbility));
        bomb.ReachDown.Value = 1;
        Move(world, player, BomberDirection.Right, BomberDirection.Down);
        Assert.True(Position(world, player).Z > origin.Z);
    }

    [Fact]
    public void MoveAndBlinkShareOneTerrainBatchPerTick()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId player);
        World world = manager.World;
        var fixture = Bind(manager);
        using IDisposable binding = fixture.Binding;
        Move(world, player, BomberDirection.Right);
        BomberSkillState skill = world.Get<BomberSkillState>(player);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows
            .Single(row => row.Id == 118003u));
        Assert.True(new UseActiveSkillAbility().CanActivate(default, world.Get<AbilityComponent>(player), out _));
        Assert.Equal(BomberConfigBinding.For(world).Map.Width * BomberConfigBinding.For(world).Map.Depth * 2,
            fixture.Abi.ReadCount);
    }

    private static (SkillAuthorityTests.BlinkVoxelAbi Abi, IDisposable Binding) Bind(WorldManager manager)
    {
        var abi = new SkillAuthorityTests.BlinkVoxelAbi(BomberConfigBinding.For(manager.World).Map);
        var adapter = new HostVoxelWorldAdapter(new KernelHandle { Generation = 1 }, abi) { World = manager.World };
        return (abi, VoxelGameplayBinding.Bind(manager, adapter));
    }

    private static Vector3 Position(World world, NetEntityId player) => world.Get<LogicTransform>(player).LocalPosition;

    private static void Move(World world, NetEntityId player, BomberDirection primary,
        BomberDirection secondary = BomberDirection.None) => new MoveAbility().Execute(
            new MoveAbility.Input { PrimaryDirection = primary, SecondaryDirection = secondary },
            world.Get<AbilityComponent>(player));

    private static void SetTickRate(World world, uint tickRate)
    {
        IBomberConfig config = BomberConfigBinding.For(world);
        GameRow old = config.Game;
        var changed = new GameRow(old.Id, old.Name, tickRate, old.PlayerCount,
            old.MapSize, old.WarmupMs, old.MatchDurationMs, old.PodiumMs,
            old.ResultsMs, old.SkillsEnabled, old.DefaultBotProfile, old.SourceStatus, old.SourceRef, old.InitialSeed,
            old.CentralSupplyEnabled, old.CentralSupplyAnnounceMs, old.CentralSupplyOpenMs,
            old.CentralSupplyStrengtheningCount, old.CentralSupplyHealthCount, old.CentralSupplyFrenzyCount,
            old.CentralSupplySpecialCount, old.CentralSupplyGoldenHeartCount, old.FrenzyEnabled,
            old.FrenzyDurationMs, old.FrenzyFuseMs, old.FrenzyConcurrentLimit, old.FrenzyMinPlacementTicks);
        config.GetType().GetField("<Game>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)!
            .SetValue(config, changed);
    }
}
