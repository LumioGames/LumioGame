using System;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

/// <summary>Stable game-owned machine identity. A participant, rather than a disposable Player entity, owns PlayerLife.</summary>
public enum BomberHfsmKind { Match = 1, FinalCircle = 2, PlayerLife = 3, Bomb = 4, Chest = 5, Pickup = 6, FireZone = 7 }

/// <summary>Only graph declarations live here. Callers answer guards and execute returned action IDs.</summary>
public static class BomberHfsmDefinitions
{
    // State, event, guard and action IDs are deliberately explicit and never derived from enum ordinals.
    public static class State
    {
        public const uint MatchWaiting = 1001, MatchWarmup = 1002, MatchRunning = 1003, MatchCircle = 1004, MatchPodium = 1005, MatchResults = 1006;
        public const uint CircleInactive = 2001, CircleActive = 2002, CirclePreview = 2003, CircleEffective = 2004, CircleFinished = 2005;
        public const uint LifeAlive = 3001, LifeProtected = 3002, LifeVulnerable = 3003, LifeDead = 3004, LifeRespawn = 3005, LifeEliminated = 3006;
        public const uint BombFuse = 4001, BombStationary = 4002, BombKicked = 4003, BombDanger = 4004, BombBurn = 4005, BombExtinguished = 4006, BombExpired = 4007;
        public const uint ChestClosed = 5001, ChestPending = 5002, ChestOpened = 5003, ChestDisposed = 5004;
        public const uint PickupAvailable = 6001, PickupPending = 6002, PickupConsumed = 6003, PickupDestroyed = 6004;
        public const uint FireActive = 7001, FireExpired = 7002;
    }

    public static class EventId
    {
        public const uint WorldReady = 1101, WarmupElapsed = 1102, CircleTriggered = 1103, MatchEnded = 1104, PodiumElapsed = 1105, ResultsElapsed = 1106;
        public const uint CircleBegin = 2101, StageDue = 2103, MoreStages = 2104, AllStagesDone = 2105;
        public const uint ProtectionEnded = 3101, ProtectionBroken = 3102, LethalSettled = 3103, RespawnDue = 3104, FinalRespawnClosed = 3105;
        public const uint Kick = 4101, KickStopped = 4102, FuseElapsed = 4103, Extinguish = 4104, DangerElapsed = 4105, BurnElapsed = 4106;
        public const uint RequiredHitsReached = 5101, OpenCommitted = 5102, OpenRejected = 5103, DisposeChest = 5104;
        public const uint Claim = 6101, ClaimCommitted = 6102, ClaimRejected = 6103, DestroyPickup = 6104;
        public const uint FireElapsed = 7101;
    }

    public static class Guard
    {
        public const uint RespawnReserved = 3101, CanBurn = 4101;
    }

    public static class Action
    {
        public const uint EnterWarmup = 1101, EnterRunning = 1102, EnterCircle = 1103, FreezeResult = 1104, BeginNextMatch = 1105;
        public const uint BeginCircle = 2101, AnnounceStage = 2102, ApplyStage = 2103, FinishCircle = 2104;
        public const uint EnterProtection = 3101, EnterVulnerable = 3102, ScheduleRespawn = 3103, Eliminate = 3104;
        public const uint ReturnCapacity = 4101, EnterDanger = 4102, EnterBurn = 4103, ExpireBomb = 4104, ExtinguishBomb = 4105;
        public const uint RequestChestOpen = 5101, CommitChestOpen = 5102, RejectChestOpen = 5103;
        public const uint RequestPickupClaim = 6101, CommitPickupClaim = 6102, RejectPickupClaim = 6103;
        public const uint ExpireFire = 7101;
    }

