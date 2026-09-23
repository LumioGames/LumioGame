using System;
using System.Threading;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Simulation;

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>
/// 本仓测试的服务器世界启动与准入，只用 Runtime 生产 API（ADR-117：游戏不借引擎测试夹具的宿主样例）。
/// 顺序：<c>WorldManager.Create</c> → <c>Start</c>（记 Owner Thread）→ 绑定每世界一份的 Native Context
/// （空间索引与 lumio-hfsm 都挂在它上面）→ <c>WorldTickBinding.Bind</c>（13 相 tick loop）。
/// </summary>
internal static class ServerWorldBoot
{
    /// <summary>
    /// 每个测试世界的 Native Context 上限。取值同 LumioSample 游戏侧测试的 KernelConfigurationFixture；
    /// 测试世界只放少量实体、不跑 Job，这组上限留足余量。
    /// </summary>
    internal static KernelConfig KernelLimits => new()
    {
        MaxContexts = 64,
        MaxHandles = 4096,
        MaxNativeBytes = 67_108_864,
        MaxJobsQueued = 256,
        MaxJobsRunning = 4,
        MaxCompletionItems = 1_024,
        LogMailboxCapacity = 8_192,
    };

    /// <summary>
    /// 建一个已开跑的服务器世界。本仓注册表不声明玩法配置契约
    /// （<see cref="EcsRegistry.RequiredGameplayConfigContract"/> 为 null，<c>ChatComponentSchemaTests</c> 钉住），
    /// 此时 Runtime 只接受「不带 WorldConfigBinding」的创建——声明与绑定必须一致，所以这里不传 config。
    /// 哪天本仓声明了配置契约，Create 会以 <see cref="WorldConfigBindingException"/> 拒绝，这里必须随之补上真实绑定。
    /// </summary>
    internal static WorldManager Boot(ulong instanceId)
    {
        WorldManager manager = WorldManager.Create(GeneratedRegistry.Instance, instanceId);
        try
        {
            manager.Start(Thread.CurrentThread);
            if (!manager.TryBindNativeSpatialIndex(KernelLimits))
            {
                throw new InvalidOperationException(
                    "LUMIO_ENGINE_NATIVE_MISSING: the server world needs liblumio_engine_native (spatial index and lumio-hfsm). "
                    + "Build it in LumioGameEngine with `node eng/dev-build.mjs --hfsm-test-support` and export its NATIVE_PATH "
                    + "as LUMIO_ENGINE_NATIVE_PATH.");
            }

            // 专用服务器世界不得静默跳过空间索引提交（与 Runtime DedicatedServerHostBinding 同口径）。
            manager.RequireBoundSpatialIndex();
            WorldTickBinding.Bind(manager);
        }
        catch
        {
            manager.Dispose();
            throw;
        }

        return manager;
    }

    /// <summary>
    /// 准入下单建一个 <see cref="PlayerEntity"/>：出生写账号（服务器私有），观察者标记为已连接。
    /// NetEntityId 在下一次 Tick 的提交相由世界发出。
    /// </summary>
    internal static EntityOrder AdmitPlayer(WorldManager manager, string accountId)
    {
        EntityOrder order = manager.World.Commands.Create<PlayerEntity>();
        order.Get<IdentityComponent>().AccountId.Value = accountId;
        ObserverComponent observer = order.Get<ObserverComponent>();
        observer.Connected = true;
        observer.ConnectionGeneration = 1;
        return order;
    }
}
