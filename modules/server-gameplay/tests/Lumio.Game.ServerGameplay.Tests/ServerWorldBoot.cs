using System;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Hosting;
using Xunit;
using Xunit.v3;

[assembly: AssemblyFixture(typeof(Lumio.Game.ServerGameplay.Tests.ServerEngineFixture))]
[assembly: Parallelization(Mode = Xunit.Sdk.ParallelMode.None)]

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>
/// 本仓测试的服务器世界启动与准入，只用 Runtime 生产 API（ADR-117：游戏不借引擎测试夹具的宿主样例）。
/// 进程级 Engine 由测试 fixture 持有；<c>LumioEngine.CreateWorld</c> 负责真实空间索引、体素、GAS 与 13 相 tick loop。
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
    /// 哪天本仓声明了配置契约，创建会以 <see cref="WorldConfigBindingException"/> 拒绝，这里必须随之补上真实绑定。
    /// </summary>
    internal static WorldManager Boot(ulong instanceId)
    {
        ServerEngineFixture fixture = TestContext.Current.GetFixture<ServerEngineFixture>().AsTask().GetAwaiter().GetResult()
            ?? throw new InvalidOperationException("Server engine assembly fixture is required.");
        WorldManager manager = fixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
        {
            InstanceId = instanceId,
            Catalog = """
                {"version":2,"retiredNames":[],"shapeTable":{},"rows":[{"blockType":256,"name":"game.test.solid","materialClass":"Solid","behaviorTemplate":"FullCube","assetRef":"game.test.asset","stateLayout":{},"lightEmission":"000"}]}
                """u8.ToArray(),
        });
        // 专用服务器世界不得静默跳过空间索引提交。
        manager.RequireBoundSpatialIndex();
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

/// <summary>Owns one real native engine for the serial test process, opened only by native tests.</summary>
public sealed class ServerEngineFixture : IDisposable
{
    private LumioEngine? _engine;

    internal LumioEngine Engine => _engine ??= LumioEngine.Start(
        Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")
            ?? throw new InvalidOperationException(
                "LUMIO_ENGINE_NATIVE_MISSING: build the native engine and set LUMIO_ENGINE_NATIVE_PATH."),
        ServerWorldBoot.KernelLimits);

    /// <summary>Closes the process context after each test has disposed its own world.</summary>
    public void Dispose()
    {
        if (_engine is null) return;
        if (_engine.WorldCount != 0)
            throw new InvalidOperationException("A server gameplay test retained a live world.");
        _engine.Dispose();
    }
}
