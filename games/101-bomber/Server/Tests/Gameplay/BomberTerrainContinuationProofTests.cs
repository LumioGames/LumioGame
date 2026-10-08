using System;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

// PRIVATE, UNCOMPILED DRAFT. No declaration, limit or production change accompanies it.
[Collection("BomberWorld")]
public sealed class BomberTerrainContinuationProofTests
{
    [Fact]
    public void ActualAcceptedUnavailableReadFrontierRoundTripsThroughOfficialRuntimeHydration()
    {
        using var frontier = AcceptedFrontier.Create();
        byte[] source = frontier.Scene.Manager.CaptureSnapshot();
        frontier.Bomb.ValidateStorage();
        using WorldManager restored = BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        Assert.Equal(frontier.Scene.World.InstanceId, restored.World.InstanceId);
        var copy = restored.World.Get<BomberBombState>(frontier.BombId);
        Assert.Equal(frontier.Original, BomberTerrainTransactions.Decode<BomberTerrainContinuation>(copy.TerrainContinuations[0]));
        Assert.Equal(source, restored.CaptureSnapshot());
        Assert.Equal(source, frontier.Scene.Manager.CaptureSnapshot());
        // Runtime-only hydration is the tested cut. This does not tick an active
        // runtime-only restore or claim a complete paired Native resume.
    }

