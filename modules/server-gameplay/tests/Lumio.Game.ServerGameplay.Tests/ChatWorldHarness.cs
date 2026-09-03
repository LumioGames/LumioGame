using System;
using System.Globalization;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Samples.Username.Components.Identity;
using Lumio.GameRuntime.Samples.Username.Host;

namespace Lumio.Game.ServerGameplay.Tests;

internal static class ChatWorldHarness
{
    public const ulong InstanceId = 0x1000000000000001UL;

    public static WorldManager Boot(int members = 1)
    {
        WorldManager manager = ServerBootstrap.Boot(InstanceId);
        for (int i = 0; i < members; i++)
        {
            string account = "acct-" + (7 + i).ToString(CultureInfo.InvariantCulture);
            ServerBootstrap.AdmitPlayer(manager, account);
            manager.Tick();
        }

        int n = 0;
        foreach (IdentityComponent identity in manager.World.Each<IdentityComponent>())
        {
            if (string.IsNullOrEmpty(identity.AccountId))
            {
                continue;
            }

            manager.BindSelf("C" + (n + 1).ToString(CultureInfo.InvariantCulture), identity.Entity);
            n++;
        }

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
}
