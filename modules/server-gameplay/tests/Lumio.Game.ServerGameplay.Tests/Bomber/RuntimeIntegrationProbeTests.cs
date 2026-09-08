using System;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;
using System.Threading;
using Lumio.Game.ServerGameplay.Bomber.Contracts;
using Lumio.Game.ServerGameplay.Bomber.Contracts.Components;
using Lumio.Game.ServerGameplay.Bomber.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Simulation;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests.Bomber;

/// <summary>
/// G-0 Runtime 接入核验（design.md §16 Gate 0；ADR 0013/0014/0021）：证明 Game 可以定义并注册全新的
/// EcsRegistry/EntityType/Component（不复用 Username 样例），四种 CS 实体各挂 Runtime 的
/// <see cref="LogicTransform"/> 且位置进快照，并且同一 Seed 起点 + 同一命令序列在两个独立 World 上重放，
/// 产出逐字节相等的快照——这是 Stage 0「同 Seed + Config + 命令流可重放」确定性门的最小可运行证据。
/// 结论写入 docs/specs/bomber/stage0-kernel-contract.md §0。
/// </summary>
public sealed class RuntimeIntegrationProbeTests
{
    private const ulong InstanceId = 0x424F4D4245520001UL; // "BOMBER" 前缀 + 0001

