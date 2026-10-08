using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.EntityTypes;

/// <summary>World declaration for the remaining shared gameplay content.</summary>
[EntityType(Mode.CS, World = true, TickRateHz = 20)]
[Has(typeof(WorldSaveComponent))]
public abstract class WorldEntity
{
}
