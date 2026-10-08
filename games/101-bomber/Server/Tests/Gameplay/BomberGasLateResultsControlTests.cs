using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Reflection;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// PRIVATE TOOLING DRAFT, UNRUN. Authored Native bomb/phase fixture isolates the
// reachable cleanup branch. Public non-Favorite Auras and all finite rows/deaths
// are real Effects/GAS results. No death intent, finite row or receipt is forged.
[Collection("BomberWorld")]
public sealed class BomberGasLateResultsControlTests
{
    private static readonly JsonSerializerOptions EvidenceJsonOptions = new() { WriteIndented = true };

    [Fact]
    public void LateResultsDeathCanDemandTwoFullSweepsPlusAuraDeathAndFreezeCleanupBeforeQueuedDestroyCommits()
    {
        string? outputDirectory = Environment.GetEnvironmentVariable("LUMIO_BOMBER_GAS_DIAGNOSTIC_DIR");
        Assert.False(string.IsNullOrWhiteSpace(outputDirectory));
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        using var receipts = new ReceiptProbe(world);
        var match = world.Single<BomberMatchState>();
        for (int z = 1; z <= 17; z++) for (int x = 1; x <= 17; x++)
        {
            uint block = scene.Native.ReadCell(new VoxelWorldCoordinate(x, 1, z)).BlockId >> 8;
            if (block is 1025u or 1026u) scene.Write(x, 1, z, 0);
        }
        scene.Write(9, 1, 9, 0);
        match.Phase.Value = (int)BomberMatchPhase.Warmup; match.PhaseEndTick.Value = world.Tick + 100;
        foreach (NetEntityId life in scene.Lives)
        {
            var player = world.Get<BomberPlayerState>(life);
            var participant = world.Get<BomberParticipantState>(player.Participant.Value);
            var skill = world.Get<BomberSkillState>(life);
            participant.SelectedForMatchCharacterId.Value = 0; skill.CharacterId.Value = 0;
            var input = new SelectCharacterAbility.Input { CharacterId = 118004 };
            var selected = world.Get<AbilityComponent>(life).Activate<SelectCharacterAbility, SelectCharacterAbility.Input>(in input);
            Assert.True(selected.Succeeded, selected.FailureCode);
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
            Assert.Equal(0u, skill.BombSkillId.Value);
        }
        match.Phase.Value = (int)BomberMatchPhase.Running;
        foreach (NetEntityId life in scene.Lives)
        {
            var cast = world.Get<AbilityComponent>(life).Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default);
            Assert.True(cast.Succeeded, cast.FailureCode);
            Assert.False(world.Get<BomberSkillState>(life).AuraFavorite.Value);
        }
        scene.TickControlled();
        Assert.False(BomberFavoriteFireZones.HasPending(world));
        Assert.All(scene.Lives, life => Assert.True(world.Get<EffectComponent>(life).HasActiveEffect(10111u, world.Tick)));
        // Creation order ensures Freeze -> surviving ordinary hit/Immunity ->
        // lethal ordinary hit, all at one genuine Native F before cleanup.
        for (int n = 0; n < 3; n++)
        {
            EntityOrder order = BomberBombAdmissions.CreatePrimary(world);
            var source = world.Get<BomberPlayerState>(scene.Lives[1]);
            var bomb = order.Get<BomberBombState>();
            bomb.Owner.Value = source.Participant.Value; bomb.SourceLife.Value = source.Entity;
            bomb.SourceLifeGeneration.Value = source.LifeGeneration.Value;
            bomb.ChainId.Value = checked(100300UL + (ulong)n);
            bomb.BombKind.Value = n == 0 ? (int)BomberBombKind.Freeze : (int)BomberBombKind.Standard;
            bomb.Phase.Value = (int)BomberBombPhase.Fuse; bomb.Power.Value = 2;
            bomb.FuseEndTick.Value = world.Tick + 1; bomb.PlacedAtTick.Value = world.Tick;
            bomb.CapacityReturned.Value = true;
            BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(9.5f, 1.5f, 9.5f));
        }
        scene.TickControlled(); // actual bomb publication
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick + 1; // elapsed on the following cleanup Tick
        scene.TickControlled(); // actual lethal damage + finite Freeze/Immunity
        Assert.Equal(0, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.All(world.Each<BomberBombState>(), bomb => Assert.Equal(0, bomb.TerrainContinuations.Count));
        Assert.All(scene.Lives, life =>
        {
            var player = world.Get<BomberPlayerState>(life);
            Assert.True(world.Get<BomberParticipantState>(player.Participant.Value).DeathStructurePending.Value);
            Assert.Equal(0L, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Equal(3, world.Get<EffectComponent>(life).ActiveEffects.Count);
        });
        receipts.Results.Clear();
        ulong cleanupTick = world.Tick;
        scene.TickControlled();
        var controls = receipts.Results.Where(result => result.Kind == EffectResultKind.Control).ToArray();
        Directory.CreateDirectory(outputDirectory!);
        File.WriteAllText(Path.Combine(outputDirectory!, "native-late-results-control-cohort.json"), JsonSerializer.Serialize(new
        {
            status = "ACTUAL_NATIVE_OBSERVATION", cleanupTick, requiredUncappedControls = 8 * 8,
            actualControls = controls.Length,
            controls = controls.Select(result => new { type = result.TypeId, target = result.Target.ToHex(),
                handleWorld = result.Handle.WorldId.Value, handleInstance = result.Handle.InstanceId.Value,
                handleGeneration = result.Handle.Generation, ordinal = result.Ordinal,
                outcome = result.Outcome.ToString() }).ToArray(),
            limitation = "Real controlled old-body/finite/death/cleanup path; late Results bomb/phase geometry is an authored fixture, not a terrain Original replay."
        }, EvidenceJsonOptions));
        Assert.Equal(64, controls.Length);
    }

    // Existing production-test observer pattern. It copies actual batches before
    // lease expiry and never authors result outcomes or payloads.
    private sealed class ReceiptProbe : IDisposable
    {
        private readonly World world;
        private readonly GasWorldContext gas;
        private readonly PropertyInfo observer;
        private readonly Action<EffectResultBatch>? previous;
        internal readonly List<EffectResult> Results = new();
        internal ReceiptProbe(World world)
        {
            this.world = world; gas = GasWorldContext.Require(world);
            observer = typeof(GasWorldContext).GetProperty("ObserveEffectResults", BindingFlags.Instance | BindingFlags.NonPublic)!;
            Assert.NotNull(observer); previous = (Action<EffectResultBatch>?)observer.GetValue(gas);
            Assert.Null(previous); observer.SetValue(gas, (Action<EffectResultBatch>)Observe);
        }
        private void Observe(EffectResultBatch batch)
        {
            for (int i = 0; i < batch.Count(world); i++) Results.Add(batch.At(world, i));
        }
        public void Dispose() => observer.SetValue(gas, previous);
    }
}
