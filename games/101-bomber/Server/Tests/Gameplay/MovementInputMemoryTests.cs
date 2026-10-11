using System;
using System.Collections.Generic;
using System.Globalization;
using System.Numerics;
using System.Reflection;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class MovementInputMemoryTests
{
    [Theory]
    [InlineData(BomberDirection.Up)]
    [InlineData(BomberDirection.Right)]
    [InlineData(BomberDirection.Down)]
    [InlineData(BomberDirection.Left)]
    public void ActualNativeCornerAssistSpendsOneTicksDistanceTowardTheLane(BomberDirection direction)
    {
        using var scene = OpenScene();
        bool horizontal = direction is BomberDirection.Left or BomberDirection.Right;
        Vector3 cross = horizontal ? Vector3.UnitZ : Vector3.UnitX;
        Vector3 before = Center + cross * 0.35f;
        Position(scene, before);
        QueueMove(scene, direction, BomberDirection.None, true, 1);
        scene.Manager.Tick();
        AssertPosition(before - cross * 0.175f, Position(scene));
    }

    [Fact]
    public void EarlyTurnTapContinuesToTheOpeningOnlyWithExplicitIdle()
    {
        using var scene = OpenScene();
        scene.Write(7, 1, 8, 1023u << 8);
        Position(scene, Center);
        QueueMove(scene, BomberDirection.Right, BomberDirection.None, false, 1);
        scene.Manager.Tick();
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 2);
        scene.Manager.Tick();
        for (uint i = 3; i <= 7; i++)
        {
            QueueMove(scene, BomberDirection.None, BomberDirection.None, false, i);
            scene.Manager.Tick();
            Assert.Equal((int)BomberDirection.Down, scene.World.Get<BomberPlayerState>(scene.Lives[0]).Facing.Value);
        }
        Assert.InRange(Position(scene).X, 8.49999f, 8.50001f);
        Assert.InRange(Position(scene).Z, 7.54999f, 7.55001f);
        Vector3 settled = Position(scene);
        scene.Manager.Tick();
        Assert.Equal(settled, Position(scene));
    }

    [Fact]
    public void MultipleCommandsInOneAuthorityTickCannotSpendMultipleMovementBudgets()
    {
        using var scene = OpenScene();
        Position(scene, Center);
        QueueMove(scene, BomberDirection.Right, BomberDirection.None, false, 1);
        QueueMove(scene, BomberDirection.Right, BomberDirection.None, false, 2);
        QueueMove(scene, BomberDirection.Right, BomberDirection.None, false, 2);
        scene.Manager.Tick();
        AssertPosition(Center + Vector3.UnitX * 0.175f, Position(scene));
    }

    [Theory]
    [InlineData(2, false)]
    [InlineData(7, true)]
    [InlineData(1, true)]
    public void RepeatedAssistUsesTheConfiguredLightThresholdButContinuesAnAcceptedSlide(int age, bool moves)
    {
        using var scene = OpenScene();
        while (scene.World.Tick <= 8) scene.Manager.Tick();
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        player.InputMemoryMatchId.Value = scene.World.Single<BomberMatchState>().MatchId.Value;
        player.LastAssistTick.Value = scene.World.Tick - (ulong)age;
        player.AssistToleranceMilli.Value = 500;
        Vector3 before = Center + Vector3.UnitX * 0.35f;
        Position(scene, before);
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 1);
        scene.Manager.Tick();
        AssertPosition(moves ? before - Vector3.UnitX * 0.175f : before, Position(scene));
    }

    [Theory]
    [InlineData(5, true)]
    [InlineData(6, false)]
    public void UnacceptedTurnExpiresAfterExactlySixAuthorityTicks(int delay, bool moves)
    {
        using var scene = OpenScene();
        scene.Write(7, 1, 8, 1023u << 8);
        Position(scene, Center);
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 1);
        scene.Manager.Tick();
        for (int i = 1; i < delay; i++) scene.Manager.Tick();
        scene.Write(7, 1, 8, 0);
        QueueMove(scene, BomberDirection.None, BomberDirection.None, false, 2);
        scene.Manager.Tick();
        AssertPosition(moves ? Center + Vector3.UnitZ * 0.175f : Center, Position(scene));
        Assert.Equal(0UL, scene.World.Get<BomberPlayerState>(scene.Lives[0]).PendingTurnUntilTick.Value);
    }

    [Theory]
    [InlineData(false, false, false)]
    [InlineData(true, false, true)]
    [InlineData(true, true, false)]
    [InlineData(false, false, true, true)]
    public void AssistUsesActualImminentBombAndTerrainFacts(bool brick, bool pierce, bool moves, bool distantFuse = false)
    {
        using var scene = OpenScene();
        if (brick) scene.Write(8, 1, 7, 1025u << 8);
        var order = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], scene.Lives[0], 5901);
        var bomb = order.Get<BomberBombState>();
        bomb.FuseEndTick.Value = scene.World.Tick + 100;
        bomb.Power.Value = 2;
        bomb.PierceLayers.Value = pierce ? 1 : 0;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(9.5f, 1.5f, 7.5f));
        scene.Manager.Tick();
        if (!distantFuse) bomb.FuseEndTick.Value = scene.World.Tick + 1;
        Vector3 before = new(7.85f, 1.5f, 6.5f);
        Position(scene, before);
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 1);
        scene.Manager.Tick();
        AssertPosition(moves ? before - Vector3.UnitX * 0.175f : before, Position(scene));
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.Equal(0, bomb.ReachLeft.Value);
        Assert.Equal(0, bomb.TerrainContinuations.Count);
    }

    [Fact]
    public void PairedColdRestoreContinuesTheSameTurnWithNewExplicitIdleInputs()
    {
        using var scene = OpenScene(persistence: true);
        scene.Write(7, 1, 8, 1023u << 8);
        Position(scene, Center);
        QueueMove(scene, BomberDirection.Right, BomberDirection.None, false, 1);
        scene.Manager.Tick();
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 2);
        scene.Manager.Tick();
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using WorldManager restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        var original = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        var copy = restored.World.Get<BomberPlayerState>(scene.Lives[0]);
        Assert.Equal(original.PendingTurnUntilTick.Value, copy.PendingTurnUntilTick.Value);
        Assert.Equal(original.LastMoveDirection.Value, copy.LastMoveDirection.Value);
        for (int i = 0; i < 7; i++)
        {
            uint sequence = checked((uint)i + 3);
            QueueMove(scene, BomberDirection.None, BomberDirection.None, false, sequence);
            restored.Enqueue(Message(scene.Lives[0], nameof(MoveAbility), default(MoveAbility.Input), checked((uint)i + 1), sequence));
            scene.Manager.Tick(); restored.Tick();
            AssertPosition(Position(scene), restored.World.Get<LogicTransform>(scene.Lives[0]).LocalPosition);
            Assert.Equal(original.PendingTurnUntilTick.Value, copy.PendingTurnUntilTick.Value);
        }
        AssertPosition(new Vector3(8.5f, 1.5f, 7.55f), Position(scene));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ExplicitIdleWithoutTurnBufferPreservesFacingAndPositionAndCreatesNoBuffer(bool turnPressed)
    {
        using var scene = OpenScene();
        Position(scene, Center);
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        player.Facing.Value = (int)BomberDirection.Left;
        QueueMove(scene, BomberDirection.None, BomberDirection.None, turnPressed, 1);
        scene.Manager.Tick();
        Assert.Equal(OperationOutcomeKind.Succeeded, Assert.Single(scene.Manager.DrainOutbox().Operations).Outcome.Kind);
        AssertPosition(Center, Position(scene));
        Assert.Equal((int)BomberDirection.Left, player.Facing.Value);
        Assert.Equal(0UL, player.PendingTurnUntilTick.Value);
        Assert.Equal(0, player.PendingTurnDirection.Value);
    }

    [Fact]
    public void AbsentInputDoesNotContinueAnUnexpiredTurnBuffer()
    {
        using var scene = OpenScene();
        scene.Write(7, 1, 8, 1023u << 8);
        Position(scene, Center);
        QueueMove(scene, BomberDirection.Right, BomberDirection.None, false, 1);
        scene.Manager.Tick();
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 2);
        scene.Manager.Tick();
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        Assert.True(player.PendingTurnUntilTick.Value > scene.World.Tick);
        Vector3 before = Position(scene);
        scene.Manager.Tick();
        AssertPosition(before, Position(scene));
        Assert.True(player.PendingTurnUntilTick.Value > scene.World.Tick);
    }

    [Fact]
    public void ActualFiniteFreezeClearsBothInputMemories()
    {
        using var scene = OpenScene();
        _ = BomberFiniteFreezeTests.FreezeForInputFixture(scene.Manager, scene.Lives[0]);
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        player.InputMemoryMatchId.Value = scene.World.Single<BomberMatchState>().MatchId.Value;
        player.PendingTurnUntilTick.Value = player.PendingPlaceUntilTick.Value = scene.World.Tick + 5;
        player.PendingTurnDirection.Value = (int)BomberDirection.Right;
        player.LastMoveTick.Value = scene.World.Tick - 1;
        player.LastMoveDirection.Value = (int)BomberDirection.Down;
        Vector3 before = Position(scene);
        scene.Manager.Tick();
        AssertPosition(before, Position(scene));
        Assert.Equal(0UL, player.PendingTurnUntilTick.Value);
        Assert.Equal(0UL, player.PendingPlaceUntilTick.Value);
        Assert.Equal(0, player.LastMoveDirection.Value);
    }

    [Fact]
    public void SuccessfulBlinkClearsOnlyMovementMemory()
    {
        using var scene = OpenScene();
        Position(scene, Center + Vector3.UnitX * 0.35f);
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 1);
        scene.Manager.Tick();
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        Assert.True(player.PendingTurnUntilTick.Value > scene.World.Tick);
        player.PendingPlaceUntilTick.Value = scene.World.Tick + 2;
        ulong placement = player.PendingPlaceUntilTick.Value;
        var skill = scene.World.Get<BomberSkillState>(scene.Lives[0]);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(scene.World).Tables.Characters.Rows.Single(r => r.Id == 118003u));
        player.Facing.Value = (int)BomberDirection.Right;
        var ability = new UseActiveSkillAbility();
        var owner = scene.World.Get<AbilityComponent>(scene.Lives[0]);
        Assert.True(ability.CanActivate(default, owner, out string? reason), reason);
        ability.Execute(default, owner);
        Assert.Equal(1UL, skill.TeleportSequence.Value);
        Assert.Equal(0UL, player.PendingTurnUntilTick.Value);
        Assert.Equal(0, player.PendingTurnDirection.Value);
        Assert.Equal(0, player.LastMoveDirection.Value);
        Assert.Equal(placement, player.PendingPlaceUntilTick.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NewMovementInputCannotReuseAStaleLifeOrMatch(bool staleMatch)
    {
        using var scene = OpenScene();
        Position(scene, Center);
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        if (staleMatch) scene.World.Get<BomberParticipantState>(player.Participant.Value).MatchId.Value++;
        else player.LifeGeneration.Value++;
        QueueMove(scene, BomberDirection.Right, BomberDirection.None, true, 1);
        scene.Manager.Tick();
        AssertPosition(Center, Position(scene));
        Assert.Equal(0UL, player.PendingTurnUntilTick.Value);
    }

    [Theory]
    [InlineData(0u, false, false, false)]
    [InlineData(1023u, false, false, true)]
    [InlineData(1025u, false, false, true)]
    [InlineData(1025u, true, false, false)]
    [InlineData(0u, false, true, true)]
    public void AutomaticAssistAvoidsTheLongFuseRayOfAnImminentChain(uint barrier, bool pierce, bool distantFuse, bool moves)
    {
        using var scene = OpenScene();
        if (barrier != 0) scene.Write(9, 1, 8, barrier << 8);
        var shortOrder = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], scene.Lives[0], 5910);
        var longOrder = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], scene.Lives[0], 5911);
        var first = shortOrder.Get<BomberBombState>();
        var chained = longOrder.Get<BomberBombState>();
        first.Power.Value = chained.Power.Value = 2;
        first.PierceLayers.Value = pierce ? 1 : 0;
        first.FuseEndTick.Value = chained.FuseEndTick.Value = scene.World.Tick + 100;
        BomberEffectIntegrationTests.Position(shortOrder.Get<LogicTransform>(), new Vector3(9.5f, 1.5f, 9.5f));
        BomberEffectIntegrationTests.Position(longOrder.Get<LogicTransform>(), new Vector3(9.5f, 1.5f, 7.5f));
        scene.Manager.Tick();
        if (!distantFuse) first.FuseEndTick.Value = scene.World.Tick + 1;
        Vector3 before = new(7.85f, 1.5f, 6.5f);
        Position(scene, before);
        QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 1);
        scene.Manager.Tick();
        Vector3 afterInput = Position(scene);
        if (barrier == 0 && !distantFuse)
        {
            scene.Manager.Tick();
            Assert.Equal((int)BomberBombPhase.Danger, first.Phase.Value);
            Assert.Equal((int)BomberBombPhase.Danger, chained.Phase.Value);
            Assert.Equal(2, chained.ReachLeft.Value);
        }
        AssertPosition(moves ? before - Vector3.UnitX * 0.175f : before, afterInput);
    }

    internal static readonly Vector3 Center = new(7.5f, 1.5f, 7.5f);

    internal static BomberTerrainProductionTests.Scene OpenScene(bool persistence = false)
    {
        var scene = new BomberTerrainProductionTests.Scene(0, persistence: persistence);
        for (int z = 5; z <= 9; z++)
        for (int x = 5; x <= 9; x++)
        {
            scene.Write(x, 0, z, 1022u << 8);
            scene.Write(x, 1, z, 0);
        }
        uint hz = BomberConfigBinding.For(scene.World).Game.TickRateHz;
        scene.World.Get<AttributeComponent>(scene.Lives[0])
            .SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, checked(hz * 175L));
        return scene;
    }

    internal static Vector3 Position(BomberTerrainProductionTests.Scene scene) =>
        scene.World.Get<LogicTransform>(scene.Lives[0]).LocalPosition;

    internal static void Position(BomberTerrainProductionTests.Scene scene, Vector3 value) =>
        MoveAbility.WritePosition(scene.World, scene.Lives[0], value, nameof(MoveAbility));

    internal static void QueueMove(BomberTerrainProductionTests.Scene scene, BomberDirection primary,
        BomberDirection secondary, bool turnPressed, uint sequence) =>
        scene.Manager.Enqueue(MoveMessage(scene.Lives[0], sequence, primary, secondary, turnPressed));

    private static InputCommandMessage MoveMessage(NetEntityId life, uint sequence, BomberDirection primary,
        BomberDirection secondary, bool turnPressed) => Message(life, nameof(MoveAbility),
            new MoveAbility.Input { PrimaryDirection = primary, SecondaryDirection = secondary, TurnPressed = turnPressed }, sequence);

    internal static void Queue(BomberTerrainProductionTests.Scene scene, string ability, IAbilityInput input, uint sequence, ulong? abilitySequence = null)
        => scene.Manager.Enqueue(Message(scene.Lives[0], ability, input, sequence, abilitySequence));

    internal static InputCommandMessage Message(NetEntityId life, string ability, IAbilityInput input, uint sequence, ulong? abilitySequence = null)
    {
        var args = new List<object?> { ability };
        input.Write(args);
        args.Add((abilitySequence ?? sequence).ToString(CultureInfo.InvariantCulture));
        MethodInfo encode = typeof(WireCodec).GetMethod("EncodeServerRpc", BindingFlags.Static | BindingFlags.NonPublic,
            null, new[] { typeof(string), typeof(string), typeof(object[]) }, null)!;
        byte[] payload = (byte[])encode.Invoke(null, new object[] { nameof(AbilityComponent), "Activate", args.ToArray() })!;
        return new InputCommandMessage(sequence, WireCodec.ServerRpc, life, payload);
    }

    internal static void AssertPosition(Vector3 expected, Vector3 actual) =>
        Assert.InRange(Vector3.Distance(expected, actual), 0, 0.00001f);
}
