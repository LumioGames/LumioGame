using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>A fire wall is one bounded gameplay entity with a source and a lifetime.</summary>
[EcsComponent]
public sealed partial class BomberFireZoneState : Component
{
    [Persist] public Sync<NetEntityId> Owner = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> SourceSkill = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> FromTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> UntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Direction = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Length = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Phase = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<NetEntityId> SourceLife = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> SourceLifeGeneration = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> SourceMatchId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> SourceChainId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> CoverageMask = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<string> PromiseToken = new(Scope.None, Authority.Server) { Value = "" };

    // Append-only v15 candidate; Root owns formal identities and generation.
    [Persist] public Sync<int> RegionOrdinal = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DurationTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> AuraEffectWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> AuraEffectInstance = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> AuraEffectGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> LifetimeEffectWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> LifetimeEffectInstance = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> LifetimeEffectGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> LifetimeOutcome = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> BirthSubmitted = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> RegionCoverage = new(Scope.Aoi, Authority.Server);
}
