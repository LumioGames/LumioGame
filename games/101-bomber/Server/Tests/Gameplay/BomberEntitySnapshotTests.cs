using System.Linq;
using System.Numerics;
using System.Security.Cryptography;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberEntitySnapshotTests
{
    [Fact]
    public void CurrentEntityDeclarationsAndTheirFieldsSurviveRealSnapshotRestore()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "entity-snapshot");
        EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
        EntityOrder bomb = manager.World.Commands.Create<BomberBombEntity>();
        EntityOrder pickup = manager.World.Commands.Create<BomberPickupItemEntity>();
        EntityOrder chest = manager.World.Commands.Create<BomberChestEntity>();
        EntityOrder fire = manager.World.Commands.Create<BomberFireZoneEntity>();
        bomb.Get<BomberBombState>().FuseEndTick.Value = 42;
        pickup.Get<BomberPickupItem>().ProtectedUntilTick.Value = 51;
        fire.Get<BomberFireZoneState>().UntilTick.Value = 63;
        manager.Tick();
        manager.World.Single<BomberMatchState>().MatchId.Value = 11;
        manager.World.Get<BomberBombState>(bomb.AssignedId).SetSource(new(participant.AssignedId, player.AssignedId, 1));
        manager.World.Get<BomberBombState>(bomb.AssignedId).TryReserveHit(new(participant.AssignedId, player.AssignedId, 1));
        manager.World.Get<BomberChestState>(chest.AssignedId).InitializeHitBudget();
        manager.World.Get<BomberChestState>(chest.AssignedId).TryCountBomb(bomb.AssignedId);

        byte[] snapshot = manager.CaptureSnapshot();
        Assert.NotEmpty(snapshot);
        using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        Assert.Equal(11UL, restored.World.Single<BomberMatchState>().MatchId.Value);
        Assert.True(restored.World.TypeOf(player.AssignedId).Is<PlayerEntity>());
        Assert.True(restored.World.TypeOf(bomb.AssignedId).Is<BomberBombEntity>());
        Assert.True(restored.World.TypeOf(pickup.AssignedId).Is<BomberPickupItemEntity>());
        Assert.True(restored.World.TypeOf(chest.AssignedId).Is<BomberChestEntity>());
        Assert.True(restored.World.TypeOf(fire.AssignedId).Is<BomberFireZoneEntity>());
        Assert.Equal(42UL, restored.World.Get<BomberBombState>(bomb.AssignedId).FuseEndTick.Value);
        Assert.Equal(participant.AssignedId, restored.World.Get<BomberBombState>(bomb.AssignedId).Owner.Value);
        Assert.True(restored.World.Get<BomberBombState>(bomb.AssignedId).TryReadHit(participant.AssignedId, out var target, out var state));
        Assert.Equal(new BomberTargetIdentity(participant.AssignedId, player.AssignedId, 1), target);
        Assert.Equal(BomberHitStorageState.Pending, state);
        Assert.Equal(51UL, restored.World.Get<BomberPickupItem>(pickup.AssignedId).ProtectedUntilTick.Value);
        Assert.Equal(2, restored.World.Get<BomberChestState>(chest.AssignedId).RemainingHits.Value);
        Assert.Equal(3, restored.World.Get<BomberChestState>(chest.AssignedId).RequiredHits.Value);
        SyncList<NetEntityId> hitBombs = restored.World.Get<BomberChestState>(chest.AssignedId).HitBombs;
        Assert.Equal(1, hitBombs.Count);
        Assert.Equal(bomb.AssignedId, hitBombs[0]);
        Assert.Equal(63UL, restored.World.Get<BomberFireZoneState>(fire.AssignedId).UntilTick.Value);
        NetEntityId[] spatial = restored.World.Each<LogicTransform>().Select(component => component.Entity).ToArray();
        Assert.Equal(4, spatial.Length);
        Assert.Contains(player.AssignedId, spatial);
        Assert.Contains(bomb.AssignedId, spatial);
        Assert.Contains(pickup.AssignedId, spatial);
        Assert.Contains(fire.AssignedId, spatial);
        Assert.DoesNotContain(chest.AssignedId, spatial);
    }

    [Fact]
    public void ChangingOnlyLogicalPositionChangesTheSnapshotHash()
    {
        byte[] first = CaptureAt(new Vector3(1.5f, 1.5f, 1.5f));
        byte[] moved = CaptureAt(new Vector3(2.5f, 1.5f, 1.5f));
        Assert.False(first.SequenceEqual(moved));
        Assert.Equal(first, CaptureAt(new Vector3(1.5f, 1.5f, 1.5f)));
    }

    private static byte[] CaptureAt(Vector3 position)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "position-snapshot");
        manager.Tick();
        LogicTransform transform = manager.World.Get<LogicTransform>(player.AssignedId);
        TransformController controller = manager.World.RegisterTransformController(player.AssignedId, nameof(MoveAbility));
        using (transform.BeginWrite(controller)) transform.SetWorldPosition(position);
        return SHA256.HashData(manager.CaptureSnapshot());
    }
}
