using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Contracts.Events;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class BomberEventContractTests
{
    private static NetEntityId Id(string text)
    {
        Assert.True(NetEntityId.TryParse(text, out var id));
        return id;
    }

    [Fact]
    public void LifeSnapshotRetainsWorldAndOldGenerationAfterRebind()
    {
        var actor = new BomberActor(Id("00000000000000010000000000000007"),
            Id("00000000000000010000000000000008"), 1);
        var next = actor with { Life = Id("00000000000000020000000000000008"), LifeGeneration = 2 };
        Assert.Equal(actor.Participant, next.Participant);
        Assert.NotEqual(actor.Life, next.Life);
        Assert.Equal(1UL, actor.LifeGeneration);
        Assert.Equal("00000000000000020000000000000008", next.Life.ToHex());
    }

    [Fact]
    public void WideCountersAndOpaqueTransactionStringsRemainLossless()
    {
        var stamp = new BomberEventStamp(ulong.MaxValue, 9007199254740993UL, ulong.MaxValue);
        var receipt = new BomberVoxelReceipt("logical:7/9007199254740993", "batch:7/42",
            stamp.Tick, stamp.Tick, stamp.Tick + 1, "sdk-value", "sdk-disposition");
        Assert.Equal(9007199254740993UL, stamp.Tick);
        Assert.Equal(ulong.MaxValue, stamp.Sequence);
        Assert.Equal("logical:7/9007199254740993", receipt.TransactionId);
        Assert.NotEqual(receipt.TransactionId, receipt.BatchTransactionId);
        Assert.Equal(stamp.Tick + 1, receipt.ObservedTick);
    }

    [Fact]
    public void SlotsArmsAndResultReferenceAreIndependentValues()
    {
        var skills = new BomberSkills(new(1, 2, true), new(3, 4, false), new(5, 6, true));
        Assert.Equal(2, skills.Bomb.Level);
        Assert.Equal(4, skills.Active.Level);
        Assert.Equal(6, skills.Passive.Level);
        var arms = new BomberArms(1, 2, 3, 4);
        Assert.Equal(4, arms.Left);
        Assert.Equal(1, arms.Up);
        var previous = new BomberResultReference(10, 21);
        Assert.NotEqual(previous, new BomberResultReference(11, 22));
        Assert.Equal(21UL, previous.PublishedGeneration);
    }

    [Fact]
    public void SameOwnerSourcesRetainDistinctBombAndChainValues()
    {
        var actor = new BomberActor(Id("00000000000000010000000000000001"),
            Id("00000000000000010000000000000002"), 3);
        var first = new BomberSource(actor, actor.Life,
            Id("00000000000000010000000000000003"), 7, 2, 40);
        var second = first with { Bomb = Id("00000000000000010000000000000004"), ChainId = 41 };
        Assert.Equal(first.Actor, second.Actor);
        Assert.NotEqual(first.Bomb, second.Bomb);
        Assert.NotEqual(first.ChainId, second.ChainId);
        // Value preservation only; not an assertion about live Effect request/results.
    }

    [Fact]
    public void CatalogHasUniqueNamesAndOneCanonicalEntryPerEvent()
    {
        var rows = BomberEventCatalog.All;
        Assert.Equal(62, rows.Count);
        Assert.Equal(46, rows.Count(x => x.Kind == BomberCatalogKind.Typed));
        Assert.Equal(14, rows.Count(x => x.Kind == BomberCatalogKind.Derived));
        Assert.Equal(2, rows.Count(x => x.Kind == BomberCatalogKind.Excluded));
        Assert.Equal(rows.Count, rows.Select(x => x.Name).Distinct(StringComparer.Ordinal).Count());
        foreach (var row in rows)
        {
            Assert.Matches("^[a-z][a-z0-9_]*$", row.Name);
            if (row.Kind == BomberCatalogKind.Excluded) Assert.Null(row.PayloadType);
            else Assert.True(typeof(IBomberEvent).IsAssignableFrom(row.PayloadType));
        }
        foreach (var type in typeof(IBomberEvent).Assembly.GetTypes()
            .Where(t => t.IsValueType && typeof(IBomberEvent).IsAssignableFrom(t)))
            Assert.Single(rows, x => x.Kind == BomberCatalogKind.Typed && x.PayloadType == type);
    }

    [Fact]
    public void CatalogMatchesEveryPlannedTelemetryDescriptor()
    {
        // Pinned from bomber-event-implementation-plan.md, Task 3; do not derive expectations from All.
        BomberEventDescriptor[] expected =
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
        };

        Assert.Equal(60, expected.Length);
        Assert.Equal(expected.Length, BomberEventCatalog.All.Count);
        foreach (var descriptor in expected)
            Assert.Equal(descriptor, Assert.Single(BomberEventCatalog.All, row => row.Name == descriptor.Name));
    }

    [Fact]
    public void TelemetryMappingCoversDesignAndSeparatesPickupRejection()
    {
        const string names = "match_join first_move first_bomb_place first_block_destroyed first_pickup first_damage_taken first_damage_dealt first_kill powerup_picked powerup_dropped_death hat_king_changed supply_announced supply_opened death respawn match_end next_match_stay water_enter water_exit drown_death final_circle_start ring_shrink eliminated final_chest_opened powerup_dropped poison_death character_select skill_cast skill_pickup skill_pickup_rejected skill_evolve skill_dropped_death regen_heal ring_clear poisoned shocked cured toxin_death";
        foreach (var name in names.Split(' ')) Assert.Single(BomberEventCatalog.All, x => x.Name == name);
        Assert.Equal(typeof(PickupRejected), BomberEventCatalog.All.Single(x => x.Name == "skill_pickup_rejected").PayloadType);
        Assert.Equal(typeof(SkillRejected), BomberEventCatalog.All.Single(x => x.Name == "skill_rejected").PayloadType);
        Assert.Equal("F", BomberEventCatalog.All.Single(x => x.Name == "match_end").DraftDependencies);
        Assert.Equal(BomberCatalogKind.Excluded, BomberEventCatalog.All.Single(x => x.Name == "supply_opened").Kind);
    }
}
