using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.Contracts.EntityTypes;

/// <summary>A room participant, never used as the authenticated input sender.</summary>
[EntityType(Mode.CS)]
[Has(typeof(ObserverComponent))]
[Has(typeof(BomberParticipantState))]
[Has(typeof(BomberStatistics))]
[Has(typeof(BomberRespawnCarry))]
[Has(typeof(BomberHfsmState))]
[Has(typeof(BomberSuccessorState))]
[Has(typeof(BomberFireFacts))]
public abstract class BomberParticipantEntity
{
}
