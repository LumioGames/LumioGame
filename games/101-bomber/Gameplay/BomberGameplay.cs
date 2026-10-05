using System;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Config;

[assembly: InternalsVisibleTo("Lumio.Bomber.Gameplay.Tests")]

namespace Lumio.Bomber.Gameplay;

/// <summary>Gameplay catalog and authoritative admission composition.</summary>
public static partial class BomberGameplay
{
    [SuppressMessage("Design", "CA1510", Justification = "Shared with the netstandard2.1 client.")]
    public static void BindPlayer(World world, NetEntityId player)
    {
        if (world is null) throw new ArgumentNullException(nameof(world));
        if (!world.IsLive(player)) throw new InvalidOperationException("BindPlayer requires a live player.");
        PlaceAdmittedPlayer(world, player);
    }

    static partial void PlaceAdmittedPlayer(World world, NetEntityId player);
}
