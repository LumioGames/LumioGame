using System;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using System.Reflection;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.Wire;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFavoriteFireFollowupProductionTests
{
    [Fact]
    public void WholeCastEmitsExactly110OrdinalsWithoutZeroWaveOrCatchup()
    {
        using var f = new PublicCast(); using var receipts = new ReceiptProbe(f.World);
        ulong start = f.Cast();
        FiniteEffectView? parent = null;
        Assert.Empty(f.World.Each<BomberFireZoneState>());
        for (int ordinal = 0; ordinal < 110; ordinal++)
        {
            f.Scene.TickControlled();
            if (ordinal == 0) parent = Assert.Single(f.World.Get<EffectComponent>(f.Life).ActiveEffects);
            var zones = f.World.Each<BomberFireZoneState>().OrderBy(z => z.RegionOrdinal.Value).ToArray();
            Assert.Equal(ordinal + 1, zones.Length);
            Assert.Equal(Enumerable.Range(0, ordinal + 1), zones.Select(z => z.RegionOrdinal.Value));
            Assert.All(zones, z => Assert.Equal(start + (ulong)z.RegionOrdinal.Value, z.FromTick.Value));
        }
        for (int i = 0; i < 22; i++) f.Scene.TickControlled();
        Assert.Empty(f.World.Each<BomberFireZoneState>());
        Assert.Equal("", f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value);
        Assert.Equal(1, f.World.Get<BomberStatistics>(f.Participant).SkillCasts.Value);
        Assert.NotNull(parent);
        var auraExpired = Assert.Single(receipts.Results, r => r.TypeId == 10111u && r.Kind == EffectResultKind.Terminal);
        Assert.Equal(parent!.Handle, auraExpired.Handle); Assert.Equal(EffectResultOutcome.Expired, auraExpired.Outcome);
        Assert.Equal(0u, auraExpired.Ordinal); Assert.Equal(f.Life, auraExpired.Source); Assert.Equal(f.Life, auraExpired.Target);
        Assert.Equal(start, auraExpired.AppliedTick); Assert.Equal(start + 110, auraExpired.Tick);
        Assert.Equal(0, f.World.Get<BomberSkillState>(f.Life).AuraOutcome.Value);
        var regionInitials = receipts.Results.Where(r => r.TypeId == 10112u && r.Kind == EffectResultKind.Initial).ToArray();
        var regionExpiries = receipts.Results.Where(r => r.TypeId == 10112u && r.Kind == EffectResultKind.Terminal).ToArray();
        Assert.Equal(110, regionInitials.Length); Assert.Equal(110, regionExpiries.Length);
        Assert.All(regionInitials, r => { Assert.NotEqual(0u, r.Ordinal); Assert.Equal(EffectResultOutcome.Applied, r.Outcome); });
        foreach (var initial in regionInitials)
        {
            var expired = Assert.Single(regionExpiries, r => r.Handle == initial.Handle);
            Assert.Equal(0u, expired.Ordinal); Assert.Equal(EffectResultOutcome.Expired, expired.Outcome);
            Assert.Equal(initial.Target, expired.Target); Assert.Equal(f.Life, expired.Source);
            Assert.Equal(initial.AppliedTick, expired.AppliedTick); Assert.Equal(initial.AppliedTick + 20, expired.Tick);
        }
        Assert.DoesNotContain(receipts.Results, r => r.TypeId == 10112u && r.Kind == EffectResultKind.Control);
    }

    [Fact]
    public void MovementSnapshotsCoverageAndFiniteExpiryDrivesNativeLeaf()
    {
        using var f = new PublicCast(); using var receipts = new ReceiptProbe(f.World);
        ulong start = f.Cast(); f.Scene.TickControlled();
        var first = Assert.Single(f.World.Each<BomberFireZoneState>());
        var finite = Assert.Single(f.World.Get<EffectComponent>(first.Entity).ActiveEffects);
        Assert.Equal(10112u, finite.TypeId); Assert.Equal(start, finite.AppliedTick);
        var payload = BomberFireZoneLifetimeEffect.ReadActualRow(finite);
        Assert.Equal(511, payload.Mask); Assert.Equal(0, payload.Ordinal);
        f.Position(9, 9); f.Scene.TickControlled();
        Assert.Equal((5, 5), Center(f.World, first));
        var moved = Assert.Single(f.World.Each<BomberFireZoneState>(), z => z.RegionOrdinal.Value == 1);
        Assert.Equal((9, 9), Center(f.World, moved));
        f.Scene.Write(4, 1, 4, 256); // The admitted first mask remains immutable.
        Assert.Equal(511, first.CoverageMask.Value);
        while (f.World.Tick <= finite.EndTick) f.Scene.TickControlled();
        var expired = Assert.Single(receipts.Results, r => r.TypeId == 10112u && r.Handle == finite.Handle && r.Kind == EffectResultKind.Terminal);
        Assert.Equal(0u, expired.Ordinal); Assert.Equal(EffectResultOutcome.Expired, expired.Outcome);
        Assert.Equal(finite.Source, expired.Source); Assert.Equal(first.Entity, expired.Target);
        Assert.Equal(finite.AppliedTick, expired.AppliedTick); Assert.Equal(finite.EndTick, expired.Tick);
        // Phase9 supplies Expired; the next normal business Tick consumes it and
        // asks the existing Native7 machine for ExpireFire. No row absence inference.
        f.Scene.TickControlled();
        Assert.Equal(4, first.LifetimeOutcome.Value);
        Assert.Equal(2, first.Phase.Value);
        Assert.Empty(f.World.Get<EffectComponent>(first.Entity).ActiveEffects);
        using var definition = BomberHfsmDefinitions.Compile(f.World, BomberHfsmKind.FireZone);
        var machine = f.World.Get<BomberHfsmState>(first.Entity);
        Assert.Equal(BomberHfsmDefinitions.State.FireExpired,
            machine.ReadSnapshot(definition, BomberHfsmKind.FireZone, machine.MachineKey.Value).ActivePath[^1].State);
    }

    [Fact]
    public void EmptyCommittedMaskStillOwnsOneAppliedFiniteRegionAndNativeClock()
    {
        using var f = new PublicCast(); using var receipts = new ReceiptProbe(f.World);
        for (int z = 4; z <= 6; z++) for (int x = 4; x <= 6; x++) f.Scene.Write(x, 1, z, 1023u << 8);
        ulong start = f.Cast(); f.Scene.TickControlled();
        var first = Assert.Single(f.World.Each<BomberFireZoneState>());
        Assert.Equal(0, first.CoverageMask.Value); Assert.Equal(3, first.LifetimeOutcome.Value);
        var row = Assert.Single(f.World.Get<EffectComponent>(first.Entity).ActiveEffects);
        Assert.Equal(10112u, row.TypeId); Assert.Equal(start, row.AppliedTick); Assert.Equal(start + 20, row.EndTick);
        Assert.Equal(0, BomberFireZoneLifetimeEffect.ReadActualRow(row).Mask);
        Assert.Single(receipts.Results, r => r.TypeId == 10112u && r.Target == first.Entity &&
            r.Kind == EffectResultKind.Initial && r.Outcome == EffectResultOutcome.Applied && r.Handle == row.Handle);
        using var definition = BomberHfsmDefinitions.Compile(f.World, BomberHfsmKind.FireZone);
        var machine = f.World.Get<BomberHfsmState>(first.Entity);
        Assert.Equal(BomberHfsmDefinitions.State.FireActive,
            machine.ReadSnapshot(definition, BomberHfsmKind.FireZone, machine.MachineKey.Value).ActivePath.Single().State);
        f.Scene.TickControlled();
        var born = Assert.Single(BomberEffectIntegrationTests.Events(f.World, "fire_region_born"),
            e => e.GetProperty("entityId").GetString() == first.Entity.ToHex());
        Assert.Equal("0", born.GetProperty("data").GetProperty("mask").GetString());
        Assert.Equal(f.Life.ToHex(), born.GetProperty("lifeId").GetString());
    }

    [Fact]
    public void RealRemovedRegionControlNeverMasqueradesAsPositiveExpiryOrReleasesItsLease()
    {
        using var f = new PublicCast(); using var receipts = new ReceiptProbe(f.World);
        f.Cast(); f.Scene.TickControlled(); var first = Assert.Single(f.World.Each<BomberFireZoneState>());
        var row = Assert.Single(f.World.Get<EffectComponent>(first.Entity).ActiveEffects);
        _ = Effects.Remove(f.World, row.Handle); f.Scene.TickControlled();
        Assert.Single(receipts.Results, r => r.TypeId == 10112u && r.Target == first.Entity && r.Handle == row.Handle &&
            r.Kind == EffectResultKind.Control && r.Outcome == EffectResultOutcome.Removed);
        string held = f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value;
        Assert.ThrowsAny<Exception>(() => f.Scene.TickControlled());
        Assert.Equal(held, f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value);
        Assert.Equal(3, first.LifetimeOutcome.Value); Assert.Equal(1, first.Phase.Value);
        Assert.DoesNotContain(BomberEffectIntegrationTests.Events(f.World, "fire_region_expired"),
            e => e.GetProperty("entityId").GetString() == first.Entity.ToHex());
        Assert.True(f.World.IsLive(first.Entity));
    }

    [Fact]
    public void SlotExchangeDoesNotChangeAdmittedFavoriteOrReapplyParent()
    {
        using var f = new PublicCast();
        f.Cast(); f.Scene.TickControlled();
        var parent = Assert.Single(f.World.Get<EffectComponent>(f.Life).ActiveEffects);
        f.Pickup(7); // Existing Pierce slot: public exchange after captured Fire.
        Assert.NotEqual(f.FireSkill, f.World.Get<BomberSkillState>(f.Life).BombSkillId.Value);
        for (int i = 0; i < 5; i++) f.Scene.TickControlled();
        Assert.True(f.World.Get<BomberSkillState>(f.Life).AuraFavorite.Value);
        Assert.Equal(parent.Handle, Assert.Single(f.World.Get<EffectComponent>(f.Life).ActiveEffects).Handle);
        Assert.All(f.World.Each<BomberFireZoneState>(), z => Assert.Equal(f.Life, z.SourceLife.Value));
    }

    [Fact]
    public void CorruptPersistedOrdinalOrHandleIsRejectedBeforeFurtherEmission()
    {
        using var f = new PublicCast(); f.Cast(); f.Scene.TickControlled();
        var first = Assert.Single(f.World.Each<BomberFireZoneState>());
        string original = f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value;
        first.RegionOrdinal.Value = 1;
        Assert.Throws<InvalidOperationException>(() => BomberFavoriteFireZones.Validate(f.World));
        Assert.Equal(original, f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value);
        first.RegionOrdinal.Value = 0; first.LifetimeEffectGeneration.Value++;
        Assert.Throws<InvalidOperationException>(() => BomberFavoriteFireZones.RequireActual(f.World, first));
        Assert.Equal(original, f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value);
    }

    [Theory]
    [InlineData(0, 0)] [InlineData(1, 1)] [InlineData(16, 1)] [InlineData(511, 9)]
    public void RegionMaskHasOneCanonicalDecoderIncludingEmpty(int mask, int count)
    {
        var cells = BomberFireRegionCoverage.Cells(5, 5, mask).ToArray();
        Assert.Equal(count, cells.Length);
        Assert.All(cells, at => Assert.True(BomberFireRegionCoverage.Contains(5, 5, mask, at.X, at.Z)));
        Assert.Throws<ArgumentOutOfRangeException>(() => BomberFireRegionCoverage.Cells(5, 5, 512).ToArray());
    }

    [Fact]
    public void WholeFutureCreditRejectsBeforeAuraCooldownProtectionOrChainMutation()
    {
        using var f = new PublicCast();
        // Capacity is actual world admission, with all producer maxima reserved.
        // This seam is the same read-only proof called by the public ability.
        Assert.True(BomberFavoriteFireZones.CanReserve(f.World, f.Life, 110, out _));
        var skill = f.World.Get<BomberSkillState>(f.Life);
        ulong chain = f.World.Single<BomberWorldRuntime>().NextChainId.Value;
        ulong protection = f.World.Get<BomberPlayerState>(f.Life).ProtectedUntilTick.Value;
        Assert.False(BomberFavoriteFireZones.CanReserve(f.World, f.Life, 881, out _));
        Assert.Equal(chain, f.World.Single<BomberWorldRuntime>().NextChainId.Value);
        Assert.Equal(protection, f.World.Get<BomberPlayerState>(f.Life).ProtectedUntilTick.Value);
        Assert.Equal(0UL, skill.CooldownUntilTick.Value);
        Assert.Empty(f.World.Get<EffectComponent>(f.Life).ActiveEffects);
    }

    [Fact]
    public void AuraAndManyRegionsUseOnePulseThenSwitchRegionWithoutRestartingExposure()
    {
        using var f = new PublicCast();
        var victim = f.Scene.Lives[2];
        BomberEffectIntegrationTests.Position(f.World.Get<LogicTransform>(victim), new Vector3(6.5f, 1.5f, 5.5f));
        f.Cast();
        for (int i = 0; i < 4; i++) f.Scene.TickControlled();
        var exposure = f.World.Get<BomberSkillState>(victim);
        ulong clock = exposure.FireExposureFromTick.Value;
        Assert.Equal(f.Life, exposure.FireExposureEntity.Value);
        f.Position(9, 9); f.Scene.TickControlled();
        Assert.Equal(3, exposure.FireExposureKind.Value);
        Assert.Equal(clock, exposure.FireExposureFromTick.Value);
        Assert.Equal(f.Life, exposure.FireExposureLife.Value);
        while (f.World.Tick <= clock + 20) f.Scene.TickControlled();
        Assert.Equal(4L, f.World.Get<AttributeComponent>(victim).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(1UL, exposure.FirePulseSequence.Value);
        f.Scene.TickControlled();
        var occurred = Assert.Single(BomberEffectIntegrationTests.Events(f.World, "damage_applied"));
        Assert.Equal(f.Life.ToHex(), occurred.GetProperty("sourceLifeId").GetString());
        Assert.Equal(victim.ToHex(), occurred.GetProperty("lifeId").GetString());
        Assert.Equal("2", occurred.GetProperty("data").GetProperty("appliedPoints").GetString());
    }

    [Fact]
    public void RealSourceDeathStopsBirthsWhileAlreadyAppliedRegionsRetainOriginalLife()
    {
        using var f = new PublicCast(); f.Cast();
        for (int i = 0; i < 4; i++) f.Scene.TickControlled();
        ulong generation = f.World.Get<BomberPlayerState>(f.Life).LifeGeneration.Value;
        for (ulong chain = 9561; chain <= 9563; chain++)
            BomberEffectIntegrationTests.Bomb(f.World, f.Scene.Lives[1], f.Life, chain);
        for (int i = 0; i < 8 && f.World.IsLive(f.Life); i++) f.Scene.TickControlled();
        Assert.False(f.World.IsLive(f.Life));
        var survivors = f.World.Each<BomberFireZoneState>().ToArray();
        Assert.NotEmpty(survivors);
        Assert.Contains(survivors, z => z.UntilTick.Value > f.World.Tick && z.LifetimeOutcome.Value == 3);
        Assert.All(survivors, z => { Assert.Equal(f.Life, z.SourceLife.Value); Assert.Equal(generation, z.SourceLifeGeneration.Value); });
        int count = survivors.Length;
        f.Scene.TickControlled(); f.Scene.TickControlled();
        Assert.Equal(count, f.World.Each<BomberFireZoneState>().Count());
        while (f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value != "" && f.World.Tick < survivors.Max(z => z.UntilTick.Value) + 4)
            f.Scene.TickControlled();
        Assert.Empty(f.World.Each<BomberFireZoneState>());
        Assert.Equal("", f.World.Single<BomberWorldRuntime>().FireTrailPromises.Value);
        Assert.Single(BomberEffectIntegrationTests.Events(f.World, "death"), e => e.GetProperty("lifeId").GetString() == f.Life.ToHex());
    }

    [Fact]
    public void PairedRestoreUsesFreshRealHandlesAndNeverReissuesFiniteInitials()
    {
        using var f = new PublicCast(persistence: true); f.Cast();
        for (int i = 0; i < 4; i++) f.Scene.TickControlled();
        var before = f.World.Each<BomberFireZoneState>().OrderBy(z => z.RegionOrdinal.Value).ToArray();
        var actual = before.Select(z => Assert.Single(f.World.Get<EffectComponent>(z.Entity).ActiveEffects)).ToArray();
        Assert.True(f.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture(); Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
        {
            InstanceId = 1, Config = BomberConfigBinding.Load(f.Directory),
            Catalog = File.ReadAllBytes(Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server/Assets/Maps/official-catalog.json")),
            Snapshot = capture.Checkpoint!.Value.Runtime, VoxelSnapshot = capture.Checkpoint.Value.Voxel,
            Subsystems = new IWorldSubsystem[] { new WorldPersistenceSubsystem() },
        });
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        foreach (var old in actual)
        {
            var current = Assert.Single(restored.World.Get<EffectComponent>(old.Target).ActiveEffects);
            Assert.NotEqual(old.Handle.WorldId, current.Handle.WorldId);
            Assert.Equal(old.Handle.InstanceId, current.Handle.InstanceId); Assert.Equal(old.Handle.Generation, current.Handle.Generation);
            Assert.Equal(old.Payload.ToArray(), current.Payload.ToArray()); Assert.Equal(old.EndTick, current.EndTick);
        }
        using var restoredReceipts = new ReceiptProbe(restored.World);
        restored.Tick();
        Assert.Equal(before.Length + 1, restored.World.Each<BomberFireZoneState>().Count());
        Assert.All(before, old => Assert.Equal(GasWorldContext.Require(restored.World).WorldId.Value,
            restored.World.Get<BomberFireZoneState>(old.Entity).LifetimeEffectWorld.Value));
        Assert.Equal(1, restored.World.Get<BomberStatistics>(f.Participant).SkillCasts.Value);
        Assert.DoesNotContain(restoredReceipts.Results, r => r.TypeId == 10111u && r.Kind == EffectResultKind.Initial);
        Assert.DoesNotContain(restoredReceipts.Results, r => r.TypeId == 10112u && r.Kind == EffectResultKind.Initial &&
            before.Any(old => old.Entity == r.Target));
    }

    [Fact]
    public void RuntimeOnlyHydrationRejectsCoupledRegionMemoryOnFirstNormalTick()
    {
        using var f = new PublicCast(); f.Cast(); f.Scene.TickControlled(); f.Scene.TickControlled();
        using var restored = BomberTestWorld.Restore(f.Scene.Manager.CaptureSnapshot(), GeneratedRegistry.Instance, BomberConfigBinding.Load(f.Directory));
        string debt = restored.World.Single<BomberWorldRuntime>().FireTrailPromises.Value;
        Assert.NotEqual("", debt);
        Assert.Throws<InvalidOperationException>(() => restored.Tick());
        Assert.Equal(debt, restored.World.Single<BomberWorldRuntime>().FireTrailPromises.Value);
    }

    [Fact]
    public void CorruptClosedOwnerAndPublicationReentryKeepTheOriginalSubmittedDebt()
    {
        using var f = new PublicCast(); f.Cast(); f.Scene.TickControlled();
        var runtime = f.World.Single<BomberWorldRuntime>(); string original = runtime.FireTrailPromises.Value;
        var first = Assert.Single(f.World.Each<BomberFireZoneState>());
        Assert.Throws<InvalidOperationException>(() => BomberFavoriteFireZones.Published(f.World, first));
        Assert.Equal(original, runtime.FireTrailPromises.Value);
        runtime.FireTrailPromises.Value = original.Replace("\"PendingOrdinal\":0", "\"PendingOrdinal\":0,\"PendingOrdinal\":0");
        Assert.Throws<InvalidOperationException>(() => BomberFavoriteFireZones.Validate(f.World));
        runtime.FireTrailPromises.Value = new string('x', 16385);
        Assert.Throws<InvalidOperationException>(() => BomberFavoriteFireZones.Validate(f.World));
        runtime.FireTrailPromises.Value = original;
        Assert.Equal(original, runtime.FireTrailPromises.Value);
    }

    [Fact]
    public void ResultsWaitForEveryFiniteRegionWithoutRemoving10112OrRollingDroppingRows()
    {
        using var f = new PublicCast(); f.Cast(); f.Scene.TickControlled(); f.Scene.TickControlled();
        var match = f.World.Single<BomberMatchState>(); ulong oldMatch = match.MatchId.Value;
        var finite = f.World.Each<BomberFireZoneState>().Select(z => Assert.Single(f.World.Get<EffectComponent>(z.Entity).ActiveEffects)).ToArray();
        match.Phase.Value = (int)BomberMatchPhase.Results; match.PhaseEndTick.Value = f.World.Tick;
        f.Scene.TickControlled();
        Assert.Equal(oldMatch, match.MatchId.Value); Assert.True(BomberFavoriteFireZones.HasPending(f.World));
        foreach (var row in finite) Assert.Equal(row.Handle, Assert.Single(f.World.Get<EffectComponent>(row.Target).ActiveEffects).Handle);
        ulong last = finite.Max(r => r.EndTick);
        while (f.World.Tick < last) { f.Scene.TickControlled(); Assert.Equal(oldMatch, match.MatchId.Value); }
        for (int i = 0; i < 8 && BomberFavoriteFireZones.HasPending(f.World); i++) f.Scene.TickControlled();
        Assert.False(BomberFavoriteFireZones.HasPending(f.World));
    }

    [Fact]
    public void BrickSnapshotMaskExcludesItsCellAndTrailHasNoOrdinaryTerrainOrPickupSideEffects()
    {
        using var f = new PublicCast(); f.Scene.Write(6, 1, 5, 1025u << 8);
        var address = new VoxelWorldCoordinate(6, 1, 5); var before = f.Scene.Native.ReadCell(address);
        f.Cast(); f.Scene.TickControlled();
        var region = Assert.Single(f.World.Each<BomberFireZoneState>());
        Assert.Equal(479, region.CoverageMask.Value); // Bit5, east neighbor, is excluded.
        var item = BomberGrowthHealthTests.Item(f.World, f.Life, (int)BomberPickupKind.Health);
        BomberEffectIntegrationTests.Position(item.Get<LogicTransform>(), new Vector3(4.5f, 1.5f, 4.5f));
        f.Scene.TickControlled();
        for (int i = 0; i < 22; i++) f.Scene.TickControlled();
        var after = f.Scene.Native.ReadCell(address);
        Assert.Equal(before.BlockId, after.BlockId); Assert.Equal(before.SectionRevision, after.SectionRevision);
        Assert.True(f.World.IsLive(item.AssignedId)); Assert.Empty(f.World.Each<BomberBombState>());
        Assert.Empty(BomberEffectIntegrationTests.Events(f.World, "bomb_exploded"));
        Assert.Equal(0, f.World.Single<BomberWorldRuntime>().PendingKinds.Count);
    }

    [Fact]
    public void RealRegionMeltUnknownRetainsExpiredSourceUntilOriginalAndReplayCannotReapply()
    {
        using var f = new PublicCast(remoteEnabled: true);
        f.Scene.Write(6, 0, 5, 1027u << 8);
        f.Position(9, 9);
        var target = f.Scene.Lives[3];
        BomberEffectIntegrationTests.Position(f.World.Get<LogicTransform>(target), new Vector3(5.5f, 1.5f, 5.5f));
        var freeze = BomberEffectIntegrationTests.Bomb(f.World, f.Scene.Lives[1], target, 9591);
        freeze.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        for (int i = 0; i < 8 && !f.World.Each<BomberIceBridgeState>().Any(b => b.AppliedTick.Value != 0); i++) f.Scene.TickControlled();
        var bridge = Assert.Single(f.World.Each<BomberIceBridgeState>());
        Assert.NotEqual(0UL, bridge.AppliedTick.Value);
        var cell = new VoxelWorldCoordinate(6, 0, 5);
        Assert.Equal(1031u << 8, f.Scene.Native.ReadCell(cell).BlockId);
        var ordinary = PlacePublic(f.Scene, 2, remote: false, 13, 3);
        var remote = PlacePublic(f.Scene, 4, remote: true, 13, 5);
        NetEntityId frenzyLife = f.Scene.Lives[5];
        BomberGrowthHealthTests.Take(f.Scene.Manager, frenzyLife, 7);
        var frenzyParticipant = f.World.Get<BomberParticipantState>(f.World.Get<BomberPlayerState>(frenzyLife).Participant.Value);
        Assert.True(BomberFrenzy.IsActive(f.World, frenzyParticipant, frenzyLife));
        long frenzyInventory = Available(f.World, frenzyLife);
        var frenzy = PlacePublic(f.Scene, 5, remote: false, 13, 7);
        Assert.True(frenzy.Frenzy.Value); Assert.Equal(frenzyInventory, Available(f.World, frenzyLife));
        var bombs = new[] { ordinary, remote, frenzy };
        var identities = bombs.Select(b => (b.Entity, b.SourceLife.Value, b.SourceLifeGeneration.Value, b.Owner.Value, b.ChainId.Value, b.FuseEndTick.Value)).ToArray();
        foreach (var bomb in bombs) BomberEffectIntegrationTests.Position(f.World.Get<LogicTransform>(bomb.Entity), new Vector3(6.5f, 1.5f, 5.5f));
        Assert.Equal(0L, Available(f.World, ordinary.SourceLife.Value));
        Assert.Equal(0L, Available(f.World, remote.SourceLife.Value));
        f.Position(5, 5); ulong start = f.Cast();
        for (int i = 0; i < 8 && f.Scene.Native.ReadCell(cell).BlockId != (1027u << 8); i++) f.Scene.TickControlled();
        var runtime = f.World.Single<BomberWorldRuntime>();
        Assert.Equal(1027u << 8, f.Scene.Native.ReadCell(cell).BlockId);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var original = f.Scene.Adapter.CaptureResultCheckpoint();
        var result = Assert.Single(original.Results, r => r.TransactionId == transaction);
        Assert.Equal(VoxelCommitDisposition.Original, result.Outcome.Disposition);
        Assert.True(result.Outcome.TokenConsumed); Assert.NotEmpty(result.Outcome.Receipt.OriginalReceiptBytes.ToArray());
        using var document = JsonDocument.Parse(runtime.IceBridgePromises.Value);
        string cause = Assert.Single(document.RootElement.EnumerateArray(), r => r.GetProperty("Bridge").GetString() == bridge.Entity.ToHex())
            .GetProperty("MeltCause").GetString()!;
        Assert.StartsWith("region:", cause);
        Assert.True(NetEntityId.TryParse(cause.Split(':')[1], out var sourceRegion));
        ulong committedRevision = f.Scene.Native.ReadCell(cell).SectionRevision;
        using (BindAdapter(f.Scene, null))
        {
            while (f.World.Tick < start + 150) f.Scene.TickControlled();
            Assert.True(f.World.IsLive(sourceRegion));
            Assert.Equal(4, f.World.Get<BomberFireZoneState>(sourceRegion).LifetimeOutcome.Value);
            Assert.Equal(2, f.World.Get<BomberFireZoneState>(sourceRegion).Phase.Value);
            Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
            Assert.Equal(110, f.World.Each<BomberFireZoneState>().Count());
            Assert.True(BomberFavoriteFireZones.HasPending(f.World));
            Assert.All(bombs, b => {
                Assert.True(f.World.IsLive(b.Entity)); Assert.Equal((int)BomberBombPhase.Fuse, b.Phase.Value);
                Assert.False(b.CapacityReturned.Value);
                Assert.Equal(identities.Single(i => i.Entity == b.Entity),
                    (b.Entity, b.SourceLife.Value, b.SourceLifeGeneration.Value, b.Owner.Value, b.ChainId.Value, b.FuseEndTick.Value));
            });
            Assert.Empty(BomberEffectIntegrationTests.Events(f.World, "bomb_extinguished"));
            Assert.Equal(0L, Available(f.World, ordinary.SourceLife.Value));
            Assert.Equal(0L, Available(f.World, remote.SourceLife.Value));
            Assert.Equal(frenzyInventory, Available(f.World, frenzyLife));
        }
        using (BindAdapter(f.Scene, original))
            for (int i = 0; i < 8; i++) f.Scene.TickControlled();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.False(f.World.IsLive(bridge.Entity)); Assert.False(f.World.IsLive(sourceRegion));
        Assert.False(BomberFavoriteFireZones.HasPending(f.World));
        foreach (var identity in identities)
        {
            Assert.False(f.World.IsLive(identity.Entity));
            var occurrence = Assert.Single(BomberEffectIntegrationTests.Events(f.World, "bomb_extinguished"),
                e => e.GetProperty("entityId").GetString() == identity.Entity.ToHex());
            Assert.Equal(identity.Item2.ToHex(), occurrence.GetProperty("lifeId").GetString());
            Assert.Equal(identity.Item4.ToHex(), occurrence.GetProperty("participantId").GetString());
            Assert.Equal(identity.Item3.ToString(CultureInfo.InvariantCulture), occurrence.GetProperty("lifeGeneration").GetString());
        }
        Assert.Equal(1L, Available(f.World, identities[0].Item2));
        Assert.Equal(1L, Available(f.World, identities[1].Item2));
        Assert.Equal(frenzyInventory, Available(f.World, frenzyLife)); Assert.Equal(0, frenzyParticipant.FrenzyBombPromises.Count);
        using (BindAdapter(f.Scene, original))
            for (int i = 0; i < 3; i++) f.Scene.TickControlled();
        Assert.Equal(committedRevision, f.Scene.Native.ReadCell(cell).SectionRevision);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(3, BomberEffectIntegrationTests.Events(f.World, "bomb_extinguished").Length);
        Assert.Equal(1L, Available(f.World, identities[0].Item2));
        Assert.Equal(1L, Available(f.World, identities[1].Item2));
        Assert.Equal(frenzyInventory, Available(f.World, frenzyLife));
    }

    [Fact]
    public void SameTickRealFreezeContactAndAppliedRegionMeltChooseMeltBeforeBirth()
    {
        using var f = new PublicCast(); f.Scene.Write(6, 0, 5, 1027u << 8);
        f.Cast(); f.Scene.TickControlled();
        var target = f.Scene.Lives[3];
        BomberEffectIntegrationTests.Position(f.World.Get<LogicTransform>(target), new Vector3(5.5f, 1.5f, 5.5f));
        var freeze = BomberEffectIntegrationTests.Bomb(f.World, f.Scene.Lives[1], target, 9592);
        freeze.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        for (int i = 0; i < 6; i++) f.Scene.TickControlled();
        Assert.Equal(1027u << 8, f.Scene.Native.ReadCell(new VoxelWorldCoordinate(6, 0, 5)).BlockId);
        Assert.Empty(f.World.Each<BomberIceBridgeState>());
        Assert.Equal("", f.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
    }

    [Fact]
    public void ExactOldLifeImmunityDoesNotExtendToItsActuallyLandedSuccessor()
    {
        using var f = new PublicCast(rapidRespawn: true); using var receipts = new ReceiptProbe(f.World);
        f.Cast(); f.Scene.TickControlled(); f.Scene.TickControlled();
        Assert.Equal(6L, f.World.Get<AttributeComponent>(f.Life).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0, f.World.Get<BomberSkillState>(f.Life).FireExposureKind.Value);
        var participant = f.World.Get<BomberParticipantState>(f.Participant);
        ulong oldGeneration = participant.LifeGeneration.Value;
        for (ulong chain = 9593; chain <= 9595; chain++)
            BomberEffectIntegrationTests.Bomb(f.World, f.Scene.Lives[1], f.Life, chain);
        for (int i = 0; i < 8 && f.World.IsLive(f.Life); i++) f.Scene.TickControlled();
        Assert.False(f.World.IsLive(f.Life));
        for (int i = 0; i < 16 && (participant.CurrentLife.Value.IsDefault || participant.CurrentLife.Value == f.Life ||
            !f.World.IsLive(participant.CurrentLife.Value) || f.World.Get<BomberPlayerState>(participant.CurrentLife.Value).RestorePending.Value ||
            !f.World.Get<BomberSuccessorState>(f.Participant).DormantLife.Value.IsDefault); i++) f.Scene.TickControlled();
        NetEntityId successor = participant.CurrentLife.Value;
        Assert.NotEqual(f.Life, successor); Assert.True(f.World.IsLive(successor));
        Assert.Equal(oldGeneration + 1, participant.LifeGeneration.Value);
        Assert.Single(receipts.Results, r => r.TypeId == 10105u && r.Target == successor && r.Outcome == EffectResultOutcome.Applied);
        Assert.Single(f.Scene.TransferResults, r => r.Operation == "transfer" && r.ParticipantId == f.Participant &&
            r.CommitFact == SuccessorCommitFact.Applied && r.NewBinding is { } binding && binding.NetEntityId == successor);
        var old = f.World.Each<BomberFireZoneState>().Last(z => z.SourceLife.Value == f.Life && z.LifetimeOutcome.Value == 3);
        Assert.True(old.UntilTick.Value > f.World.Tick + 2, "The old finite region must remain actually active through successor observation.");
        BomberEffectIntegrationTests.Position(f.World.Get<LogicTransform>(successor), new Vector3(5.5f, 1.5f, 5.5f));
        // Successor restores the bound Aura with empty Bomb slot. Genuine non-Favorite
        // public cast removes its landing protection through actual 10111 settlement.
        var admitted = f.World.Get<AbilityComponent>(successor).Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9596);
        Assert.True(admitted.Succeeded, admitted.FailureCode);
        f.Scene.TickControlled(); f.Scene.TickControlled();
        Assert.Equal(0UL, f.World.Get<BomberPlayerState>(successor).ProtectedUntilTick.Value);
        var exposure = f.World.Get<BomberSkillState>(successor);
        Assert.Equal(3, exposure.FireExposureKind.Value); Assert.Equal(f.Life, exposure.FireExposureLife.Value);
        Assert.Equal(oldGeneration, exposure.FireExposureGeneration.Value);
        Assert.NotEqual(successor, exposure.FireExposureLife.Value);
    }

    private static AdapterBinding BindAdapter(BomberTerrainProductionTests.Scene scene, VoxelResultCheckpoint? original)
    {
        var candidate = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        if (original is not null) candidate.RestoreResultCheckpoint(original);
        candidate.SetBindingPolicy(scene.Adapter.BindingPolicy);
        var binding = VoxelGameplayBinding.Bind(scene.Manager, candidate);
        scene.Manager.BindVoxelTick(candidate.PrepareVoxel, candidate.CommitVoxel);
        return new AdapterBinding(scene, binding);
    }
    private static long Available(World world, NetEntityId life) => world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.AvailableBombs);
    private static BomberBombState PlacePublic(BomberTerrainProductionTests.Scene scene, int slot, bool remote, int x, int z)
    {
        NetEntityId life = scene.Lives[slot]; var skill = scene.World.Get<BomberSkillState>(life);
        skill.BombSkillId.Value = remote ? BomberConfigBinding.For(scene.World).Tables.Skills.Rows.Single(s => s.Slot == "Bomb" && s.BombKindCode == 7 && !s.IsCombo).Id : 0;
        skill.BombSkillLevel.Value = remote ? 1 : 0;
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(life), new Vector3(x + .5f, 1.5f, z + .5f));
        var owner = scene.World.Get<AbilityComponent>(life);
        Assert.True(PlaceBombAbility.CanPlace(owner, out string? reason), reason);
        var admitted = owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        Assert.True(admitted.Succeeded, admitted.FailureCode); scene.TickControlled();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>(), b => b.SourceLife.Value == life &&
            scene.World.Get<LogicTransform>(b.Entity).LocalPosition == new Vector3(x + .5f, 1.5f, z + .5f));
        Assert.Equal(remote ? 7 : 0, bomb.BombKind.Value); Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        return bomb;
    }
    private sealed class AdapterBinding(BomberTerrainProductionTests.Scene scene, IDisposable binding) : IDisposable
    {
        public void Dispose() { binding.Dispose(); scene.Manager.BindVoxelTick(scene.Adapter.PrepareVoxel, scene.Adapter.CommitVoxel); }
    }

    private static (int X, int Z) Center(World world, BomberFireZoneState z)
    {
        var p = world.Get<LogicTransform>(z.Entity).LocalPosition;
        return (BomberMatchRules.CellX(p), BomberMatchRules.CellZ(p));
    }

    private sealed class PublicCast : IDisposable
    {
        internal readonly BomberObjectBudgetTests.AuthoredFixture Authored;
        internal readonly BomberTerrainProductionTests.Scene Scene;
        internal World World => Scene.World;
        internal NetEntityId Life { get; }
        internal NetEntityId Participant { get; }
        internal uint FireSkill { get; }
        internal string Directory { get; }
        internal PublicCast(bool persistence = false, bool rapidRespawn = false, bool remoteEnabled = false)
        {
            var edits = new List<(string, string, string, string)> { ("bomb_kinds", "Fire", "enabled", "true"),
                ("object_budgets", "default", "max_bomb_entities", "4064"),
                ("object_budgets", "default", "max_pickup_entities", "1351"),
                ("object_budgets", "default", "max_firezone_entities", "880") };
            if (rapidRespawn) edits.Add(("life", "default", "respawn_ms", "50"));
            if (remoteEnabled) edits.Add(("bomb_kinds", "Remote", "enabled", "true"));
            Authored = new(edits.ToArray());
            Directory = Authored.Compile();
            Scene = new(0, configDirectory: Directory, controlled: true, persistence: persistence);
            Life = Scene.Lives[0];
            Participant = World.Get<BomberPlayerState>(Life).Participant.Value;
            for (int z = 3; z <= 11; z++) for (int x = 3; x <= 11; x++) Scene.Write(x, 1, z, 0);
            foreach (var other in Scene.Lives) BomberEffectIntegrationTests.Position(World.Get<LogicTransform>(other), new Vector3(15.5f, 1.5f, 15.5f));
            Position(5, 5);
            var match = World.Single<BomberMatchState>(); var skill = World.Get<BomberSkillState>(Life);
            match.Phase.Value = (int)BomberMatchPhase.Warmup; match.PhaseEndTick.Value = World.Tick + 100;
            World.Get<BomberParticipantState>(Participant).SelectedForMatchCharacterId.Value = 0; skill.CharacterId.Value = 0;
            var select = new SelectCharacterAbility.Input { CharacterId = 118004 };
            var selected = World.Get<AbilityComponent>(Life).Activate<SelectCharacterAbility, SelectCharacterAbility.Input>(in select, 9551);
            Assert.True(selected.Succeeded, selected.FailureCode);
            match.Phase.Value = (int)BomberMatchPhase.Running;
            match.PhaseEndTick.Value = World.Tick + Ticks.FromMilliseconds(240000, 20);
            FireSkill = BomberConfigBinding.For(World).Tables.Skills.Rows.Single(row => row.Slot == "Bomb" && row.BombKindCode == 2 && !row.IsCombo).Id;
            Pickup(FireSkill);
        }
        internal void Pickup(uint skill)
        {
            var order = BomberGrowthHealthTests.Item(World, Life, (int)BomberPickupKind.Skill);
            order.Get<BomberPickupItem>().SkillId.Value = skill; order.Get<BomberPickupItem>().SkillLevel.Value = 1;
            Scene.TickControlled();
            var input = new PickupAbility.Input { Target = order.AssignedId };
            var picked = World.Get<AbilityComponent>(Life).Activate<PickupAbility, PickupAbility.Input>(in input, 9552);
            Assert.True(picked.Succeeded, picked.FailureCode); Scene.TickControlled(); Scene.TickControlled();
        }
        internal ulong Cast()
        {
            ulong start = World.Tick;
            var cast = World.Get<AbilityComponent>(Life).Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9553);
            Assert.True(cast.Succeeded, cast.FailureCode); Assert.True(World.Get<BomberSkillState>(Life).AuraFavorite.Value);
            return start;
        }
        internal void Position(int x, int z) => BomberEffectIntegrationTests.Position(World.Get<LogicTransform>(Life), new Vector3(x + .5f, 1.5f, z + .5f));
        public void Dispose() { Scene.Dispose(); Authored.Dispose(); }
    }

    // Same existing actual Runtime result observer as BomberPublicAuraProductionTests.
    // This observes real settlement batches; it does not fabricate outcomes or payloads.
    private sealed class ReceiptProbe : IDisposable
    {
        private readonly World world;
        private readonly GasWorldContext gas;
        private readonly PropertyInfo observer;
        private readonly Action<EffectResultBatch>? previous;
        internal List<EffectResult> Results { get; } = new();
        internal ReceiptProbe(World world)
        {
            this.world = world; gas = GasWorldContext.Require(world);
            observer = typeof(GasWorldContext).GetProperty("ObserveEffectResults", BindingFlags.Instance | BindingFlags.NonPublic)!;
            Assert.NotNull(observer);
            previous = (Action<EffectResultBatch>?)observer.GetValue(gas);
            Assert.Null(previous); observer.SetValue(gas, (Action<EffectResultBatch>)Observe);
        }
        private void Observe(EffectResultBatch batch)
        {
            for (int i = 0; i < batch.Count(world); i++) Results.Add(batch.At(world, i));
        }
        public void Dispose() => observer.SetValue(gas, previous);
    }
}
