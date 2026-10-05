using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Components.Identity;

/// <summary>Platform identity projected for an admitted player.</summary>
[EcsComponent]
public sealed partial class IdentityComponent : Component
{
    [Persist]
    public Sync<string> Name = new(Scope.Room, Authority.Owner);
}
