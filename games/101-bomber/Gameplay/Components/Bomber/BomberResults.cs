using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Two complete, immutable match results, held on the one World entity.</summary>
[EcsComponent]
public sealed partial class BomberResults : Component
{
    [Persist] public Sync<ulong> PublishedGeneration = new(Scope.Room, Authority.Server);
    [Persist] public SyncList<ulong> RetainedMatchIds = new(Scope.Room, 2, Authority.Server);
    [Persist] public SyncList<ulong> EndTicks = new(Scope.Room, 2, Authority.Server);
    [Persist] public SyncList<int> EndReasons = new(Scope.Room, 2, Authority.Server);
    [Persist] public SyncList<NetEntityId> WinnerParticipants = new(Scope.Room, 2, Authority.Server);
    [Persist] public SyncList<int> SurvivorCounts = new(Scope.Room, 2, Authority.Server);
    [Persist] public SyncList<ulong> MatchIds = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<NetEntityId> Participants = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<NetEntityId> Lives = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<ulong> LifeGenerations = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Slots = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Ranks = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<bool> Survived = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> FinalHats = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<ulong> EliminatedTicks = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Characters = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Kills = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Bombs = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> DestroyedBlocks = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Pickups = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> BestChains = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> PeakHats = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> SkillCasts = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Evolutions = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<ulong> HatKingTicks = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> Deaths = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> PeakHealthPoints = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> BossKills = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> ClutchEscapes = new(Scope.Room, 32, Authority.Server);
    [Persist] public SyncList<int> GoldenHeartPickups = new(Scope.Room, 32, Authority.Server);
    // Six uint identities (ten decimal digits each) plus five separators.
    [Persist] public SyncList<string> SpecialBombHistories = new(Scope.Room, 32, Authority.Server);
}
