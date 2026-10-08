using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;
using Lumio.Client.Gameplay.ECS;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Simulation;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

/// <summary>Loads the actual client compilation while the test also hosts server gameplay.</summary>
internal sealed class BomberJournalReplicaFactory : IDisposable
{
    private readonly AssemblyLoadContext _context = new("bomber-journal-client", isCollectible: true);
    private readonly EcsRegistry _registry;
    private readonly MethodInfo _loadConfig;
    private readonly MethodInfo _journal;
    private readonly FieldInfo _entries;
    private readonly MethodInfo _skill;
    private readonly FieldInfo _frozenUntil;
    private readonly FieldInfo _immuneUntil;
    private readonly List<IClientReplica> _replicas = new();
    private readonly NativeEngineLease _native;

    internal BomberJournalReplicaFactory()
    {
        string root = Lumio.Bomber.Tests.EngineRelease.RepoRoot;
        string clientPath = Environment.GetEnvironmentVariable("LUMIO_BOMBER_CLIENT_GAMEPLAY")
            ?? Path.Combine(root, "Gameplay", "bin", "Debug", "net10.0-client", "Lumio.Bomber.Gameplay.dll");
        if (!File.Exists(clientPath))
            throw new InvalidOperationException("Build Gameplay/Lumio.Bomber.Gameplay.csproj with -p:LumioEcsSide=client before this replica test, or set LUMIO_BOMBER_CLIENT_GAMEPLAY: " + clientPath);
        Assembly client = _context.LoadFromAssemblyPath(Path.GetFullPath(clientPath));
        Type registryType = client.GetType("Lumio.Bomber.Gameplay.GeneratedRegistry", throwOnError: true)!;
        _registry = (EcsRegistry)registryType.GetProperty("Instance")!.GetValue(null)!;
        Assert.Equal(RegistrySide.Client, _registry.Side);
        _loadConfig = client.GetType("Lumio.Bomber.Gameplay.Config.BomberConfigBinding", true)!.GetMethod("Load")!;
        Type journalType = client.GetType("Lumio.Bomber.Gameplay.Contracts.Components.BomberPresentationJournal", true)!;
        _journal = typeof(World).GetMethod(nameof(World.Single))!.MakeGenericMethod(journalType);
        _entries = journalType.GetField("Entries")!;
        Type skillType = client.GetType("Lumio.Bomber.Gameplay.Contracts.Components.BomberSkillState", true)!;
        _skill = typeof(World).GetMethods().Single(method => method.Name == nameof(World.Get) && method.IsGenericMethodDefinition &&
            method.GetParameters() is var parameters && parameters.Length == 1 && parameters[0].ParameterType == typeof(NetEntityId)).MakeGenericMethod(skillType);
        _frozenUntil = skillType.GetField("FrozenUntilTick")!;
        _immuneUntil = skillType.GetField("FreezeImmuneUntilTick")!;
        _native = NativeEngineLoader.LoadFromBuildInfo(Lumio.Bomber.Tests.EngineRelease.NativeLibrary);
    }

    internal IClientReplica Create()
    {
        IClientReplica replica = new ClientReplicaFactory(() =>
        {
            string configPath = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Client", "Config", "Tables");
            var config = (WorldConfigBinding)_loadConfig.Invoke(null, new object?[] { configPath })!;
            WorldManager manager = BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(_registry)
            {
                Config = config,
                Catalog = File.ReadAllBytes(Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server", "Assets", "Maps", "official-catalog.json")),
                Subsystems = ReplicaSchedulingSubsystem.Create(),
            });
            return manager;
        }).Create();
        _replicas.Add(replica);
        return replica;
    }

    internal string[] ReadJournal(IClientReplica replica)
    {
        object journal = _journal.Invoke(replica.World.Manager.World, null)!;
        return ((SyncList<string>)_entries.GetValue(journal)!).Values.ToArray();
    }

    internal (ulong Frozen, ulong Immune) ReadFreeze(IClientReplica replica, NetEntityId life)
    {
        object skill = _skill.Invoke(replica.World.Manager.World, new object[] { life })!;
        return (((Sync<ulong>)_frozenUntil.GetValue(skill)!).Value, ((Sync<ulong>)_immuneUntil.GetValue(skill)!).Value);
    }

    public void Dispose()
    {
        foreach (IClientReplica replica in _replicas) replica.Dispose();
        _native.Dispose();
        _context.Unload();
    }
}
