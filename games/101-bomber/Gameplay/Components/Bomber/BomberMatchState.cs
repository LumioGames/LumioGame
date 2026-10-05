using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Authoritative match state. Phase is a projection of native HFSM state; elapsed time derives from StartTick.</summary>
[EcsComponent]
public sealed partial class BomberMatchState : Component
{
    [Persist] public Sync<ulong> MatchId = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> MatchIndex = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> Seed = new(Scope.Room, Authority.Server);
    [Persist] public Sync<string> ConfigHash = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> StartTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> EndTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> PhaseEndTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Phase = new(Scope.Room, Authority.Server);
    [Persist] public Sync<NetEntityId> HatKing = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> EndReason = new(Scope.Room, Authority.Server);
    [Persist] public Sync<NetEntityId> Winner = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> SurvivorCount = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> SettlementRespawnTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> SettlementPodiumTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> OutcomePending = new(Scope.None, Authority.Server);
}
