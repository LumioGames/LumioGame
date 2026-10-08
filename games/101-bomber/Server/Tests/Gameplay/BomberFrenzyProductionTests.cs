using System;
using System.IO;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.Runtime.ExceptionServices;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFrenzyProductionTests
{
    [Fact]
    public void InjuredLifeConsumesFrenzyCandyAfterActualAppliedHealthSettlement()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], life, 9701);
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        var attributes = world.Get<AttributeComponent>(life);
        Assert.Equal(4L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));

        // Kind 7 is a fixture-created source input. Pickup and healing still run
        // through the production Ability, GAS settlement and ordinary Tick.
        EntityOrder candy = BomberGrowthHealthTests.Item(world, life, 7);
        scene.Manager.Tick();
        world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(
            new PickupAbility.Input { Target = candy.AssignedId });
        scene.Manager.Tick(); scene.Manager.Tick();

        Assert.Equal(6L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, attributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.False(world.IsLive(candy.AssignedId));
        AssertApplied(world, life, candy.AssignedId, 4, 2);
    }

    [Fact]
    public void FullHealthLifeConsumesFrenzyCandyWithActualZeroPointAppliedSettlement()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        var attributes = world.Get<AttributeComponent>(life);
        Assert.Equal(6L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));

        // This input fixture does not assert central-supply issuance or budget.
        EntityOrder candy = BomberGrowthHealthTests.Item(world, life, 7);
        scene.Manager.Tick();
        world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(
            new PickupAbility.Input { Target = candy.AssignedId });
        scene.Manager.Tick(); scene.Manager.Tick();

        Assert.False(world.IsLive(candy.AssignedId));
        Assert.Equal(6L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, attributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
        AssertApplied(world, life, candy.AssignedId, 6, 0);
    }

    [Fact]
    public void DuplicateActiveFrenzyStaysOnGroundWithoutRefreshingTheAppliedDeadline()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        ulong originalUntil = participant.FrenzyUntilTick.Value;
        EntityOrder duplicate = BomberGrowthHealthTests.Item(scene.World, scene.Lives[0], 7);
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.True(scene.World.IsLive(duplicate.AssignedId));
        Assert.True(scene.World.Get<BomberPickupItem>(duplicate.AssignedId).ClaimedBy.Value.IsDefault);
        Assert.Equal(originalUntil, participant.FrenzyUntilTick.Value);
        Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "pickup_taken"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(5)]
    [InlineData(6)]
    public void ActualExtraPlacementIsStandardWithoutConsumingInventoryOrInheritingTheHeldSlot(int heldKind)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        _ = TakeFrenzy(scene);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        var player = world.Get<BomberPlayerState>(scene.Lives[0]);
        var attributes = world.Get<AttributeComponent>(player.Entity);
        var slot = world.Get<BomberSkillState>(player.Entity);
        if (heldKind != 0)
        {
            slot.BombSkillId.Value = config.Tables.Skills.Rows.Single(s => s.Slot == "Bomb" && !s.IsCombo && s.BombKindCode == (uint)heldKind).Id;
            slot.BombSkillLevel.Value = 1;
        }
        // Empty ordinary inventory and the held slot are input premises, not placed bombs.
        attributes.SetBaseValue(BomberAttributeNames.AvailableBombs, 0);
        attributes.SetCurrentValue(BomberAttributeNames.AvailableBombs, 0);
        int hats = player.HatCount.Value;
        ulong placed = world.Tick;
        ActivatePlace(scene, 7, 5);
        scene.Manager.Tick();
        var bomb = Assert.Single(world.Each<BomberBombState>());
        Assert.True(bomb.Frenzy.Value);
        Assert.Equal((int)BomberBombKind.Standard, bomb.BombKind.Value);
        Assert.Equal(0, bomb.SkillLevel.Value);
        Assert.Equal(0, bomb.PierceLayers.Value);
        Assert.Equal(0, bomb.FutureChildren.Value);
        Assert.Equal(placed, bomb.PlacedAtTick.Value);
        Assert.Equal(placed + Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz), bomb.FuseEndTick.Value);
        Assert.Equal(player.Entity, bomb.SourceLife.Value);
        Assert.Equal(player.LifeGeneration.Value, bomb.SourceLifeGeneration.Value);
        Assert.Equal(0L, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(hats, player.HatCount.Value);
        scene.Manager.Tick();
        Assert.Single(BomberEffectIntegrationTests.Events(world, "bomb_placed"));
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("active")]
    [InlineData("disabled")]
    public void FrenzyStillRejectsAnUnknownWrongSlotOrDisabledHeldBombBeforeAnyPlacementConsumption(string invalidSlot)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        Assert.True(config.Game.SkillsEnabled);
        var slot = world.Get<BomberSkillState>(scene.Lives[0]);
        slot.BombSkillId.Value = invalidSlot switch
        {
            "unknown" => uint.MaxValue,
            "active" => config.Tables.Skills.Rows.First(s => s.Slot == "Active" && !s.IsCombo).Id,
            "disabled" => config.Tables.Skills.Rows.First(s => s.Slot == "Bomb" && !s.IsCombo &&
                config.Tables.BombKinds.Rows.Any(b => b.KindCode == s.BombKindCode && !b.Enabled)).Id,
            _ => throw new ArgumentOutOfRangeException(nameof(invalidSlot)),
        };
        slot.BombSkillLevel.Value = 1;
        var attributes = world.Get<AttributeComponent>(scene.Lives[0]);
        long available = attributes.GetBaseValue(BomberAttributeNames.AvailableBombs);
        ulong chain = world.Single<BomberWorldRuntime>().NextChainId.Value;
        ulong last = participant.FrenzyLastPlacementTick.Value;
        var owner = world.Get<AbilityComponent>(scene.Lives[0]);
        Assert.False(PlaceBombAbility.CanPlace(owner, out string? reason));
        Assert.Equal("bomb_skill_invalid", reason);
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.Manager.Tick();
        Assert.Empty(world.Each<BomberBombState>());
        Assert.Equal(0, participant.FrenzyBombPromises.Count);
        Assert.Equal(chain, world.Single<BomberWorldRuntime>().NextChainId.Value);
        Assert.Equal(last, participant.FrenzyLastPlacementTick.Value);
        Assert.Equal(available, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0, world.Get<BomberStatistics>(participant.Entity).Bombs.Value);
    }

    [Fact]
    public void ActualPlacementsRejectBeforeFiveTicksAndAllowTheFifthTick()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        var owner = scene.World.Get<AbilityComponent>(scene.Lives[0]);
        scene.Write(9, 1, 5, 0);
        scene.Manager.Tick();
        ulong placed = scene.World.Tick;
        ActivatePlace(scene, 7, 5);
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(owner.Entity), new Vector3(9.5f, 1.5f, 5.5f));
        Assert.False(PlaceBombAbility.CanPlace(owner, out string? reason));
        Assert.Equal("frenzy_placement_interval", reason);
        ulong interval = BomberConfigBinding.For(scene.World).Game.FrenzyMinPlacementTicks;
        while (scene.World.Tick < placed + interval - 1) scene.Manager.Tick();
        Assert.False(PlaceBombAbility.CanPlace(owner, out reason));
        Assert.Equal("frenzy_placement_interval", reason);
        Assert.Equal(placed, participant.FrenzyLastPlacementTick.Value);
        scene.Manager.Tick();
        Assert.True(PlaceBombAbility.CanPlace(owner, out reason), reason);
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.Manager.Tick();
        Assert.Equal(2, scene.World.Each<BomberBombState>().Count());
        Assert.Equal(placed + interval, participant.FrenzyLastPlacementTick.Value);
    }

    [Fact]
    public void ActualFrenzyProducesMoreThanSixOverItsWindowAndReplenishesAfterNaturalExplosions()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        int[] cells = { 7, 9, 11, 13, 15 };
        foreach (int x in cells) scene.Write(x, 1, 5, 0);
        scene.Manager.Tick();
        ulong next = scene.World.Tick;
        var config = BomberConfigBinding.For(scene.World);
        for (int index = 0; index < 8; index++)
        {
            while (scene.World.Tick < next) scene.Manager.Tick();
            ActivatePlace(scene, cells[index % cells.Length], 5);
            scene.Manager.Tick();
            Assert.InRange(scene.World.Each<BomberBombState>().Count(b => b.Frenzy.Value && b.Phase.Value == (int)BomberBombPhase.Fuse),
                1, config.Game.FrenzyConcurrentLimit);
            Assert.Equal(0, participant.FrenzyBombPromises.Count);
            next += config.Game.FrenzyMinPlacementTicks;
        }
        scene.Manager.Tick();
        Assert.Equal(8, scene.World.Get<BomberStatistics>(participant.Entity).Bombs.Value);
        Assert.Equal(8, BomberEffectIntegrationTests.Events(scene.World, "bomb_placed").Length);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void TwoActualFrenzyPlacementsNaturallyChainWithoutChangingTheirOriginalPublicationOrSource()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        scene.Write(9, 1, 5, 0);
        scene.Manager.Tick();
        ActivatePlace(scene, 7, 5);
        scene.Manager.Tick();
        var first = Assert.Single(world.Each<BomberBombState>());
        ulong firstDue = first.FuseEndTick.Value;
        ulong firstChain = first.ChainId.Value;
        while (world.Tick < first.PlacedAtTick.Value + config.Game.FrenzyMinPlacementTicks) scene.Manager.Tick();
        ActivatePlace(scene, 9, 5);
        scene.Manager.Tick();
        var second = world.Each<BomberBombState>().Single(b => b.Entity != first.Entity);
        NetEntityId secondId = second.Entity;
        string originalToken = second.PromiseToken.Value;
        ulong originalChain = second.ChainId.Value;
        ulong originalDue = second.FuseEndTick.Value;
        NetEntityId sourceLife = second.SourceLife.Value;
        ulong sourceGeneration = second.SourceLifeGeneration.Value;
        Assert.Equal(second.PlacedAtTick.Value + Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz), originalDue);
        Assert.NotEqual(firstChain, originalChain);
        while (world.Tick <= firstDue) scene.Manager.Tick();
        second = world.Get<BomberBombState>(secondId);
        Assert.Equal((int)BomberBombPhase.Danger, second.Phase.Value);
        Assert.Equal(firstDue, second.ExplodedAtTick.Value);
        Assert.Equal(firstDue, second.FuseEndTick.Value);
        Assert.True(second.FuseEndTick.Value < originalDue);
        Assert.Equal(firstChain, second.ChainId.Value);
        Assert.Equal(originalToken, second.PromiseToken.Value);
        Assert.Equal(sourceLife, second.SourceLife.Value);
        Assert.Equal(sourceGeneration, second.SourceLifeGeneration.Value);
        Assert.True(second.Frenzy.Value);
        Assert.Equal((int)BomberBombKind.Standard, second.BombKind.Value);
        Assert.Equal(0, second.FutureChildren.Value);
        BomberFrenzy.Validate(world);
        var placed = Assert.Single(BomberEffectIntegrationTests.Events(world, "bomb_placed"),
            e => e.GetProperty("entityId").GetString() == secondId.ToHex());
        Assert.Equal(originalDue.ToString(CultureInfo.InvariantCulture), placed.GetProperty("data").GetProperty("fuseEndTick").GetString());
        Assert.Equal(originalChain.ToString(CultureInfo.InvariantCulture), placed.GetProperty("data").GetProperty("chainId").GetString());
        scene.Manager.Tick();
        Assert.Equal(6L, world.Get<AttributeComponent>(participant.CurrentLife.Value).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void DiagnosticTwoActualFrenzyPlacementsCapturesOriginalProvenanceFault()
    {
        string? outputPath = Environment.GetEnvironmentVariable("LUMIO_FRENZY_VALUE_PROBE_OUTPUT");
        if (outputPath is null)
        {
            TwoActualFrenzyPlacementsNaturallyChainWithoutChangingTheirOriginalPublicationOrSource();
            return;
        }

        if (string.IsNullOrWhiteSpace(outputPath) || !Path.IsPathFullyQualified(outputPath) ||
            !Directory.Exists(Path.GetDirectoryName(outputPath)) || File.Exists(outputPath) || Directory.Exists(outputPath))
            throw new ArgumentException("The configured Frenzy probe output must be a new absolute file in an existing directory.", nameof(outputPath));

        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        scene.Write(9, 1, 5, 0);
        scene.Manager.Tick();
        ActivatePlace(scene, 7, 5);
        scene.Manager.Tick();
        var first = Assert.Single(world.Each<BomberBombState>());
        ulong firstDue = first.FuseEndTick.Value;
        ulong firstChain = first.ChainId.Value;
        var firstMachine = world.Get<BomberHfsmState>(first.Entity);
        var firstPublication = new FrenzyProbeRow();
        bool firstPublicationComplete = CopyFrenzyProbeRow(firstPublication, first, firstMachine);
        JsonElement[] firstPlaced = BomberEffectIntegrationTests.Events(world, "bomb_placed");
        while (world.Tick < first.PlacedAtTick.Value + config.Game.FrenzyMinPlacementTicks) scene.Manager.Tick();
        ActivatePlace(scene, 9, 5);
        scene.Manager.Tick();
        var second = world.Each<BomberBombState>().Single(b => b.Entity != first.Entity);
        NetEntityId secondId = second.Entity;
        string originalToken = second.PromiseToken.Value;
        ulong originalChain = second.ChainId.Value;
        ulong originalDue = second.FuseEndTick.Value;
        NetEntityId sourceLife = second.SourceLife.Value;
        ulong sourceGeneration = second.SourceLifeGeneration.Value;
        Assert.Equal(second.PlacedAtTick.Value + Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz), originalDue);
        Assert.NotEqual(firstChain, originalChain);
        var secondMachine = world.Get<BomberHfsmState>(secondId);
        JsonElement[] bothPlaced = BomberEffectIntegrationTests.Events(world, "bomb_placed");
        var probe = new FrenzyProbe(world, first, firstMachine, second, secondMachine,
            firstPublication, firstPublicationComplete, firstPlaced, bothPlaced,
            Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz));
        probe.CheckBaseline();
        probe.ReadPair(probe.Baseline, world.Tick);
        if (!probe.Baseline.Complete || !firstPublicationComplete || !firstPublication.HfsmSnapshotPresent ||
            firstPublication.Entity != first.Entity || firstPlaced.Length != 1 || bothPlaced.Length != 2 ||
            !firstMachine.SnapshotPresent.Value || !secondMachine.SnapshotPresent.Value)
            throw new InvalidOperationException("BLOCKED_PROBE_BASELINE: ordinary publication did not yield two complete initialized machines.");

        EventHandler<FirstChanceExceptionEventArgs> handler = (_, args) => probe.OnFirstChance(args.Exception);
        Exception? outerTickException = null;
        AppDomain.CurrentDomain.FirstChanceException += handler;
        probe.Active = true;
        try
        {
            while (world.Tick <= firstDue)
            {
                try
                {
                    probe.CheckBaseline();
                    probe.ReadPair(probe.LastPreTick, world.Tick);
                    if (!probe.LastPreTick.Complete)
                        throw new InvalidOperationException("BLOCKED_PROBE_BASELINE: incomplete pre-Tick pair.");
                }
                catch
                {
                    probe.BaselineFailure = true;
                    throw;
                }
                probe.ArmedPreTick = world.Tick;
                probe.InsideOwnedTick = true;
                try { scene.Manager.Tick(); }
                catch (Exception error)
                {
                    outerTickException = error;
                    throw;
                }
                finally { probe.InsideOwnedTick = false; }
            }
        }
        finally
        {
            probe.Active = false;
            AppDomain.CurrentDomain.FirstChanceException -= handler;
            try { WriteFrenzyProbeReport(outputPath, probe, outerTickException); }
            catch { /* Evidence failure cannot replace the gameplay exception. */ }
        }

        second = world.Get<BomberBombState>(secondId);
        Assert.Equal((int)BomberBombPhase.Danger, second.Phase.Value);
        Assert.Equal(firstDue, second.ExplodedAtTick.Value);
        Assert.Equal(firstDue, second.FuseEndTick.Value);
        Assert.True(second.FuseEndTick.Value < originalDue);
        Assert.Equal(firstChain, second.ChainId.Value);
        Assert.Equal(originalToken, second.PromiseToken.Value);
        Assert.Equal(sourceLife, second.SourceLife.Value);
        Assert.Equal(sourceGeneration, second.SourceLifeGeneration.Value);
        Assert.True(second.Frenzy.Value);
        Assert.Equal((int)BomberBombKind.Standard, second.BombKind.Value);
        Assert.Equal(0, second.FutureChildren.Value);
        BomberFrenzy.Validate(world);
        var placed = Assert.Single(BomberEffectIntegrationTests.Events(world, "bomb_placed"),
            e => e.GetProperty("entityId").GetString() == secondId.ToHex());
        Assert.Equal(originalDue.ToString(CultureInfo.InvariantCulture), placed.GetProperty("data").GetProperty("fuseEndTick").GetString());
        Assert.Equal(originalChain.ToString(CultureInfo.InvariantCulture), placed.GetProperty("data").GetProperty("chainId").GetString());
        scene.Manager.Tick();
        Assert.Equal(6L, world.Get<AttributeComponent>(participant.CurrentLife.Value).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    private sealed class FrenzyProbe
    {
        private const string Fault = "Frenzy chain change has no published explosion provenance.";
        private readonly World world;
        private readonly BomberBombState first;
        private readonly BomberBombState second;
        private readonly BomberHfsmState firstMachine;
        private readonly BomberHfsmState secondMachine;
        private readonly NetEntityId firstId;
        private readonly NetEntityId secondId;
        private readonly ulong worldInstanceId;
        private readonly int threadId;
        public readonly Guid RunId = Guid.NewGuid();
        public readonly FrenzyProbeRow FirstPublication;
        public readonly bool FirstPublicationComplete;
        public readonly JsonElement[] FirstPlaced;
        public readonly JsonElement[] BothPlaced;
        public readonly ulong DerivedNominalFuseTicks;
        public readonly FrenzyProbePair Baseline = new();
        public readonly FrenzyProbePair LastPreTick = new();
        public readonly FrenzyProbePair FirstChance = new();
        public bool Active;
        public bool InsideOwnedTick;
        public bool ObserverBusy;
        public bool Attempted;
        public bool ObserverFailure;
        public bool BaselineFailure;
        public Exception? ObserverException;
        public Exception? FirstChanceException;
        public ulong ArmedPreTick;

        public FrenzyProbe(World world, BomberBombState first, BomberHfsmState firstMachine,
            BomberBombState second, BomberHfsmState secondMachine, FrenzyProbeRow firstPublication,
            bool firstPublicationComplete, JsonElement[] firstPlaced, JsonElement[] bothPlaced, ulong derivedNominalFuseTicks)
        {
            this.world = world;
            this.first = first;
            this.firstMachine = firstMachine;
            this.second = second;
            this.secondMachine = secondMachine;
            firstId = first.Entity;
            secondId = second.Entity;
            worldInstanceId = world.InstanceId;
            threadId = Environment.CurrentManagedThreadId;
            FirstPublication = firstPublication;
            FirstPublicationComplete = firstPublicationComplete;
            FirstPlaced = firstPlaced;
            BothPlaced = bothPlaced;
            DerivedNominalFuseTicks = derivedNominalFuseTicks;
        }

        public void CheckBaseline()
        {
            if (Environment.CurrentManagedThreadId != threadId || !world.IsLive(firstId) || !world.IsLive(secondId) ||
                first.Entity != firstId || second.Entity != secondId ||
                !ReferenceEquals(world.Get<BomberBombState>(firstId), first) ||
                !ReferenceEquals(world.Get<BomberBombState>(secondId), second) ||
                !ReferenceEquals(world.Get<BomberHfsmState>(firstId), firstMachine) ||
                !ReferenceEquals(world.Get<BomberHfsmState>(secondId), secondMachine) ||
                world.Each<BomberBombState>().Count() != 2)
                throw new InvalidOperationException("BLOCKED_PROBE_BASELINE: retained world or bomb identities changed.");
        }

        public void ReadPair(FrenzyProbePair pair, ulong armedPreTick)
        {
            pair.Complete = false;
            pair.WorldInstanceId = world.InstanceId;
            pair.WorldTick = world.Tick;
            pair.ManagedThreadId = Environment.CurrentManagedThreadId;
            pair.ArmedPreTick = armedPreTick;
            bool firstComplete = CopyFrenzyProbeRow(pair.First, first, firstMachine);
            bool secondComplete = CopyFrenzyProbeRow(pair.Second, second, secondMachine);
            pair.Complete = firstComplete && secondComplete && pair.WorldInstanceId == worldInstanceId &&
                pair.ManagedThreadId == threadId && pair.First.Entity == firstId && pair.Second.Entity == secondId &&
                pair.First.HfsmEntity == firstId && pair.Second.HfsmEntity == secondId;
        }

        public void OnFirstChance(Exception error)
        {
            if (!Active || !InsideOwnedTick || Environment.CurrentManagedThreadId != threadId || ObserverBusy || Attempted ||
                error.GetType() != typeof(InvalidOperationException) || !string.Equals(error.Message, Fault, StringComparison.Ordinal))
                return;
            ObserverBusy = true;
            Attempted = true;
            FirstChanceException = error;
            try { ReadPair(FirstChance, ArmedPreTick); }
            catch (Exception observerError)
            {
                ObserverFailure = true;
                ObserverException = observerError;
                FirstChance.Complete = false;
            }
            finally { ObserverBusy = false; }
        }
    }

    private sealed class FrenzyProbePair
    {
        public ulong WorldInstanceId;
        public ulong WorldTick;
        public ulong ArmedPreTick;
        public int ManagedThreadId;
        public bool Complete;
        public readonly FrenzyProbeRow First = new();
        public readonly FrenzyProbeRow Second = new();
    }

    private sealed class FrenzyProbeRow
    {
        public NetEntityId Entity, Owner, SourceLife, HfsmEntity, HfsmOwnerEntity;
        public ulong SourceLifeGeneration, FuseEndTick, ChainId, ExplodedAtTick, DangerUntilTick, PlacedAtTick;
        public ulong HfsmFingerprint, HfsmMachineKey, HfsmEpoch, HfsmStepSeq, HfsmNextActivationSeq;
        public int Phase, BombKind, Power, FutureChildren, SkillLevel, PierceLayers, ChildDirection;
        public int KickDirection, KickRange, HfsmSchemaVersion, HfsmMachineKind, HfsmLifecycle;
        public bool Frenzy, PlacementRecorded, CapacityReturned, HfsmSnapshotPresent, PathCountsValid;
        public string? PromiseToken;
        public int ActiveStatesCount, ActiveActivationsCount;
        public readonly uint[] ActiveStates = new uint[7];
        public readonly ulong[] ActiveActivations = new ulong[7];
    }

    private static bool CopyFrenzyProbeRow(FrenzyProbeRow row, BomberBombState bomb, BomberHfsmState machine)
    {
        row.Entity = bomb.Entity;
        row.Owner = bomb.Owner.Value;
        row.SourceLife = bomb.SourceLife.Value;
        row.SourceLifeGeneration = bomb.SourceLifeGeneration.Value;
        row.PromiseToken = bomb.PromiseToken.Value;
        row.PlacedAtTick = bomb.PlacedAtTick.Value;
        row.FuseEndTick = bomb.FuseEndTick.Value;
        row.ChainId = bomb.ChainId.Value;
        row.Phase = bomb.Phase.Value;
        row.PlacementRecorded = bomb.PlacementRecorded.Value;
        row.ExplodedAtTick = bomb.ExplodedAtTick.Value;
        row.Frenzy = bomb.Frenzy.Value;
        row.BombKind = bomb.BombKind.Value;
        row.Power = bomb.Power.Value;
        row.FutureChildren = bomb.FutureChildren.Value;
        row.SkillLevel = bomb.SkillLevel.Value;
        row.PierceLayers = bomb.PierceLayers.Value;
        row.ChildDirection = bomb.ChildDirection.Value;
        row.CapacityReturned = bomb.CapacityReturned.Value;
        row.DangerUntilTick = bomb.DangerUntilTick.Value;
        row.KickDirection = bomb.KickDirection.Value;
        row.KickRange = bomb.KickRange.Value;
        row.HfsmEntity = machine.Entity;
        row.HfsmSnapshotPresent = machine.SnapshotPresent.Value;
        row.HfsmSchemaVersion = machine.SnapshotSchemaVersion.Value;
        row.HfsmOwnerEntity = machine.OwnerEntity.Value;
        row.HfsmMachineKind = machine.MachineKind.Value;
        row.HfsmFingerprint = machine.Fingerprint.Value;
        row.HfsmMachineKey = machine.MachineKey.Value;
        row.HfsmEpoch = machine.Epoch.Value;
        row.HfsmStepSeq = machine.StepSeq.Value;
        row.HfsmNextActivationSeq = machine.NextActivationSeq.Value;
        row.HfsmLifecycle = machine.Lifecycle.Value;
        row.ActiveStatesCount = machine.ActiveStates.Count;
        row.ActiveActivationsCount = machine.ActiveActivations.Count;
        row.PathCountsValid = row.ActiveStatesCount is >= 0 and <= 7 && row.ActiveActivationsCount is >= 0 and <= 7 &&
            row.ActiveStatesCount == row.ActiveActivationsCount;
        if (!row.PathCountsValid) return false;
        for (int i = 0; i < row.ActiveStatesCount; i++) row.ActiveStates[i] = machine.ActiveStates[i];
        for (int i = 0; i < row.ActiveActivationsCount; i++) row.ActiveActivations[i] = machine.ActiveActivations[i];
        for (int i = row.ActiveStatesCount; i < 7; i++) row.ActiveStates[i] = 0;
        for (int i = row.ActiveActivationsCount; i < 7; i++) row.ActiveActivations[i] = 0;
        return true;
    }

    private static class FrenzyProbeJson
    {
        internal static readonly JsonSerializerOptions Options = new() { IncludeFields = true };
    }

    private static void WriteFrenzyProbeReport(string outputPath, FrenzyProbe probe, Exception? outerTickException)
    {
        bool sameExceptionInChain = false;
        for (Exception? candidate = outerTickException; candidate is not null; candidate = candidate.InnerException)
            if (ReferenceEquals(candidate, probe.FirstChanceException)) sameExceptionInChain = true;
        string status = probe.ObserverFailure || probe.BaselineFailure || !probe.FirstPublicationComplete || !probe.Baseline.Complete ||
            !probe.LastPreTick.Complete || !probe.FirstChance.Complete || !sameExceptionInChain
            ? "UNKNOWN" : "COMPLETE_MATCHING_FIRST_CHANCE";
        if (!probe.Attempted && !probe.BaselineFailure && outerTickException is null) status = "UNEXPECTED_NO_MATCH";
        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new
        {
            schema = "f1-frenzy-value-probe-v1",
            status,
            test = nameof(DiagnosticTwoActualFrenzyPlacementsCapturesOriginalProvenanceFault),
            runId = probe.RunId,
            processId = Environment.ProcessId,
            firstPublicationComplete = probe.FirstPublicationComplete,
            firstPublication = probe.FirstPublication,
            firstPlaced = probe.FirstPlaced,
            bothPlaced = probe.BothPlaced,
            derivedNominalFuseTicks = probe.DerivedNominalFuseTicks,
            derivedNominalFirstDeadlineMatchesObservedOriginal =
                ulong.MaxValue - probe.FirstPublication.PlacedAtTick >= probe.DerivedNominalFuseTicks &&
                probe.FirstPublication.PlacedAtTick + probe.DerivedNominalFuseTicks == probe.FirstPublication.FuseEndTick,
            derivedNominalSecondDeadlineMatchesObservedOriginal =
                ulong.MaxValue - probe.Baseline.Second.PlacedAtTick >= probe.DerivedNominalFuseTicks &&
                probe.Baseline.Second.PlacedAtTick + probe.DerivedNominalFuseTicks == probe.Baseline.Second.FuseEndTick,
            initializedByOrdinaryPublication = probe.Baseline.Complete,
            baseline = probe.Baseline,
            lastPreTick = probe.LastPreTick,
            firstChance = probe.FirstChance,
            matchingAttempts = probe.Attempted ? 1 : 0,
            observerFailure = probe.ObserverFailure,
            baselineFailure = probe.BaselineFailure,
            observerError = probe.ObserverException?.ToString(),
            sameExceptionInPropagatedChain = sameExceptionInChain,
            outerException = outerTickException?.ToString(),
            firstChanceException = probe.FirstChanceException?.ToString(),
            localQueueMembership = "UNKNOWN",
            nativeOutcome = "UNKNOWN",
        }, FrenzyProbeJson.Options);
        if (json.Length > 64 * 1024) return;
        using var file = new FileStream(outputPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        file.Write(json);
        file.Flush(true);
    }

    [Fact]
    public void SixKnownPublishedPrimaryFixturesRejectTheNextActualFrenzyPlacement()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        var life = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
        var runtime = world.Single<BomberWorldRuntime>();
        int limit = config.Game.FrenzyConcurrentLimit;
        // These rows are an explicitly known concurrency-boundary fixture. Their
        // simultaneous timestamp does not claim six actual five-Tick placements.
        for (int index = 0; index < limit; index++)
        {
            ulong chain = checked(++runtime.NextChainId.Value);
            var order = world.Commands.Create<BomberBombEntity>();
            var bomb = order.Get<BomberBombState>();
            bomb.Owner.Value = participant.Entity;
            bomb.SourceLife.Value = life.Entity;
            bomb.SourceLifeGeneration.Value = life.LifeGeneration.Value;
            bomb.Frenzy.Value = true;
            bomb.PromiseToken.Value = $"frenzy:{participant.Entity.ToHex()}:{chain:x16}";
            bomb.Power.Value = 1;
            bomb.ChainId.Value = chain;
            bomb.PlacedAtTick.Value = world.Tick;
            bomb.FuseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz));
            bomb.PlacementRecorded.Value = true;
            BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(1.5f, 1.5f, 1.5f));
        }
        scene.Manager.Tick();
        Assert.Equal(limit, world.Each<BomberBombState>().Count(b => b.Frenzy.Value && b.Phase.Value == (int)BomberBombPhase.Fuse));
        Assert.Equal(0, participant.FrenzyBombPromises.Count);
        Assert.False(PlaceBombAbility.CanPlace(world.Get<AbilityComponent>(life.Entity), out string? reason));
        Assert.Equal("frenzy_capacity_full", reason);
        Assert.Equal(0UL, participant.FrenzyLastPlacementTick.Value);
        Assert.Equal(0, world.Get<BomberStatistics>(participant.Entity).Bombs.Value);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void ActualFrenzyPlacementUsesTheSameHardTotalCapacityAsPublishedAndUnpublishedBombs(int freeSlots)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        int limit = BomberConfigBinding.For(world).ObjectBudgets.BombCapacity;
        var source = world.Get<BomberPlayerState>(scene.Lives[1]);
        // The full census is a published capacity fixture, as in the common
        // owner's boundary test. The extra placement below uses the actual Ability.
        for (int offset = 0; offset < limit - freeSlots;)
        {
            int stop = Math.Min(offset + 48, limit - freeSlots);
            while (offset < stop)
            {
                var order = world.Commands.Create<BomberBombEntity>();
                var bomb = order.Get<BomberBombState>();
                bomb.Owner.Value = source.Participant.Value;
                bomb.SourceLife.Value = source.Entity;
                bomb.SourceLifeGeneration.Value = source.LifeGeneration.Value;
                bomb.Power.Value = 1;
                bomb.ChainId.Value = checked((ulong)(100_000 + offset));
                bomb.FuseEndTick.Value = 100_000;
                bomb.PlacementRecorded.Value = true;
                BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(1.5f, 1.5f, 1.5f));
                offset++;
            }
            scene.Manager.Tick();
        }
        var participant = TakeFrenzy(scene);
        var owner = world.Get<AbilityComponent>(scene.Lives[0]);
        Assert.Equal(limit - freeSlots, world.Each<BomberBombState>().Count());
        if (freeSlots != 0)
        {
            ActivatePlace(scene, 7, 5);
            Assert.Equal(limit - 1, world.Each<BomberBombState>().Count());
            Assert.Equal(1, participant.FrenzyBombPromises.Count);
            Assert.Equal(1, BomberFrenzy.ReservedCount(world));
            Assert.False(BomberBombAdmissions.CanReserve(world, 1));
            scene.Manager.Tick();
            Assert.Equal(0, participant.FrenzyBombPromises.Count);
            Assert.Equal(0, BomberFrenzy.ReservedCount(world));
        }
        Assert.Equal(limit, world.Each<BomberBombState>().Count());
        Assert.False(BomberBombAdmissions.CanReserve(world, 1));
        while (world.Tick < participant.FrenzyLastPlacementTick.Value +
            BomberConfigBinding.For(world).Game.FrenzyMinPlacementTicks) scene.Manager.Tick();
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(owner.Entity), new Vector3(9.5f, 1.5f, 5.5f));
        scene.Write(9, 1, 5, 0);
        scene.Manager.Tick();
        Assert.False(PlaceBombAbility.CanPlace(owner, out string? reason));
        Assert.Equal("bomb_cell_reserved", reason);
        Assert.Equal(freeSlots, world.Get<BomberStatistics>(participant.Entity).Bombs.Value);
    }

    [Fact]
    public void NaturalTailBombRemainsSelfImmuneAfterFrenzyExpiresAndEnemyBombStillAppliesDamage()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = TakeFrenzy(scene);
        var config = BomberConfigBinding.For(scene.World);
        var attributes = scene.World.Get<AttributeComponent>(scene.Lives[0]);
        attributes.SetBaseValue(BomberAttributeNames.AvailableBombs, 0);
        attributes.SetCurrentValue(BomberAttributeNames.AvailableBombs, 0);
        ulong tail = participant.FrenzyUntilTick.Value - config.Game.FrenzyMinPlacementTicks;
        while (scene.World.Tick < tail) scene.Manager.Tick();
        ActivatePlace(scene, 7, 5);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>());
        ulong due = bomb.FuseEndTick.Value;
        while (scene.World.Tick < participant.FrenzyUntilTick.Value) scene.Manager.Tick();
        Assert.False(BomberFrenzy.IsActive(scene.World, participant, scene.Lives[0]));
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.False(PlaceBombAbility.CanPlace(scene.World.Get<AbilityComponent>(scene.Lives[0]), out _));
        while (scene.World.Tick <= due + 3) scene.Manager.Tick();
        Assert.Equal(6L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(due, bomb.FuseEndTick.Value);
        Assert.True(bomb.Frenzy.Value);
        Assert.Equal(0L, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], scene.Lives[0], 9791);
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(4L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void ActualPublishedFrenzyKeepsItsExactSourceFuseAndParticipantClockAcrossPairedRestore()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        var participant = TakeFrenzy(scene);
        ActivatePlace(scene, 7, 5);
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        var restoredBomb = restored.World.Get<BomberBombState>(bomb.Entity);
        var restoredParticipant = restored.World.Get<BomberParticipantState>(participant.Entity);
        Assert.True(restoredBomb.Frenzy.Value);
        Assert.Equal(bomb.SourceLife.Value, restoredBomb.SourceLife.Value);
        Assert.Equal(bomb.SourceLifeGeneration.Value, restoredBomb.SourceLifeGeneration.Value);
        Assert.Equal(bomb.FuseEndTick.Value, restoredBomb.FuseEndTick.Value);
        Assert.Equal(participant.FrenzyLastPlacementTick.Value, restoredParticipant.FrenzyLastPlacementTick.Value);
        Assert.Equal(participant.FrenzyUntilTick.Value, restoredParticipant.FrenzyUntilTick.Value);
        Assert.Equal(0, restoredParticipant.FrenzyBombPromises.Count);
        restored.Tick();
        Assert.Equal(6L, restored.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void ActualQueuedPlacementReservesCapacityAndCaptureRefusesUntilItsRealPublication()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        var participant = TakeFrenzy(scene);
        ActivatePlace(scene, 7, 5);
        Assert.Equal(1, participant.FrenzyBombPromises.Count);
        string promise = participant.FrenzyBombPromises[0];
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, BomberFrenzy.ReservedCount(scene.World));
        var error = Assert.Throws<InvalidOperationException>(() => scene.Manager.CaptureSnapshot());
        Assert.Equal("Snapshot/partition capture refuses pending uncommitted structural work.", error.Message);
        Assert.Equal(1, participant.FrenzyBombPromises.Count);
        Assert.Equal(promise, participant.FrenzyBombPromises[0]);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.True(bomb.Frenzy.Value);
        Assert.Equal(0, participant.FrenzyBombPromises.Count);
        Assert.Equal(0, BomberFrenzy.ReservedCount(scene.World));
    }

    [Fact]
    public void ExplicitUnknownOwnerFixtureRetainsItsPromiseAcrossPairedRestoreAndExpiryWithoutRetry()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        var participant = CreateUnknownOwnerFixture(scene);
        Assert.Equal(1, participant.FrenzyBombPromises.Count);
        string promise = participant.FrenzyBombPromises[0];
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        var retained = restored.World.Get<BomberParticipantState>(participant.Entity);
        ulong stop = checked(retained.FrenzyUntilTick.Value + 5);
        while (restored.World.Tick < stop) restored.Tick();
        Assert.Equal(1, retained.FrenzyBombPromises.Count);
        Assert.Equal(promise, retained.FrenzyBombPromises[0]);
        Assert.Empty(restored.World.Each<BomberBombState>());
        Assert.Equal(1, BomberFrenzy.ReservedCount(restored.World));
        Assert.True(BomberFrenzy.HasUnpublished(restored.World));
    }

    [Fact]
    public void ActualDelayedNativeOriginalFromOldFrenzyLifeCanDamageItsRealSuccessorLife()
    {
        // Supported UGC fuse lets the genuine successor finish birth before
        // this old-life bomb submits terrain. Default 1.2s behavior is tested separately.
        using var authored = new BomberObjectBudgetTests.AuthoredFixture(("game", "default", "frenzy_fuse_ms", "10000"));
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, controlled: true, configDirectory: authored.Compile());
        World world = scene.World;
        var participant = TakeFrenzy(scene);
        NetEntityId oldLife = participant.CurrentLife.Value;
        ulong oldGeneration = participant.LifeGeneration.Value;
        ActivatePlace(scene, 5, 5);
        scene.TickControlled();
        var bomb = Assert.Single(world.Each<BomberBombState>());
        NetEntityId bombId = bomb.Entity;
        ulong fuseEnd = bomb.FuseEndTick.Value;
        Assert.Equal(bomb.PlacedAtTick.Value + 200UL, fuseEnd);
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        // Actual lethal fixtures explode at their victim. Keep them outside
        // the old bomb's cross so they cannot prematurely chain its long fuse.
        for (int z = 11; z <= 15; z++) scene.Write(13, 1, z, 0);
        for (int x = 11; x <= 15; x++) scene.Write(x, 1, 13, 0);
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(oldLife), new Vector3(13.5f, 1.5f, 13.5f));
        for (int i = 0; i < 3; i++) BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], oldLife, (ulong)(9801 + i));
        ulong stop = checked(world.Tick + Ticks.FromMilliseconds(checked(config.Life.RespawnMs + config.Life.ProtectionMs), config.Game.TickRateHz) + 64);
        bool Ready() => !participant.SuccessorPending.Value &&
            !participant.CurrentLife.Value.IsDefault && participant.CurrentLife.Value != oldLife &&
            world.IsLive(participant.CurrentLife.Value) &&
            !world.Get<BomberPlayerState>(participant.CurrentLife.Value).RestorePending.Value &&
            world.Get<BomberPlayerState>(participant.CurrentLife.Value).LifePhase.Value == (int)BomberLifePhase.Vulnerable &&
            world.Get<BomberPlayerState>(participant.CurrentLife.Value).ProtectedUntilTick.Value <= world.Tick;
        while (world.Tick < stop && !Ready()) scene.TickControlled();
        Assert.True(Ready());
        Assert.True(world.Tick < fuseEnd);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.False(world.IsLive(oldLife));
        Assert.True(world.IsLive(bombId));
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.Equal(oldLife, bomb.SourceLife.Value);
        Assert.Equal(oldGeneration, bomb.SourceLifeGeneration.Value);
        Assert.True(bomb.Frenzy.Value);
        Assert.Equal(fuseEnd, bomb.FuseEndTick.Value);
        NetEntityId newLife = participant.CurrentLife.Value;
        Assert.Equal(6L, world.Get<AttributeComponent>(newLife).GetBaseValue(BomberAttributeNames.HealthPoints));
        // Keep the already vulnerable successor outside all danger until the
        // real retained Original carries the newly opened right-hand cell.
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(newLife), new Vector3(15.5f, 1.5f, 15.5f));
        while (world.Tick <= fuseEnd && runtime.PendingVoxelTransactionIds.Count == 0) scene.TickControlled();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(bomb.Entity, runtime.PendingSourceBombs[0]);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        var checkpoint = scene.Adapter.CaptureResultCheckpoint();
        var delayed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = world };
        using var delayBinding = VoxelGameplayBinding.Bind(scene.Manager, delayed);
        scene.Manager.BindVoxelTick(delayed.PrepareVoxel, delayed.CommitVoxel);
        ulong pastDanger = checked(bomb.DangerUntilTick.Value + 2UL);
        while (world.Tick <= pastDanger) scene.TickControlled();
        Assert.True(Ready());
        Assert.True(world.IsLive(bombId));
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(6L, world.Get<AttributeComponent>(newLife).GetBaseValue(BomberAttributeNames.HealthPoints));
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(newLife), new Vector3(6.5f, 1.5f, 5.5f));
        var accepted = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = world };
        accepted.RestoreResultCheckpoint(checkpoint);
        using var acceptedBinding = VoxelGameplayBinding.Bind(scene.Manager, accepted);
        scene.Manager.BindVoxelTick(accepted.PrepareVoxel, accepted.CommitVoxel);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.Equal(4L, world.Get<AttributeComponent>(newLife).GetBaseValue(BomberAttributeNames.HealthPoints));
        var applied = Assert.Single(BomberEffectIntegrationTests.Events(world, "damage_applied"),
            e => e.GetProperty("entityId").GetString() == bombId.ToHex() &&
                e.GetProperty("lifeId").GetString() == newLife.ToHex());
        Assert.Equal(oldLife.ToHex(), applied.GetProperty("sourceLifeId").GetString());
        Assert.Equal(oldGeneration.ToString(CultureInfo.InvariantCulture), applied.GetProperty("data").GetProperty("sourceLifeGeneration").GetString());
        Assert.NotEqual(oldGeneration, world.Get<BomberPlayerState>(newLife).LifeGeneration.Value);
    }

    [Theory]
    [InlineData("invalid-json")]
    [InlineData("bytes")]
    [InlineData("duplicate")]
    [InlineData("generation")]
    [InlineData("fuse")]
    [InlineData("match")]
    public void MalformedPersistedPromiseIsRejectedWithoutChangingTheOriginalSnapshot(string mutation)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = CreateUnknownOwnerFixture(scene);
        Assert.Equal(1, participant.FrenzyBombPromises.Count);
        string originalPromise = participant.FrenzyBombPromises[0];
        byte[] original = scene.Manager.CaptureSnapshot();
        var row = JsonSerializer.Deserialize<BomberFrenzy.Promise>(originalPromise)!;
        if (mutation == "duplicate") participant.FrenzyBombPromises.Add(originalPromise);
        else participant.FrenzyBombPromises[0] = mutation switch
        {
            "invalid-json" => "{",
            "bytes" => new string('x', BomberFrenzy.PromiseByteLimit + 1),
            "generation" => JsonSerializer.Serialize(row with { Generation = 0 }),
            "fuse" => JsonSerializer.Serialize(row with { FuseEnd = row.FuseEnd + 1 }),
            "match" => JsonSerializer.Serialize(row with { Match = row.Match + 1 }),
            _ => throw new ArgumentOutOfRangeException(nameof(mutation)),
        };
        byte[] malformed = scene.Manager.CaptureSnapshot();
        participant.FrenzyBombPromises.Clear();
        participant.FrenzyBombPromises.Add(originalPromise);
        Assert.Equal(original, scene.Manager.CaptureSnapshot());
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
        {
            using var rejected = BomberTestWorld.Restore(malformed, GeneratedRegistry.Instance, config: BomberConfigBinding.Load());
        });
        Assert.Equal(original, scene.Manager.CaptureSnapshot());
    }

    [Fact]
    public void SerializedSeventhPromiseRejectsTheFixedContainerBudgetWithoutMutatingTheOriginal()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var participant = CreateUnknownOwnerFixture(scene);
        Assert.Equal(1, participant.FrenzyBombPromises.Count);
        string promise = participant.FrenzyBombPromises[0];
        byte[] original = scene.Manager.CaptureSnapshot();
        byte[] malformed = BomberSnapshotCorruption.AppendListEntries(original,
            "BomberParticipantState.frenzyBombPromises", 1, Enumerable.Repeat(promise, 6).ToArray());
        FormatException error = BomberTestWorld.AssertOwnerFailure<FormatException>(() =>
        {
            using var rejected = BomberTestWorld.Restore(malformed, GeneratedRegistry.Instance, config: BomberConfigBinding.Load());
        });
        Assert.Equal("exceeds_max_capacity", error.Message);
        Assert.Equal(original, scene.Manager.CaptureSnapshot());
        Assert.Equal(1, participant.FrenzyBombPromises.Count);
        Assert.Equal(promise, participant.FrenzyBombPromises[0]);
    }

    private static BomberParticipantState TakeFrenzy(BomberTerrainProductionTests.Scene scene)
    {
        BomberGrowthHealthTests.Take(scene.Manager, scene.Lives[0], 7);
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        var participant = scene.World.Get<BomberParticipantState>(player.Participant.Value);
        Assert.True(BomberFrenzy.IsActive(scene.World, participant, player.Entity));
        return participant;
    }

    private static BomberParticipantState CreateUnknownOwnerFixture(BomberTerrainProductionTests.Scene scene)
    {
        var participant = TakeFrenzy(scene);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        var runtime = world.Single<BomberWorldRuntime>();
        var life = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
        ulong chain = checked(runtime.NextChainId.Value + 1);
        // Explicit owner-state fixture for restore/corruption boundaries. No
        // structural create was submitted, and this is not actual Unknown proof.
        var row = new BomberFrenzy.Promise($"frenzy:{participant.Entity.ToHex()}:{chain:x16}",
            life.Entity.ToHex(), life.LifeGeneration.Value, participant.MatchId.Value, chain,
            checked((int)world.Get<AttributeComponent>(life.Entity).GetCurrentValue(BomberAttributeNames.BombPower)),
            7, 5, 1.5f, world.Tick,
            checked(world.Tick + Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz)), true);
        string encoded = BomberFrenzy.Encode(world, participant, row, chain);
        runtime.NextChainId.Value = chain;
        participant.FrenzyLastPlacementTick.Value = world.Tick;
        participant.FrenzyBombPromises.Add(encoded);
        return participant;
    }

    private static void ActivatePlace(BomberTerrainProductionTests.Scene scene, int x, int z)
    {
        var owner = scene.World.Get<AbilityComponent>(scene.Lives[0]);
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(owner.Entity), new Vector3(x + .5f, 1.5f, z + .5f));
        Assert.True(PlaceBombAbility.CanPlace(owner, out string? reason), reason);
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
    }

    private static void AssertApplied(World world, NetEntityId life, NetEntityId candy, long before, long actual)
    {
        var player = world.Get<BomberPlayerState>(life);
        var facts = world.Get<BomberHealthFacts>(life);
        Assert.Equal(1, facts.Status[0]);
        Assert.True(facts.Ready[0]);
        Assert.Equal(7, facts.Kind[0]);
        Assert.Equal(candy, facts.Item[0]);
        Assert.Equal(life, facts.Target[0]);
        Assert.Equal(life, facts.Source[0]);
        Assert.Equal(player.Participant.Value, facts.Participant[0]);
        Assert.Equal(player.LifeGeneration.Value, facts.Generation[0]);
        Assert.Equal(before, facts.Before[0]);
        Assert.Equal(6L, facts.After[0]);
        Assert.Equal(actual, facts.Actual[0]);
        Assert.NotEqual(0UL, facts.HandleInstance[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        Assert.Equal(life, participant.FrenzyLife.Value);
        Assert.Equal(player.LifeGeneration.Value, participant.FrenzyGeneration.Value);
        var config = BomberConfigBinding.For(world);
        Assert.Equal(facts.Tick[0] + Ticks.FromMilliseconds(config.Game.FrenzyDurationMs, config.Game.TickRateHz), participant.FrenzyUntilTick.Value);
        var pickup = Assert.Single(BomberEffectIntegrationTests.Events(world, "pickup_taken"));
        Assert.Equal(candy.ToHex(), pickup.GetProperty("entityId").GetString());
        Assert.Equal("7", pickup.GetProperty("data").GetProperty("pickupKind").GetString());
    }
}
