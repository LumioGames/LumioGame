using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.Contracts.EntityTypes;

[EntityType(Mode.CS)]
[BlockEntity]
[Has(typeof(BomberIceBridgeState))]
public abstract class BomberIceBridgeEntity
{
}
