using System;
using System.IO;
using System.Linq;
using System.Threading;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Simulation;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Persistence;
using Lumio.Engine.SDK;
using Lumio.Bomber.Gameplay.Components.Identity;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.EntityTypes;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[CollectionDefinition("BomberWorld", DisableParallelization = true)]
public sealed class BomberWorldSerialDefinition : ICollectionFixture<BomberWorldNativeFixture> { }

public sealed class BomberWorldNativeFixture : IDisposable
{
    internal static LumioEngine Engine { get; private set; } = null!;
    private readonly string? _previousConfig = Environment.GetEnvironmentVariable(BomberTables.ConfigDirVariable);
    public BomberWorldNativeFixture()
    {
        Environment.SetEnvironmentVariable(BomberTables.ConfigDirVariable, Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server", "Config", "Tables"));
        Engine = LumioEngine.Start(Lumio.Bomber.Tests.EngineRelease.NativeLibrary, KernelConfigurationFixture.Create());
    }
    public void Dispose()
    {
        Engine.Dispose();
        Environment.SetEnvironmentVariable(BomberTables.ConfigDirVariable, _previousConfig);
    }
}

internal static class BomberTestWorld
{
    internal static WorldManager Start(ulong instance = 101, string? configDirectory = null,
        bool withMap = false, WorldIngressBudget? budget = null, uint receiptLimit = 256, bool persistence = false, BomberAdmissionFixture? admission = null)
    {
        WorldManager manager = Create(GeneratedRegistry.Instance, instance,
            BomberConfigBinding.Load(configDirectory), withMap, budget, receiptLimit, persistence, admission);
        manager.RequireBoundSpatialIndex();
        return manager;
    }

    internal static WorldManager Create(EcsRegistry registry, ulong? instance = null,
        WorldConfigBinding? config = null, bool withMap = false, WorldIngressBudget? budget = null, uint receiptLimit = 256, bool persistence = false, BomberAdmissionFixture? admission = null) =>
        BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(registry)
        {
            InstanceId = instance, Config = config, IngressBudget = budget,
            Catalog = ReadMap("official-catalog.json"), ReceiptEntries = receiptLimit,
            InitialVoxelSnapshot = withMap ? ReadMap("bomber.voxel") : ReadOnlyMemory<byte>.Empty,
            TickRate = registry.Side == RegistrySide.Server ? checked((uint)registry.DeclaredTickRateHz) : null,
            Subsystems = (persistence ? new IWorldSubsystem[] { new WorldPersistenceSubsystem() } : Array.Empty<IWorldSubsystem>())
                .Concat(admission is null ? Array.Empty<IWorldSubsystem>() : new IWorldSubsystem[] { admission.Sections, admission }).ToArray(),
        });

