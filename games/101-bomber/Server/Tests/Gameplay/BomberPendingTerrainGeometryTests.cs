using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberPendingTerrainGeometryTests
{
    [Theory]
    [InlineData("direction", "validate")]
    [InlineData("direction", "hydrate")]
    [InlineData("direction", "original")]
    [InlineData("remaining", "validate")]
    [InlineData("remaining", "hydrate")]
    [InlineData("remaining", "original")]
    public void CorruptedActualPendingGeometryIsRefusedBeforeAnyOriginalAccounting(string corruption, string boundary)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
        var order = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, runtime.TerrainPendingDetails.Count);
        Assert.Equal((int)BomberVoxelIntentKind.DestroySoft, runtime.PendingKinds[0]);
        Assert.Equal(bomb.Entity, runtime.PendingSourceBombs[0]);
        Assert.Equal(bomb.Owner.Value, runtime.PendingParticipants[0]);
        Assert.Equal(bomb.SourceLife.Value, runtime.PendingSourceLives[0]);
        Assert.Equal(bomb.SourceLifeGeneration.Value, runtime.PendingSourceLifeGenerations[0]);
        Assert.Equal(bomb.ChainId.Value, runtime.PendingChainIds[0]);
        Assert.True(bomb.PierceLayers.Value > 0);
        Assert.Equal(4, bomb.Power.Value);
        var originalDetail = BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[0]);
        Assert.Equal(6, originalDetail.X); Assert.Equal(5, originalDetail.Z);
        Assert.Equal(1, originalDetail.Direction); Assert.Equal(3, originalDetail.Remaining);
        Assert.Equal(bomb.ExplodedAtTick.Value, originalDetail.Occurred);
        Assert.Equal(BomberTerrainTransactions.Family(bomb).ToHex(), originalDetail.Family);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
            result => StringComparer.Ordinal.Equals(result.TransactionId, transaction));
        Assert.Null(original.Operation); Assert.Null(original.BatchTransactionId);
        Assert.Equal(0, original.Outcome.Status);
        Assert.Equal(VoxelTxnState.Applied, original.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        Assert.False(original.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        Assert.Equal(checked((uint)original.Outcome.Receipt.OriginalReceiptBytes.Length), original.Outcome.ReceiptByteCount);
        var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, 6, 1, 5);
        Assert.Equal(address.Section, runtime.PendingSections[0]); Assert.Equal(address.Offset, runtime.PendingCellOffsets[0]);
        var receipt = Assert.Single(original.Outcome.Receipt.Sections!);
        Assert.Equal(address.Section, receipt.SectionKey);
        Assert.True(receipt.UpToSectionRevision > runtime.PendingExpectedRevisions[0]);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        BomberTerrainTransactions.Validate(scene.World);
        byte[] positive = scene.Manager.CaptureSnapshot();
        using (WorldManager restored = BomberTestWorld.Restore(positive, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
            Assert.Equal(positive, restored.CaptureSnapshot());

        string artifact = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".run", "pending-geometry-artifacts",
            Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(artifact);
        File.WriteAllBytes(Path.Combine(artifact, "actual-before.lwm"), positive);
        File.WriteAllBytes(Path.Combine(artifact, "actual-original.receipt"), original.Outcome.Receipt.OriginalReceiptBytes.ToArray());
        var corrupted = corruption switch
        {
            "direction" => originalDetail with { Direction = 3 },
            "remaining" => originalDetail with { Remaining = 2 },
            _ => throw new InvalidOperationException("Unknown corruption."),
        };
        // One deliberately damaged owned row; exact Native/address/source/receipt bytes stay unchanged.
        runtime.TerrainPendingDetails[0] = BomberTerrainTransactions.Encode(corrupted);
        byte[] source = scene.Manager.CaptureSnapshot();
        Assert.False(positive.SequenceEqual(source));
        File.WriteAllBytes(Path.Combine(artifact, "corrupted.lwm"), source);
        var statistics = scene.World.Get<BomberStatistics>(bomb.Owner.Value);
        int destroyed = statistics.DestroyedBlocks.Value;
        int rewards = runtime.TerrainRewards.Count, contacts = bomb.ContactedChests.Count;
        int reserved = runtime.TerrainReservedPickups.Value;
        string pending = runtime.TerrainPendingDetails[0];
        Console.WriteLine("ACTUAL_PENDING_GEOMETRY " + System.Text.Json.JsonSerializer.Serialize(new
        {
            corruption, boundary, artifact, sourceSha256 = Convert.ToHexString(SHA256.HashData(source)),
            rawReceiptSha256 = Convert.ToHexString(SHA256.HashData(original.Outcome.Receipt.OriginalReceiptBytes.Span)),
            transaction, bomb = bomb.Entity.ToHex(), participant = bomb.Owner.Value.ToHex(),
            life = bomb.SourceLife.Value.ToHex(), generation = bomb.SourceLifeGeneration.Value,
            chain = bomb.ChainId.Value, power = bomb.Power.Value, occurred = bomb.ExplodedAtTick.Value,
        }));
        if (boundary == "hydrate")
        {
            var error = BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
            {
                using WorldManager rejected = BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
                    config: BomberConfigBinding.Load());
            });
            Assert.Contains("continuation", error.Message, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(source, scene.Manager.CaptureSnapshot());
        }
        else if (boundary == "validate")
        {
            var error = Assert.Throws<InvalidOperationException>(() => BomberTerrainTransactions.Validate(scene.World));
            Assert.Contains("continuation", error.Message, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(source, scene.Manager.CaptureSnapshot());
        }
        else
        {
            Assert.ThrowsAny<Exception>(() =>
            {
                try { scene.Manager.Tick(); }
                finally
                {
                    Console.WriteLine("ACTUAL_PENDING_ACCOUNTING_AFTER " + System.Text.Json.JsonSerializer.Serialize(new
                    {
                        corruption, pendingBefore = 1, pendingAfter = runtime.PendingVoxelTransactionIds.Count,
                        destroyedBefore = destroyed, destroyedAfter = statistics.DestroyedBlocks.Value,
                        rewardsBefore = rewards, rewardsAfter = runtime.TerrainRewards.Count,
                        reservedBefore = reserved, reservedAfter = runtime.TerrainReservedPickups.Value,
                        contactsBefore = contacts, contactsAfter = bomb.ContactedChests.Count,
                    }));
                }
            });
            Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
            Assert.Equal(pending, runtime.TerrainPendingDetails[0]);
            Assert.Equal(reserved, runtime.TerrainReservedPickups.Value);
            Assert.Equal(destroyed, statistics.DestroyedBlocks.Value);
            Assert.Equal(rewards, runtime.TerrainRewards.Count);
            Assert.Equal(contacts, bomb.ContactedChests.Count);
        }
    }
}
