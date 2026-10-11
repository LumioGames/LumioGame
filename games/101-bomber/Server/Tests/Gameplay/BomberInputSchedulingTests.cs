using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberInputSchedulingTests
{
    private static readonly JsonSerializerOptions TraceOptions = new() { IncludeFields = true, WriteIndented = true };
    [Fact]
    public void FiveReceivedMovesSucceedOnFiveDistinctActualTicks()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        var ledger = scene.World.Get<AttributeComponent>(scene.Lives[0]);
        ledger.SetBaseValue(BomberAttributeNames.AvailableBombs, 10);
        ledger.SetCurrentValue(BomberAttributeNames.AvailableBombs, 10);
        scene.World.Get<AbilityComponent>(scene.Lives[0]).ActivationContext = new AbilityActivationContext(
            () => ledger.GetBaseValue(BomberAttributeNames.AvailableBombs),
            value => ledger.SetBaseValue(BomberAttributeNames.AvailableBombs, value),
            value => ledger.SetCurrentValue(BomberAttributeNames.AvailableBombs, value));
        for (uint sequence = 1; sequence <= 5; sequence++) Move(scene, 0, sequence);
        var results = new List<WorldOperationResult>();
        for (int tick = 1; tick <= 5; tick++)
        {
            scene.Manager.Tick();
            var actual = scene.Manager.DrainOutbox().Operations;
            Trace("five-moves-tick-" + tick, actual);
            results.Add(Assert.Single(actual));
            Assert.Equal(OperationOutcomeKind.Succeeded, results[^1].Outcome.Kind);
            Assert.Equal((ulong)tick, results[^1].Operation.Sequence);
            MovementInputMemoryTests.AssertPosition(MovementInputMemoryTests.Center + Vector3.UnitX * (0.175f * tick), MovementInputMemoryTests.Position(scene));
            Assert.Equal(10 - tick, ledger.GetBaseValue(BomberAttributeNames.AvailableBombs));
            Assert.Equal(10 - tick, ledger.GetCurrentValue(BomberAttributeNames.AvailableBombs));
        }
        Assert.Equal(5, results.Select(result => result.ExecutionTick).Distinct().Count());
        Assert.Equal(0, scene.Manager.PendingIngressCount);
        Assert.Equal(0, scene.Manager.PendingIngressBytes);
    }

    [Fact]
    public void ImmediateBombAndSkillRetainSameTickCooldownAndPlacementCost()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        var skill = scene.World.Get<BomberSkillState>(scene.Lives[0]);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(scene.World).Tables.Characters.Rows.Single(row => row.Id == 118003u));
        Queue(scene, 0, 1, nameof(PlaceBombAbility), new PlaceBombAbility.Input());
        Queue(scene, 0, 2, nameof(PlaceBombAbility), new PlaceBombAbility.Input());
        Queue(scene, 0, 3, nameof(UseActiveSkillAbility), new UseActiveSkillAbility.Input());
        scene.Manager.Tick();
        var results = scene.Manager.DrainOutbox().Operations;
        Assert.Equal(new ulong[] { 1, 2, 3 }, results.Select(result => result.Operation.Sequence));
        Assert.Equal(OperationOutcomeKind.Succeeded, results[0].Outcome.Kind);
        Assert.Equal(OperationOutcomeKind.BusinessReject, results[1].Outcome.Kind);
        Assert.Equal(OperationOutcomeKind.Succeeded, results[2].Outcome.Kind);
        Assert.Single(results.Select(result => result.ExecutionTick).Distinct());
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(0, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(1UL, skill.TeleportSequence.Value);
        Assert.Equal(0, scene.Manager.PendingIngressCount);
    }

    [Fact]
    public void WaitingMoveKeepsBombAndSkillInOrderWhileAnotherConnectionProgresses()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        for (int z = 5; z <= 9; z++)
        for (int x = 5; x <= 9; x++)
        {
            scene.Write(x, 0, z, 1022u << 8);
            scene.Write(x, 1, z, 0);
        }
        var skill = scene.World.Get<BomberSkillState>(scene.Lives[0]);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(scene.World).Tables.Characters.Rows.Single(row => row.Id == 118003u));
        Move(scene, 0, 1);
        Move(scene, 0, 2);
        Queue(scene, 0, 3, nameof(PlaceBombAbility), new PlaceBombAbility.Input());
        Queue(scene, 0, 4, nameof(UseActiveSkillAbility), new UseActiveSkillAbility.Input());
        Move(scene, 0, 5);
        Move(scene, 1, 1);
        ulong before = scene.World.Tick;
        scene.Manager.Tick();
        var first = scene.Manager.DrainOutbox().Operations;
        Trace("mixed-tick-1", first);
        Assert.Equal(2, first.Count);
        Assert.All(first, result => Assert.Equal(OperationOutcomeKind.Succeeded, result.Outcome.Kind));
        Assert.Contains(first, result => result.Operation.Sender == scene.Lives[1]);
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(0UL, skill.TeleportSequence.Value);
        scene.Manager.Tick();
        var second = scene.Manager.DrainOutbox().Operations;
        Trace("mixed-tick-2", second);
        Assert.Equal(new ulong[] { 2, 3, 4 }, second.Select(result => result.Operation.Sequence));
        Assert.All(second, result => { Assert.Equal(OperationOutcomeKind.Succeeded, result.Outcome.Kind); Assert.Equal(before + 2, result.ExecutionTick); });
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(1UL, skill.TeleportSequence.Value);
        Assert.Equal(before + 1, skill.CooldownFromTick.Value);
        scene.Manager.Tick();
        var third = scene.Manager.DrainOutbox().Operations;
        Trace("mixed-tick-3", third);
        Assert.Equal(5UL, Assert.Single(third).Operation.Sequence);
        Assert.Equal(OperationOutcomeKind.Succeeded, third[0].Outcome.Kind);
        Assert.Equal(before + 3, third[0].ExecutionTick);
    }

    [Theory]
    [InlineData("freeze")]
    [InlineData("cooldown")]
    [InlineData("cost")]
    public void RejectedFirstMoveDoesNotBecomeWaitingOrBlockLaterInput(string reason)
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        var owner = scene.World.Get<AbilityComponent>(scene.Lives[0]);
        if (reason == "freeze") _ = BomberFiniteFreezeTests.FreezeForInputFixture(scene.Manager, scene.Lives[0]);
        if (reason == "cooldown") owner.SetCooldown(MoveAbility.TypeId, scene.World.Tick + 100);
        if (reason == "cost") owner.ActivationContext = new AbilityActivationContext(static () => 0, static _ => { }, static _ => { });
        Move(scene, 0, 1);
        Queue(scene, 0, 2, nameof(UseActiveSkillAbility), new UseActiveSkillAbility.Input());
        scene.Manager.Tick();
        var results = scene.Manager.DrainOutbox().Operations;
        Assert.Equal(new ulong[] { 1, 2 }, results.Select(result => result.Operation.Sequence));
        Assert.Equal(OperationOutcomeKind.BusinessReject, results[0].Outcome.Kind);
        Assert.Equal(0, scene.Manager.PendingIngressCount);
    }

    [Theory]
    [InlineData(8, 1048576)]
    [InlineData(256, 16384)]
    public void GeneratedHostRejectsInsufficientCustomBudgetWithoutEnlargingIt(int capacity, long bytes)
    {
        var budget = new WorldIngressBudget(capacity, bytes, 256, 1048576);
        BomberTestWorld.AssertOwnerFailure<ArgumentOutOfRangeException>(() => BomberTestWorld.Start(budget: budget).Dispose());
        Assert.Equal(capacity, budget.Capacity);
        Assert.Equal(bytes, budget.MaxBytes);
    }

    [Fact]
    public void GeneratedHostLoadsSelectedSdkAndProductionNative()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        var release = Lumio.Bomber.Tests.EngineRelease.Root;
        string rid = Lumio.Bomber.Tests.EngineRelease.Rid;
        Lumio.Bomber.Tests.EngineRelease.ValidateLoadedAssembly(typeof(WorldManager).Assembly, $"server/{rid}/SDK/Managed/Lumio.GameRuntime.Ecs.dll");
        Lumio.Bomber.Tests.EngineRelease.ValidateLoadedAssembly(typeof(AbilityComponent).Assembly, $"server/{rid}/SDK/Managed/Lumio.GameRuntime.Gas.dll");
        using Process process = Process.GetCurrentProcess();
        string nativeName = Path.GetFileName(Lumio.Bomber.Tests.EngineRelease.NativeLibrary);
        string actual = Assert.Single(process.Modules.Cast<ProcessModule>(), module => module.ModuleName == nativeName).FileName;
        Lumio.Bomber.Tests.EngineRelease.ValidateNative(actual);
        Trace("loaded-identity", new { release, ecs = typeof(WorldManager).Assembly.Location, gas = typeof(AbilityComponent).Assembly.Location, native = actual, identity = Lumio.Bomber.Tests.EngineRelease.NativeBuildInfo() });
    }

    private static void Move(BomberTerrainProductionTests.Scene scene, int life, uint sequence) =>
        Queue(scene, life, sequence, nameof(MoveAbility), new MoveAbility.Input { PrimaryDirection = BomberDirection.Right });

    private static void Queue(BomberTerrainProductionTests.Scene scene, int life, uint sequence, string ability, IAbilityInput input)
    {
        InputCommandMessage message = MovementInputMemoryTests.Message(scene.Lives[life], ability, input, sequence);
        if (scene.ControlledBinding is not null)
        {
            string connection = "successor-" + life;
            Assert.True(scene.ControlledBinding.TryResolveConnectionState(connection, out _, out ulong generation));
            message = new InputCommandMessage(sequence, message.MappingId, scene.Lives[life], message.Payload, connection, generation)
            { Profile = WireProfile.SuccessorBindingReceiptsPartsV1, WorldIncarnation = scene.Manager.WorldIncarnation, ReceiptParts = new[] { 0 } };
        }
        scene.Manager.Enqueue(message);
    }

    private static void Trace(string name, object value)
    {
        string? directory = Environment.GetEnvironmentVariable("G2B_TEST_EVIDENCE");
        if (directory is not null) File.WriteAllText(Path.Combine(directory, name + ".json"), JsonSerializer.Serialize(value, TraceOptions));
    }
}
