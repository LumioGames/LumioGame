using System;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberBarrelState
{
    protected override void OnHydrate() => ValidateStorage();

    internal void ValidateStorage()
    {
        if (ResourceGeneration.Value == 0)
            throw new InvalidOperationException("Barrel requires its complete resource generation.");
        BomberInitialResources.ValidateBarrel(World, this);
    }
}
