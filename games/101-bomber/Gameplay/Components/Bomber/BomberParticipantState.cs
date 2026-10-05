using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>One durable match seat across destroyed and newly admitted player lives.</summary>
[EcsComponent]
public sealed partial class BomberParticipantState : Component
{
    [Persist] public Sync<int> Slot = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> MatchId = new(Scope.Room, Authority.Server);
    [Persist] public Sync<NetEntityId> CurrentLife = new(Scope.Room, Authority.Server);
    [Persist] public Sync<NetEntityId> LastLife = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> LifeGeneration = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> LifePhase = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> DeathTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> RespawnAtTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> EliminatedTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<bool> PendingFinalRespawn = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> NextCharacterId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> SelectedForMatchCharacterId = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> DeathStructurePending = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> DeathStructureLife = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DeathStructureGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DeathStructureTick = new(Scope.None, Authority.Server);

    // Historical terminal observation only; never used as live gameplay health.
    [Persist] public Sync<NetEntityId> TerminalLife = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> TerminalGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> TerminalMatchId = new(Scope.None, Authority.Server);
    [Persist] public SyncList<long> TerminalBaseSample = new(Scope.None, 1, Authority.Server);
    [Persist] public SyncList<long> TerminalCurrentSample = new(Scope.None, 1, Authority.Server);
    [Persist] public Sync<ulong> TerminalOccurrenceTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> TerminalCaptureTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> TerminalDestructionTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DeathConsumedCount = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> SuccessorPending = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> DeathDropPending = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> DeathCellX = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> DeathCellZ = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> FrenzyLife = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> FrenzyGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FrenzyUntilTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> FrenzyLastPlacementTick = new(Scope.None, Authority.Server);
    [Persist] public SyncList<string> FrenzyBombPromises = new(Scope.None, 6, Authority.Server);
}
