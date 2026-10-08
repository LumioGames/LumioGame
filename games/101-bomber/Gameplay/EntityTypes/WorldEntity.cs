using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.EntityTypes;

/// <summary>The only world singleton; gameplay phases are projected from native HFSM state.</summary>
[EntityType(Mode.CS, World = true, TickRateHz = 20)]
[Has(typeof(WorldSaveComponent))]
[Has(typeof(BomberMatchState))]
[Has(typeof(BomberFinalCircleState))]
[Has(typeof(BomberHfsmState))]
[Has(typeof(BomberFinalCircleHfsmState))]
[Has(typeof(BomberResults))]
[Has(typeof(BomberWorldRuntime))]
[Has(typeof(BomberPresentationJournal))]
public abstract class WorldEntity
{
}