    [Theory]
    [InlineData("axis", false)]
    [InlineData("axis", true)]
    [InlineData("direction", false)]
    [InlineData("direction", true)]
    [InlineData("remaining", false)]
    [InlineData("remaining", true)]
    [InlineData("distance", false)]
    [InlineData("distance", true)]
    public void ACorruptedAcceptedFrontierIsRefusedByStorageValidationAndOfficialHydration(string corruption, bool restore)
    {
        using var frontier = AcceptedFrontier.Create();
        frontier.Bomb.ValidateStorage();
        byte[] original = frontier.Scene.Manager.CaptureSnapshot();
        using (WorldManager positive = BomberTestWorld.Restore(original, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
            Assert.Equal(original, positive.CaptureSnapshot());

        // Deliberate corruption of one persisted column of an actual accepted row.
        // Family, Occurred, complete source identities, Power and transform stay intact.
        BomberTerrainContinuation corrupted = corruption switch
        {
            "axis" => frontier.Original with { Z = 4 },
            "direction" => frontier.Original with { Direction = 3 },
            "remaining" => frontier.Original with { Remaining = 4 },
            "distance" => frontier.Original with { X = 10 },
            _ => throw new InvalidOperationException("Unknown draft corruption."),
        };
        frontier.Bomb.TerrainContinuations[0] = BomberTerrainTransactions.Encode(corrupted);
        byte[] source = frontier.Scene.Manager.CaptureSnapshot();
        Assert.False(original.SequenceEqual(source));
        Assert.Equal(corrupted, BomberTerrainTransactions.Decode<BomberTerrainContinuation>(frontier.Bomb.TerrainContinuations[0]));
        frontier.Save(source, corruption + (restore ? "-restore" : "-validate"));

        InvalidOperationException error = restore
            ? BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
            {
                using WorldManager rejected = BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
                    config: BomberConfigBinding.Load());
            })
            : Assert.Throws<InvalidOperationException>(frontier.Bomb.ValidateStorage);
        Assert.Contains("continuation", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(source, frontier.Scene.Manager.CaptureSnapshot());
    }

    [Theory]
    [InlineData(7)]
    [InlineData(8)]
    public void ActualAuthoredLargePowerPierceRetainsItsFullSourceAndSettlesItsNativeOriginal(int power)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("attributes", "BombPower", "initial", power.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            ("attributes", "BombPower", "maximum", power.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        string export = fixture.Compile(); // Actual author CLI; validation failure is a fixture/admission blocker.
        var read = BomberConfigBinding.Read(export);
        var authoredPower = read.Tables.Attributes.Rows.Single(row => row.Name == BomberAttributeNames.BombPower);
        Assert.Equal((long)power, authoredPower.Initial);
        Assert.Equal((long)power, authoredPower.Maximum);
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: export);
        var config = BomberConfigBinding.For(scene.World);
        uint floor = config.Tables.Blocks.Rows.Single(row => row.Name == "floor").BlockType << 8;
        uint iron = config.Tables.Blocks.Rows.Single(row => row.Name == "iron").BlockType << 8;
        uint soft = config.Tables.Blocks.Rows.Single(row => row.Name == "softBrick").BlockType << 8;
        for (int x = 3; x <= 12; x++)
        {
            scene.Write(x, 0, 5, floor);
            scene.Write(x, 1, 5, x is 4 or 5 ? soft : 0);
        }
        scene.Write(3, 1, 4, iron);
        scene.Write(2, 1, 5, iron);
        scene.Write(3, 1, 6, iron);
        MovementInputMemoryTests.Position(scene, new Vector3(3.5f, 1.5f, 5.5f));
        NetEntityId life = scene.Lives[0];
        var player = scene.World.Get<BomberPlayerState>(life);
        NetEntityId participant = player.Participant.Value;
        ulong generation = player.LifeGeneration.Value;
        var attributes = scene.World.Get<AttributeComponent>(life);
        Assert.Equal((long)power, attributes.GetCurrentValue(BomberAttributeNames.BombPower));
        long available = attributes.GetBaseValue(BomberAttributeNames.AvailableBombs);
        var skills = scene.World.Get<BomberSkillState>(life);
        // Authored qualified held-slot fixture, identical to SpecialBombProductionTests.
        // This is actual RPC placement, not a test-created bomb or a pickup acceptance claim.
        skills.BombSkillId.Value = config.Tables.Skills.Rows.Single(row => row.Slot == "Bomb" &&
            row.BombKindCode == (uint)BomberBombKind.Pierce && !row.IsCombo).Id;
        skills.BombSkillLevel.Value = 1;
        MovementInputMemoryTests.Queue(scene, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 1);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>());
        NetEntityId bombId = bomb.Entity;
        ulong due = bomb.FuseEndTick.Value;
        ulong chain = bomb.ChainId.Value;
        Assert.Equal(power, bomb.Power.Value);
        Assert.Equal((int)BomberBombKind.Pierce, bomb.BombKind.Value);
        Assert.True(bomb.PierceLayers.Value > 0);
        Assert.Equal(life, bomb.SourceLife.Value);
        Assert.Equal(participant, bomb.Owner.Value);
        Assert.Equal(generation, bomb.SourceLifeGeneration.Value);
        Assert.Equal(available - 1, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        // Move only the player; the produced bomb Power/phase/fuse/transform are never patched.
        MovementInputMemoryTests.Position(scene, new Vector3(2.5f, 1.5f, 3.5f));
        while (scene.World.Tick <= due) scene.Manager.Tick();
        Assert.True(scene.World.IsLive(bombId));
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        Assert.Equal(due, bomb.ExplodedAtTick.Value);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(bombId, runtime.PendingSourceBombs[0]);
        Assert.Equal(life, runtime.PendingSourceLives[0]);
        Assert.Equal(generation, runtime.PendingSourceLifeGenerations[0]);
        Assert.Equal(participant, runtime.PendingParticipants[0]);
        Assert.Equal(chain, runtime.PendingChainIds[0]);
        var detail = BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[0]);
        Assert.Equal(4, detail.X);
        Assert.Equal(5, detail.Z);
        Assert.Equal(1, detail.Direction);
        Assert.Equal(power - 1, detail.Remaining);
        Assert.Equal(BomberTerrainTransactions.Family(bomb).ToHex(), detail.Family);
        Assert.Equal(due, detail.Occurred);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
            result => StringComparer.Ordinal.Equals(result.TransactionId, transaction));
        AssertOriginal(original);
        AssertPendingCell(scene, original, 4, 5);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(4, 1, 5)).BlockId);
        Assert.Equal(soft, scene.Native.ReadCell(new VoxelWorldCoordinate(5, 1, 5)).BlockId);
        Console.WriteLine("ACTUAL_LARGE_POWER_ORIGINAL " + System.Text.Json.JsonSerializer.Serialize(new
        {
            power, transaction, bomb = bombId.ToHex(), sourceLife = life.ToHex(), generation,
            participant = participant.ToHex(), chain, occurred = due, remaining = detail.Remaining,
            rawReceiptSha256 = Convert.ToHexString(SHA256.HashData(original.Outcome.Receipt.OriginalReceiptBytes.Span)),
        }));
        // Desired real behavior: the accepted Native original can be consumed on the
        // next normal Tick. Current Power8 is expected to fail the remaining<=6 guard.
        Exception? failure = Record.Exception(scene.Manager.Tick);
        Assert.Null(failure);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(5, 1, 5)).BlockId);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(bombId, runtime.PendingSourceBombs[0]);
        Assert.Equal(life, bomb.SourceLife.Value);
        Assert.Equal(generation, bomb.SourceLifeGeneration.Value);
        Assert.Equal(chain, bomb.ChainId.Value);
        Assert.Equal(power, bomb.Power.Value);
    }

    private static void AssertOriginal(VoxelTransactionResult result)
    {
        Assert.Null(result.Operation);
        Assert.Null(result.BatchTransactionId);
        var original = result.Outcome;
        Assert.Equal(0, original.Status);
        Assert.Equal(VoxelTxnState.Applied, original.State);
        Assert.Equal(VoxelCommitDisposition.Original, original.Disposition);
        Assert.True(original.TokenConsumed);
        Assert.False(original.Receipt.OriginalReceiptBytes.IsEmpty);
        Assert.NotNull(original.Receipt.Sections);
        Assert.Equal(checked((uint)original.Receipt.OriginalReceiptBytes.Length), original.ReceiptByteCount);
        Assert.Equal(1u, original.SectionCount);
        Assert.Single(original.Receipt.Sections!);
    }

    private static void AssertPendingCell(BomberTerrainProductionTests.Scene scene,
        VoxelTransactionResult original, int x, int z)
    {
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, x, 1, z);
        Assert.Equal(address.Section, runtime.PendingSections[0]);
        Assert.Equal(address.Offset, runtime.PendingCellOffsets[0]);
        Assert.Equal((int)BomberVoxelIntentKind.DestroySoft, runtime.PendingKinds[0]);
        Assert.True(runtime.PendingChests[0].IsDefault);
        Assert.Equal(scene.World.Single<BomberMatchState>().MatchId.Value, runtime.PendingVoxelMatchIds[0]);
        Assert.Equal(runtime.PendingVoxelTransactionIds[0], original.TransactionId);
        var section = Assert.Single(original.Outcome.Receipt.Sections!);
        Assert.Equal(address.Section, section.SectionKey);
        Assert.True(section.UpToSectionRevision > runtime.PendingExpectedRevisions[0]);
    }

    private sealed class AcceptedFrontier : IDisposable
    {
        internal readonly BomberTerrainProductionTests.Scene Scene;
        internal readonly NetEntityId BombId;
        internal readonly BomberTerrainContinuation Original;
        internal readonly byte[] OriginalReceipt;
        private readonly string artifact;
        internal BomberBombState Bomb => Scene.World.Get<BomberBombState>(BombId);

        private AcceptedFrontier(BomberTerrainProductionTests.Scene scene, NetEntityId id,
            BomberTerrainContinuation original, byte[] originalReceipt)
        {
            Scene = scene;
            BombId = id;
            Original = original;
            OriginalReceipt = originalReceipt;
            artifact = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".run",
                "continuation-proof-artifacts", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(artifact);
            File.WriteAllBytes(Path.Combine(artifact, "actual-original.receipt"), originalReceipt);
            Save(scene.Manager.CaptureSnapshot(), "actual-accepted-before");
        }

        internal static AcceptedFrontier Create()
        {
            // Reuse the already-real Native unavailable-read fixture, not a manufactured continuation.
            var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
            try
            {
                EntityOrder order = scene.Bomb(true);
                scene.Manager.Tick(); scene.Manager.Tick();
                var runtime = scene.World.Single<BomberWorldRuntime>();
                Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
                Assert.Equal(order.AssignedId, runtime.PendingSourceBombs[0]);
                var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
                var detail = BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[0]);
                Assert.Equal(6, detail.X);
                Assert.Equal(5, detail.Z);
                Assert.Equal(1, detail.Direction);
                Assert.Equal(3, detail.Remaining);
                Assert.Equal(bomb.SourceLife.Value, runtime.PendingSourceLives[0]);
                Assert.Equal(bomb.SourceLifeGeneration.Value, runtime.PendingSourceLifeGenerations[0]);
                Assert.Equal(bomb.Owner.Value, runtime.PendingParticipants[0]);
                Assert.Equal(bomb.ChainId.Value, runtime.PendingChainIds[0]);
                string transaction = runtime.PendingVoxelTransactionIds[0];
                var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
                    result => StringComparer.Ordinal.Equals(result.TransactionId, transaction));
                AssertOriginal(original);
                AssertPendingCell(scene, original, 6, 5);
                Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
                var key = new VoxelSectionKey(0, 0, 0);
                ulong revision = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).SectionRevision;
                byte[] payload;
                VoxelSectionExportResult record;
                using (var export = scene.Native.OpenSectionExport(new(1, 1024 * 1024, 1024 * 1024)))
                using (var snapshot = export.Acquire(key, revision))
                {
                    Assert.Equal(5, export.Read(snapshot, null, Span<byte>.Empty, out var size));
                    payload = new byte[size.RequiredBytes];
                    Assert.Equal(0, export.Read(snapshot, null, payload, out record));
                }
                scene.Native.ApplyDurabilityAck(key, record.WorldGeneration, revision);
                scene.Native.UnloadSection(key, record.WorldGeneration, revision);
                Assert.False(scene.Adapter.Read(new[] { (0UL, 256 + 5 * 16 + 6) })[0].HasBlockId);
                scene.Manager.Tick(); // Actual Original is consumed; authoritative read remains unavailable.
                Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
                Assert.Equal(1, bomb.TerrainContinuations.Count);
                var ray = BomberTerrainTransactions.Decode<BomberTerrainContinuation>(bomb.TerrainContinuations[0]);
                Assert.False(ray.Unstarted);
                Assert.Equal(6, ray.X);
                Assert.Equal(5, ray.Z);
                Assert.Equal(1, ray.Direction);
                Assert.Equal(3, ray.Remaining);
                Assert.Equal(detail.Family, ray.Family);
                Assert.Equal(detail.Occurred, ray.Occurred);
                Assert.Equal(4, bomb.Power.Value);
                Assert.Equal(new Vector3(5.5f, 1.5f, 5.5f), scene.World.Get<LogicTransform>(order.AssignedId).LocalPosition);
                bomb.ValidateStorage();
                return new AcceptedFrontier(scene, order.AssignedId, ray, original.Outcome.Receipt.OriginalReceiptBytes.ToArray());
            }
            catch
            {
                scene.Dispose();
                throw;
            }
        }

        internal void Save(byte[] snapshot, string label)
        {
            string path = Path.Combine(artifact, label + ".lwm");
            File.WriteAllBytes(path, snapshot);
            Console.WriteLine("CONTINUATION_ACTUAL_SOURCE " + System.Text.Json.JsonSerializer.Serialize(new
            {
                label, path, sourceSha256 = Convert.ToHexString(SHA256.HashData(snapshot)),
                actualOriginalSha256 = Convert.ToHexString(SHA256.HashData(OriginalReceipt)),
                bomb = BombId.ToHex(), participant = Bomb.Owner.Value.ToHex(),
                sourceLife = Bomb.SourceLife.Value.ToHex(), generation = Bomb.SourceLifeGeneration.Value,
                chain = Bomb.ChainId.Value, power = Bomb.Power.Value, occurred = Bomb.ExplodedAtTick.Value,
            }));
        }

        public void Dispose() => Scene.Dispose();
    }
}
