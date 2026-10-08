using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.Contracts.EntityTypes;

/// <summary>软砖掉落的正向糖果。design.md §7.4/§8.5（Stage 0 只含三种正向糖果）。位置归 <see cref="LogicTransform"/>。</summary>
[EntityType(Mode.CS)]
[Has(typeof(ObserverComponent))]
[Has(typeof(LogicTransform))]
[Has(typeof(BomberPickupItem))]
[Has(typeof(BomberHfsmState))]
public abstract class BomberPickupItemEntity
{
}
