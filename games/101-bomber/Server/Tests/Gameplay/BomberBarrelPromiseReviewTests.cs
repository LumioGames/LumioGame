using System;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBarrelPromiseReviewTests
{
    [Theory]
    [InlineData("position", 0)]
    [InlineData("pierce", 3)]
    [InlineData("split-resolved", 4)]
    public void RetainedPromiseCannotTransferToADifferentFirstPublicationConstruction(string mutation, int shape)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var (row, bomb) = PublishFromActualNativeBarrel(scene, shape);
        switch (mutation)
        {
            case "position":
                BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(bomb.Entity), new Vector3(7.5f, 1.5f, 5.5f));
                break;
            case "pierce": bomb.PierceLayers.Value = 2; break;
            case "split-resolved":
                bomb.SplitSubmittedMask.Value = bomb.SplitResolvedMask.Value = 1;
                bomb.FutureChildren.Value = 3;
                break;
            default: throw new InvalidOperationException("Unknown review mutation.");
        }
        // The ordinary bomb storage still accepts these states. This proof targets
        // exact first-publication transfer from the retained barrel obligation.
        bomb.ValidateStorage();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        runtime.BarrelBombPromises.Value = BomberBarrelBombPromises.Encode(scene.World, new[] { row });
        byte[] source = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(source, scene.Manager.CaptureSnapshot());
    }

    [Fact]
    public void OlderMatchPromiseIsRejectedByCodecAndPairedHydrationWithoutChangingSource()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var (row, _) = PublishFromActualNativeBarrel(scene, 0);
        // Pair a newer match/roster with the actual old Native-produced row. The
        // ordinary round gates forbid this state; corruption must not revive it.
        scene.World.Single<BomberMatchState>().MatchId.Value = row.Match + 1;
        foreach (var participant in scene.World.Each<BomberParticipantState>()) participant.MatchId.Value = row.Match + 1;
        Assert.Throws<InvalidOperationException>(() => BomberBarrelBombPromises.Encode(scene.World, new[] { row }));
        scene.World.Single<BomberWorldRuntime>().BarrelBombPromises.Value = JsonSerializer.Serialize(new[] { row });
        byte[] source = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(source, scene.Manager.CaptureSnapshot());
    }

    private static (BomberBarrelBombPromises.Promise Row, BomberBombState Bomb) PublishFromActualNativeBarrel(
        BomberTerrainProductionTests.Scene scene, int shape)
    {
        var order = scene.World.Commands.Create<BomberBarrelEntity>();
        order.Get<BomberBarrelState>().ResourceGeneration.Value = 1;
        scene.Manager.Tick();
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1032, scene.World.Registry.WireName(typeof(BomberBarrelEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var entry = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1032u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(new[] { entry },
            new[] { new VoxelBindingOp(0, entry.CellOffset, order.AssignedId.ToHex()) { ExpectedSectionRevision = entry.ExpectedSectionRevision } }, "review-fixture-barrel").Status);
        scene.Manager.Tick();
        Assert.Equal(order.AssignedId.ToHex(), scene.Adapter.BindingGet(0, entry.CellOffset));
        var source = scene.Bomb();
        source.Get<BomberBombState>().BombKind.Value = shape;
        source.Get<BomberBombState>().FutureChildren.Value = shape == 4 ? 4 : 0;
        source.Get<BomberBombState>().CapacityReturned.Value = true;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(order.AssignedId));
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        var row = Assert.Single(JsonSerializer.Deserialize<BomberBarrelBombPromises.Promise[]>(
            scene.World.Single<BomberWorldRuntime>().BarrelBombPromises.Value)!);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value == row.Token);
        Assert.Equal("", scene.World.Single<BomberWorldRuntime>().BarrelBombPromises.Value);
        return (row with { Applied = true, CreationSubmitted = true, CreatedAt = bomb.PlacedAtTick.Value, Produced = bomb.Entity.ToHex() }, bomb);
    }
}
