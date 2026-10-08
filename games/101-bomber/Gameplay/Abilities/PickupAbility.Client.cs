using System.Numerics;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

public sealed partial class PickupAbility
{
    private static partial bool CanExchangeAt(World world, Vector3 position) => false;
}
