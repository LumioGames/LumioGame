using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public readonly record struct BomberSourceIdentity(
    NetEntityId Participant, NetEntityId Life, ulong LifeGeneration);
public readonly record struct BomberTargetIdentity(
    NetEntityId Participant, NetEntityId Life, ulong LifeGeneration);
public enum BomberHitStorageState { Pending = 1, ContactApplied = 2 }
public enum BomberStorageAdmission { Added, Duplicate, CapacityExceeded }
public readonly record struct BomberChestPendingReference(
    string TransactionId, ulong MatchId, ulong SubmittedTick);