    [Fact]
    public void CustomComponentRegistersAndParticipatesInSnapshot()
    {
        using WorldManager manager = BootProbeWorld();

        BomberMatchState world = manager.World.Single<BomberMatchState>();
        Assert.NotNull(world);

        var order = manager.World.Commands.Create<BomberPlayerEntity>();
        BomberPlayerState player = order.Get<BomberPlayerState>();
        player.HatCount.SetSilent(0);

        manager.Tick();

        BomberPlayerState[] players = manager.World.Each<BomberPlayerState>().ToArray();
        Assert.Single(players);
        Assert.Equal(0, players[0].HatCount.Value);

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

    /// <summary>
    /// 契约 v2.0.0 §1.1：四种 CS 实体各挂 <see cref="LogicTransform"/>（位置的唯一真值），
    /// World 实体不挂。五种实体全部注册、创建、Tick、入快照。
    /// </summary>
    [Fact]
    public void AllFiveEntityTypesRegisterCreateAndParticipateInSnapshot()
    {
        using WorldManager manager = BootProbeWorld();

        manager.World.Single<BomberMatchState>().MatchTick.SetSilent(0);

        var playerOrder = manager.World.Commands.Create<BomberPlayerEntity>();
        playerOrder.Get<BomberPlayerState>().HatCount.SetSilent(3);

        var bombOrder = manager.World.Commands.Create<BomberBombEntity>();
        BomberBombState bomb = bombOrder.Get<BomberBombState>();
        bomb.FuseEndTick.SetSilent(42);
        bomb.Power.SetSilent(2);
        bomb.BombKind.SetSilent(0);
        bomb.ExplodedAtTick.SetSilent(42);
        bomb.DangerUntilTick.SetSilent(49);
        bomb.BurnUntilTick.SetSilent(49);
        bomb.ReachUp.SetSilent(2);
        bomb.ReachDown.SetSilent(1);
        bomb.ReachLeft.SetSilent(2);
        bomb.ReachRight.SetSilent(0);

        var pileOrder = manager.World.Commands.Create<BomberHatPileEntity>();
        pileOrder.Get<BomberHatPile>().Count.SetSilent(7);

        var pickupOrder = manager.World.Commands.Create<BomberPickupItemEntity>();
        pickupOrder.Get<BomberPickupItem>().Kind.SetSilent(1);

        // 结构单要先提交，实体号才发出来；位置只能写在活实体上（见 PlaceAt）。
        manager.Tick();

        PlaceAt(manager, playerOrder.Get<LogicTransform>(), new Vector3(1.5f, 1f, 2.5f));
        PlaceAt(manager, bombOrder.Get<LogicTransform>(), new Vector3(5.5f, 1f, 5.5f));
        PlaceAt(manager, pileOrder.Get<LogicTransform>(), new Vector3(3.5f, 1f, 4.5f));
        PlaceAt(manager, pickupOrder.Get<LogicTransform>(), new Vector3(7.5f, 1f, 8.5f));

        manager.Tick();

        Assert.Single(manager.World.Each<BomberPlayerState>());
        Assert.Single(manager.World.Each<BomberBombState>());
        Assert.Single(manager.World.Each<BomberHatPile>());
        Assert.Single(manager.World.Each<BomberPickupItem>());

        // 四种 CS 实体的位置真值都在 LogicTransform 上，读回与写入一致。
        Assert.Equal(new Vector3(1.5f, 1f, 2.5f), playerOrder.Get<LogicTransform>().WorldPosition);
        Assert.Equal(new Vector3(5.5f, 1f, 5.5f), bombOrder.Get<LogicTransform>().WorldPosition);
        Assert.Equal(new Vector3(3.5f, 1f, 4.5f), pileOrder.Get<LogicTransform>().WorldPosition);
        Assert.Equal(new Vector3(7.5f, 1f, 8.5f), pickupOrder.Get<LogicTransform>().WorldPosition);

        byte[] snapshot = manager.CaptureSnapshot();
        Assert.True(snapshot.Length > 0);
    }

    /// <summary>
    /// 契约 v2.0.0 §6.2：位置真值在 <see cref="LogicTransform"/> 上，随 CaptureSnapshot() 一起拍到，
    /// 所以 StateHash 不需要单独哈希位置。反向断言——**只改位置、别的都不动**，快照哈希必须变；
    /// 否则「位置进快照」是假的，同 Seed 回放对移动完全失效。
    /// </summary>
    [Fact]
    public void LogicTransformPositionEntersSnapshotHash()
    {
        byte[] atOrigin = RunSinglePlayerAt(new Vector3(1.5f, 1f, 1.5f));
        byte[] movedOneCell = RunSinglePlayerAt(new Vector3(2.5f, 1f, 1.5f));

        Assert.NotEqual(Convert.ToHexString(atOrigin), Convert.ToHexString(movedOneCell));
    }

    private static byte[] RunSinglePlayerAt(Vector3 position)
    {
        using WorldManager manager = BootProbeWorld();

        var order = manager.World.Commands.Create<BomberPlayerEntity>();
        order.Get<BomberPlayerState>().HatCount.SetSilent(0);

        manager.Tick();
        PlaceAt(manager, order.Get<LogicTransform>(), position);
        manager.Tick();

        return SHA256.HashData(manager.CaptureSnapshot());
    }

    private static byte[] RunFixedScenario()
    {
        using WorldManager manager = BootProbeWorld();

        for (int i = 0; i < 3; i++)
        {
            var order = manager.World.Commands.Create<BomberPlayerEntity>();
            order.Get<BomberPlayerState>().HatCount.SetSilent(i);
            manager.Tick();
            PlaceAt(manager, order.Get<LogicTransform>(), new Vector3(i + 0.5f, 1f, 0.5f));
            manager.Tick();
        }

        foreach (BomberPlayerState player in manager.World.Each<BomberPlayerState>())
        {
            player.HatCount.SetSilent(player.HatCount.Value + 1);
        }

        manager.Tick();

        byte[] snapshot = manager.CaptureSnapshot();
        return SHA256.HashData(snapshot);
    }

    /// <summary>
    /// 探针世界的启动序列，与 Runtime 宿主样例 ServerBootstrap.Boot 同序：Create → Start（记线程归属）
    /// → WorldTickBinding.Bind（把 13 相 tick loop 挂上）。Tick() 只经绑定的 tick loop 跑 13 相，
    /// 未绑定即拒绝，所以四个用例共用这一份，别再各自手抄启动序列。
    /// </summary>
    private static WorldManager BootProbeWorld()
    {
        WorldManager manager = WorldManager.Create(GeneratedRegistry.Instance, InstanceId);
        manager.Start(Thread.CurrentThread);
        WorldTickBinding.Bind(manager);
        return manager;
    }

    /// <summary>
    /// 位置只能经注册的 TransformController 在写作用域里改（Runtime 纪律，见 LogicTransform.BeginWrite），
    /// 且实体必须已经是活的——`Commands.Create` 只是下结构单，实体号要等提交相发出来，
    /// 所以调用点一律排在 Tick() 之后。玩法里这个 controller 归移动技能；
    /// 探针里用一个固定来源名，保证两次运行逐字节一致。
    /// </summary>
    private static void PlaceAt(WorldManager manager, LogicTransform transform, Vector3 position)
    {
        TransformController controller = manager.World.RegisterTransformController(transform.Entity, "probe");
        using (transform.BeginWrite(controller))
        {
            transform.SetWorldPosition(position);
        }
    }
}
