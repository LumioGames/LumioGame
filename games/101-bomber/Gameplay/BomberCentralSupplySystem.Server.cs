using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

/// <summary>Publishes each match's central supply through persisted pickup promises.</summary>
[System(TickPhase.ProcessorPlan)]
[After(typeof(BombSystem))]
public sealed class BomberCentralSupplySystem : EcsSystem
{
    public override void Execute(World world) => BomberCentralSupply.Advance(world);
}
