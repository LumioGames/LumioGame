using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberTerrainFrontierRetryTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void AcceptedPrefixCannotBecomeAnUnstartedFullPowerArmOrHitANewChestBehindItsCursor(bool inspectCursor)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var config = BomberConfigBinding.For(scene.World);
        uint floor = config.Tables.Blocks.Rows.Single(row => row.Name == "floor").BlockType << 8;
        uint hard = config.Tables.Blocks.Rows.Single(row => row.Name == "iron").BlockType << 8;
        uint soft = config.Tables.Blocks.Rows.Single(row => row.Name == "softBrick").BlockType << 8;
        uint wood = config.Tables.Chest.Rows.Single(row => row.Name == "Wood").Id;
        uint chestBlock = config.Tables.Blocks.Rows.Single(row => row.Name == "chest").BlockType << 8;
        scene.Write(3, 1, 4, hard);
        scene.Write(2, 1, 5, hard);
        for (int x = 3; x <= 7; x++)
        {
            scene.Write(x, 0, 5, floor);
            scene.Write(x, 1, 5, x == 7 ? soft : 0);
        }
        scene.Write(3, 0, 6, floor);
        scene.Write(3, 1, 6, 0);
        NetEntityId first = scene.Chest("Wood"); // Real Native binding at (6, 5).
        var competingOrder = scene.World.Commands.Create<BomberChestEntity>();
        var replacementOrder = scene.World.Commands.Create<BomberChestEntity>();
        scene.Manager.Tick();
        NetEntityId competing = competingOrder.AssignedId;
        NetEntityId replacement = replacementOrder.AssignedId;
        scene.World.Get<BomberChestState>(competing).InitializeTier(wood, 1);
        scene.World.Get<BomberChestState>(replacement).InitializeTier(wood, 2);
        ulong firstGeneration = scene.World.Get<BomberChestState>(first).ResourceGeneration.Value;
        ulong competingGeneration = scene.World.Get<BomberChestState>(competing).ResourceGeneration.Value;
        ulong replacementGeneration = scene.World.Get<BomberChestState>(replacement).ResourceGeneration.Value;
        Assert.NotEqual(first, replacement);
        Assert.Equal(first.InstanceId, replacement.InstanceId);
        scene.Manager.Tick(); // Publish the live candidates through the real binding-context phase.
        // The two prepublished entities are authored fixture inputs, not a claim
        // that the currently withheld resource-chest regeneration producer exists.
        BindAuthoredChest(scene, competing, 3, 6, chestBlock, 992601);
        Assert.Equal(competing.ToHex(), Binding(scene, 3, 6));
        Assert.True(scene.World.IsLive(replacement));
        Assert.Null(Binding(scene, 7, 5));
        for (int i = 0; i < scene.Lives.Length; i++)
            BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[i]),
                new Vector3(1.5f, 1.5f, 1.5f + i));

        var order = scene.Bomb(pierce: true);
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(3.5f, 1.5f, 5.5f));
        order.Get<BomberBombState>().Power.Value = 4;
        // Scene.Bomb is the existing terrain owner fixture: only input setup is
        // authored. Tick runs the actual Native HFSM, terrain and receipt consumer.
        scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        BomberSourceIdentity source = bomb.ReadSource();
        ulong chain = bomb.ChainId.Value;
        NetEntityId family = BomberTerrainTransactions.Family(bomb);
        int baselineDestroyed = scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value;
        scene.Manager.Tick();
        ulong occurred = bomb.ExplodedAtTick.Value;
        Assert.NotEqual(0UL, occurred);
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        string firstTransaction = AssertOriginalPending(scene, bomb, first, firstGeneration, 6, 5);
        Assert.False(scene.World.IsLive(first));
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Null(Binding(scene, 6, 5));
        Assert.Equal(0, bomb.ContactedChests.Count);
        Assert.Equal(baselineDestroyed, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        var initialRetry = Assert.Single(Rays(bomb), ray => ray.Direction == 2);
        Assert.True(initialRetry.Unstarted);
        Assert.Equal((3, 5, 4), (initialRetry.X, initialRetry.Z, initialRetry.Remaining));

        // A's actual Original is consumed first; C's previously unstarted arm
        // then owns this Tick's bound-chest transaction before A resumes toward B.
        scene.Manager.Tick();
        AssertIdentity(bomb, source, chain, family, occurred);
        Assert.Equal(first, Assert.Single(Enumerable.Range(0, bomb.ContactedChests.Count).Select(i => bomb.ContactedChests[i])));
        Assert.Equal(baselineDestroyed + 1, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        string competingTransaction = AssertOriginalPending(scene, bomb, competing, competingGeneration, 3, 6);
        Assert.NotEqual(firstTransaction, competingTransaction);
        Assert.False(scene.World.IsLive(competing));
        Assert.Equal(soft, scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 5)).BlockId);
        var resumedRight = Assert.Single(Rays(bomb), ray => ray.Direction == 1);
        Assert.Equal(family.ToHex(), resumedRight.Family);
        Assert.Equal(occurred, resumedRight.Occurred);

        if (inspectCursor)
        {
            // Three of the original four rightward steps were consumed by A.
            // Competition cannot reset this accepted frontier to origin/Power.
            Assert.False(resumedRight.Unstarted);
            Assert.Equal((6, 5, 1), (resumedRight.X, resumedRight.Z, resumedRight.Remaining));
            return;
        }

        // Genuine SDK block+binding author input at the idle committed boundary.
        // C's real delivery remains untouched; no fake Original or revision is used.
        ulong beforeReplacementRevision = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).SectionRevision;
        BindAuthoredChest(scene, replacement, 6, 5, chestBlock, 992602);
        Assert.Equal(replacement.ToHex(), Binding(scene, 6, 5));
        Assert.Equal(chestBlock, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.True(scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).SectionRevision > beforeReplacementRevision);
        Assert.Equal(2UL, scene.World.Get<BomberChestState>(replacement).ResourceGeneration.Value);
        Assert.Equal(competingTransaction, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds[0]);

        scene.Manager.Tick();
        AssertIdentity(bomb, source, chain, family, occurred);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        // Record the genuine bad-path receipt when present. Final assertions below
        // reject this behavior; this branch supplies Native/source evidence only.
        if (runtime.PendingVoxelTransactionIds.Count != 0)
        {
            string replacementTransaction = AssertOriginalPending(scene, bomb, replacement, replacementGeneration, 6, 5);
            Assert.NotEqual(firstTransaction, replacementTransaction);
            Assert.NotEqual(competingTransaction, replacementTransaction);
        }
        scene.Manager.Tick();
        AssertIdentity(bomb, source, chain, family, occurred);
        Assert.True(scene.World.IsLive(replacement), "An accepted prefix must not be replayed against a new full chest identity.");
        Assert.Equal(replacement.ToHex(), Binding(scene, 6, 5));
        Assert.Equal(chestBlock, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        var history = Enumerable.Range(0, bomb.ContactedChests.Count).Select(i => bomb.ContactedChests[i]).ToArray();
        Assert.Equal(new[] { first, competing }, history);
        Assert.DoesNotContain(replacement, history);
        Assert.Equal(baselineDestroyed + 2, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
    }

    private static BomberTerrainContinuation[] Rays(BomberBombState bomb) =>
        Enumerable.Range(0, bomb.TerrainContinuations.Count)
            .Select(i => BomberTerrainTransactions.Decode<BomberTerrainContinuation>(bomb.TerrainContinuations[i])).ToArray();

    private static string? Binding(BomberTerrainProductionTests.Scene scene, int x, int z)
    {
        var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, x, 1, z);
        return scene.Adapter.BindingGet(address.Section, address.Offset);
    }

    private static void AssertIdentity(BomberBombState bomb, BomberSourceIdentity source, ulong chain,
        NetEntityId family, ulong occurred)
    {
        Assert.Equal(source, bomb.ReadSource());
        Assert.Equal(chain, bomb.ChainId.Value);
        Assert.Equal(family, BomberTerrainTransactions.Family(bomb));
        Assert.Equal(occurred, bomb.ExplodedAtTick.Value);
    }

    private static string AssertOriginalPending(BomberTerrainProductionTests.Scene scene, BomberBombState bomb,
        NetEntityId chest, ulong generation, int x, int z)
    {
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, runtime.PendingSections.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, x, 1, z);
        Assert.Equal(address.Section, runtime.PendingSections[0]);
        Assert.Equal(address.Offset, runtime.PendingCellOffsets[0]);
        Assert.Equal((int)BomberVoxelIntentKind.DestroySoft, runtime.PendingKinds[0]);
        Assert.Equal(chest, runtime.PendingChests[0]);
        Assert.Equal(bomb.Entity, runtime.PendingSourceBombs[0]);
        Assert.Equal(bomb.Owner.Value, runtime.PendingParticipants[0]);
        Assert.Equal(bomb.SourceLife.Value, runtime.PendingSourceLives[0]);
        Assert.Equal(bomb.SourceLifeGeneration.Value, runtime.PendingSourceLifeGenerations[0]);
        Assert.Equal(bomb.ChainId.Value, runtime.PendingChainIds[0]);
        Assert.Equal(scene.World.Single<BomberMatchState>().MatchId.Value, runtime.PendingVoxelMatchIds[0]);
        Assert.InRange(runtime.PendingVoxelSubmittedTicks[0], bomb.ExplodedAtTick.Value, scene.World.Tick);
        var detail = BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[0]);
        Assert.Equal((x, z), (detail.X, detail.Z));
        Assert.Equal(BomberTerrainTransactions.Family(bomb).ToHex(), detail.Family);
        Assert.Equal(bomb.ExplodedAtTick.Value, detail.Occurred);
        Assert.Equal(generation, detail.CellGeneration);
        var result = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
            candidate => candidate.TransactionId == transaction);
        Assert.Null(result.Operation);
        Assert.Null(result.BatchTransactionId);
        Assert.Equal(0, result.Outcome.Status);
        Assert.Equal(VoxelTxnState.Applied, result.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, result.Outcome.Disposition);
        Assert.True(result.Outcome.TokenConsumed);
        Assert.False(result.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        Assert.Equal(result.Outcome.ReceiptByteCount, checked((uint)result.Outcome.Receipt.OriginalReceiptBytes.Length));
        Assert.Equal(1u, result.Outcome.SectionCount);
        var section = Assert.Single(result.Outcome.Receipt.Sections!);
        Assert.Equal(address.Section, section.SectionKey);
        Assert.True(section.UpToSectionRevision > runtime.PendingExpectedRevisions[0]);
        return transaction;
    }

    private static void BindAuthoredChest(BomberTerrainProductionTests.Scene scene, NetEntityId chest,
        int x, int z, uint block, ulong transaction)
    {
        Assert.True(scene.World.IsLive(chest));
        Assert.True(scene.World.TypeOf(chest).Is<BomberChestEntity>());
        Assert.True(scene.Adapter.TryRefreshBindingContext());
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(x, 1, z));
        Assert.Equal(0u, before.BlockId);
        Assert.Null(Binding(scene, x, z));
        var key = new VoxelSectionKey(x >> 4, 0, z >> 4);
        ushort offset = checked((ushort)(256 + (z & 15) * 16 + (x & 15)));
        using var token = scene.Native.PrepareWriteV2(transaction,
            new[] { new VoxelBlockWriteEntry(key, offset, block, before.SectionRevision) },
            new[] { new VoxelBindingMutationEntry(key, offset, VoxelBindingMutationOperation.Set,
                chest.ToHex(), before.SectionRevision) });
        var requirements = scene.Native.GetOutputRequirements(token);
        var committed = scene.Native.CommitV3(token, new VoxelWriteReceipt[requirements.SectionCapacity],
            new byte[requirements.ReceiptByteCapacity]);
        Assert.Equal(0, committed.Status);
        Assert.Equal(block, scene.Native.ReadCell(new VoxelWorldCoordinate(x, 1, z)).BlockId);
        Assert.Equal(chest.ToHex(), Binding(scene, x, z));
    }
}
