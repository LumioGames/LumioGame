using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Events;

/// <summary>Inclusive XZ cell coordinates captured at occurrence; LogicTransform remains position authority.</summary>
public readonly record struct BomberCell(int X, int Z);

/// <summary>Inclusive XZ cell bounds.</summary>
public readonly record struct BomberRange(BomberCell Min, BomberCell Max);

/// <summary>Durable participant and actual body at occurrence, with a separate gameplay life generation.</summary>
public readonly record struct BomberActor(NetEntityId Participant, NetEntityId Life, ulong LifeGeneration);

/// <summary>A slot's skill identity and level; an empty slot has zero identity and level and is unbound.</summary>
public readonly record struct BomberSkillSlot(uint SkillId, int Level, bool Bound);

/// <summary>The three fixed skill slots.</summary>
public readonly record struct BomberSkills(BomberSkillSlot Bomb, BomberSkillSlot Active, BomberSkillSlot Passive);

/// <summary>The two skill identities and levels forming a combination.</summary>
public readonly record struct BomberCombination(uint FirstSkillId, int FirstLevel, uint SecondSkillId, int SecondLevel);

/// <summary>A fixed skill slot.</summary>
public enum BomberSlot { Bomb, Active, Passive }

/// <summary>A captured skill change; Combination is absent when no combination applies.</summary>
public readonly record struct BomberSkillChange(uint CharacterId, BomberSlot Slot, BomberSkillSlot Skill, BomberCombination? Combination);

/// <summary>Primary actor state at occurrence; times are elapsed milliseconds and health is in half-heart points.</summary>
public readonly record struct BomberActorContext(BomberActor Actor, ulong JoinElapsedMs, int HatCount,
    long HealthPoints, long BombPower, long BombCapacity, long MovementSpeedTier, uint CharacterId, BomberSkills Skills);

/// <summary>Match elapsed milliseconds, game zone label, and optional primary actor snapshot.</summary>
public readonly record struct BomberContext(ulong ElapsedMs, string ZoneId, BomberActorContext? Subject);

/// <summary>Captured attribution; optional actor means an environmental source, not a zero actor.</summary>
public readonly record struct BomberSource(BomberActor? Actor, NetEntityId? Entity, NetEntityId? Bomb,
    uint? SkillId, int? SkillLevel, ulong? ChainId);

/// <summary>Arm lengths excluding the center; up/down change Z and left/right change X.</summary>
public readonly record struct BomberArms(int Up, int Right, int Down, int Left);

/// <summary>Bomb chain identity, root and optional parent, with traversal depth.</summary>
public readonly record struct BomberChain(ulong Id, NetEntityId RootBomb, NetEntityId? ParentBomb, int Depth);

/// <summary>One owner's inventory delta and balance after an economic group operation.</summary>
public readonly record struct BomberInventory(BomberActor Owner, ulong GroupId, int Delta, int AvailableAfter);

/// <summary>Bomb identity, owner, shape and optional chain captured at occurrence.</summary>
public readonly record struct BomberBombSnapshot(NetEntityId Bomb, BomberActor Owner, BomberBombKind Kind,
    int PierceLayers, BomberCell Cell, BomberArms Arms, BomberChain? Chain);

/// <summary>Phase and its effective and deadline ticks.</summary>
public readonly record struct BomberPhaseWindow(BomberMatchPhase Phase, ulong EffectiveTick, ulong DeadlineTick);

/// <summary>A circle stage with inclusive bounds before and after its effective tick.</summary>
public readonly record struct BomberCircleStage(int Index, int Side, BomberRange Before, BomberRange After, ulong EffectiveTick);

/// <summary>One economic operation within a match.</summary>
public readonly record struct BomberEconomyGroup(ulong MatchId, ulong GroupId);

/// <summary>Game rule that issued an item.</summary>
public enum BomberItemOrigin { Brick, Chest, Death, OtherGameRule }

/// <summary>Item provenance and captured cell; optional fields are absent when inapplicable.</summary>
public readonly record struct BomberItem(NetEntityId Item, BomberPickupKind Kind, int Quantity,
    BomberSkillSlot? Skill, BomberCombination? Combination, BomberItemOrigin Origin, BomberActor? DroppedBy,
    BomberSource? Source, ulong ProtectedUntilTick, BomberCell Cell, BomberEconomyGroup Group);

/// <summary>Power, capacity and speed quantities.</summary>
public readonly record struct BomberPowerups(int Power, int Capacity, int Speed);

/// <summary>Reference to a frozen retained result generation for a match.</summary>
public readonly record struct BomberResultReference(ulong MatchId, ulong PublishedGeneration);

/// <summary>Actual logical and optional physical voxel transaction identities and SDK outcome projections.</summary>
public readonly record struct BomberVoxelReceipt(string TransactionId, string? BatchTransactionId,
    ulong SubmittedTick, ulong CommittedTick, ulong ObservedTick, string OutcomeCode, string Disposition);

/// <summary>Captured status source, effective and until ticks, and game reason.</summary>
public readonly record struct BomberStatus(BomberActor Target, BomberSource? Source, uint? SkillId,
    int? SkillLevel, ulong EffectiveTick, ulong UntilTick, string Reason);
