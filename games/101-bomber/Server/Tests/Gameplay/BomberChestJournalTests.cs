using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Client.Gameplay.ECS;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Replication.Binding;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberChestJournalTests
{
    private static readonly string[] RemainingHitCounts = { "2", "1", "0" };

    [Fact]
    public void ActualClientReplicaReceivesOriginalStrongChestJournalBytes()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        using var bindings = EntityBindingQuery.Create(scene.Manager);
        using var factory = new BomberJournalReplicaFactory();
        IClientReplica? replica = null;
        void Deliver()
        {
            foreach (var message in scene.Manager.DrainOutbox().Frames)
            {
                if (message is WelcomeMessage welcome)
                {
                    replica = factory.Create();
                    replica.ResetForNewSession(new ReplicaResetRequest(1, "chest-journal-room"));
                    Assert.True(replica.TryObserveWelcome(WireCodec.EncodePack(welcome)));
                }
                else if (message is WorldChangeMessage change)
                {
                    Assert.NotNull(replica);
                    var previous = replica.GetSnapshot().Committed;
                    ulong next = previous.Revision + 1;
                    var request = new ReplicaStageRequest(previous.Generation,
                        previous.HasBaseline ? ReplicaUpdateKind.Delta : ReplicaUpdateKind.FullSnapshot,
                        previous.Baseline, previous.Revision, next, next, WireCodec.EncodePack(change),
                        ReadOnlyMemory<ulong>.Empty, ReadOnlyMemory<ulong>.Empty);
                    Assert.Equal(ReplicaStageStatus.Staged, replica.StageAuthority(in request, out var handle, out _).Status);
                    Assert.Equal(ReplicaOutcomeStatus.Observed,
                        replica.ObserveRuntimeOutcome(handle, ReplicaRuntimeOutcome.CommittedOutcome(), out _));
                    Assert.True(replica.GetLastApplyResult()!.AuthorityApplied);
                }
            }
        }
        Assert.Equal("accepted", bindings.Admit("chest-journal-connection", "effects-0", "chest-journal-room", "player").Outcome);
        scene.Manager.Tick(); Deliver();
        _ = StrongChest(scene); Deliver();
        for (int i = 0; i < 3; i++)
        {
            scene.Bomb(true);
            scene.Manager.Tick(); Deliver();
            scene.Manager.Tick(); Deliver();
        }
        scene.Manager.Tick(); Deliver();
        Assert.NotNull(replica);
        string[] journal = factory.ReadJournal(replica);
        Assert.Equal(scene.World.Single<BomberPresentationJournal>().Entries.Values, journal);
        Assert.Equal(3, journal.Count(text => JsonKind(text) == "chest_hit"));
        Assert.Single(journal, text => JsonKind(text) == "final_chest_opened");
        string? evidence = Environment.GetEnvironmentVariable("LUMIO_BOMBER_CHEST_JOURNAL_EVIDENCE");
        if (!string.IsNullOrEmpty(evidence))
            File.WriteAllText(evidence, JsonSerializer.Serialize(new
            {
                tick = scene.World.Tick.ToString(CultureInfo.InvariantCulture),
                matchId = scene.World.Single<BomberMatchState>().MatchId.Value.ToString(CultureInfo.InvariantCulture),
                events = journal,
            }));
    }

    private static string? JsonKind(string text)
    {
        using var json = JsonDocument.Parse(text);
        return json.RootElement.GetProperty("kind").GetString();
    }
    [Fact]
    public void StrongHitsAreDistinctAndOpeningWaitsForOriginalSettlement()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var chest = StrongChest(scene);
        scene.World.Single<BomberPresentationJournal>().Reset();
        var first = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(2, scene.World.Get<BomberChestState>(chest).RemainingHits.Value);
        var same = scene.Bomb(true);
        same.Get<BomberBombState>().HitFamily.Value = first.AssignedId;
        scene.Manager.Tick(); scene.Manager.Tick();
        var second = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var last = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(chest));
        Assert.Empty(Rows(scene.World, "final_chest_opened"));
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
        var hits = Rows(scene.World, "chest_hit");
        Assert.Equal(RemainingHitCounts, hits.Select(row => row.GetProperty("data").GetProperty("remainingHits").GetString()));
        Assert.Equal(new[] { first.AssignedId.ToHex(), second.AssignedId.ToHex(), last.AssignedId.ToHex() },
            hits.Select(row => row.GetProperty("data").GetProperty("bombId").GetString()));
        foreach (var row in hits)
        {
            Assert.Equal(chest.ToHex(), row.GetProperty("entityId").GetString());
            Assert.Equal("0", row.GetProperty("data").GetProperty("resourceTier").GetString());
        }
        ulong settlementTick = scene.World.Tick;
        scene.Manager.Tick();
        var opened = Assert.Single(Rows(scene.World, "final_chest_opened"));
        var source = scene.World.Get<BomberBombState>(last.AssignedId);
        Assert.Equal(chest.ToHex(), opened.GetProperty("entityId").GetString());
        Assert.Equal(source.Owner.Value.ToHex(), opened.GetProperty("sourceParticipantId").GetString());
        Assert.Equal(source.SourceLife.Value.ToHex(), opened.GetProperty("sourceLifeId").GetString());
        Assert.Equal("101", opened.GetProperty("data").GetProperty("chainId").GetString());
        Assert.Equal(last.AssignedId.ToHex(), opened.GetProperty("data").GetProperty("bombId").GetString());
        Assert.Equal(settlementTick.ToString(CultureInfo.InvariantCulture), opened.GetProperty("tick").GetString());
        Assert.Equal(6, opened.GetProperty("x").GetInt32());
        Assert.Equal(5, opened.GetProperty("z").GetInt32());
        for (int i = 0; i < 3; i++) scene.Manager.Tick();
        Assert.Equal(3, Rows(scene.World, "chest_hit").Length);
        Assert.Single(Rows(scene.World, "final_chest_opened"));
        Assert.Empty(Rows(scene.World, "crate_opened"));
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
    }

    [Fact]
    public void RefusedTerminalDigKeepsCountedHitsAndEmitsNoOpenUntilNewBombSucceeds()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var chest = StrongChest(scene);
        scene.World.Single<BomberPresentationJournal>().Reset();
        for (int i = 0; i < 2; i++) { scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); }
        var refused = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native),
            new WorldIngressBudget(1, 1, 1, 1))
        { World = scene.World };
        var third = scene.Bomb(true);
        using (VoxelGameplayBinding.Bind(scene.Manager, refused))
        {
            scene.Manager.BindVoxelTick(refused.PrepareVoxel, refused.CommitVoxel);
            scene.Manager.Tick(); scene.Manager.Tick();
            Assert.Equal(0, scene.World.Get<BomberChestState>(chest).RemainingHits.Value);
            Assert.Empty(Rows(scene.World, "final_chest_opened"));
            Assert.Equal(3, Rows(scene.World, "chest_hit").Length);
            Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
        }
        using var rebound = VoxelGameplayBinding.Bind(scene.Manager, scene.Adapter);
        scene.Manager.BindVoxelTick(scene.Adapter.PrepareVoxel, scene.Adapter.CommitVoxel);
        scene.Manager.Tick(); scene.Manager.Tick();
        var child = scene.Bomb(true);
        child.Get<BomberBombState>().HitFamily.Value = third.AssignedId;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.True(scene.World.IsLive(chest));
        Assert.Empty(Rows(scene.World, "final_chest_opened"));
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(chest));
        Assert.Equal(3, Rows(scene.World, "chest_hit").Length);
        Assert.Single(Rows(scene.World, "final_chest_opened"));
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
    }

    [Theory]
    [InlineData("Wood")]
    [InlineData("Iron")]
    [InlineData("Gold")]
    public void ResourceTierOpeningIsNotReportedAsStrongChest(string tier)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var chest = scene.Chest(tier);
        var row = BomberConfigBinding.For(scene.World).Tables.Chest.Rows.Single(value => value.Name == tier);
        scene.World.Single<BomberPresentationJournal>().Reset();
        for (int i = 0; i < row.IndependentBombHits; i++)
        { scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); }
        Assert.Empty(Rows(scene.World, "crate_opened"));
        scene.Manager.Tick();
        var opened = Assert.Single(Rows(scene.World, "crate_opened"));
        Assert.Equal(chest.ToHex(), opened.GetProperty("entityId").GetString());
        Assert.Equal(row.Id.ToString(CultureInfo.InvariantCulture), opened.GetProperty("data").GetProperty("resourceTier").GetString());
        Assert.Empty(Rows(scene.World, "chest_hit"));
        Assert.Empty(Rows(scene.World, "final_chest_opened"));
        scene.Manager.Tick();
        Assert.Single(Rows(scene.World, "crate_opened"));
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(value => value.DestroyedBlocks.Value));
    }

    internal static JsonElement[] Rows(World world, string kind) => world.Single<BomberPresentationJournal>().Entries.Values
        .Select(text => { using var json = JsonDocument.Parse(text); return json.RootElement.Clone(); })
        .Where(row => row.GetProperty("kind").GetString() == kind).ToArray();

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
            "chest-journal-fixture").Status);
        scene.Manager.Tick();
        return order.AssignedId;
    }
}
