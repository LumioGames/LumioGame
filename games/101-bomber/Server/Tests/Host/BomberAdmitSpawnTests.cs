using System;
using System.Collections;
using System.IO;
using System.Reflection;
using System.Text.Json;
using Xunit;

namespace Lumio.Bomber.Server.HostTests;

/// <summary>
/// After Admit, a Bomber registry world must contain a live PlayerEntity plus
/// LogicTransform.
///
/// The Sample host guards are retained against this game's registry, config,
/// admission and restore paths. First-round Bomber abilities are deliberately
/// not ready; these cases verify their actual GAS rejection, not a played match.
///
/// <list type="number">
/// <item>the catalog bytes the host retains are a defensive copy, and mutating
/// the caller's array afterwards changes nothing;</item>
/// <item>a corrupted voxel half makes restore refuse, and the live
/// <c>Manager</c> identity does not change;</item>
/// <item>after a successful restore the <c>IngressBudget</c> object identity is
/// preserved while <c>Manager</c> is a new instance;</item>
/// <item>all five declared Bomber abilities reject through the live
/// <c>AbilityComponent</c> with <c>bomber_match_not_ready</c> before and after restore;</item>
/// <item>a <c>runtime-only</c> snapshot carries no <c>voxelBase64</c>;</item>
/// <item><c>Physics</c> is present exactly when the world profile is
/// <c>runtime+voxel</c>.</item>
/// </list>
///
/// HostEntry is one process-scoped Default ALC, so both cases carry
/// <c>[Trait("Isolation", "Process")]</c> and <c>Tools/test-server-host.mjs</c>
/// runs each of them in its own process — the same contract LumioServer's
/// <c>Tools/test-host-entry.mjs</c> <c>isolatedCases</c> manifest enforced.
/// </summary>
public sealed class BomberAdmitSpawnTests : IDisposable
{
    public BomberAdmitSpawnTests() => ShutdownHost();

    private readonly string? _configDirectory = Environment.GetEnvironmentVariable("LUMIO_CONFIG_DIR");

    public void Dispose()
    {
        try { ShutdownHost(); }
        finally { Environment.SetEnvironmentVariable("LUMIO_CONFIG_DIR", _configDirectory); }
    }

    private static void ShutdownHost()
    {
        JsonElement result = HostEntryBridge.Send("{\"op\":\"shutdown\"}", out string raw);
        Assert.True(result.GetProperty("ok").GetBoolean(), raw);
    }

    /// <summary>
    /// ADR-119 (SH/R-00733): the fixed admission-baseline region this boot request used to carry is
    /// retired — first delivery and release are now driven entirely by Runtime's per-connection Section
    /// subscription table (taken every tick), not by a Section box named at boot. Sending the old
    /// <c>voxelBaselineRegion</c> field here would now be rejected as an unknown/retired field.
    /// </summary>
    private const string VoxelProfileFields = ",\"worldProfile\":\"runtime+voxel\"";

    // ADR-123: the named three-path is the release's SDK/Managed, the set HostEntry was built with.
    private static (string Replication, string Ecs) RequireRuntime() => (
        Lumio.Bomber.Tests.EngineRelease.Require(Lumio.Bomber.Tests.EngineRelease.ReplicationAssembly, "the host wires Runtime from the named three-path"),
        Lumio.Bomber.Tests.EngineRelease.Require(Lumio.Bomber.Tests.EngineRelease.EcsAssembly, "the host wires Runtime from the named three-path"));

    private static string RequireBomberGameplayDll() => HostEntryBridge.Require(
        "LUMIO_BOMBER_GAMEPLAY_DLL",
        "this run's freshly built Bomber gameplay assembly; missing artifacts are not a passing combination");

    private static JsonElement Boot(string replication, string ecs, string registry, out string raw,
        bool voxel, string? catalog, string config, string? voxelSnapshot)
    {
        string request = "{\"op\":\"boot\",\"kernelConfig\":" + KernelConfigurationFixture.Json +
            ",\"replicationAssembly\":" + JsonSerializer.Serialize(replication) +
            ",\"ecsAssembly\":" + JsonSerializer.Serialize(ecs) +
            ",\"registryAssembly\":" + JsonSerializer.Serialize(registry) +
            ",\"configDir\":" + JsonSerializer.Serialize(config) +
            (voxel ? VoxelProfileFields : ",\"worldProfile\":\"runtime-only\"") +
            (catalog is null ? "" : ",\"voxelCatalogBase64\":" + JsonSerializer.Serialize(catalog)) +
            (voxelSnapshot is null ? "" : ",\"voxelSnapshotBase64\":" + JsonSerializer.Serialize(voxelSnapshot)) + "}";
        return HostEntryBridge.Send(request, out raw);
    }

