using System;
using System.Collections.Generic;

namespace Lumio.Bomber.Gameplay.Contracts.Events;

/// <summary>Whether a telemetry name is a direct event, a documented derivation or excluded.</summary>
public enum BomberCatalogKind { Typed, Derived, Excluded }

/// <summary>Finite telemetry name, payload type and draft dependency metadata; Rule is documentation.</summary>
public readonly record struct BomberEventDescriptor(string Name, Type? PayloadType,
    BomberCatalogKind Kind, string Rule, string DraftDependencies);

/// <summary>Fixed game-owned event and telemetry mapping without discovery or retained history.</summary>
public static class BomberEventCatalog
{
    /// <summary>Canonical event rows followed by derived and excluded telemetry names.</summary>
    public static IReadOnlyList<BomberEventDescriptor> All { get; } =
        Array.AsReadOnly(new BomberEventDescriptor[]
        {
            new("match_started", typeof(MatchStarted), BomberCatalogKind.Typed, "occurrence", "none"),
            new("phase_changed", typeof(PhaseChanged), BomberCatalogKind.Typed, "occurrence", "F"),
            new("bomb_placed", typeof(BombPlaced), BomberCatalogKind.Typed, "occurrence", "none"),
            new("bomb_exploded", typeof(BombExploded), BomberCatalogKind.Typed, "occurrence", "none"),
            new("bomb_extinguished", typeof(BombExtinguished), BomberCatalogKind.Typed, "occurrence", "none"),
            new("bomb_kicked", typeof(BombKicked), BomberCatalogKind.Typed, "occurrence", "none"),
            new("damage_applied", typeof(DamageApplied), BomberCatalogKind.Typed, "occurrence", "P"),
            new("fire_region_born", typeof(FireRegionBorn), BomberCatalogKind.Typed, "actual finite Initial", "none"),
            new("fire_region_expired", typeof(FireRegionExpired), BomberCatalogKind.Typed, "actual finite Expired and Native action", "none"),
            new("death", typeof(PlayerDied), BomberCatalogKind.Typed, "occurrence", "P"),
            new("respawn", typeof(PlayerRespawned), BomberCatalogKind.Typed, "occurrence", "none"),
            new("eliminated", typeof(PlayerEliminated), BomberCatalogKind.Typed, "occurrence", "P/F"),
            new("powerup_dropped", typeof(PowerupsDropped), BomberCatalogKind.Typed, "occurrence", "none"),
            new("pickup_spawned", typeof(PickupSpawned), BomberCatalogKind.Typed, "occurrence", "none"),
            new("pickup_taken", typeof(PickupTaken), BomberCatalogKind.Typed, "occurrence", "none"),
            new("pickup_rejected", typeof(PickupRejected), BomberCatalogKind.Typed, "occurrence", "none"),
            new("pickup_destroyed", typeof(PickupDestroyed), BomberCatalogKind.Typed, "occurrence", "none"),
            new("hat_king_changed", typeof(HatKingChanged), BomberCatalogKind.Typed, "occurrence", "none"),
            new("brick_destroyed", typeof(BrickDestroyed), BomberCatalogKind.Typed, "occurrence", "none"),
            new("bricks_regrown", typeof(BricksRegrown), BomberCatalogKind.Typed, "occurrence", "none"),
            new("final_circle_start", typeof(FinalCircleStarted), BomberCatalogKind.Typed, "occurrence", "none"),
            new("ring_announced", typeof(RingAnnounced), BomberCatalogKind.Typed, "occurrence", "none"),
            new("ring_shrink", typeof(RingShrunk), BomberCatalogKind.Typed, "occurrence", "none"),
            new("ring_clear", typeof(RingCleared), BomberCatalogKind.Typed, "occurrence", "none"),
            new("chest_spawned", typeof(ChestSpawned), BomberCatalogKind.Typed, "occurrence", "none"),
            new("chest_hit", typeof(ChestHit), BomberCatalogKind.Typed, "occurrence", "none"),
            new("final_chest_opened", typeof(ChestOpened), BomberCatalogKind.Typed, "occurrence", "none"),
            new("crate_opened", typeof(ResourceCrateOpened), BomberCatalogKind.Typed, "Original resource chest opening; retain configured resource tier", "none"),
            new("skill_cast", typeof(SkillActivated), BomberCatalogKind.Typed, "occurrence", "P/T"),
            new("skill_rejected", typeof(SkillRejected), BomberCatalogKind.Typed, "occurrence", "none"),
            new("skill_pickup", typeof(SkillGained), BomberCatalogKind.Typed, "occurrence", "none"),
            new("skill_evolve", typeof(SkillEvolved), BomberCatalogKind.Typed, "occurrence", "none"),
            new("skill_dropped", typeof(SkillDropped), BomberCatalogKind.Typed, "occurrence", "none"),
            new("player_healed", typeof(PlayerHealed), BomberCatalogKind.Typed, "occurrence", "P/T"),
            new("player_frozen", typeof(PlayerFrozen), BomberCatalogKind.Typed, "occurrence", "P/T"),
            new("poisoned", typeof(PlayerPoisoned), BomberCatalogKind.Typed, "occurrence", "P/T"),
            new("shocked", typeof(PlayerShocked), BomberCatalogKind.Typed, "occurrence", "P/T"),
            new("cured", typeof(PlayerCured), BomberCatalogKind.Typed, "occurrence", "T"),
            new("match_end", typeof(MatchEnded), BomberCatalogKind.Typed, "occurrence", "F"),
            new("match_join", typeof(MatchJoined), BomberCatalogKind.Typed, "occurrence", "none"),
            new("first_move", typeof(PlayerFirstMoved), BomberCatalogKind.Typed, "occurrence", "none"),
            new("next_match_stay", typeof(NextMatchStayed), BomberCatalogKind.Typed, "occurrence", "none"),
            new("water_enter", typeof(WaterEntered), BomberCatalogKind.Typed, "occurrence", "none"),
            new("water_exit", typeof(WaterExited), BomberCatalogKind.Typed, "occurrence", "none"),
            new("character_select", typeof(CharacterSelected), BomberCatalogKind.Typed, "occurrence", "none"),
            new("chain_completed", typeof(ChainCompleted), BomberCatalogKind.Typed, "occurrence", "P"),
            new("first_bomb_place", typeof(BombPlaced), BomberCatalogKind.Derived, "first accepted placement per match and owner participant", "none"),
            new("first_block_destroyed", typeof(BrickDestroyed), BomberCatalogKind.Derived, "first committed brick destruction per match and source participant", "none"),
            new("first_pickup", typeof(PickupTaken), BomberCatalogKind.Derived, "first accepted pickup per match and picker participant", "none"),
            new("first_damage_taken", typeof(DamageApplied), BomberCatalogKind.Derived, "first accepted damage per match and victim participant", "P"),
            new("first_damage_dealt", typeof(DamageApplied), BomberCatalogKind.Derived, "first accepted damage per match and source participant", "P"),
            new("first_kill", typeof(PlayerDied), BomberCatalogKind.Derived, "first accepted kill per match and killer participant", "P"),
            new("powerup_picked", typeof(PickupTaken), BomberCatalogKind.Derived, "reinforcement kinds Power Capacity Speed only", "none"),
            new("powerup_dropped_death", typeof(PowerupsDropped), BomberCatalogKind.Derived, "Reason equals death", "none"),
            new("drown_death", typeof(PlayerDied), BomberCatalogKind.Derived, "Cause equals Drown", "P"),
            new("poison_death", typeof(PlayerDied), BomberCatalogKind.Derived, "Cause equals RingPoison", "P"),
            new("toxin_death", typeof(PlayerDied), BomberCatalogKind.Derived, "Cause equals Toxin; retain throwing owner", "P/T"),
            new("skill_pickup_rejected", typeof(PickupRejected), BomberCatalogKind.Derived, "Kind equals Skill; never cast rejection", "none"),
            new("skill_dropped_death", typeof(SkillDropped), BomberCatalogKind.Derived, "Reason equals death", "none"),
            new("regen_heal", typeof(PlayerHealed), BomberCatalogKind.Derived, "Reason equals regeneration", "P/T"),
            new("supply_announced", null, BomberCatalogKind.Excluded, "outside Stage 0", "none"),
            new("supply_opened", null, BomberCatalogKind.Excluded, "outside Stage 0", "none"),
        });
}
