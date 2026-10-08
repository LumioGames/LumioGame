using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Events;

/// <summary>Match identity, occurrence tick and EventSequence within the match.</summary>
public readonly record struct BomberEventStamp(ulong MatchId, ulong Tick, ulong Sequence);

/// <summary>Shared occurrence stamp and captured context for typed game events.</summary>
public interface IBomberEvent
{
    /// <summary>Occurrence identity and tick.</summary>
    BomberEventStamp Stamp { get; }
    /// <summary>Context captured when the event occurred.</summary>
    BomberContext Context { get; }
}

/// <summary>Start snapshot with seed, config hash and phase ticks.</summary>
public readonly record struct MatchStarted(BomberEventStamp Stamp, BomberContext Context,
    ulong Seed, string ConfigHash, BomberPhaseWindow Window) : IBomberEvent;

/// <summary>Captured phase window with effective and deadline ticks.</summary>
public readonly record struct PhaseChanged(BomberEventStamp Stamp, BomberContext Context,
    BomberPhaseWindow Window) : IBomberEvent;

/// <summary>Placed bomb, fuse end tick and owner inventory change.</summary>
public readonly record struct BombPlaced(BomberEventStamp Stamp, BomberContext Context,
    BomberBombSnapshot Bomb, ulong FuseEndTick, BomberInventory Inventory) : IBomberEvent;

/// <summary>Exploded bomb and owner inventory change.</summary>
public readonly record struct BombExploded(BomberEventStamp Stamp, BomberContext Context,
    BomberBombSnapshot Bomb, BomberInventory Inventory) : IBomberEvent;

/// <summary>Extinguished bomb, game reason and owner inventory change.</summary>
public readonly record struct BombExtinguished(BomberEventStamp Stamp, BomberContext Context,
    BomberBombSnapshot Bomb, string Reason, BomberInventory Inventory) : IBomberEvent;

/// <summary>Bomb kick with actual kicker and direction.</summary>
public readonly record struct BombKicked(BomberEventStamp Stamp, BomberContext Context,
    BomberBombSnapshot Bomb, BomberActor Kicker, BomberDirection Direction) : IBomberEvent;

/// <summary>Settled damage and remaining health in half-heart points.</summary>
public readonly record struct DamageApplied(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Victim, BomberSource Source, BomberDamageCause Cause, long AppliedPoints, long HealthPointsLeft) : IBomberEvent;

/// <summary>One actually Applied favorite region, carrying its immutable original Life and interval.</summary>
public readonly record struct FireRegionBorn(BomberEventStamp Stamp, BomberContext Context,
    NetEntityId Region, BomberActor Source, uint SkillId, int SkillLevel, ulong ChainId,
    BomberCell Center, int Mask, ulong FromTick, ulong UntilTick) : IBomberEvent;

/// <summary>One matching GAS Expired result and Native ExpireFire transition.</summary>
public readonly record struct FireRegionExpired(BomberEventStamp Stamp, BomberContext Context,
    NetEntityId Region, BomberActor Source, uint SkillId, int SkillLevel, ulong ChainId,
    BomberCell Center, int Mask, ulong FromTick, ulong UntilTick) : IBomberEvent;

/// <summary>Death of the actual life, optional killer, remaining half-heart points and cell.</summary>
public readonly record struct PlayerDied(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Victim, BomberActor? Killer, BomberSource Source, BomberDamageCause Cause, long HealthPointsLeft, BomberCell Cell) : IBomberEvent;

/// <summary>Old and new actual lives, spawn cell and protection end tick.</summary>
public readonly record struct PlayerRespawned(BomberEventStamp Stamp, BomberContext Context,
    BomberActor PreviousLife, BomberActor NewLife, BomberCell Cell, ulong ProtectedUntilTick) : IBomberEvent;

/// <summary>Eliminated player, optional source, reason and death tick.</summary>
public readonly record struct PlayerEliminated(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSource? Source, string Reason, ulong DeathTick) : IBomberEvent;

