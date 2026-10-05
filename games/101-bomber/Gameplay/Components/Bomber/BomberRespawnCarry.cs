using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Short lived, settled carry between destruction of one life and seeding of its successor.</summary>
[EcsComponent]
public sealed partial class BomberRespawnCarry : Component
{
    [Persist] public Sync<bool> CarryPresent = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PowerBase = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> CapacityBase = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> SpeedTierBase = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> AvailableBombs = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> CharacterId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BombSkillId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BombLevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> BombBound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BombCombinationOriginA = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BombOriginALevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> BombOriginABound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BombCombinationOriginB = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BombOriginBLevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> BombOriginBBound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> ActiveSkillId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> ActiveLevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> ActiveBound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> ActiveCombinationOriginA = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> ActiveOriginALevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> ActiveOriginABound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> ActiveCombinationOriginB = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> ActiveOriginBLevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> ActiveOriginBBound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PassiveSkillId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PassiveLevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> PassiveBound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PassiveCombinationOriginA = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PassiveOriginALevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> PassiveOriginABound = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PassiveCombinationOriginB = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PassiveOriginBLevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> PassiveOriginBBound = new(Scope.None, Authority.Server);

    // Nonspendable selected wealth, transferred only to ordinary created pickups.
    [Persist] public Sync<int> PendingPower = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PendingCapacity = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PendingSpeed = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> PendingBombSkill = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PendingBombLevel = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DropMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> DropLife = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DropGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DropOccurrenceTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> DropOriginX = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> DropOriginZ = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> SelectedDropCount = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PlacedDropCount = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> PendingGoldenHearts = new(Scope.None, Authority.Server);
    // Each retained cohort owns at least one of the existing shared pickup credits.
    [Persist] public SyncList<string> DeferredDeathDebts = new(Scope.None, 703, Authority.Server);
}
