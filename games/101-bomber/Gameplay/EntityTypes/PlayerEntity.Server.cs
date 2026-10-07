using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Components.Identity;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.EntityTypes;

/// <summary>Players and Bot clients are admitted as the same authoritative entity type.</summary>
[EntityType(Mode.CS)]
[DeclareAttribute("HealthPoints", IsLethal = true, Persist = true)]
[DeclareAttribute("BombPower", Persist = true)]
[DeclareAttribute("BombCapacity", Persist = true)]
[DeclareAttribute("AvailableBombs", Persist = true)]
[DeclareAttribute("SpeedTier", Persist = true)]
[DeclareAttribute("MovementSpeedMilli", Persist = true)]
[Has(typeof(ObserverComponent))]
[Has(typeof(IdentityComponent))]
[Has(typeof(LogicTransform))]
[Has(typeof(AbilityComponent))]
[Has(typeof(AttributeComponent))]
[Has(typeof(EffectComponent))]
[Has(typeof(BomberPlayerState))]
[Has(typeof(BomberSkillState))]
[Has(typeof(BomberHealthFacts))]
[Has(typeof(BomberSuccessorLife))]
public abstract class PlayerEntity
{
}
