using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Bounded, room-visible display occurrences on the world singleton.</summary>
[EcsComponent]
public sealed partial class BomberPresentationJournal : Component
{
    [Persist] public SyncList<string> Entries = new(Scope.Room, 128, Authority.Server);
}
