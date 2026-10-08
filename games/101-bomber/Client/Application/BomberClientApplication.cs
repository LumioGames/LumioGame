using System;
using System.Threading;
using Lumio.Client.Application;
using Lumio.Bomber.Gameplay;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Application;

/// <summary>Bomber-owned composition entry point for hosts using the Client Application API.</summary>
public static class BomberClientApplication
{
    /// <summary>The generated client registry; the project always selects the client gameplay assembly.</summary>
    public static EcsRegistry Registry => GeneratedRegistry.Instance;

    /// <summary>Validate the game binding while retaining every engine option, including voxel prediction budgets.</summary>
    public static ClientInstanceOptions Configure(ClientInstanceOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (Registry.Side != RegistrySide.Client)
            throw new InvalidOperationException("Bomber client application requires the client gameplay projection.");
        if (!ReferenceEquals(options.Registry, Registry))
            throw new ArgumentException("Use BomberClientApplication.Registry when composing this game's client options.", nameof(options));
        return options;
    }

    /// <summary>The supplied engine host owns the returned instance, transport, voxel world and prediction session.</summary>
    public static ClientInstance CreateInstance(ClientHost host, ClientInstanceOptions options, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(host);
        return host.CreateInstance(Configure(options), cancellationToken);
    }
}
