using System.Numerics;
using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Config;

namespace Lumio.Bomber.Gameplay;

public static partial class BomberGameplay
{
    /// <summary>Admission holds players in the first interior cell until match placement runs.</summary>
    internal static Vector3 AdmittedPlayerPosition(World world)
    {
        MapRow map = BomberConfigBinding.For(world).Map;
        const float cellCenter = 0.5f;
        return new Vector3(map.BoundaryCells + cellCenter, map.ObstacleLayer + cellCenter, map.BoundaryCells + cellCenter);
    }

    static partial void PlaceAdmittedPlayer(World world, NetEntityId player)
    {
        LogicTransform logic = world.Get<LogicTransform>(player);
        if (logic.LocalPosition != Vector3.Zero) return;
        TransformController controller = world.RegisterTransformController(player, nameof(MoveAbility));
        using (logic.BeginWrite(controller))
            logic.SetLocalPosition(AdmittedPlayerPosition(world));
    }
}
