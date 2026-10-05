using System;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBarrelProductionTests
{
    [Fact]
    public void InitialBarrelsAreRealUniqueNativeBindingsAtEveryPlannedCell()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        M2Layout layout = M2InitialLayout.Plan(19);
        BomberInitialResources.Configure(scene.World, layout);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        var barrels = scene.World.Each<BomberBarrelState>().ToArray();
        Assert.Equal(4, barrels.Length);
        Assert.Equal(layout.Cells.Count, scene.World.Single<BomberWorldRuntime>().InitialResourceCursor.Value);
        foreach (var cell in layout.Cells.Where(c => c.Kind == M2CellKind.Barrel))
        {
            var at = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, cell.X, 1, cell.Z);
            Assert.Equal(1032u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(cell.X, 1, cell.Z)).BlockId);
            var barrel = Assert.Single(barrels, b => b.InitialResourceCell.Value == cell.Z * 19 + cell.X);
            Assert.Equal(1UL, barrel.ResourceGeneration.Value);
            Assert.Equal(1UL, barrel.InitialResourceMatch.Value);
            Assert.Equal(barrel.Entity.ToHex(), scene.Adapter.BindingGet(at.Section, at.Offset));
            Assert.True(scene.World.TypeOf(barrel.Entity).Is<BomberBarrelEntity>());
        }
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }

    [Theory]
    [InlineData("{")]
    [InlineData("null")]
    [InlineData("[{}, {}, {}, {}, {}, {}, {}, {}, {}]")]
    [InlineData("[{}]")]
    public void InvalidPromiseHydrationFailsWithoutChangingSourceBytes(string malformed)
    {
        using var manager = BomberTestWorld.Start();
        manager.World.Single<BomberWorldRuntime>().BarrelBombPromises.Value = malformed;
        byte[] source = manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(source, manager.CaptureSnapshot());
    }

    [Fact]
    public void Utf8PromiseBudgetRejectsOversizeBeforeHydration()
    {
        using var manager = BomberTestWorld.Start();
        manager.World.Single<BomberWorldRuntime>().BarrelBombPromises.Value = new string('桶', 5500);
        byte[] source = manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(source, manager.CaptureSnapshot());
    }

    [Fact]
    public void ActualBarrelExplodesTwoTicksAfterNativeAppliedAndPreservesSourceShapeWithoutInventoryRefund()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        NetEntityId barrel = BindBarrel(scene);
        var order = scene.Bomb();
        var source = order.Get<BomberBombState>();
        source.BombKind.Value = (int)BomberBombKind.ReservedFire;
        source.CapacityReturned.Value = true;
        var sourceLife = source.SourceLife.Value;
        ulong generation = source.SourceLifeGeneration.Value;
        NetEntityId participant = source.Owner.Value;
        var inventory = scene.World.Get<AttributeComponent>(sourceLife);
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 1);
        inventory.SetCurrentValue(BomberAttributeNames.AvailableBombs, 1);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(barrel));
        Assert.Null(scene.Adapter.BindingGet(0, 256 + 5 * 16 + 6));
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(1, BomberBarrelBombPromises.ReservedCount(scene.World));
        Assert.DoesNotContain(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
        var runtime = scene.World.Single<BomberWorldRuntime>();
        ulong applied = runtime.PendingVoxelSubmittedTicks[0];
        var original = scene.Adapter.CaptureResultCheckpoint().Results.Single(r => r.TransactionId == runtime.PendingVoxelTransactionIds[0]).Outcome;
        Assert.Equal(VoxelTxnState.Applied, original.State);
        Assert.Equal(VoxelCommitDisposition.Original, original.Disposition);
        Assert.Equal(source.ExplodedAtTick.Value, applied);
        Assert.Equal(applied + 1, scene.World.Tick);
        scene.Manager.Tick();
        var produced = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
        Assert.Equal(applied + 1, produced.PlacedAtTick.Value);
        Assert.Equal(applied + 2, produced.FuseEndTick.Value);
        Assert.Equal((int)BomberBombPhase.Fuse, produced.Phase.Value);
        Assert.Equal(sourceLife, produced.SourceLife.Value);
        Assert.Equal(generation, produced.SourceLifeGeneration.Value);
        Assert.Equal(participant, produced.Owner.Value);
        Assert.Equal(source.ChainId.Value, produced.ChainId.Value);
        Assert.Equal((int)BomberBombKind.ReservedFire, produced.BombKind.Value);
        Assert.Equal(3, produced.Power.Value);
        Assert.True(produced.CapacityReturned.Value);
        Assert.Equal(new Vector3(6.5f, 1.5f, 5.5f), scene.World.Get<LogicTransform>(produced.Entity).LocalPosition);
        Assert.Equal(0, BomberBarrelBombPromises.ReservedCount(scene.World));
        scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Danger, produced.Phase.Value);
        Assert.Equal(applied + 2, produced.ExplodedAtTick.Value);
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().TerrainRewards.Count);
    }

    private static NetEntityId BindBarrel(BomberTerrainProductionTests.Scene scene)
    {
        var order = scene.World.Commands.Create<BomberBarrelEntity>();
        order.Get<BomberBarrelState>().ResourceGeneration.Value = 1;
        scene.Manager.Tick();
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1032, scene.World.Registry.WireName(typeof(BomberBarrelEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var entry = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1032u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(new[] { entry },
            new[] { new VoxelBindingOp(0, entry.CellOffset, order.AssignedId.ToHex()) { ExpectedSectionRevision = entry.ExpectedSectionRevision } }, "fixture-barrel").Status);
        scene.Manager.Tick();
        Assert.Equal(order.AssignedId.ToHex(), scene.Adapter.BindingGet(0, entry.CellOffset));
        return order.AssignedId;
    }

    [Theory]
    [InlineData(0, 0, false)]
    [InlineData(0, 1, true)]
    [InlineData(4, 4, false)]
    [InlineData(4, 5, true)]
    public void NativeBarrelDestructionNeedsAllShapeCreditsBeforeStaging(int shape, int free, bool accepted)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        NetEntityId barrel = BindBarrel(scene);
        var sourceOrder = scene.Bomb();
        sourceOrder.Get<BomberBombState>().BombKind.Value = shape;
        sourceOrder.Get<BomberBombState>().FutureChildren.Value = shape == 4 ? 4 : 0;
        sourceOrder.Get<BomberBombState>().CapacityReturned.Value = true;
        scene.Manager.Tick();
        int sourceCredits = shape == 4 ? 5 : 1;
        int capacity = BomberConfigBinding.For(scene.World).ObjectBudgets.BombCapacity;
        for (int i = 0; i < capacity - sourceCredits - free; i++)
        {
            var order = BomberBombAdmissions.CreatePrimary(scene.World);
            order.Get<BomberBombState>().FuseEndTick.Value = ulong.MaxValue;
        }
        scene.Manager.Tick();
        Assert.Equal(!accepted, scene.World.IsLive(barrel));
        Assert.Equal(accepted ? sourceCredits : 0, BomberBarrelBombPromises.ReservedCount(scene.World));
        Assert.Equal(accepted ? 0u : 1032u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(accepted ? 1 : 0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }

    [Fact]
    public void SynchronousStageRejectionRetainsNativeBarrelAndNoPromise()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        NetEntityId barrel = BindBarrel(scene);
        var limited = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native),
            new WorldIngressBudget(1, 128, 1, 128)) { World = scene.World };
        // The normal adapter has already installed the actual Native binding policy.
        // Only the subsequent dig admission is limited; policy authoring is not under test.
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, limited);
        scene.Manager.BindVoxelTick(limited.PrepareVoxel, limited.CommitVoxel);
        scene.Bomb(); scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.True(scene.World.IsLive(barrel));
        Assert.Equal(1032u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal("", scene.World.Single<BomberWorldRuntime>().BarrelBombPromises.Value);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }

    [Fact]
    public void RealNativeRevisionAbortReleasesOnlyItsPromiseAndKeepsBinding()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        NetEntityId barrel = BindBarrel(scene);
        var source = scene.Bomb();
        scene.Manager.Tick();
        ulong revision = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).SectionRevision;
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageWrite(new[] {
            new VoxelWriteEntry(0, 256 + 7 * 16 + 7, 1025u << 8, revision)
        }, "earlier-independent-barrel-producer").Status);
        scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = runtime.PendingVoxelTransactionIds[0];
        Assert.Equal(VoxelTxnState.Aborted, scene.Adapter.CaptureResultCheckpoint().Results.Single(r => r.TransactionId == transaction).Outcome.State);
        Assert.Equal(1, BomberBarrelBombPromises.ReservedCount(scene.World));
        Assert.True(scene.World.IsLive(barrel));
        Assert.Equal(barrel.ToHex(), scene.Adapter.BindingGet(0, 256 + 5 * 16 + 6));
        Assert.Equal(1032u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        scene.Manager.Tick();
        Assert.Equal("", runtime.BarrelBombPromises.Value);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(source.AssignedId).Owner.Value).DestroyedBlocks.Value);
        Assert.DoesNotContain(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    public void ActualPublicationInheritsEveryShapeAndTransfersSplitFutureCredits(int shape)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        BindBarrel(scene);
        var order = scene.Bomb();
        order.Get<BomberBombState>().BombKind.Value = shape;
        order.Get<BomberBombState>().FutureChildren.Value = shape == 4 ? 4 : 0;
        order.Get<BomberBombState>().CapacityReturned.Value = true;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(shape == 4 ? 5 : 1, BomberBarrelBombPromises.ReservedCount(scene.World));
        scene.Manager.Tick();
        var produced = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
        var source = scene.World.Get<BomberBombState>(order.AssignedId);
        Assert.Equal(shape, produced.BombKind.Value);
        Assert.Equal(3, produced.Power.Value);
        Assert.Equal(shape == 3 ? 1 : 0, produced.PierceLayers.Value);
        Assert.Equal(shape == 4 ? 4 : 0, produced.FutureChildren.Value);
        Assert.Equal(source.Owner.Value, produced.Owner.Value);
        Assert.Equal(source.SourceLife.Value, produced.SourceLife.Value);
        Assert.Equal(source.SourceLifeGeneration.Value, produced.SourceLifeGeneration.Value);
        Assert.Equal(source.ChainId.Value, produced.ChainId.Value);
        Assert.True(produced.CapacityReturned.Value);
        Assert.Equal(0, BomberBarrelBombPromises.ReservedCount(scene.World));
        Assert.Equal("", scene.World.Single<BomberWorldRuntime>().BarrelBombPromises.Value);
        if (shape == 7)
        {
            ulong due = produced.FuseEndTick.Value;
            scene.Manager.Tick();
            Assert.Equal((int)BomberBombPhase.Danger, produced.Phase.Value);
            Assert.Equal(due, produced.ExplodedAtTick.Value);
        }
    }

    [Fact]
    public void HistoricalAppliedWithheldOriginalKeepsCreditThenLateOriginalDoesNotRestartFuse()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        BindBarrel(scene);
        scene.Bomb(); scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        ulong applied = runtime.PendingVoxelSubmittedTicks[0];
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var checkpoint = scene.Adapter.CaptureResultCheckpoint();
        var withheld = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var withheldBinding = VoxelGameplayBinding.Bind(scene.Manager, withheld);
        scene.Manager.BindVoxelTick(withheld.PrepareVoxel, withheld.CommitVoxel);
        for (int i = 0; i < 8; i++) scene.Manager.Tick();
        Assert.Equal(VoxelTxnState.Applied, withheld.QueryTransaction(transaction).State);
        Assert.Equal(VoxelCommitDisposition.None, withheld.QueryTransaction(transaction).Disposition);
        Assert.Equal(1, BomberBarrelBombPromises.ReservedCount(scene.World));
        Assert.DoesNotContain(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
        var accepted = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        accepted.RestoreResultCheckpoint(checkpoint);
        using var acceptedBinding = VoxelGameplayBinding.Bind(scene.Manager, accepted);
        scene.Manager.BindVoxelTick(accepted.PrepareVoxel, accepted.CommitVoxel);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
        Assert.Equal(applied + 2, bomb.FuseEndTick.Value);
        Assert.True(bomb.PlacedAtTick.Value > bomb.FuseEndTick.Value);
        Assert.Equal(0, BomberBarrelBombPromises.ReservedCount(scene.World));
        ulong processing = scene.World.Tick;
        scene.Manager.Tick();
        Assert.Equal(processing, bomb.ExplodedAtTick.Value);
        var repeated = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        repeated.RestoreResultCheckpoint(checkpoint);
        using var repeatedBinding = VoxelGameplayBinding.Bind(scene.Manager, repeated);
        scene.Manager.BindVoxelTick(repeated.PrepareVoxel, repeated.CommitVoxel);
        scene.Manager.Tick();
        Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }

    [Theory]
    [InlineData("exact")]
    [InlineData("wrong-produced")]
    [InlineData("wrong-shape")]
    [InlineData("wrong-source")]
    public void RestoredRetainedPromiseTransfersOnlyToItsExactActualPublication(string mutation)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        BindBarrel(scene);
        scene.Bomb(); scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var row = Assert.Single(JsonSerializer.Deserialize<BomberBarrelBombPromises.Promise[]>(runtime.BarrelBombPromises.Value)!);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value == row.Token);
        row = row with { Applied = true, CreationSubmitted = true, CreatedAt = bomb.PlacedAtTick.Value, Produced = bomb.Entity.ToHex() };
        row = mutation switch
        {
            "wrong-produced" => row with { Produced = row.SourceBomb },
            "wrong-shape" => row with { Shape = (int)BomberBombKind.Pierce },
            "wrong-source" => row with { LifeGeneration = row.LifeGeneration + 1 },
            _ => row
        };
        runtime.BarrelBombPromises.Value = BomberBarrelBombPromises.Encode(scene.World, new[] { row });
        byte[] source = scene.Manager.CaptureSnapshot();
        if (mutation == "exact")
        {
            using var restored = BomberTestWorld.Restore(source, GeneratedRegistry.Instance, config: BomberConfigBinding.Load());
            Assert.Equal(0, BomberBarrelBombPromises.ReservedCount(restored.World));
            Assert.Equal(source, restored.CaptureSnapshot());
            scene.Manager.Tick();
            Assert.Equal("", runtime.BarrelBombPromises.Value);
        }
        else
            BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load()));
        if (mutation != "exact") Assert.Equal(source, scene.Manager.CaptureSnapshot());
    }

    [Fact]
    public void SubmittedUnknownCreationWithoutActualPublicationKeepsCreditAndDoesNotRetry()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        BindBarrel(scene);
        scene.Bomb(); scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var row = Assert.Single(JsonSerializer.Deserialize<BomberBarrelBombPromises.Promise[]>(runtime.BarrelBombPromises.Value)!);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value == row.Token);
        row = row with { Applied = true, CreationSubmitted = true, CreatedAt = bomb.PlacedAtTick.Value, Produced = bomb.Entity.ToHex() };
        for (int i = 0; i < 128 && scene.World.IsLive(bomb.Entity); i++) scene.Manager.Tick();
        Assert.False(scene.World.IsLive(bomb.Entity));
        // Restore the retained submission witness without a published row. This is
        // a structural-outcome fault injection; the original Native destruction is real.
        runtime.BarrelBombPromises.Value = BomberBarrelBombPromises.Encode(scene.World, new[] { row });
        string retained = runtime.BarrelBombPromises.Value;
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(retained, runtime.BarrelBombPromises.Value);
        Assert.Equal(1, BomberBarrelBombPromises.ReservedCount(scene.World));
        Assert.DoesNotContain(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value == row.Token);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }
}
