using System;
using System.Linq;
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
public sealed class BomberBombPromiseReplayTests
{
    [Fact]
    public void RestoredExplicitUnknownSplitOwnerCannotResubmitAndRetainsItsCredit()
    {
        using var scene = BomberSplitBombProductionTests.Open(persistence: true);
        scene.Write(8, 1, 7, 1025u << 8);
        var mother = BomberSplitBombProductionTests.Mother(scene, 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Danger, mother.Phase.Value);
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        var withheld = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, withheld);
        scene.Manager.BindVoxelTick(withheld.PrepareVoxel, withheld.CommitVoxel);
        // Explicit durable unknown fixture: the published mother is real, but
        // these flags do not claim an actual structural Unknown checkpoint.
        mother.SplitSubmittedMask.Value = 1;
        string token = $"split:{mother.Entity.ToHex()}:0";
        using var restored = Restore(scene);
        Assert.True(BomberSplitBombs.HasSubmittedPromise(restored.World, token));
        AssertRejectedWithoutMutation(restored, token);
        Assert.Equal(4, restored.World.Get<BomberBombState>(mother.Entity).FutureChildren.Value);
    }

    [Fact]
    public void RestoredExplicitUnknownBarrelOwnerCannotResubmitAndRetainsItsCredit()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        var barrel = scene.World.Commands.Create<BomberBarrelEntity>();
        barrel.Get<BomberBarrelState>().ResourceGeneration.Value = 1;
        scene.Manager.Tick();
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1032,
            scene.World.Registry.WireName(typeof(BomberBarrelEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var write = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1032u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(new[] { write },
            new[] { new VoxelBindingOp(0, write.CellOffset, barrel.AssignedId.ToHex())
                { ExpectedSectionRevision = write.ExpectedSectionRevision } }, "replay-fixture-barrel").Status);
        scene.Manager.Tick();
        scene.Bomb();
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(barrel.AssignedId));
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var row = Assert.Single(JsonSerializer.Deserialize<BomberBarrelBombPromises.Promise[]>(runtime.BarrelBombPromises.Value)!);
        Assert.False(row.CreationSubmitted);
        scene.Manager.Tick();
        var published = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value == row.Token);
        NetEntityId publishedId = published.Entity;
        row = row with { Applied = true, CreationSubmitted = true, CreatedAt = published.PlacedAtTick.Value,
            Produced = publishedId.ToHex() };
        for (int i = 0; i < 128 && scene.World.IsLive(publishedId); i++) scene.Manager.Tick();
        Assert.False(scene.World.IsLive(publishedId));
        // Fault-inject a retained unknown witness after the actual publication
        // retires. Original Native provenance is real; this is not Unknown capture.
        runtime.BarrelBombPromises.Value = BomberBarrelBombPromises.Encode(scene.World, new[] { row });
        using var restored = Restore(scene);
        Assert.True(BomberBarrelBombPromises.HasSubmittedPromise(restored.World, row.Token));
        AssertRejectedWithoutMutation(restored, row.Token);
        Assert.Equal(1, BomberBarrelBombPromises.ReservedCount(restored.World));
    }

    [Fact]
    public void RestoredExplicitUnknownFrenzyOwnerCannotResubmitAndRetainsItsCredit()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        BomberGrowthHealthTests.Take(scene.Manager, scene.Lives[0], 7);
        var world = scene.World;
        var life = world.Get<BomberPlayerState>(scene.Lives[0]);
        var participant = world.Get<BomberParticipantState>(life.Participant.Value);
        Assert.True(BomberFrenzy.IsActive(world, participant, life.Entity));
        var config = BomberConfigBinding.For(world);
        var runtime = world.Single<BomberWorldRuntime>();
        ulong chain = checked(runtime.NextChainId.Value + 1);
        // Explicit durable unknown fixture, separate from the real queued
        // placement test whose CaptureSnapshot correctly refuses pending creates.
        var row = new BomberFrenzy.Promise($"frenzy:{participant.Entity.ToHex()}:{chain:x16}",
            life.Entity.ToHex(), life.LifeGeneration.Value, participant.MatchId.Value, chain,
            checked((int)world.Get<AttributeComponent>(life.Entity).GetCurrentValue(BomberAttributeNames.BombPower)),
            7, 5, 1.5f, world.Tick,
            checked(world.Tick + Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz)), true);
        string encoded = BomberFrenzy.Encode(world, participant, row, chain);
        runtime.NextChainId.Value = chain;
        participant.FrenzyLastPlacementTick.Value = world.Tick;
        participant.FrenzyBombPromises.Add(encoded);
        using var restored = Restore(scene);
        Assert.True(BomberFrenzy.HasSubmittedPromise(restored.World, row.Token));
        AssertRejectedWithoutMutation(restored, row.Token);
        Assert.Equal(1, BomberFrenzy.ReservedCount(restored.World));
    }

    private static WorldManager Restore(BomberTerrainProductionTests.Scene scene)
    {
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        return BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
    }

    private static void AssertRejectedWithoutMutation(WorldManager restored, string token)
    {
        byte[] before = restored.CaptureSnapshot();
        int actual = restored.World.Each<BomberBombState>().Count();
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(restored.World, token));
        Assert.Equal(actual, restored.World.Each<BomberBombState>().Count());
        Assert.Equal(before, restored.CaptureSnapshot());
    }
}
