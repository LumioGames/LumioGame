using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.Contracts.EntityTypes;

[EntityType(Mode.CS)]
[Has(typeof(ObserverComponent))]
[Has(typeof(LogicTransform))]
[Has(typeof(BomberFireZoneState))]
[Has(typeof(BomberHfsmState))]
[Has(typeof(AttributeComponent))]
[Has(typeof(EffectComponent))]
public abstract class BomberFireZoneEntity
{
}
