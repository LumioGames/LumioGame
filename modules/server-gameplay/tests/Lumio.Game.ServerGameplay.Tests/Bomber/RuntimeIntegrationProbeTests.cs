using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using Lumio.Game.ServerGameplay.Bomber.Contracts;
using Lumio.Game.ServerGameplay.Bomber.Contracts.Components;
using Lumio.Game.ServerGameplay.Bomber.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests.Bomber;

/// <summary>
/// G-0 Runtime 接入核验（design.md §16 Gate 0；ADR 0013/0014）：证明 Game 可以定义并注册全新的
/// EcsRegistry/EntityType/Component（不复用 Username 样例），并且同一 Seed 起点 + 同一命令序列在
/// 两个独立 World 上重放，产出逐字节相等的快照——这是 Stage 0a「同 Seed + Config + 命令流可重放」
/// 确定性门的最小可运行证据。结论写入 docs/specs/bomber/stage0-kernel-contract.md §0。
/// </summary>
public sealed class RuntimeIntegrationProbeTests
{
    private const ulong InstanceId = 0x424F4D4245520001UL; // "BOMBER" 前缀 + 0001

    [Fact]
    public void CustomComponentRegistersAndParticipatesInSnapshot()
    {
        using WorldManager manager = WorldManager.Create(GeneratedRegistry.Instance, InstanceId);
        manager.Start(Thread.CurrentThread);

        BomberMatchState world = manager.World.Single<BomberMatchState>();
        Assert.NotNull(world);

        var order = manager.World.Commands.Create<BomberPlayerEntity>();
        BomberPlayerState player = order.Get<BomberPlayerState>();
        player.HealthPoints.SetSilent(6);
        player.HatCount.SetSilent(0);

        manager.Tick();

        BomberPlayerState[] players = manager.World.Each<BomberPlayerState>().ToArray();
        Assert.Single(players);
        Assert.Equal(6, players[0].HealthPoints.Value);

        byte[] snapshot = manager.CaptureSnapshot();
        Assert.True(snapshot.Length > 0, "快照必须包含数据，不能是空字节");
    }

    [Fact]
    public void SameSeedAndCommandSequenceProducesByteIdenticalSnapshotOnTwoIndependentWorlds()
    {
        byte[] hashA = RunFixedScenario();
        byte[] hashB = RunFixedScenario();

        Assert.Equal(Convert.ToHexString(hashA), Convert.ToHexString(hashB));
    }

    [Fact]
    public void AllFiveEntityTypesRegisterCreateAndParticipateInSnapshot()
    {
        using WorldManager manager = WorldManager.Create(GeneratedRegistry.Instance, InstanceId);
        manager.Start(Thread.CurrentThread);

        manager.World.Single<BomberMatchState>().MatchTick.SetSilent(0);

        BomberPlayerState player = manager.World.Commands.Create<BomberPlayerEntity>().Get<BomberPlayerState>();
        player.HealthPoints.SetSilent(6);

        BomberBombState bomb = manager.World.Commands.Create<BomberBombEntity>().Get<BomberBombState>();
        bomb.CellX.SetSilent(5);
        bomb.CellY.SetSilent(5);
        bomb.CellZ.SetSilent(0);
        bomb.FuseEndTick.SetSilent(42);
        bomb.BombKind.SetSilent(0);
        bomb.ExplodedAtTick.SetSilent(42);
        bomb.DangerUntilTick.SetSilent(49);
        bomb.BurnUntilTick.SetSilent(49);
        bomb.ReachUp.SetSilent(2);
        bomb.ReachDown.SetSilent(1);
        bomb.ReachLeft.SetSilent(2);
        bomb.ReachRight.SetSilent(0);

        BomberHatPile pile = manager.World.Commands.Create<BomberHatPileEntity>().Get<BomberHatPile>();
        pile.Count.SetSilent(7);

        BomberPickupItem pickup = manager.World.Commands.Create<BomberPickupItemEntity>().Get<BomberPickupItem>();
        pickup.Kind.SetSilent(1);

        manager.Tick();

        Assert.Single(manager.World.Each<BomberPlayerState>());
        Assert.Single(manager.World.Each<BomberBombState>());
        Assert.Single(manager.World.Each<BomberHatPile>());
        Assert.Single(manager.World.Each<BomberPickupItem>());

        byte[] snapshot = manager.CaptureSnapshot();
        Assert.True(snapshot.Length > 0);
    }

    private static byte[] RunFixedScenario()
    {
        using WorldManager manager = WorldManager.Create(GeneratedRegistry.Instance, InstanceId);
        manager.Start(Thread.CurrentThread);

        for (int i = 0; i < 3; i++)
        {
            var order = manager.World.Commands.Create<BomberPlayerEntity>();
            BomberPlayerState player = order.Get<BomberPlayerState>();
            player.HealthPoints.SetSilent(6);
            player.HatCount.SetSilent(i);
            manager.Tick();
        }

        foreach (BomberPlayerState player in manager.World.Each<BomberPlayerState>())
        {
            player.HealthPoints.SetSilent(player.HealthPoints.Value - 2);
        }

        manager.Tick();

        byte[] snapshot = manager.CaptureSnapshot();
        return SHA256.HashData(snapshot);
    }
}