/// <summary>Powerup quantities issued by one economic group.</summary>
public readonly record struct PowerupsDropped(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberPowerups Amounts, BomberEconomyGroup Group, string Reason) : IBomberEvent;

/// <summary>Spawned item with optional successful voxel receipt.</summary>
public readonly record struct PickupSpawned(BomberEventStamp Stamp, BomberContext Context,
    BomberItem Item, BomberVoxelReceipt? Receipt) : IBomberEvent;

/// <summary>Accepted item pickup, credited quantity and optional skill change.</summary>
public readonly record struct PickupTaken(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberItem Item, BomberEconomyGroup TransferGroup, int CreditedQuantity, BomberSkillChange? SkillChange, bool AtCapAfter) : IBomberEvent;

/// <summary>Rejected item pickup with optional skill identity.</summary>
public readonly record struct PickupRejected(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, NetEntityId Item, BomberPickupKind Kind, uint? SkillId, string Reason) : IBomberEvent;

/// <summary>Destroyed item with optional source.</summary>
public readonly record struct PickupDestroyed(BomberEventStamp Stamp, BomberContext Context,
    BomberItem Item, BomberSource? Source, string Reason) : IBomberEvent;

/// <summary>Previous and current king actors may be absent; hat counts are captured.</summary>
public readonly record struct HatKingChanged(BomberEventStamp Stamp, BomberContext Context,
    BomberActor? Previous, int PreviousHats, BomberActor? Current, int CurrentHats) : IBomberEvent;

/// <summary>Committed brick destruction and grouped item counts.</summary>
public readonly record struct BrickDestroyed(BomberEventStamp Stamp, BomberContext Context,
    BomberCell Cell, uint BlockType, BomberSource Source, BomberVoxelReceipt Receipt, BomberEconomyGroup Group, int IssuedItemCount, int IssuedQuantity) : IBomberEvent;

/// <summary>Committed regrowth count within inclusive XZ bounds.</summary>
public readonly record struct BricksRegrown(BomberEventStamp Stamp, BomberContext Context,
    BomberRange Range, int Count, BomberVoxelReceipt Receipt) : IBomberEvent;

/// <summary>Final circle start reason and stage tick and bounds.</summary>
public readonly record struct FinalCircleStarted(BomberEventStamp Stamp, BomberContext Context,
    string Reason, BomberCircleStage Stage) : IBomberEvent;

/// <summary>Announced circle stage with effective tick and bounds.</summary>
public readonly record struct RingAnnounced(BomberEventStamp Stamp, BomberContext Context,
    BomberCircleStage Stage) : IBomberEvent;

/// <summary>Effective circle stage with tick and bounds.</summary>
public readonly record struct RingShrunk(BomberEventStamp Stamp, BomberContext Context,
    BomberCircleStage Stage) : IBomberEvent;

/// <summary>Committed clear with cell and item counts and voxel receipt.</summary>
public readonly record struct RingCleared(BomberEventStamp Stamp, BomberContext Context,
    BomberCircleStage Stage, int ClearedCells, int DestroyedItems, BomberVoxelReceipt Receipt) : IBomberEvent;

/// <summary>Spawned chest with required hit count and optional successful voxel receipt.</summary>
public readonly record struct ChestSpawned(BomberEventStamp Stamp, BomberContext Context,
    NetEntityId Chest, BomberCell Cell, int RequiredHits, BomberVoxelReceipt? Receipt) : IBomberEvent;

/// <summary>Chest hit with bomb and remaining hit count.</summary>
public readonly record struct ChestHit(BomberEventStamp Stamp, BomberContext Context,
    NetEntityId Chest, NetEntityId Bomb, BomberSource Source, int RequiredHits, int RemainingHits) : IBomberEvent;

/// <summary>Committed chest opening and grouped item counts.</summary>
public readonly record struct ChestOpened(BomberEventStamp Stamp, BomberContext Context,
    NetEntityId Chest, BomberSource Source, BomberVoxelReceipt Receipt, BomberEconomyGroup Group, int IssuedItemCount, int IssuedQuantity) : IBomberEvent;

