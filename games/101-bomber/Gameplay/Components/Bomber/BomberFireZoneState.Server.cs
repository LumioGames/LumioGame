namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberFireZoneState
{
    protected override void Awake()
    {
        if (RegionCoverage.Value) BomberFavoriteFireZones.Published(World, this);
    }
    protected override void OnHydrate() => BomberFavoriteFireZones.ValidateZoneStorage(World, this);
}
