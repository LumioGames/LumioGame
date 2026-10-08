using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>A barrel's initial cell is provenance; Native binding owns its current position.</summary>
[EcsComponent]
public sealed partial class BomberBarrelState : Component
{
    [Persist] public Sync<ulong> ResourceGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> InitialResourceMatch = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> InitialResourceCell = new(Scope.None, Authority.Server);
}