/// <summary>Committed resource crate opening retains its configured wood, iron or gold tier.</summary>
public readonly record struct ResourceCrateOpened(BomberEventStamp Stamp, BomberContext Context,
    NetEntityId Chest, uint ResourceTier, BomberSource Source, BomberVoxelReceipt Receipt,
    BomberEconomyGroup Group, int IssuedItemCount, int IssuedQuantity) : IBomberEvent;

/// <summary>Accepted skill activation with optional target and effective and until ticks.</summary>
public readonly record struct SkillActivated(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSkillChange Skill, BomberSource Source, BomberActor? Target, ulong EffectiveTick, ulong UntilTick) : IBomberEvent;

/// <summary>Rejected skill activation and game reason.</summary>
public readonly record struct SkillRejected(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSkillChange Skill, string Reason) : IBomberEvent;

/// <summary>Skill gain with optional item and economic group.</summary>
public readonly record struct SkillGained(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSkillChange Skill, NetEntityId? Item, BomberEconomyGroup? Group) : IBomberEvent;

/// <summary>Skill evolution with optional economic group.</summary>
public readonly record struct SkillEvolved(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSkillChange Skill, BomberEconomyGroup? Group) : IBomberEvent;

/// <summary>Skill drop, economic group and game reason.</summary>
public readonly record struct SkillDropped(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSkillChange Skill, BomberEconomyGroup Group, string Reason) : IBomberEvent;

/// <summary>Applied healing and remaining health in half-heart points, with optional source.</summary>
public readonly record struct PlayerHealed(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSource? Source, long AppliedPoints, long HealthPointsLeft, string Reason) : IBomberEvent;

/// <summary>Frozen status with optional source and effective and until ticks.</summary>
public readonly record struct PlayerFrozen(BomberEventStamp Stamp, BomberContext Context,
    BomberStatus Status) : IBomberEvent;

/// <summary>Poisoned status with optional source and effective and until ticks.</summary>
public readonly record struct PlayerPoisoned(BomberEventStamp Stamp, BomberContext Context,
    BomberStatus Status) : IBomberEvent;

/// <summary>Shocked status with optional source and effective and until ticks.</summary>
public readonly record struct PlayerShocked(BomberEventStamp Stamp, BomberContext Context,
    BomberStatus Status) : IBomberEvent;

/// <summary>Named status removal with optional source and method.</summary>
public readonly record struct PlayerCured(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberSource? Source, string Status, string Method) : IBomberEvent;

/// <summary>Match end with optional winner and frozen retained result reference.</summary>
public readonly record struct MatchEnded(BomberEventStamp Stamp, BomberContext Context,
    BomberEndReason Reason, BomberActor? Winner, int SurvivorCount, BomberResultReference Results) : IBomberEvent;

/// <summary>Durable seat occurrence; body may be default only without an admitted life.</summary>
public readonly record struct MatchJoined(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player) : IBomberEvent;

/// <summary>First accepted movement of a participant to an XZ cell.</summary>
public readonly record struct PlayerFirstMoved(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberCell Cell) : IBomberEvent;

/// <summary>Participant continuing from a previous match identity.</summary>
public readonly record struct NextMatchStayed(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, ulong PreviousMatchId) : IBomberEvent;

/// <summary>Water entry at an XZ cell.</summary>
public readonly record struct WaterEntered(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberCell Cell) : IBomberEvent;

/// <summary>Water exit at an XZ cell.</summary>
public readonly record struct WaterExited(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, BomberCell Cell) : IBomberEvent;

/// <summary>Character choice applied to a specified match identity.</summary>
public readonly record struct CharacterSelected(BomberEventStamp Stamp, BomberContext Context,
    BomberActor Player, uint CharacterId, ulong AppliesToMatchId) : IBomberEvent;

/// <summary>Chain aggregate with bomb, width, depth and committed voxel write counts.</summary>
public readonly record struct ChainCompleted(BomberEventStamp Stamp, BomberContext Context,
    ulong ChainId, NetEntityId RootBomb, int BombCount, int MaxWidth, int MaxDepth, int CommittedVoxelWrites) : IBomberEvent;
