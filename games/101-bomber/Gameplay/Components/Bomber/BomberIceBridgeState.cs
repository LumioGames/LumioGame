using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>The original applied bridge generation owns its immutable lifetime.</summary>
[EcsComponent]
public sealed partial class BomberIceBridgeState : Component
{
    [Persist] public Sync<ulong> ResourceGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> MatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<string> FreezeToken = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<ulong> AppliedTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> ExpiresAtTick = new(Scope.None, Authority.Server);
}
