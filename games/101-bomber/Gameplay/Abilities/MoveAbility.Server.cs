using System.Numerics;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

public sealed partial class MoveAbility
{
    static partial void ReleasePickupExclusionOnExit(World world, NetEntityId entity,
        Vector3 before, Vector3 after) => PickupAbility.ReleaseDropperOnExit(world, entity, before, after);
}
