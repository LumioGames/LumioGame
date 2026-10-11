using System.Collections.Generic;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

[WorldSubsystem]
public sealed class BomberInputSchedulingSubsystem : IWorldSubsystem
{
    public string Name => "bomber.input-scheduling";
    public IReadOnlyList<string> Dependencies => new[] { "gas", "world-data" };
    public void Initialize(WorldManager world) => world.ConfigureOrderedInputScheduling(8, 16384);
    public void Shutdown(WorldManager world) { }
}
