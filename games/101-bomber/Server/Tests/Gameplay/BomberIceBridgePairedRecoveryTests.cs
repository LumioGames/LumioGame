using System;
using System.Linq;
using System.Numerics;
using System.Text;
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
using VoxelPresence = Lumio.GameRuntime.Coordination.VoxelPresence;

using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Persistence;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberIceBridgePairedRecoveryTests
{
    private const int X = 6, Z = 5;
    private const uint Water = 1027u << 8, Ice = 1031u << 8;

    // Private, uncompiled tests of official Runtime+Native+receipt-envelope cuts.
    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    public void OfficialPairedCheckpointResumesTheActualBridgeBirthPendingActiveWaterAndRetiringCuts(int phase)
    {
        using var fixture = new Fixture(persistence: true);
        var scene = fixture.Scene;
        var bridge = PrepareCut(scene, phase == 5 ? 4 : phase);
        NetEntityId id = bridge.Entity;
        string token = bridge.FreezeToken.Value;
        ulong generation = bridge.ResourceGeneration.Value;
        if (phase == 5)
        {
            scene.TickControlled(); // Real Original consumption/structural retirement, metadata captured while live.
            Assert.False(scene.World.IsLive(id));
        }
        JsonElement before = Owner(scene.World, token);
        Assert.Equal(phase, before.GetProperty("Phase").GetInt32());
        string source = before.GetProperty("SourceBomb").GetString()!;
        string life = before.GetProperty("SourceLife").GetString()!;
        ulong lifeGeneration = before.GetProperty("SourceLifeGeneration").GetUInt64();
        string participant = before.GetProperty("SourceParticipant").GetString()!;
        ulong chain = before.GetProperty("ChainId").GetUInt64();
        ulong match = before.GetProperty("Match").GetUInt64();
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        var cut = captured.Checkpoint!.Value;
        SaveCut(cut, phase.ToString(System.Globalization.CultureInfo.InvariantCulture));
        var sourceResults = scene.Adapter.CaptureResultCheckpoint();
        if (phase is 2 or 4) Assert.Single(sourceResults.Results);
        else Assert.Empty(sourceResults.Results);
        using WorldManager restored = RestoreOfficial(fixture, cut);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        Assert.Equal(scene.World.InstanceId, restored.World.InstanceId);
        Assert.Equal(cut.Tick, restored.World.Tick);
        var resources = NativeWorldVoxelResources.Require(restored);
        Assert.Equal(sourceResults.Results.Length, resources.Adapter.CaptureResultCheckpoint().Results.Length);
        JsonElement resumedOwner = Owner(restored.World, token);
        Assert.Equal(before.GetRawText(), resumedOwner.GetRawText());
        Assert.Equal(source, resumedOwner.GetProperty("SourceBomb").GetString());
        Assert.Equal(life, resumedOwner.GetProperty("SourceLife").GetString());
        Assert.Equal(lifeGeneration, resumedOwner.GetProperty("SourceLifeGeneration").GetUInt64());
        Assert.Equal(participant, resumedOwner.GetProperty("SourceParticipant").GetString());
        Assert.Equal(chain, resumedOwner.GetProperty("ChainId").GetUInt64());
        Assert.Equal(match, resumedOwner.GetProperty("Match").GetUInt64());
        Assert.Equal(phase != 5, restored.World.IsLive(id));
        var at = BomberTerrainTransactions.Address(BomberConfigBinding.For(restored.World).Map, X, 0, Z);
        Assert.Equal(phase is 2 or 3 ? Ice : Water, resources.Voxel.ReadCell(new VoxelWorldCoordinate(X, 0, Z)).BlockId);
        Assert.Equal(phase is 2 or 3 ? id.ToHex() : null, resources.Adapter.BindingGet(at.Section, at.Offset));
        if (phase is 4 or 5)
        {
            restored.Tick(); restored.Tick(); restored.Tick();
            Assert.False(restored.World.IsLive(id));
            Assert.Equal("", restored.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
            Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            Assert.Equal(Water, resources.Voxel.ReadCell(new VoxelWorldCoordinate(X, 0, Z)).BlockId);
            Assert.Null(resources.Adapter.BindingGet(at.Section, at.Offset));
        }
        else
        {
            for (int tick = 0; tick < 8 && Owner(restored.World, token).GetProperty("Phase").GetInt32() != 3; tick++) restored.Tick();
            Assert.Equal(3, Owner(restored.World, token).GetProperty("Phase").GetInt32());
            Assert.True(restored.World.IsLive(id));
            var resumedBridge = restored.World.Get<BomberIceBridgeState>(id);
            Assert.Equal(generation, resumedBridge.ResourceGeneration.Value); Assert.Equal(token, resumedBridge.FreezeToken.Value);
            Assert.Equal(match, resumedBridge.MatchId.Value);
            Assert.Equal(checked(resumedBridge.AppliedTick.Value + Ticks.FromMilliseconds(8000,
                BomberConfigBinding.For(restored.World).Game.TickRateHz)), resumedBridge.ExpiresAtTick.Value);
            if (phase == 3)
            {
                Assert.Equal(before.GetProperty("AppliedTick").GetUInt64(), resumedBridge.AppliedTick.Value);
                Assert.Equal(before.GetProperty("ExpiresAtTick").GetUInt64(), resumedBridge.ExpiresAtTick.Value);
            }
            Assert.Single(restored.World.Each<BomberIceBridgeState>());
            Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            Assert.Equal(id.ToHex(), resources.Adapter.BindingGet(at.Section, at.Offset));
            restored.Tick(); // No replay birth or second freeze token on an ordinary follow-up Tick.
            Assert.Single(restored.World.Each<BomberIceBridgeState>());
            Assert.Equal(token, restored.World.Get<BomberIceBridgeState>(id).FreezeToken.Value);
        }
    }

    [Theory]
    [InlineData(2)]
    [InlineData(4)]
    public void ActualNativeHistoryEvictionAndPairedEmptyDeliveryKeepBridgeDebtUntilTheRetainedOriginal(int phase)
    {
        using var fixture = new Fixture(persistence: true, receiptLimit: 1);
        var scene = fixture.Scene;
        var bridge = PrepareCut(scene, phase);
        string token = bridge.FreezeToken.Value;
        NetEntityId id = bridge.Entity;
        string transaction = scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds[0];
        VoxelResultCheckpoint original = Original(scene, scene.Adapter);
        string debt = scene.World.Single<BomberWorldRuntime>().IceBridgePromises.Value;
        // Genuine unrelated SDK commit evicts the real Native history in the declared one-entry fixture.
        scene.Write(13, 1, 13, 1025u << 8);
        using (Withhold(scene))
        {
            var held = VoxelGameplayBinding.Resolve(scene.Manager)!;
            Assert.Equal(VoxelTxnState.Unknown, held.QueryTransaction(transaction).State);
            Assert.Empty(held.CaptureResultCheckpoint().Results);
            var captured = DualCutCheckpoint.Capture(scene.Manager, new ActualCapturePort(scene, held));
            Assert.True(captured.Succeeded, captured.ErrorCode);
            var cut = captured.Checkpoint!.Value;
            SaveCut(cut, "unknown-" + phase);
            using WorldManager restored = RestoreOfficial(fixture, cut);
            Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
            var resources = NativeWorldVoxelResources.Require(restored);
            Assert.Empty(resources.Adapter.CaptureResultCheckpoint().Results);
            Assert.Equal(VoxelTxnState.Unknown, resources.Adapter.QueryTransaction(transaction).State);
            for (int tick = 0; tick < 4; tick++)
            {
                restored.Tick();
                Assert.Equal(debt, restored.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
                Assert.Equal(transaction, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds[0]);
                Assert.True(restored.World.IsLive(id));
                Assert.Equal(phase, Owner(restored.World, token).GetProperty("Phase").GetInt32());
                Assert.Empty(resources.Adapter.CaptureResultCheckpoint().Results);
            }
            DeliverStoredOriginal(restored, original);
            if (phase == 2)
            {
                Assert.Equal(3, Owner(restored.World, token).GetProperty("Phase").GetInt32());
                Assert.True(restored.World.IsLive(id));
                Assert.Equal(id.ToHex(), resources.Adapter.BindingGet(Address(scene).Section, Address(scene).Offset));
            }
            else
            {
                Assert.False(restored.World.IsLive(id));
                Assert.Equal("", restored.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
                Assert.Null(resources.Adapter.BindingGet(Address(scene).Section, Address(scene).Offset));
            }
            Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            DeliverStoredOriginal(restored, original);
            Assert.Equal(phase == 2, restored.World.IsLive(id));
            Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        }
    }

    [Theory]
    [InlineData(2)]
    [InlineData(4)]
    public void PairedActualRevisionAbortReleasesOnlyItsUncommittedFreezeOrRestoresTheExistingIceOwner(int phase)
    {
        using var fixture = new Fixture(persistence: true);
        var scene = fixture.Scene;
        BomberIceBridgeState bridge;
        if (phase == 2) bridge = PrepareCut(scene, 1);
        else
        {
            bridge = FreezeAndAccept(scene);
            while (scene.World.Tick < bridge.ExpiresAtTick.Value) scene.TickControlled();
        }
        NetEntityId id = bridge.Entity;
        string token = bridge.FreezeToken.Value;
        ulong generation = bridge.ResourceGeneration.Value, deadline = bridge.ExpiresAtTick.Value;
        // Qualify the actual Runtime-derived policy before staging the independent
        // transaction: policy replacement itself is forbidden while mutations exist.
        if (!scene.Adapter.BindingPolicy.Any(row => row.BlockType == Ice >> 8))
            scene.Adapter.SetBindingPolicy(scene.Adapter.BindingPolicy.Concat(new[] {
                new VoxelBindingPolicyEntry(Ice >> 8, scene.World.Registry.WireName(typeof(BomberIceBridgeEntity)))
            }).ToArray());
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(13, 1, 13));
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageWrite(new[] {
            new VoxelWriteEntry(0, 256 + 13 * 16 + 13, 1025u << 8, before.SectionRevision)
        }, "ice-earlier-independent-revision-conflict").Status);
        scene.TickControlled(); // Earlier real Native transaction consumes the shared section revision.
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string rejectedTransaction = runtime.PendingVoxelTransactionIds[0];
        var realResults = scene.Adapter.CaptureResultCheckpoint();
        var abort = Assert.Single(realResults.Results, result => result.TransactionId == rejectedTransaction);
        Assert.Equal(VoxelTxnState.Aborted, abort.Outcome.State);
        Assert.NotEqual(VoxelCommitDisposition.Original, abort.Outcome.Disposition);
        Assert.Equal(phase, Owner(scene.World, token).GetProperty("Phase").GetInt32());
        Assert.Equal(phase == 2 ? Water : Ice, GroundBlock(scene));
        Assert.Equal(phase == 2 ? null : id.ToHex(), scene.Adapter.BindingGet(Address(scene).Section, Address(scene).Offset));
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture(); Assert.True(captured.Succeeded, captured.ErrorCode);
        SaveCut(captured.Checkpoint!.Value, "abort-" + phase);
        using WorldManager restored = RestoreOfficial(fixture, captured.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        var resources = NativeWorldVoxelResources.Require(restored);
        Assert.Contains(resources.Adapter.CaptureResultCheckpoint().Results,
            result => result.TransactionId == rejectedTransaction && result.Outcome.State == VoxelTxnState.Aborted);
        restored.Tick();
        var resumedRuntime = restored.World.Single<BomberWorldRuntime>();
        Assert.DoesNotContain(Enumerable.Range(0, resumedRuntime.PendingVoxelTransactionIds.Count),
            index => resumedRuntime.PendingVoxelTransactionIds[index] == rejectedTransaction);
        if (phase == 2)
        {
            restored.Tick();
            Assert.False(restored.World.IsLive(id));
            Assert.Equal("", restored.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
            Assert.Equal(Water, resources.Voxel.ReadCell(new VoxelWorldCoordinate(X, 0, Z)).BlockId);
        }
        else
        {
            // Expiry remains latched: a genuine later retry may already stage/commit water.
            Assert.True(restored.World.IsLive(id));
            var retained = restored.World.Get<BomberIceBridgeState>(id);
            Assert.Equal(generation, retained.ResourceGeneration.Value); Assert.Equal(token, retained.FreezeToken.Value);
            Assert.Equal(deadline, retained.ExpiresAtTick.Value);
            Assert.NotEqual(rejectedTransaction, Owner(restored.World, token).GetProperty("TransactionId").GetString());
            for (int tick = 0; tick < 8 && restored.World.IsLive(id); tick++) restored.Tick();
            Assert.False(restored.World.IsLive(id));
            restored.Tick(); // Observe the already-flushed destruction in the ordinary Retiring cleanup.
            Assert.Equal("", restored.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
            Assert.Equal(Water, resources.Voxel.ReadCell(new VoxelWorldCoordinate(X, 0, Z)).BlockId);
        }
    }

    private static BomberIceBridgeState PrepareCut(BomberTerrainProductionTests.Scene scene, int phase)
    {
        if (phase == 1)
        {
            _ = Blast(scene, (int)BomberBombKind.Freeze);
            for (int tick = 0; tick < 8 && scene.World.Single<BomberWorldRuntime>().IceBridgePromises.Value == ""; tick++) scene.TickControlled();
            var born = Assert.Single(scene.World.Each<BomberIceBridgeState>());
            Assert.Equal(1, Owner(scene.World, born.FreezeToken.Value).GetProperty("Phase").GetInt32());
            Assert.Equal(Water, GroundBlock(scene));
            Assert.Null(scene.Adapter.BindingGet(Address(scene).Section, Address(scene).Offset));
            return born;
        }
        _ = Blast(scene, (int)BomberBombKind.Freeze);
        var bridge = AwaitNativeBridge(scene);
        if (phase == 2) return bridge;
        scene.TickControlled();
        Assert.Equal(3, Owner(scene.World, bridge.FreezeToken.Value).GetProperty("Phase").GetInt32());
        if (phase == 3) return bridge;
        AwaitWater(scene);
        if (phase == 4) return bridge;
        throw new ArgumentOutOfRangeException(nameof(phase));
    }

    private static JsonElement Owner(World world, string token)
    {
        using var document = JsonDocument.Parse(world.Single<BomberWorldRuntime>().IceBridgePromises.Value);
        return Assert.Single(document.RootElement.EnumerateArray(),
            row => row.GetProperty("FreezeToken").GetString() == token).Clone();
    }

    private static WorldManager RestoreOfficial(Fixture fixture, DualCutCheckpointPayload cut) =>
        BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance) {
            InstanceId = 1, Config = BomberConfigBinding.Load(fixture.Export),
            Catalog = System.IO.File.ReadAllBytes(System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot,
                "Server", "Assets", "Maps", "official-catalog.json")),
            Snapshot = cut.Runtime, VoxelSnapshot = cut.Voxel,
            Subsystems = new IWorldSubsystem[] { new WorldPersistenceSubsystem() },
        });

    private static void DeliverStoredOriginal(WorldManager manager, VoxelResultCheckpoint original)
    {
        var resources = NativeWorldVoxelResources.Require(manager);
        var candidate = new HostVoxelWorldAdapter(resources.Voxel.NativeHandle, new VoxelFacadeNativeAbi(resources.Voxel)) { World = manager.World };
        candidate.RestoreResultCheckpoint(original); // Fresh target, before SetBindingPolicy freezes it.
        candidate.SetBindingPolicy(resources.Adapter.BindingPolicy);
        using var binding = VoxelGameplayBinding.Bind(manager, candidate);
        manager.BindVoxelTick(candidate.PrepareVoxel, candidate.CommitVoxel);
        try { manager.Tick(); manager.Tick(); manager.Tick(); }
        finally { manager.BindVoxelTick(resources.Adapter.PrepareVoxel, resources.Adapter.CommitVoxel); }
    }

    private static void SaveCut(DualCutCheckpointPayload cut, string label)
    {
        string directory = System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".run",
            "ice-paired-cut-artifacts", label + "-" + Guid.NewGuid().ToString("N"));
        System.IO.Directory.CreateDirectory(directory);
        System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory, "runtime-with-receipts.packet"), cut.Runtime);
        System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory, "native.snapshot"), cut.Voxel);
        Assert.Equal(cut.RuntimeSha256, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(cut.Runtime)).ToLowerInvariant());
        Assert.Equal(cut.VoxelSha256, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(cut.Voxel)).ToLowerInvariant());
        Console.WriteLine("ICE_ACTUAL_PAIRED_CUT " + JsonSerializer.Serialize(new {
            label, directory, cut.Tick, cut.RuntimeSha256, cut.VoxelSha256, cut.SectionCount,
        }));
    }

    // Capture-only actual forwarding port selects the *currently bound* delivery queue,
    // because the built-in persistence service holds the original boot adapter.
    private sealed class ActualCapturePort(BomberTerrainProductionTests.Scene scene, HostVoxelWorldAdapter adapter) : IVoxelResultSnapshotPort
    {
        public byte[]? Capture() => scene.Native.Capture();
        public VoxelResultCheckpoint CaptureResults() => adapter.CaptureResultCheckpoint();
        public void RestoreResults(VoxelResultCheckpoint checkpoint, WorldManager manager) {
            adapter.World = manager.World; adapter.RestoreResultCheckpoint(checkpoint);
        }
        public bool TryRestore(ReadOnlySpan<byte> snapshot, out string? errorCode) {
            try { scene.Native.Restore(snapshot); errorCode = null; return true; }
            catch (Exception error) { errorCode = error.Message; return false; }
        }
        public bool HasUnresolvedRequiredSections => scene.World.Each<LogicTransform>().Any(transform => {
            Vector3 position = transform.WorldPosition;
            var map = BomberConfigBinding.For(scene.World).Map;
            var address = BomberTerrainTransactions.Address(map, (int)MathF.Floor(position.X),
                (int)MathF.Floor(position.Y), (int)MathF.Floor(position.Z));
            return adapter.Read(address.Section, address.Offset).Presence is VoxelPresence.Pending or VoxelPresence.Unavailable;
        });
    }
    private static BomberBombState Blast(BomberTerrainProductionTests.Scene scene, int kind, int x = 5)
    {
        var order = scene.Bomb();
        var bomb = order.Get<BomberBombState>();
        bomb.BombKind.Value = kind;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(x + .5f, 1.5f, Z + .5f));
        return bomb;
    }

    private static BomberIceBridgeState AwaitNativeBridge(BomberTerrainProductionTests.Scene scene)
    {
        for (int tick = 0; tick < 8 && GroundBlock(scene) != Ice; tick++) scene.TickControlled();
        Assert.Equal(Ice, GroundBlock(scene));
        var bridge = Assert.Single(scene.World.Each<BomberIceBridgeState>());
        AssertBound(scene, bridge);
        Assert.Equal(scene.World.Single<BomberMatchState>().MatchId.Value, bridge.MatchId.Value);
        Assert.True(bridge.ResourceGeneration.Value > 0);
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        return bridge;
    }

    private static BomberIceBridgeState FreezeAndAccept(BomberTerrainProductionTests.Scene scene)
    {
        _ = Blast(scene, (int)BomberBombKind.Freeze);
        BomberIceBridgeState bridge = AwaitNativeBridge(scene);
        ulong submitted = scene.World.Single<BomberWorldRuntime>().PendingVoxelSubmittedTicks[0];
        _ = Original(scene, scene.Adapter);
        scene.TickControlled();
        AssertAcceptedBridge(scene, bridge, submitted);
        return bridge;
    }

    private static void AssertAcceptedBridge(BomberTerrainProductionTests.Scene scene, BomberIceBridgeState bridge, ulong submitted)
    {
        AssertBound(scene, bridge);
        Assert.Equal(submitted, bridge.AppliedTick.Value);
        Assert.Equal(checked(submitted + Ticks.FromMilliseconds(8000, BomberConfigBinding.For(scene.World).Game.TickRateHz)), bridge.ExpiresAtTick.Value);
    }

    private static void AwaitWater(BomberTerrainProductionTests.Scene scene)
    {
        ulong latest = checked(scene.World.Tick + Ticks.FromMilliseconds(8000, BomberConfigBinding.For(scene.World).Game.TickRateHz) + 8);
        while (scene.World.Tick <= latest && GroundBlock(scene) != Water) scene.TickControlled();
        Assert.Equal(Water, GroundBlock(scene));
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
    }

    private static JsonElement Debt(BomberTerrainProductionTests.Scene scene, BomberIceBridgeState bridge)
    {
        string encoded = scene.World.Single<BomberWorldRuntime>().IceBridgePromises.Value;
        Assert.InRange(Encoding.UTF8.GetByteCount(encoded), 1, 65536);
        using var document = JsonDocument.Parse(encoded);
        var rows = document.RootElement.EnumerateArray().ToArray();
        Assert.InRange(rows.Length, 1, 60);
        JsonElement row = Assert.Single(rows, r => r.GetProperty("FreezeToken").GetString() == bridge.FreezeToken.Value);
        Assert.Equal(bridge.Entity.ToHex(), row.GetProperty("Bridge").GetString());
        Assert.Equal(bridge.ResourceGeneration.Value, row.GetProperty("Generation").GetUInt64());
        Assert.Equal(bridge.MatchId.Value, row.GetProperty("Match").GetUInt64());
        return row.Clone();
    }

    private static VoxelResultCheckpoint Original(BomberTerrainProductionTests.Scene scene, HostVoxelWorldAdapter adapter)
    {
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        VoxelResultCheckpoint checkpoint = adapter.CaptureResultCheckpoint();
        var result = Assert.Single(checkpoint.Results, r => r.TransactionId == runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(0, result.Outcome.Status);
        Assert.Equal(VoxelTxnState.Applied, result.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, result.Outcome.Disposition);
        Assert.True(result.Outcome.TokenConsumed);
        Assert.False(result.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        var section = Assert.Single(result.Outcome.Receipt.Sections!);
        Assert.Equal(runtime.PendingSections[0], section.SectionKey);
        Assert.True(section.UpToSectionRevision > runtime.PendingExpectedRevisions[0]);
        return checkpoint;
    }

    private static BomberBombState Place(BomberTerrainProductionTests.Scene scene, int slot, bool remote, int x, int z)
    {
        NetEntityId life = scene.Lives[slot];
        var skill = scene.World.Get<BomberSkillState>(life);
        skill.BombSkillId.Value = remote ? BomberConfigBinding.For(scene.World).Tables.Skills.Rows.Single(s => s.Slot == "Bomb" && s.BombKindCode == 7 && !s.IsCombo).Id : 0;
        skill.BombSkillLevel.Value = remote ? 1 : 0;
        Position(scene.World, life, x, z);
        var owner = scene.World.Get<AbilityComponent>(life);
        Assert.True(PlaceBombAbility.CanPlace(owner, out string? reason), reason);
        var admitted = owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        Assert.True(admitted.Succeeded, admitted.FailureCode);
        scene.TickControlled();
        var player = scene.World.Get<BomberPlayerState>(life);
        var bomb = Assert.Single(scene.World.Each<BomberBombState>(), b => b.SourceLife.Value == life && b.Owner.Value == player.Participant.Value &&
            scene.World.Get<LogicTransform>(b.Entity).LocalPosition == new Vector3(x + .5f, 1.5f, z + .5f));
        Assert.Equal(remote ? 7 : 0, bomb.BombKind.Value);
        Assert.Equal(player.LifeGeneration.Value, bomb.SourceLifeGeneration.Value);
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        return bomb;
    }

    private static void AssertAllFuse(BomberTerrainProductionTests.Scene scene, BomberBombState[] bombs)
    {
        foreach (var bomb in bombs)
        {
            Assert.True(scene.World.IsLive(bomb.Entity));
            Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
            Assert.True(bomb.FuseEndTick.Value > scene.World.Tick);
            Assert.Equal(new Vector3(X + .5f, 1.5f, Z + .5f), scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition);
        }
    }

    private readonly record struct BombIdentity(NetEntityId Entity, NetEntityId SourceLife, ulong SourceLifeGeneration, NetEntityId Owner);
    private static BombIdentity CaptureIdentity(BomberBombState bomb) =>
        new(bomb.Entity, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value, bomb.Owner.Value);

    private static void AssertOneExtinguishment(BomberTerrainProductionTests.Scene scene, BombIdentity bomb)
    {
        var occurrence = Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "bomb_extinguished"), e => e.GetProperty("entityId").GetString() == bomb.Entity.ToHex());
        Assert.Equal(bomb.SourceLife.ToHex(), occurrence.GetProperty("lifeId").GetString());
        Assert.Equal(bomb.Owner.ToHex(), occurrence.GetProperty("participantId").GetString());
        Assert.Equal(bomb.SourceLifeGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture), occurrence.GetProperty("lifeGeneration").GetString());
    }

    private static void AssertBound(BomberTerrainProductionTests.Scene scene, BomberIceBridgeState bridge)
    {
        Assert.Equal(Ice, GroundBlock(scene));
        Assert.True(scene.World.IsLive(bridge.Entity));
        Assert.True(scene.World.TypeOf(bridge.Entity).Is<BomberIceBridgeEntity>());
        var at = Address(scene);
        Assert.Equal(bridge.Entity.ToHex(), scene.Adapter.BindingGet(at.Section, at.Offset));
    }

    private static void AssertRetired(BomberTerrainProductionTests.Scene scene, NetEntityId bridge)
    {
        Assert.Equal(Water, GroundBlock(scene));
        var at = Address(scene);
        Assert.Null(scene.Adapter.BindingGet(at.Section, at.Offset));
        Assert.False(scene.World.IsLive(bridge));
    }

    private static AdapterBinding Withhold(BomberTerrainProductionTests.Scene scene) => BindCandidate(scene, null);
    private static void DeliverAndTick(BomberTerrainProductionTests.Scene scene, VoxelResultCheckpoint original)
    {
        using var binding = BindCandidate(scene, original);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
    }

    private static AdapterBinding BindCandidate(BomberTerrainProductionTests.Scene scene, VoxelResultCheckpoint? original)
    {
        var candidate = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        if (original is not null) candidate.RestoreResultCheckpoint(original);
        candidate.SetBindingPolicy(scene.Adapter.BindingPolicy);
        IDisposable binding = VoxelGameplayBinding.Bind(scene.Manager, candidate);
        scene.Manager.BindVoxelTick(candidate.PrepareVoxel, candidate.CommitVoxel);
        return new AdapterBinding(scene, binding);
    }

    private static (ulong Section, int Offset) Address(BomberTerrainProductionTests.Scene scene) =>
        BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, X, BomberConfigBinding.For(scene.World).Map.GroundLayer, Z);
    private static uint GroundBlock(BomberTerrainProductionTests.Scene scene) =>
        scene.Native.ReadCell(new VoxelWorldCoordinate(X, checked((byte)BomberConfigBinding.For(scene.World).Map.GroundLayer), Z)).BlockId;
    private static ulong GroundRevision(BomberTerrainProductionTests.Scene scene) =>
        scene.Native.ReadCell(new VoxelWorldCoordinate(X, checked((byte)BomberConfigBinding.For(scene.World).Map.GroundLayer), Z)).SectionRevision;
    private static long Available(BomberTerrainProductionTests.Scene scene, NetEntityId life) =>
        scene.World.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.AvailableBombs);
    private static void Position(World world, NetEntityId entity, int x, int z) =>
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(entity), new Vector3(x + .5f, 1.5f, z + .5f));

    private sealed class AdapterBinding(BomberTerrainProductionTests.Scene scene, IDisposable binding) : IDisposable
    {
        public void Dispose()
        {
            binding.Dispose();
            scene.Manager.BindVoxelTick(scene.Adapter.PrepareVoxel, scene.Adapter.CommitVoxel);
        }
    }

    private sealed class Fixture : IDisposable
    {
        // Same private, budgeted Remote capability as existing real Remote tests.
        // No M2 map, ice enabled flag, maxima or formal producer guard is changed.
        private readonly BomberObjectBudgetTests.AuthoredFixture authored;
        internal BomberTerrainProductionTests.Scene Scene { get; }

        internal string Export { get; }

        internal Fixture(bool dropAllCapacity = false, bool persistence = false, uint receiptLimit = 64)
        {
            // Only the old-Life isolation case opts into the existing supported full-loss profile value.
            authored = dropAllCapacity
                ? new BomberObjectBudgetTests.AuthoredFixture(("bomb_kinds", "Remote", "enabled", "true"),
                    ("drops", "default", "death_drop_permille", "1000"))
                : new BomberObjectBudgetTests.AuthoredFixture(("bomb_kinds", "Remote", "enabled", "true"));
            Export = authored.Compile();
            Scene = new BomberTerrainProductionTests.Scene(0, configDirectory: Export, controlled: true, persistence: persistence, receiptLimit: receiptLimit);
            for (int z = 3; z <= 15; z++)
                for (int x = 3; x <= 15; x++) Scene.Write(x, 1, z, 0);
            Scene.Write(X, 0, Z, Water);
            Assert.Equal(Water, GroundBlock(Scene));
            Assert.Equal("LegacyPillars", BomberConfigBinding.For(Scene.World).Map.LayoutKind);
            Assert.False(BomberConfigBinding.For(Scene.World).Tables.Blocks.Rows.Single(b => b.Name == "ice").Enabled);
            foreach (NetEntityId life in Scene.Lives) Position(Scene.World, life, 15, 15);
        }

        public void Dispose() { Scene.Dispose(); authored.Dispose(); }
    }
}
