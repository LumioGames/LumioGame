using System;
using System.IO;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Persistence;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberChestContactCapacityNativeTests
{
    // The source history and pre-observed terminal identity are produced by Game
    // against actual Native. The extra future cohort below probes the exact Game
    // preflight API; it does not pretend that Native submitted those extra rows.
    [Theory]
    [InlineData("overflow", "actual per-bomb contact capacity")]
    [InlineData("duplicate-future", "repeats a full identity")]
    [InlineData("duplicate-observed", "repeats a full identity")]
    [InlineData("source", "differs from its exact source")]
    [InlineData("unobserved-transfer", "lost its already observed chest")]
    public void ActualStrongNativeOriginalCohortRefusesBeforeAnyCapacityOrProvenanceWrite(string attack, string diagnostic)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        int limit = BomberConfigBinding.For(scene.World).ObjectBudgets.PerBombContactLimit;
        Assert.True(limit > 0);
        var futureOrders = Enumerable.Range(0, limit).Select(_ => scene.World.Commands.Create<BomberChestEntity>()).ToArray();
        scene.Manager.Tick();
        var future = futureOrders.Select(order => order.AssignedId).ToArray();
        uint wood = BomberConfigBinding.For(scene.World).Tables.Chest.Rows.Single(row => row.Name == "Wood").Id;
        foreach (var id in future) scene.World.Get<BomberChestState>(id).InitializeTier(wood, 1);
        NetEntityId chest = StrongChest(scene);
        for (int i = 0; i < 2; i++) { scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); }
        var terminal = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(terminal.AssignedId);
        BomberSourceIdentity source = bomb.ReadSource();
        Assert.Equal(chest, Assert.Single(bomb.ContactedChests.Values));
        Assert.Equal(5, bomb.TraversalArms[1]);
        Assert.Equal(limit, bomb.ContactedChests.MaxCapacity);
        Assert.Equal(bomb.ContactedChests.MaxCapacity, BomberConfigBinding.For(scene.World).ObjectBudgets.PerBombContactLimit);
        Assert.False(scene.World.IsLive(chest));
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = Assert.Single(runtime.PendingVoxelTransactionIds.Values);
        Assert.Equal(chest, Assert.Single(runtime.PendingChests.Values));
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results, row => row.TransactionId == transaction);
        Assert.Equal(VoxelTxnState.Applied, original.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        Assert.False(original.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var good = persistence!.Capture();
        Assert.True(good.Succeeded, good.ErrorCode);
        using (var positive = RestorePaired(good.Checkpoint!.Value))
        {
            Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, positive.CompletedRestore);
            var copy = positive.World.Get<BomberBombState>(bomb.Entity);
            Assert.Equal(source, copy.ReadSource());
            Assert.Equal(chest, Assert.Single(copy.ContactedChests.Values));
            Assert.Equal(5, copy.TraversalArms[1]);
            BomberTerrainTransactions.ValidateTraversalOwners(positive.World);
            // One real observed contact plus limit-1 distinct future writes fills
            // the declaration. Transferring that observed terminal uses no new slot.
            copy.PreflightChestContactCohort(source, future.Take(limit - 1).ToArray(), new[] { chest });
        }
        byte[] before = scene.Manager.CaptureSnapshot();
        uint nativeCell = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId;
        string? nativeBinding = scene.Adapter.BindingGet(0, 256 + 5 * 16 + 6);
        NetEntityId[] writes = future.Take(limit - 1).ToArray();
        NetEntityId[] observed = { chest };
        BomberSourceIdentity expected = source;
        switch (attack)
        {
            case "overflow": writes = future; break;
            case "duplicate-future": writes = new[] { future[0], future[0] }; break;
            case "duplicate-observed": observed = new[] { chest, chest }; break;
            case "source": expected = new(source.Participant, source.Life, checked(source.LifeGeneration + 1)); break;
            case "unobserved-transfer": writes = Array.Empty<NetEntityId>(); observed = new[] { future[0] }; break;
            default: throw new InvalidOperationException("Unknown capacity attack.");
        }
        var error = Assert.Throws<InvalidOperationException>(() => bomb.PreflightChestContactCohort(expected, writes, observed));
        Assert.Contains("Bomb terrain traversal", error.Message, StringComparison.Ordinal);
        Assert.Contains(diagnostic, error.Message, StringComparison.Ordinal);
        Assert.Equal(before, scene.Manager.CaptureSnapshot());
        Assert.Equal(nativeCell, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(nativeBinding, scene.Adapter.BindingGet(0, 256 + 5 * 16 + 6));
        Assert.Equal(chest, Assert.Single(bomb.ContactedChests.Values));
        Assert.Equal(5, bomb.TraversalArms[1]);
        Assert.Equal(transaction, Assert.Single(runtime.PendingVoxelTransactionIds.Values));
        Assert.Equal(original.Outcome.Receipt.OriginalReceiptBytes.ToArray(),
            Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results, row => row.TransactionId == transaction)
                .Outcome.Receipt.OriginalReceiptBytes.ToArray());
    }

    private static WorldManager RestorePaired(DualCutCheckpointPayload cut) =>
        BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance) {
            InstanceId = 1, Config = BomberConfigBinding.Load(),
            Catalog = File.ReadAllBytes(Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot,
                "Server", "Assets", "Maps", "official-catalog.json")),
            Snapshot = cut.Runtime, VoxelSnapshot = cut.Voxel,
            Subsystems = new IWorldSubsystem[] { new WorldPersistenceSubsystem() },
        });

    private static NetEntityId StrongChest(BomberTerrainProductionTests.Scene scene)
    {
        var order = scene.World.Commands.Create<BomberChestEntity>();
        scene.Manager.Tick();
        scene.World.Get<BomberChestState>(order.AssignedId).InitializeHitBudget();
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1028, scene.World.Registry.WireName(typeof(BomberChestEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var entry = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1028u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(new[] { entry },
            new[] { new VoxelBindingOp(0, entry.CellOffset, order.AssignedId.ToHex()) { ExpectedSectionRevision = entry.ExpectedSectionRevision } },
            "capacity-strong-fixture").Status);
        scene.Manager.Tick();
        Assert.Equal(order.AssignedId.ToHex(), scene.Adapter.BindingGet(0, entry.CellOffset));
        return order.AssignedId;
    }
}
