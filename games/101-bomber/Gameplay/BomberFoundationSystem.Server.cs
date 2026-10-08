using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

/// <summary>Validates restored World references and starts missing World machines before gameplay.</summary>
[System(TickPhase.ProcessorPlan)]
public sealed class BomberFoundationSystem : EcsSystem
{
    public override void Execute(World world) => world.Single<BomberWorldRuntime>().EnsureFoundation();
}
