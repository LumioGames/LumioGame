using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Revision captured from Runtime when a dormant successor is created.</summary>
[EcsComponent]
public sealed partial class BomberSuccessorLife : Component
{
    [Persist] public Sync<ulong> PreparedRevision = new(Scope.None, Authority.Server);
}
