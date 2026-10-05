using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.Wire;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberPublicPierceContactHistoryNativeTests
{
    // Additive companion, intentionally separate from the current-capacity-five
    // RED producer test. It requires the declared capacity to admit at least
    // seven real contacts. It never authors the contact history or a receipt.
    [Fact]
    public void SixActualPublicContactsRemainOwnedAcrossNativeDuplicateUnknownReplacementAndResultsDeadline()
    {
        using var authored = BomberPublicPierceChestContactNativeTests.AuthoredPowerEight();
        using var scene = new BomberTerrainProductionTests.Scene(0,
            configDirectory: authored.Compile(), controlled: true, receiptLimit: 1);
        BomberPublicPierceChestContactNativeTests.PrepareCross(scene);
        NetEntityId[] six = BomberPublicPierceChestContactNativeTests.BindSixChests(scene);
        var inputs = PrepareSeventhAndReplacement(scene);
        BomberBombState bomb = BomberPublicPierceChestContactNativeTests.PlacePublicPierce(scene);
        CaptureSixAndSeventhOriginal(scene, bomb, six, inputs.Seventh);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var source = bomb.ReadSource();
        ulong chain = bomb.ChainId.Value, occurred = bomb.ExplodedAtTick.Value;
        string transaction = Assert.Single(runtime.PendingVoxelTransactionIds.Values);
        string detail = Assert.Single(runtime.TerrainPendingDetails.Values);
        var section = runtime.PendingSections[0];
        var offset = runtime.PendingCellOffsets[0];
        ulong revision = runtime.PendingExpectedRevisions[0];
        var retainedActualOriginal = scene.Adapter.CaptureResultCheckpoint();
        byte[] nativeBytes = Assert.Single(retainedActualOriginal.Results)
            .Outcome.Receipt.OriginalReceiptBytes.ToArray();

        // The new adapter withholds the actual retained Original. The duplicate
        // below is produced by Native's real Replay path, not constructed here.
        var held = new HostVoxelWorldAdapter(scene.Native.NativeHandle,
            new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var heldBinding = VoxelGameplayBinding.Bind(scene.Manager, held);
        scene.Manager.BindVoxelTick(held.PrepareVoxel, held.CommitVoxel);
        Assert.Equal(VoxelStageStatus.Staged, held.TryStageDigThrough(section, offset,
            revision, transaction, VoxelSubmissionIntent.Replay).Status);
        scene.TickControlled();
        var duplicate = Assert.Single(held.CaptureResultCheckpoint().Results,
            row => row.TransactionId == transaction);
        Assert.Equal(VoxelTxnState.Applied, duplicate.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Duplicate, duplicate.Outcome.Disposition);
        scene.TickControlled();
        AssertHeldHistory(scene, bomb, six, inputs.Seventh, transaction, detail,
            source.Participant, source.Life, source.LifeGeneration, chain, occurred);

        BindReplacement(scene, held, inputs.Replacement);
        // receiptLimit=1 and this independent committed Native mutation evict
        // Native's old transaction lookup, while the original bytes remain in
        // the captured adapter checkpoint above.
        Assert.Equal(VoxelTxnState.Unknown, held.QueryTransaction(transaction).State);
        Assert.Equal(VoxelStageStatus.OutcomeUnknown, held.TryStageDigThrough(section,
            offset, revision, transaction, VoxelSubmissionIntent.Replay).Status);
        Assert.Equal(nativeBytes, Assert.Single(retainedActualOriginal.Results)
            .Outcome.Receipt.OriginalReceiptBytes.ToArray());

        var match = scene.World.Single<BomberMatchState>();
        ulong matchId = match.MatchId.Value, matchIndex = match.MatchIndex.Value;
        // Explicit phase input premise; World.Tick and bomb clocks are never
        // overwritten. The ordinary processor owns all following deadline work.
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = scene.World.Tick;
        ulong stop = checked(bomb.DangerUntilTick.Value + 16);
        while (scene.World.Tick <= stop) scene.TickControlled();
        Assert.True(scene.World.Tick > bomb.DangerUntilTick.Value);
        Assert.Equal((int)BomberMatchPhase.Results, match.Phase.Value);
        Assert.Equal(matchId, match.MatchId.Value);
        Assert.Equal(matchIndex, match.MatchIndex.Value);
        AssertHeldHistory(scene, bomb, six, inputs.Seventh, transaction, detail,
            source.Participant, source.Life, source.LifeGeneration, chain, occurred);
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        Assert.True(scene.World.IsLive(inputs.Replacement));
        Assert.Equal(inputs.Replacement.ToHex(), Binding(scene, held, 5, 9));
        Assert.Equal(1028u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(5, 1, 9)).BlockId);
        Assert.Empty(scene.World.Get<BomberChestState>(inputs.Replacement).HitBombs.Values);
        Assert.Equal(99UL, scene.World.Get<BomberChestState>(inputs.Replacement).ResourceGeneration.Value);
        Assert.DoesNotContain(inputs.Replacement, bomb.ContactedChests.Values);
        Assert.Equal(6, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Equal(6, BomberEffectIntegrationTests.Events(scene.World, "crate_opened").Length);
        Assert.Empty(BomberEffectIntegrationTests.Events(scene.World, "next_match_started"));
        bomb.ValidateStorage();
        // Disposal ends the fixture with the seventh accepted debt still held;
        // this case proves preservation, not eventual settlement/next-round PASS.
    }

    [Fact]
    public void SeventhActualOriginalRecordsItsOldFullIdentityAndNeverContactsTheNewBindingAtItsCursor()
    {
        // Long Danger is a source-table input for observing settlement before
        // ordinary bomb retirement; it is not a hand-edited bomb timestamp.
        using var authored = new BomberObjectBudgetTests.AuthoredFixture(
            ("attributes", BomberAttributeNames.BombPower, "maximum", "8"),
            ("game", "default", "skills_enabled", "true"),
            ("game", "default", "central_supply_enabled", "false"),
            ("object_budgets", "default", "max_pickup_entities", "1351"),
            ("object_budgets", "default", "max_bomb_entities", "8192"),
            ("bomb", "default", "danger_ms", "2000"));
        using var scene = new BomberTerrainProductionTests.Scene(0,
            configDirectory: authored.Compile(), controlled: true);
        BomberPublicPierceChestContactNativeTests.PrepareCross(scene);
        Assert.Equal(2000u, BomberConfigBinding.For(scene.World).Bomb.DangerMs);
        NetEntityId[] six = BomberPublicPierceChestContactNativeTests.BindSixChests(scene);
        var inputs = PrepareSeventhAndReplacement(scene);
        BomberBombState bomb = BomberPublicPierceChestContactNativeTests.PlacePublicPierce(scene);
        CaptureSixAndSeventhOriginal(scene, bomb, six, inputs.Seventh);
        var source = bomb.ReadSource();
        ulong chain = bomb.ChainId.Value, occurred = bomb.ExplodedAtTick.Value;
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = Assert.Single(runtime.PendingVoxelTransactionIds.Values);
        string detail = Assert.Single(runtime.TerrainPendingDetails.Values);
        var actualOriginal = scene.Adapter.CaptureResultCheckpoint();
        var held = new HostVoxelWorldAdapter(scene.Native.NativeHandle,
            new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var heldBinding = VoxelGameplayBinding.Bind(scene.Manager, held);
        scene.Manager.BindVoxelTick(held.PrepareVoxel, held.CommitVoxel);
        BindReplacement(scene, held, inputs.Replacement);
        AssertHeldHistory(scene, bomb, six, inputs.Seventh, transaction, detail,
            source.Participant, source.Life, source.LifeGeneration, chain, occurred);
        Assert.True(scene.World.Tick < bomb.DangerUntilTick.Value);

        var delivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle,
            new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        delivered.RestoreResultCheckpoint(actualOriginal);
        using var deliveryBinding = VoxelGameplayBinding.Bind(scene.Manager, delivered);
        scene.Manager.BindVoxelTick(delivered.PrepareVoxel, delivered.CommitVoxel);
        scene.TickControlled();
        Assert.True(scene.World.IsLive(bomb.Entity));
        Assert.Empty(runtime.PendingVoxelTransactionIds.Values);
        Assert.Empty(bomb.TerrainContinuations.Values);
        NetEntityId[] historical = six.Append(inputs.Seventh).ToArray();
        Assert.Equal(historical.OrderBy(id => id).ToArray(), bomb.ContactedChests.Values.OrderBy(id => id).ToArray());
        Assert.Equal(7, bomb.ContactedChests.Count);
        Assert.DoesNotContain(inputs.Replacement, bomb.ContactedChests.Values);
        Assert.Equal(source, bomb.ReadSource());
        Assert.Equal(chain, bomb.ChainId.Value);
        Assert.Equal(occurred, bomb.ExplodedAtTick.Value);
        Assert.True(scene.World.IsLive(inputs.Replacement));
        Assert.Equal(inputs.Replacement.ToHex(), Binding(scene, delivered, 5, 9));
        var replacement = scene.World.Get<BomberChestState>(inputs.Replacement);
        Assert.Equal(99UL, replacement.ResourceGeneration.Value);
        Assert.Equal(1, replacement.RemainingHits.Value);
        Assert.Empty(replacement.HitBombs.Values);
        Assert.Equal(7, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Equal(7, BomberEffectIntegrationTests.Events(scene.World, "crate_opened").Length);

        // Re-deliver only the exact captured Native Original checkpoint. No
        // locally fabricated receipt or second Native producer is claimed.
        var redelivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle,
            new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        redelivered.RestoreResultCheckpoint(actualOriginal);
        using var redeliveryBinding = VoxelGameplayBinding.Bind(scene.Manager, redelivered);
        scene.Manager.BindVoxelTick(redelivered.PrepareVoxel, redelivered.CommitVoxel);
        scene.TickControlled();
        Assert.True(scene.World.IsLive(bomb.Entity));
        Assert.Equal(7, bomb.ContactedChests.Count);
        Assert.Equal(historical.OrderBy(id => id).ToArray(), bomb.ContactedChests.Values.OrderBy(id => id).ToArray());
        Assert.DoesNotContain(inputs.Replacement, bomb.ContactedChests.Values);
        Assert.Equal(inputs.Replacement.ToHex(), Binding(scene, redelivered, 5, 9));
        Assert.Equal(7, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Equal(7, BomberEffectIntegrationTests.Events(scene.World, "crate_opened").Length);
        Assert.Empty(BomberEffectIntegrationTests.Events(scene.World, "damage_applied"));
        bomb.ValidateStorage();
    }

    private static (NetEntityId Seventh, NetEntityId Replacement) PrepareSeventhAndReplacement(
        BomberTerrainProductionTests.Scene scene)
    {
        var oldOrder = scene.World.Commands.Create<BomberChestEntity>();
        var newOrder = scene.World.Commands.Create<BomberChestEntity>();
        scene.TickControlled();
        uint wood = BomberConfigBinding.For(scene.World).Tables.Chest.Rows.Single(row => row.Name == "Wood").Id;
        scene.World.Get<BomberChestState>(oldOrder.AssignedId).InitializeTier(wood, 7);
        scene.World.Get<BomberChestState>(newOrder.AssignedId).InitializeTier(wood, 99);
        Assert.NotEqual(oldOrder.AssignedId, newOrder.AssignedId);
        Assert.Equal(oldOrder.AssignedId.InstanceId, newOrder.AssignedId.InstanceId);
        scene.TickControlled();
        BindReplacement(scene, scene.Adapter, oldOrder.AssignedId);
        return (oldOrder.AssignedId, newOrder.AssignedId);
    }

    private static void BindReplacement(BomberTerrainProductionTests.Scene scene,
        HostVoxelWorldAdapter adapter, NetEntityId id)
    {
        adapter.SetBindingPolicy(new[] {
            new VoxelBindingPolicyEntry(1028, scene.World.Registry.WireName(typeof(BomberChestEntity))) });
        var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, 5, 1, 9);
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(5, 1, 9));
        Assert.Equal(0u, before.BlockId);
        Assert.Null(adapter.BindingGet(address.Section, address.Offset));
        Assert.Equal(VoxelStageStatus.Staged, adapter.TryStageMutation(
            new[] { new VoxelWriteEntry(address.Section, address.Offset, 1028u << 8, before.SectionRevision) },
            new[] { new VoxelBindingOp(address.Section, address.Offset, id.ToHex()) {
                ExpectedSectionRevision = before.SectionRevision } },
            "public-pierce-seventh-binding-" + id.ToHex()).Status);
        scene.TickControlled();
        Assert.Equal(id.ToHex(), adapter.BindingGet(address.Section, address.Offset));
        Assert.True(scene.World.IsLive(id));
    }

    private static void CaptureSixAndSeventhOriginal(BomberTerrainProductionTests.Scene scene,
        BomberBombState bomb, NetEntityId[] six, NetEntityId seventh)
    {
        var originals = new HashSet<NetEntityId>();
        NetEntityId[] all = six.Append(seventh).ToArray();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        ulong stop = checked(bomb.FuseEndTick.Value + 18);
        while (scene.World.Tick < stop)
        {
            scene.TickControlled();
            BomberPublicPierceChestContactNativeTests.ObserveActualOriginal(scene, bomb, all, originals);
            if (runtime.PendingChests.Count == 1 && runtime.PendingChests[0] == seventh) break;
        }
        Assert.Equal(seventh, Assert.Single(runtime.PendingChests.Values));
        Assert.Equal(bomb.Entity, Assert.Single(runtime.PendingSourceBombs.Values));
        Assert.Equal(7, originals.Count);
        Assert.Equal(6, bomb.ContactedChests.Count);
        Assert.Equal(six.OrderBy(id => id).ToArray(), bomb.ContactedChests.Values.OrderBy(id => id).ToArray());
        Assert.False(scene.World.IsLive(seventh));
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(5, 1, 9)).BlockId);
        var detail = BomberTerrainTransactions.Decode<BomberTerrainDetail>(Assert.Single(runtime.TerrainPendingDetails.Values));
        Assert.Equal((5, 9), (detail.X, detail.Z));
        Assert.Equal(7UL, detail.CellGeneration);
        Assert.Equal(bomb.Entity.ToHex(), detail.Family);
        Assert.Equal(bomb.ExplodedAtTick.Value, detail.Occurred);
        Assert.True(BomberTerrainTransactions.HoldsSource(scene.World, bomb.Entity));
    }

    private static void AssertHeldHistory(BomberTerrainProductionTests.Scene scene, BomberBombState bomb,
        NetEntityId[] six, NetEntityId seventh, string transaction, string detail,
        NetEntityId participant, NetEntityId life, ulong generation, ulong chain, ulong occurred)
    {
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.True(scene.World.IsLive(bomb.Entity));
        Assert.True(BomberTerrainTransactions.HoldsSource(scene.World, bomb.Entity));
        Assert.Equal(6, bomb.ContactedChests.Count);
        Assert.Equal(six.OrderBy(id => id).ToArray(), bomb.ContactedChests.Values.OrderBy(id => id).ToArray());
        Assert.Equal(transaction, Assert.Single(runtime.PendingVoxelTransactionIds.Values));
        Assert.Equal(detail, Assert.Single(runtime.TerrainPendingDetails.Values));
        Assert.Equal(seventh, Assert.Single(runtime.PendingChests.Values));
        Assert.Equal(bomb.Entity, Assert.Single(runtime.PendingSourceBombs.Values));
        Assert.Equal(participant, Assert.Single(runtime.PendingParticipants.Values));
        Assert.Equal(life, Assert.Single(runtime.PendingSourceLives.Values));
        Assert.Equal(generation, Assert.Single(runtime.PendingSourceLifeGenerations.Values));
        Assert.Equal(participant, bomb.Owner.Value);
        Assert.Equal(life, bomb.SourceLife.Value);
        Assert.Equal(generation, bomb.SourceLifeGeneration.Value);
        Assert.Equal(chain, bomb.ChainId.Value);
        Assert.Equal(occurred, bomb.ExplodedAtTick.Value);
        Assert.All(six, id => Assert.False(scene.World.IsLive(id)));
        bomb.ValidateStorage();
    }

    private static string? Binding(BomberTerrainProductionTests.Scene scene,
        HostVoxelWorldAdapter adapter, int x, int z)
    {
        var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, x, 1, z);
        return adapter.BindingGet(address.Section, address.Offset);
    }
}