    /// <summary>Compile against the Native Context already bound to this World; dispose after the caller's batch.</summary>
    public static NativeHfsmDefinition Compile(World world, BomberHfsmKind kind)
    {
        ArgumentNullException.ThrowIfNull(world);
        return kind switch
        {
            BomberHfsmKind.Match => world.CompileHfsm(State.MatchWaiting,
            [
                new() { Id = State.MatchWaiting }, new() { Id = State.MatchWarmup, Entry = [Action.EnterWarmup] },
                new() { Id = State.MatchRunning, Entry = [Action.EnterRunning] }, new() { Id = State.MatchCircle, Entry = [Action.EnterCircle] },
                new() { Id = State.MatchPodium, Entry = [Action.FreezeResult] }, new() { Id = State.MatchResults },
            ],
            [
                T(1101, State.MatchWaiting, EventId.WorldReady, State.MatchWarmup),
                T(1102, State.MatchWarmup, EventId.WarmupElapsed, State.MatchRunning),
                T(1103, State.MatchRunning, EventId.CircleTriggered, State.MatchCircle),
                T(1104, State.MatchRunning, EventId.MatchEnded, State.MatchPodium),
                T(1105, State.MatchCircle, EventId.MatchEnded, State.MatchPodium),
                T(1106, State.MatchPodium, EventId.PodiumElapsed, State.MatchResults),
                T(1107, State.MatchResults, EventId.ResultsElapsed, State.MatchWarmup, Action.BeginNextMatch),
            ]),
            BomberHfsmKind.FinalCircle => world.CompileHfsm(State.CircleInactive,
            [
                new() { Id = State.CircleInactive }, new() { Id = State.CircleActive, Initial = State.CirclePreview, Entry = [Action.BeginCircle] },
                new() { Id = State.CirclePreview, Parent = State.CircleActive, Entry = [Action.AnnounceStage] },
                new() { Id = State.CircleEffective, Parent = State.CircleActive, Entry = [Action.ApplyStage] },
                new() { Id = State.CircleFinished, Entry = [Action.FinishCircle] },
            ],
            [
                T(2101, State.CircleInactive, EventId.CircleBegin, State.CircleActive),
                T(2102, State.CirclePreview, EventId.StageDue, State.CircleEffective),
                T(2103, State.CircleEffective, EventId.MoreStages, State.CirclePreview),
                T(2104, State.CircleEffective, EventId.AllStagesDone, State.CircleFinished),
                T(2105, State.CirclePreview, EventId.AllStagesDone, State.CircleFinished),
            ]),
            BomberHfsmKind.PlayerLife => world.CompileHfsm(State.LifeAlive,
            [
                new() { Id = State.LifeAlive, Initial = State.LifeProtected },
                new() { Id = State.LifeProtected, Parent = State.LifeAlive, Entry = [Action.EnterProtection] },
                new() { Id = State.LifeVulnerable, Parent = State.LifeAlive, Entry = [Action.EnterVulnerable] },
                new() { Id = State.LifeDead, Initial = State.LifeRespawn },
                new() { Id = State.LifeRespawn, Parent = State.LifeDead, Entry = [Action.ScheduleRespawn] },
                new() { Id = State.LifeEliminated, Entry = [Action.Eliminate] },
            ],
            [
                T(3101, State.LifeProtected, EventId.ProtectionEnded, State.LifeVulnerable),
                T(3102, State.LifeProtected, EventId.ProtectionBroken, State.LifeVulnerable),
                new() { Id = 3103, Source = State.LifeAlive, Event = EventId.LethalSettled, Target = State.LifeDead, Priority = 1, Guard = Guard.RespawnReserved },
                new() { Id = 3104, Source = State.LifeAlive, Event = EventId.LethalSettled, Target = State.LifeEliminated, Priority = 2 },
                T(3105, State.LifeRespawn, EventId.RespawnDue, State.LifeAlive),
                T(3106, State.LifeRespawn, EventId.FinalRespawnClosed, State.LifeEliminated),
            ]),
            BomberHfsmKind.Bomb => world.CompileHfsm(State.BombFuse,
            [
                new() { Id = State.BombFuse, Initial = State.BombStationary, Exit = [Action.ReturnCapacity] },
                new() { Id = State.BombStationary, Parent = State.BombFuse }, new() { Id = State.BombKicked, Parent = State.BombFuse },
                new() { Id = State.BombDanger, Entry = [Action.EnterDanger] }, new() { Id = State.BombBurn, Entry = [Action.EnterBurn] },
                new() { Id = State.BombExtinguished, Entry = [Action.ExtinguishBomb] }, new() { Id = State.BombExpired, Entry = [Action.ExpireBomb] },
            ],
            [
                T(4101, State.BombStationary, EventId.Kick, State.BombKicked), T(4102, State.BombKicked, EventId.KickStopped, State.BombStationary),
                T(4103, State.BombFuse, EventId.FuseElapsed, State.BombDanger), T(4104, State.BombFuse, EventId.Extinguish, State.BombExtinguished),
                new() { Id = 4105, Source = State.BombDanger, Event = EventId.DangerElapsed, Target = State.BombBurn, Priority = 1, Guard = Guard.CanBurn },
                new() { Id = 4106, Source = State.BombDanger, Event = EventId.DangerElapsed, Target = State.BombExpired, Priority = 2 },
                T(4107, State.BombBurn, EventId.BurnElapsed, State.BombExpired),
            ]),
            BomberHfsmKind.Chest => world.CompileHfsm(State.ChestClosed,
            [
                new() { Id = State.ChestClosed }, new() { Id = State.ChestPending, Entry = [Action.RequestChestOpen] },
                new() { Id = State.ChestOpened, Entry = [Action.CommitChestOpen] }, new() { Id = State.ChestDisposed },
            ],
            [
                T(5101, State.ChestClosed, EventId.RequiredHitsReached, State.ChestPending),
                T(5102, State.ChestPending, EventId.OpenCommitted, State.ChestOpened),
                T(5103, State.ChestPending, EventId.OpenRejected, State.ChestClosed, Action.RejectChestOpen),
                T(5104, State.ChestOpened, EventId.DisposeChest, State.ChestDisposed),
            ]),
            BomberHfsmKind.Pickup => world.CompileHfsm(State.PickupAvailable,
            [
                new() { Id = State.PickupAvailable }, new() { Id = State.PickupPending, Entry = [Action.RequestPickupClaim] },
                new() { Id = State.PickupConsumed, Entry = [Action.CommitPickupClaim] }, new() { Id = State.PickupDestroyed },
            ],
            [
                T(6101, State.PickupAvailable, EventId.Claim, State.PickupPending),
                T(6102, State.PickupPending, EventId.ClaimCommitted, State.PickupConsumed),
                T(6103, State.PickupPending, EventId.ClaimRejected, State.PickupAvailable, Action.RejectPickupClaim),
                T(6104, State.PickupAvailable, EventId.DestroyPickup, State.PickupDestroyed),
                T(6105, State.PickupPending, EventId.DestroyPickup, State.PickupDestroyed),
            ]),
            BomberHfsmKind.FireZone => world.CompileHfsm(State.FireActive,
            [new() { Id = State.FireActive }, new() { Id = State.FireExpired, Entry = [Action.ExpireFire] }],
            [T(7101, State.FireActive, EventId.FireElapsed, State.FireExpired)]),
            _ => throw new ArgumentOutOfRangeException(nameof(kind)),
        };
    }

    private static HfsmTransitionDefinition T(uint id, uint source, uint @event, uint target, params uint[] actions)
        => new() { Id = id, Source = source, Event = @event, Target = target, Actions = actions };
}
