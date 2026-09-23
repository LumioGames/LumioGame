using System;
using System.Collections.Generic;
using System.Globalization;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Tests;

internal static class ChatWorldHarness
{
    public const ulong InstanceId = 0x1000000000000001UL;

    public static WorldManager Boot(int members = 1)
    {
        WorldManager manager = ServerWorldBoot.Boot(InstanceId);
        for (int i = 0; i < members; i++)
        {
            string account = "acct-" + (7 + i).ToString(CultureInfo.InvariantCulture);
            ServerWorldBoot.AdmitPlayer(manager, account);
            manager.Tick();
        }

        var connections = new Dictionary<string, NetEntityId>(StringComparer.Ordinal);
        int connectionIndex = 1;
        foreach (IdentityComponent identity in manager.World.Each<IdentityComponent>())
        {
            if (string.IsNullOrEmpty(identity.AccountId))
            {
                continue;
            }

            manager.Bind(identity.Entity);
            connections.Add("C" + connectionIndex.ToString(CultureInfo.InvariantCulture), identity.Entity);
            connectionIndex++;
        }

        manager.AttachControlAdapter(new TestControlAdapter(connections));

        return manager;
    }

    public static NetEntityId Net(WorldManager manager, int index)
    {
        int n = 0;
        foreach (IdentityComponent identity in manager.World.Each<IdentityComponent>())
        {
            if (string.IsNullOrEmpty(identity.AccountId))
            {
                continue;
            }

            if (n == index)
            {
                return identity.Entity;
            }

            n++;
        }

        throw new InvalidOperationException("no member at " + index.ToString(CultureInfo.InvariantCulture));
    }

    private sealed class TestControlAdapter : IWorldControlAdapter
    {
        private readonly IReadOnlyDictionary<string, NetEntityId> _byConnection;

        public TestControlAdapter(IReadOnlyDictionary<string, NetEntityId> byConnection) =>
            _byConnection = byConnection;

        public bool TryHandle(WorldMessage message, out ErrorMessage? failure)
        {
            failure = null;
            return false;
        }

        public bool TryResolveConnection(NetEntityId observerId, out string connection)
        {
            foreach (KeyValuePair<string, NetEntityId> pair in _byConnection)
            {
                if (pair.Value == observerId)
                {
                    connection = pair.Key;
                    return true;
                }
            }

            connection = string.Empty;
            return false;
        }

        public bool TryResolveConnectionState(string connection, out NetEntityId observerId, out ulong generation)
        {
            generation = 1UL;
            return _byConnection.TryGetValue(connection, out observerId);
        }
    }
}