    internal static WorldManager RestorePaired(DualCutCheckpointPayload checkpoint) =>
        BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
        {
            InstanceId = 1, Config = BomberConfigBinding.Load(), Catalog = ReadMap("official-catalog.json"),
            Snapshot = checkpoint.Runtime, VoxelSnapshot = checkpoint.Voxel,
            Subsystems = new IWorldSubsystem[] { new WorldPersistenceSubsystem() },
        });

    internal static void LoadTerrainMap(WorldManager manager, bool openInterior = false)
    {
        var native = NativeWorldVoxelResources.Require(manager).Voxel;
        native.Restore(ReadMap("bomber.voxel"));
        if (!openInterior) return;
        var map = BomberConfigBinding.For(manager.World).Map;
        var writes = new System.Collections.Generic.List<VoxelBlockWriteEntry>();
        for (int z = map.BoundaryCells; z < map.Depth - map.BoundaryCells; z++)
        for (int x = map.BoundaryCells; x < map.Width - map.BoundaryCells; x++)
        {
            var before = native.ReadCell(new VoxelWorldCoordinate(x, 1, z));
            writes.Add(new(new VoxelSectionKey(x >> 4, 0, z >> 4), (ushort)(256 + ((z & 15) << 4) + (x & 15)), 0, before.SectionRevision));
        }
        using var token = native.PrepareWriteV2(990716, writes.ToArray(), Array.Empty<VoxelBindingMutationEntry>());
        var limits = native.GetOutputRequirements(token);
        Assert.Equal(0, native.CommitV3(token, new VoxelWriteReceipt[limits.SectionCapacity], new byte[limits.ReceiptByteCapacity]).Status);
    }

    // These cases validate the ECS serialization cut. Coupled runtime/voxel recovery
    // uses the public paired checkpoint options in its separate integration cases.
    internal static WorldManager Restore(byte[] snapshot, EcsRegistry registry, WorldConfigBinding? config = null) =>
        BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(registry)
        {
            // The owner needs an authority candidate id before decoding; hydration restores
            // the persisted InstanceId and these tests continue asserting that exact identity.
            InstanceId = registry.Side == RegistrySide.Server ? 1UL : null,
            Config = config, Catalog = ReadMap("official-catalog.json"), RuntimeOnlySnapshot = snapshot,
        });

    internal static T AssertOwnerFailure<T>(Action create) where T : Exception
    {
        EngineHostException failure = Assert.Throws<EngineHostException>(create);
        Assert.Equal(Lumio.Wire.EngineHostErrorCodes.WorldInitializationFailed, failure.Code);
        return Assert.IsType<T>(failure.InnerException);
    }

    private static byte[] ReadMap(string file) => File.ReadAllBytes(Path.Combine(
        Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server", "Assets", "Maps", file));

    internal static EntityOrder QueuePlayer(World world, string account)
    {
        EntityOrder order = world.Commands.Create<PlayerEntity>();
        EcsRegistry.Generated(order.Get<IdentityComponent>())!.WriteField("accountId", account, silent: true);
        return order;
    }
}

[Collection("BomberWorld")]
public sealed class BomberWiringTests
{
    [Fact]
    public void EightPlayerEntitiesUseTheSameDeclarationAndRealWorldTick()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder[] orders = Enumerable.Range(0, 8).Select(i => BomberTestWorld.QueuePlayer(manager.World, "foundation-" + i)).ToArray();
        ulong before = manager.World.Tick;
        Assert.All(orders, order => Assert.Equal(0UL, order.AssignedId.Counter));
        manager.Tick();
        Assert.Equal(before + 1, manager.World.Tick);
        Assert.Equal(8, manager.World.Each<BomberPlayerState>().Count());
        Assert.Equal(8, orders.Select(order => order.AssignedId).Distinct().Count());
        foreach (EntityOrder order in orders)
        {
            Assert.True(manager.World.TypeOf(order.AssignedId).Is<PlayerEntity>());
            Assert.NotNull(manager.World.Get<LogicTransform>(order.AssignedId));
            Assert.NotNull(manager.World.Get<AbilityComponent>(order.AssignedId));
            Assert.NotNull(manager.World.Get<EffectComponent>(order.AssignedId));
            Assert.NotNull(manager.World.Get<BomberSkillState>(order.AssignedId));
        }
    }

    [Theory]
    [InlineData("HealthPoints", 6)]
    [InlineData("BombPower", 2)]
    [InlineData("BombCapacity", 1)]
    [InlineData("AvailableBombs", 1)]
    [InlineData("SpeedTier", 0)]
    [InlineData("MovementSpeedMilli", 3500)]
    public void BothLedgersSeedFromTheCurrentDesign(string attribute, long expected)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "attributes");
        manager.Tick();
        AttributeComponent ledger = manager.World.Get<AttributeComponent>(player.AssignedId);
        Assert.Equal(expected, ledger.GetBaseValue(attribute));
        Assert.Equal(expected, ledger.GetCurrentValue(attribute));
        Assert.Equal(6, ledger.AttributeNames.Count);
        Assert.DoesNotContain("Stamina", ledger.AttributeNames);
        Assert.DoesNotContain("Ore", ledger.AttributeNames);
    }

    [Fact]
    public void GameplayCatalogHasDistinctAbilityIds()
    {
        using WorldManager manager = BomberTestWorld.Start();
        GasTypeRegistry registry = GasWorldContext.Require(manager.World).Types;
        uint[] ids = {
            registry.TypeIdOf(typeof(MoveAbility)),
            registry.TypeIdOf(typeof(PlaceBombAbility)),
            registry.TypeIdOf(typeof(PickupAbility)),
            registry.TypeIdOf(typeof(UseActiveSkillAbility)),
            registry.TypeIdOf(typeof(SelectCharacterAbility))
        };
        Assert.Equal(5, ids.Distinct().Count());
        Assert.DoesNotContain(0u, ids);
        Assert.Equal(new uint[] { 1, 2, 3, 4, 5 }, ids);
        Assert.True(registry.IsFrozen);
    }

    [Fact]
    public void GameplayCatalogRegistersAllEffectTypes()
    {
        using WorldManager manager = BomberTestWorld.Start();
        GasTypeRegistry registry = GasWorldContext.Require(manager.World).Types;
        Assert.Equal(10101u, registry.EffectTypeIdOf(typeof(BomberDamageEffect)));
        Assert.Equal(10102u, registry.EffectTypeIdOf(typeof(BomberHealEffect)));
        Assert.Equal(10103u, registry.EffectTypeIdOf(typeof(BomberRestoreHealthEffect)));
        Assert.Equal(10104u, registry.EffectTypeIdOf(typeof(BomberNewMatchEffect)));
        Assert.Equal(10105u, registry.EffectTypeIdOf(typeof(BomberSuccessorRestoreEffect)));
        Assert.Equal(10106u, registry.EffectTypeIdOf(typeof(BomberInventoryEffect)));
        Assert.Equal(10107u, registry.EffectTypeIdOf(typeof(BomberBubbleEffect)));
        Assert.Equal(10108u, registry.EffectTypeIdOf(typeof(BomberFreezeEffect)));
        Assert.Equal(10109u, registry.EffectTypeIdOf(typeof(BomberFreezeImmunityEffect)));
        Assert.Equal(10110u, registry.EffectTypeIdOf(typeof(BomberBurnDamageEffect)));
        Assert.Equal(10111u, registry.EffectTypeIdOf(typeof(BomberFireAuraEffect)));
        Assert.Equal(10112u, registry.EffectTypeIdOf(typeof(BomberFireZoneLifetimeEffect)));
        uint[] ids = registry.EnumerateEffectsCanonical().Select(id => id.Value).ToArray();
        Assert.Equal(12, ids.Length);
        Assert.Equal(12, ids.Distinct().Count());
        Assert.DoesNotContain(0u, ids);
        Assert.Equal(Enumerable.Range(10101, 12).Select(id => (uint)id), ids);
        Assert.True(registry.IsFrozen);
    }
}