    [Fact]
    [Trait("Isolation", "Process")]
    public void AdmitOnBomberRegistryRuntimeOnly() => AdmitOnBomberRegistryLeavesALivePlayerEntityWithLogicTransform(false);

    [Fact]
    [Trait("Isolation", "Process")]
    public void AdmitOnBomberRegistryWithVoxel() => AdmitOnBomberRegistryLeavesALivePlayerEntityWithLogicTransform(true);

    private static void AdmitOnBomberRegistryLeavesALivePlayerEntityWithLogicTransform(bool voxel)
    {
        (string replication, string ecs) = RequireRuntime();
        string bomber = RequireBomberGameplayDll();
        string config = HostEntryBridge.Require("LUMIO_CONFIG_DIR",
            "Bomber requires its matching per-end config export (Server/Config/Tables)");

        // HostEntry is one process-scoped Default ALC. Bomber's own bin/ carries
        // a second copy of Runtime assemblies; LoadFrom of that path after a
        // Username boot throws FileLoadException. Stage the gameplay dll next
        // to the same three-path this suite already loaded.
        string staging = StageBomberBesideRuntime(bomber, replication);
        try
        {
            string stagedBomber = Path.Combine(staging, "Lumio.Bomber.Gameplay.dll");
            string? fixture = voxel ? HostEntryBridge.Path("LUMIO_TEST_VOXEL_FIXTURE_DIR") : null;
            if (voxel)
            {
                Assert.True(!string.IsNullOrEmpty(fixture),
                    "LUMIO_TEST_VOXEL_FIXTURE_DIR is required: a real matching catalog/world fixture directory "
                    + "(catalog-world.json + catalog-world.capture) authored against this run's native image");
            }
            byte[]? catalogBytes = voxel ? File.ReadAllBytes(Path.Combine(fixture!, "catalog-world.json")) : null;
            string? catalog = voxel ? " \t" + Convert.ToBase64String(catalogBytes!) + "\r\n" : null;
            string? voxelSnapshot = voxel ? Convert.ToBase64String(File.ReadAllBytes(Path.Combine(fixture!, "catalog-world.capture"))) : null;
            JsonElement booted = Boot(replication, ecs, stagedBomber, out string bootRaw, voxel, catalog, config, voxelSnapshot);
            Assert.True(booted.GetProperty("ok").GetBoolean(), bootRaw);
            if (voxel)
            {
                byte[] retainedCopy = HostEntryBridge.ReadCatalogCopy();
                Assert.Equal(catalogBytes, retainedCopy);
                retainedCopy[0] ^= 0xff;
                Assert.Equal(catalogBytes, HostEntryBridge.ReadCatalogCopy());
            }

            ulong before = HostEntryBridge.ReadWorldTick();

            JsonElement enqueued = HostEntryBridge.Send(
                "{\"op\":\"enqueue\",\"messageType\":\"AdmitConnectionMessage\",\"connection\":\"c-bomber-1\",\"accountId\":\"acct-bomber-1\",\"roomId\":\"room-a\",\"entityType\":\"PlayerEntity\"}",
                out string enqueueRaw);
            Assert.True(enqueued.GetProperty("ok").GetBoolean(), enqueueRaw);
            Assert.Equal(before, HostEntryBridge.ReadWorldTick());

            JsonElement ticked = HostEntryBridge.Send("{\"op\":\"tick\"}", out string tickRaw);
            Assert.True(ticked.GetProperty("ok").GetBoolean(), tickRaw);
            Assert.Equal(before + 1, ticked.GetProperty("appliedTick").GetUInt64());

            object admittedId = AssertLivePlayerWithLogicTransform("acct-bomber-1");
            object attributes = BomberComponent("acct-bomber-1", "AttributeComponent");
            object manager = HostEntryBridge.ReadManager();
            object world = manager.GetType().GetProperty("World")!.GetValue(manager)!;
            object gameplayConfig = world.GetType().GetProperty("GameplayConfig")!.GetValue(world)!;
            Assembly gameplay = Assembly.LoadFrom(stagedBomber);
            Type configContract = gameplay.GetType("Lumio.Bomber.Gameplay.Config.IBomberConfig", throwOnError: true)!;
            object healthRow = configContract.GetMethod("Attribute")!.Invoke(gameplayConfig, new object[] { "HealthPoints" })!;
            string health = (string)healthRow.GetType().GetProperty("Name")!.GetValue(healthRow)!;
            long initialHealth = (long)healthRow.GetType().GetProperty("Initial")!.GetValue(healthRow)!;
            long minimumHealth = (long)healthRow.GetType().GetProperty("Minimum")!.GetValue(healthRow)!;
            long savedHealth = Math.Max(minimumHealth, initialHealth - 1);
            Assert.NotEqual(initialHealth, savedHealth);
            Assert.Equal(initialHealth, ReadBaseValue(attributes, health));
            attributes.GetType().GetMethod("SetBaseValue")!.Invoke(attributes, new object[] { health, savedHealth });
            AssertBomberAbilitiesNotReady(gameplay, admittedId, voxel);
            JsonElement snapshot = HostEntryBridge.Send("{\"op\":\"snapshot\"}", out string snapshotRaw);
            Assert.True(snapshot.GetProperty("ok").GetBoolean(), snapshotRaw);
            var restoreRequest = new System.Collections.Generic.Dictionary<string, object?> {
                ["op"] = "restore", ["registryAssembly"] = stagedBomber, ["roomId"] = "room-a",
                ["bytesBase64"] = snapshot.GetProperty("bytesBase64").GetString(),
            };
            if (voxel) restoreRequest["voxelBase64"] = snapshot.GetProperty("voxelBase64").GetString();
            else Assert.False(snapshot.TryGetProperty("voxelBase64", out _));
            object oldManager = HostEntryBridge.ReadManager();
            object oldBudget = oldManager.GetType().GetProperty("IngressBudget")!.GetValue(oldManager)!;
            if (voxel)
            {
                object? validVoxel = restoreRequest["voxelBase64"];
                restoreRequest["voxelBase64"] = "AQ==";
                JsonElement refused = HostEntryBridge.Send(JsonSerializer.Serialize(restoreRequest), out string refusedRaw);
                Assert.False(refused.GetProperty("ok").GetBoolean(), refusedRaw);
                Assert.Same(oldManager, HostEntryBridge.ReadManager());
                Assert.Equal(catalogBytes, HostEntryBridge.ReadCatalogCopy());
                restoreRequest["voxelBase64"] = validVoxel;
            }
            JsonElement restored = HostEntryBridge.Send(JsonSerializer.Serialize(restoreRequest), out string restoreRaw);
            Assert.True(restored.GetProperty("ok").GetBoolean(), restoreRaw);
            Assert.NotSame(oldManager, HostEntryBridge.ReadManager());
            Assert.Same(oldBudget, HostEntryBridge.ReadManager().GetType().GetProperty("IngressBudget")!.GetValue(HostEntryBridge.ReadManager()));
            Assert.Equal(admittedId, AssertLivePlayerWithLogicTransform("acct-bomber-1"));
            if (voxel)
            {
                Assert.Equal(catalogBytes, HostEntryBridge.ReadCatalogCopy());
            }
            object hydratedAttributes = BomberComponent("acct-bomber-1", "AttributeComponent");
            Assert.Equal(savedHealth, ReadBaseValue(hydratedAttributes, health));
            AssertBomberAbilitiesNotReady(gameplay, admittedId, voxel);
            Assert.Equal(savedHealth, ReadBaseValue(hydratedAttributes, health));
            Assert.True(HostEntryBridge.Send("{\"op\":\"tick\"}", out tickRaw).GetProperty("ok").GetBoolean(), tickRaw);
        }
        finally
        {
            try { Directory.Delete(staging, recursive: true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static long ReadBaseValue(object attributes, string name) =>
        (long)attributes.GetType().GetMethod("GetBaseValue")!.Invoke(attributes, new object[] { name })!;

    private static void AssertBomberAbilitiesNotReady(Assembly gameplay, object playerId, bool voxel)
    {
        object component = BomberComponent("acct-bomber-1", "AbilityComponent");
        Type componentType = component.GetType();
        if (voxel) Assert.NotNull(componentType.GetProperty("Physics")!.GetValue(component));
        else Assert.Null(componentType.GetProperty("Physics")!.GetValue(component));

        MethodInfo activate = componentType.GetMethod("Activate")!;
        var typeIds = new System.Collections.Generic.HashSet<uint>();
        string[] names = { "MoveAbility", "PlaceBombAbility", "PickupAbility", "UseActiveSkillAbility", "SelectCharacterAbility" };
        ulong sequence = 1;
        foreach (string name in names)
        {
            Type ability = gameplay.GetType("Lumio.Bomber.Gameplay." + name, throwOnError: true)!;
            uint typeId = (uint)ability.GetField("TypeId")!.GetRawConstantValue()!;
            Assert.NotEqual(0u, typeId);
            Assert.True(typeIds.Add(typeId), "Each Bomber ability must have a distinct registered identity.");
            Type inputType = ability.GetNestedType("Input")!;
            object input = Activator.CreateInstance(inputType)!;
            if (name == "PickupAbility") inputType.GetField("Target")!.SetValue(input, playerId);

            object result = activate.MakeGenericMethod(ability, inputType).Invoke(component, new[] { input, (object)sequence })!;
            Type resultType = result.GetType();
            Assert.False((bool)resultType.GetProperty("Succeeded")!.GetValue(result)!, name);
            Assert.Equal("Rejected", resultType.GetProperty("State")!.GetValue(result)!.ToString());
            Assert.Equal("bomber_match_not_ready", resultType.GetProperty("FailureCode")!.GetValue(result));
            Assert.True((int)resultType.GetProperty("RejectedStep")!.GetValue(result)! > 0, name);
            Assert.Equal(sequence, resultType.GetProperty("Sequence")!.GetValue(result));
            Assert.Equal(0, componentType.GetProperty("Count")!.GetValue(component));
            sequence++;
        }
    }

    /// <summary>
    /// Copy BomberGameplay.dll into a temp directory that already has the
    /// Runtime siblings from the named three-path, so LoadFrom does not pick
    /// a second MVID of Command/Ecs/Replication.
    /// </summary>
    private static string StageBomberBesideRuntime(string bomberDll, string replication)
    {
        string staging = Path.Combine(Path.GetTempPath(), "lumio-bomber-admit-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(staging);
        string runtimeDir = Path.GetDirectoryName(replication)!;
        foreach (string file in Directory.GetFiles(runtimeDir, "*.dll"))
            File.Copy(file, Path.Combine(staging, Path.GetFileName(file)), overwrite: true);
        File.Copy(bomberDll, Path.Combine(staging, "Lumio.Bomber.Gameplay.dll"), overwrite: true);
        return staging;
    }

    private static object BomberComponent(string accountId, string name)
    {
        object manager = HostEntryBridge.ReadManager();
        object world = manager.GetType().GetProperty("World")!.GetValue(manager)!;
        MethodInfo account = world.GetType().GetMethod("TryGetAccount")!;
        Type idType = account.GetParameters()[1].ParameterType;
        object?[] arguments = { accountId, Activator.CreateInstance(idType.IsByRef ? idType.GetElementType()! : idType) };
        Assert.True((bool)account.Invoke(world, arguments)!);
        return world.GetType().GetMethod("NamedComponent")!.Invoke(world, new[] { arguments[1], name })!;
    }

    private static object AssertLivePlayerWithLogicTransform(string accountId)
    {
        object manager = HostEntryBridge.ReadManager();
        object world = manager.GetType().GetProperty("World")!.GetValue(manager)!;
        Type worldType = world.GetType();
        MethodInfo tryGetAccount = worldType.GetMethod("TryGetAccount")
            ?? throw new MissingMethodException(worldType.FullName, "TryGetAccount");
        object[] tryGet = new object[2];
        tryGet[0] = accountId;
        Type idType = tryGetAccount.GetParameters()[1].ParameterType;
        tryGet[1] = Activator.CreateInstance(idType.IsByRef ? idType.GetElementType()! : idType)!;
        bool found = (bool)tryGetAccount.Invoke(world, tryGet)!;
        Assert.True(found, "TryGetAccount must find the admitted Bomber player " + accountId);
        object accountEntity = tryGet[1];
        Assert.False((bool)accountEntity.GetType().GetProperty("IsDefault")!.GetValue(accountEntity)!);
        Assert.True((bool)worldType.GetMethod("IsLive")!.Invoke(world, new[] { accountEntity })!);
        string fullIdentity = (string)accountEntity.GetType().GetMethod("ToHex")!.Invoke(accountEntity, null)!;
        Assert.Equal(32, fullIdentity.Length);
        Assert.Equal(accountEntity, accountEntity.GetType().GetMethod("Parse")!.Invoke(null, new object[] { fullIdentity }));

        object issued = worldType.GetProperty("IssuedIds")!.GetValue(world)!;
        object? playerId = null;
        object? playerType = null;
        MethodInfo typeOf = worldType.GetMethod("TypeOf")!;
        foreach (object id in (IEnumerable)issued)
        {
            object typeRef = typeOf.Invoke(world, new[] { id })!;
            Type clr = (Type)typeRef.GetType().GetProperty("ClrType")!.GetValue(typeRef)!;
            if (string.Equals(clr.Name, "PlayerEntity", StringComparison.Ordinal)
                || string.Equals(clr.FullName, "Lumio.Bomber.Gameplay.EntityTypes.PlayerEntity", StringComparison.Ordinal))
            {
                playerId = id;
                playerType = clr;
                break;
            }
        }
        Assert.NotNull(playerId);
        Assert.NotNull(playerType);
        Assert.Equal(accountEntity, playerId);

        MethodInfo named = worldType.GetMethod("NamedComponent")!;
        object? transform = named.Invoke(world, new[] { playerId, "LogicTransform" });
        Assert.NotNull(transform);
        Assert.Equal("LogicTransform", transform!.GetType().Name);
        return accountEntity;
    }
}
