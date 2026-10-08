using System;
using System.Linq;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Config;

public sealed record BomberObjectBudgets(
    int BombCapacity, int PickupCapacity, int FireZoneCapacity,
    int RequiredBombs, int RequiredPickups, int RequiredFireZones,
    int ParticipantLimit, int ChestLimit, int ChestHitLimit,
    int PlacementsPerParticipantTick, int WallCastsPerParticipantTick,
    int ReservationRetirementSlackTicks, int DeathOutputLimit, int PerBombContactLimit);

public static class BomberObjectBudgetCalculator
{
    public static BomberObjectBudgets Calculate(BomberTypedTables tables)
    {
        try
        {
            return CalculateChecked(tables);
        }
        catch (OverflowException exception)
        {
            throw new InvalidOperationException("object_budgets: effective producer lifetime arithmetic exceeds the supported integer range.", exception);
        }
    }

    private static BomberObjectBudgets CalculateChecked(BomberTypedTables tables)
    {
        var rule = tables.ObjectBudgets.Rows.Single();
        var game = tables.Game.Rows.Single();
        var map = tables.Map.Rows.Single();
        var bomb = tables.Bomb.Rows.Single();
        var regeneration = tables.Regeneration.Rows.Single();
        var circle = tables.FinalCircle.Rows.Single();
        var chest = tables.Chest.Rows.Single(row => row.Name == "default");

        if (map.LayoutKind != "LegacyPillars")
            throw Invalid("map.layout_kind", map.LayoutKind);

        Positive(rule.MaxBombEntities, "max_bomb_entities");
        Positive(rule.MaxPickupEntities, "max_pickup_entities");
        Positive(rule.MaxFirezoneEntities, "max_firezone_entities");
        Positive(rule.MaxBombPlacementsPerParticipantTick, "max_bomb_placements_per_participant_tick");
        Positive(rule.ReservationRetirementSlackTicks, "reservation_retirement_slack_ticks");
        Exact(rule.MaxDistinctMatchParticipants, 8, "max_distinct_match_participants");
        Exact(game.PlayerCount, rule.MaxDistinctMatchParticipants, "game.player_count");
        Exact(rule.InitialMintGenerations, 1, "initial_mint_generations");
        Exact(rule.MaxChestIssuancesPerStage, 1, "max_chest_issuances_per_stage");
        Exact(rule.MaxWallCastsPerParticipantTick, 1, "max_wall_casts_per_participant_tick");
        Exact(map.Width, 19, "map.width");
        Exact(map.Depth, 19, "map.depth");
        Exact(game.MapSize, map.Width, "game.map_size");
        if (map.EntityBudgetMode != "EffectiveProducerLifetimeBounds")
            throw Invalid("map.entity_budget_mode", map.EntityBudgetMode);
        if (game.TickRateHz == 0) throw Invalid("game.tick_rate_hz", game.TickRateHz);
        if (regeneration.MaxMirrorOrbits < 0) throw Invalid("regeneration.max_mirror_orbits", regeneration.MaxMirrorOrbits);
        if (chest.IndependentBombHits <= 0 ||
            chest.IndependentBombHits > new Contracts.Components.BomberChestState().HitBombs.MaxCapacity)
            throw Invalid("chest.independent_bomb_hits", chest.IndependentBombHits);

        var capacity = tables.Attributes.Rows.Single(row => row.Name == BomberAttributeNames.BombCapacity).Maximum;
        if (capacity < 0 || rule.MaxBombPlacementsPerParticipantTick < capacity)
            throw new InvalidOperationException($"object_budgets.max_bomb_placements_per_participant_tick={rule.MaxBombPlacementsPerParticipantTick} must cover attributes.BombCapacity.maximum={capacity}.");

        ValidateProducers(tables);

        var stageCount = tables.CircleStages.Rows.Count(row => row.SpawnChest);
        if (stageCount > 5) throw new InvalidOperationException($"circle_stages.spawn_chest requires {stageCount} chest issuances; first-round envelope provisions at most 5.");
        BomberResourceRewardRules.Validate(tables, game.SkillsEnabled);
        ulong rewardCount = checked((ulong)BomberResourceRewardRules.Maximum(game.SkillsEnabled, chest));
        ulong regenerationReward = checked((ulong)tables.Chest.Rows
            .Where(row => row.Name is "SoftOuter" or "SoftMiddle" or "SoftCore" or "Wood" or "Iron" or "Gold")
            .Max(row => BomberResourceRewardRules.Maximum(game.SkillsEnabled, row)));
        ulong initialReward = checked((ulong)tables.Chest.Rows
            .Where(row => row.Name is "SoftOuter" or "SoftMiddle" or "SoftCore")
            .Max(row => BomberResourceRewardRules.Maximum(game.SkillsEnabled, row)));

        ulong Tick(uint milliseconds) => Ticks.FromMilliseconds(milliseconds, game.TickRateHz);
        var fuse = Tick(bomb.FuseMs);
        var danger = Tick(bomb.DangerMs);
        // Enabled Fire retains the same bomb for its authored Native Burn phase.
        // Charge that residence before opening its public producer admission.
        var fireSkill = tables.Skills.Rows.Single(row => row.Name == "fireBomb");
        var burn = tables.BombKinds.Rows.Single(row => row.Name == "Fire").Enabled
            ? Tick(tables.SkillLevels.Rows.Single(row => row.SkillId == fireSkill.Id && row.Level == 1).DurationMs)
            : 0UL;
        if (fuse == 0) throw Invalid("bomb.fuse_ms", bomb.FuseMs);
        if (danger == 0) throw Invalid("bomb.danger_ms", bomb.DangerMs);
        var match = Tick(game.MatchDurationMs);
        var final = Tick(circle.DurationMs);
        var lead = Tick(regeneration.StopBeforeFinalMs);
        var interval = Tick(regeneration.IntervalMs);
        if (interval == 0) throw Invalid("regeneration.interval_ms", regeneration.IntervalMs);
        if (final > match) throw Invalid("final_circle.duration_ms", circle.DurationMs);
        var first = Tick(regeneration.FirstTriggerMs);
        var stopOffset = checked(final + lead);
        var stop = match > stopOffset ? match - stopOffset : 0UL;
        var waves = first < stop ? checked(1UL + (stop - 1UL - first) / interval) : 0UL;
        var regenerationCells = checked(waves * 4UL * checked((ulong)regeneration.MaxMirrorOrbits));
        var strongIssuances = checked((ulong)stageCount * (ulong)rule.MaxChestIssuancesPerStage);
        // Lifetime issuance provisions concurrent and unpublished chest owners.
        // A bomb's separate contact capacity is its actual generated declaration.
        var chestIssuances = checked(regenerationCells + strongIssuances);
        var wallRows = tables.SkillLevels.Rows.Where(row => row.Name.StartsWith("fireDash_lv", StringComparison.Ordinal)).ToArray();
        if (wallRows.Length == 0) throw Invalid("skill_levels.fireDash.wall_ms", "missing");
        var wallTicks = wallRows.Max(row => Tick(row.WallMs));

        var participants = checked((ulong)rule.MaxDistinctMatchParticipants);
        var slack = checked((ulong)rule.ReservationRetirementSlackTicks);
        // Primary Fuse bombs retain the same participant inventory across death/respawn.
        // Remote's eight-second wait therefore cannot create another Fuse cohort per Tick.
        // Keep the existing conservative ordinary-fuse envelope (at least the inventory cap),
        // then provision exploded Danger rows and structural retirement separately. Actual
        // live rows plus unpublished orders still pass the common hard-cap admission owner.
        var fuseRowsPerParticipant = Math.Max((ulong)capacity, checked((ulong)rule.MaxBombPlacementsPerParticipantTick * fuse));
        var requiredBombs = checked(participants * checked(fuseRowsPerParticipant +
            (ulong)rule.MaxBombPlacementsPerParticipantTick * checked(danger + burn + slack)) + 128UL);
        var requiredPickups = checked(checked((ulong)map.Width * (ulong)map.Depth * (ulong)rule.InitialMintGenerations * initialReward)
            + checked(regenerationCells * regenerationReward)
            + checked(strongIssuances * rewardCount));
        var requiredWalls = checked(participants * (ulong)rule.MaxWallCastsPerParticipantTick * checked(wallTicks + slack));
        // Public active-skill admission currently reaches 2, 3, 4 and 13 only.
        // FireDash has no public producer; preserve its old conservative allowance.
        // A Favorite cast leases every future region, including retained expired rows.
        // Bound levels reachable through character selection, rather than dormant rows,
        // determine this cohort. Any future enabled FireDash producer must sum cohorts.
        if (game.SkillsEnabled && tables.BombKinds.Rows.Single(row => row.Name == "Fire").Enabled)
        {
            ulong favoriteTicks = 0;
            foreach (var character in tables.Characters.Rows.Where(row => row.BoundSlot == "Active" && row.BoundSkillId == 4u))
                favoriteTicks = Math.Max(favoriteTicks, Tick(tables.SkillLevels.Rows.Single(row =>
                    row.SkillId == 4u && row.Level == character.BoundLevel).DurationMs));
            requiredWalls = Math.Max(requiredWalls, checked(participants * favoriteTicks));
        }

        var supplyFrenzy = SupplyFrenzyBounds(tables);
        requiredBombs = checked(requiredBombs + supplyFrenzy.FrenzyBombs);
        requiredPickups = checked(requiredPickups + supplyFrenzy.Pickups);

        RequireCapacity("max_bomb_entities", requiredBombs, rule.MaxBombEntities);
        RequireCapacity("max_pickup_entities", requiredPickups, rule.MaxPickupEntities);
        RequireCapacity("max_firezone_entities", requiredWalls, rule.MaxFirezoneEntities);
        return new BomberObjectBudgets(rule.MaxBombEntities, rule.MaxPickupEntities, rule.MaxFirezoneEntities,
            checked((int)requiredBombs), checked((int)requiredPickups), checked((int)requiredWalls),
            rule.MaxDistinctMatchParticipants, checked((int)chestIssuances), chest.IndependentBombHits,
            rule.MaxBombPlacementsPerParticipantTick, rule.MaxWallCastsPerParticipantTick, rule.ReservationRetirementSlackTicks,
            checked((int)tables.Attributes.Rows.Where(row => row.Name == BomberAttributeNames.BombPower ||
                row.Name == BomberAttributeNames.BombCapacity || row.Name == BomberAttributeNames.SpeedTier)
                .Aggregate(4L, (total, row) => checked(total + row.Maximum - row.Initial))),
            new Contracts.Components.BomberBombState().ContactedChests.MaxCapacity);
    }

    private static ulong CeilingDivide(ulong value, ulong divisor)
    {
        if (divisor == 0) throw new InvalidOperationException("Frenzy interval must be positive.");
        return checked(value / divisor + (value % divisor == 0 ? 0UL : 1UL));
    }

    private static (ulong Pickups, ulong FrenzyBombs) SupplyFrenzyBounds(BomberTypedTables tables)
    {
        var game = tables.Game.Rows.Single();
        var counts = new[] { game.CentralSupplyStrengtheningCount, game.CentralSupplyHealthCount,
            game.CentralSupplyFrenzyCount, game.CentralSupplySpecialCount, game.CentralSupplyGoldenHeartCount };
        ulong total = 0;
        foreach (int count in counts)
        {
            if (count < 0) throw Invalid("game.central_supply_counts", count);
            total = checked(total + (ulong)count);
        }
        if (total > 11) throw Invalid("game.central_supply_counts", total);
        ulong Tick(uint ms) => Ticks.FromMilliseconds(ms, game.TickRateHz);
        ulong announce = Tick(game.CentralSupplyAnnounceMs);
        ulong open = Tick(game.CentralSupplyOpenMs);
        ulong match = Tick(game.MatchDurationMs);
        if (game.CentralSupplyAnnounceMs >= game.CentralSupplyOpenMs ||
            game.CentralSupplyOpenMs >= game.MatchDurationMs || announce >= open || open >= match)
            throw Invalid("game.central_supply_schedule", "announce < open < match in milliseconds and effective ticks required");
        ulong duration = Tick(game.FrenzyDurationMs);
        ulong fuse = Tick(game.FrenzyFuseMs);
        if (duration == 0) throw Invalid("game.frenzy_duration_ms", game.FrenzyDurationMs);
        if (fuse == 0) throw Invalid("game.frenzy_fuse_ms", game.FrenzyFuseMs);
        if (game.FrenzyConcurrentLimit is < 1 or > 6)
            throw Invalid("game.frenzy_concurrent_limit", game.FrenzyConcurrentLimit);
        if (game.FrenzyMinPlacementTicks < 5)
            throw Invalid("game.frenzy_min_placement_ticks", game.FrenzyMinPlacementTicks);
        var frenzy = tables.PickupKinds.Rows.Where(row => row.Name == "Frenzy").ToArray();
        if (frenzy.Length != 1 || frenzy[0].KindCode != 7 || frenzy[0].SoftWeight != 0 ||
            frenzy[0].AttributeName != "None" || frenzy[0].LedgerMode != "Frenzy" ||
            tables.PickupKinds.Rows.Any(row => row.KindCode == 7 && row.Name != "Frenzy"))
            throw Invalid("pickup_kinds.Frenzy.source", "one fixed kind7/None/Frenzy row with zero random-pool weight required");
        if (!game.CentralSupplyEnabled) return (0, 0);
        if (game.CentralSupplyFrenzyCount > 0 && !game.FrenzyEnabled)
            throw Invalid("game.central_supply_frenzy_count", "enabled source has disabled consumer");
        ulong pickups = checked(total - (game.SkillsEnabled ? 0UL : (ulong)game.CentralSupplySpecialCount));
        ulong sources = game.FrenzyEnabled ? (ulong)game.CentralSupplyFrenzyCount : 0UL;
        ulong perSource = CeilingDivide(duration, game.FrenzyMinPlacementTicks);
        // Every accepted placement is one retained live/promise credit even if retirement is unknown.
        return (pickups, checked(sources * perSource));
    }

    private static void ValidateProducers(BomberTypedTables tables)
    {
        foreach (var (name, code, effect) in new[]
            {
                ("Fire", 2u, "FireResidue"),
                ("Remote", 7u, "Remote"),
                ("Split", 4u, "Split"),
            })
        {
            var kinds = tables.BombKinds.Rows.Where(row => row.Name == name).ToArray();
            if (kinds.Length != 1 || (name == "Split" && kinds[0].Enabled) || kinds[0].KindCode != code || kinds[0].EffectKey != effect)
                throw Invalid($"bomb_kinds.{name}.dormant", name);
        }
        foreach (var row in tables.BombKinds.Rows.Where(row => row.Enabled))
            if ((row.Name, row.EffectKey) is not (("Standard", "BombDamage") or ("Freeze", "Freeze")
                or ("Pierce", "Pierce") or ("Toxin", "Toxin") or ("Shock", "Shock") or ("Remote", "Remote")
                or ("Fire", "FireResidue")))
                throw Invalid("bomb_kinds.enabled", row.Name);
        foreach (var row in tables.Blocks.Rows.Where(row => row.Enabled))
        {
            var expected = row.Name switch
            {
                "air" => ("air", "none", "none"),
                "floor" => ("floor", "none", "none"),
                "iron" => ("iron", "none", "none"),
                "hardPillar" => ("hardPillar", "none", "none"),
                "softBrick" => ("air", "soft", "none"),
                "crate" => ("air", "skill", "none"),
                "water" => ("water", "none", "drown"),
                "chest" => ("air", "chest", "none"),
                _ => throw Invalid("blocks.enabled", row.Name),
            };
            if (row.Residue != expected.Item1 || row.DropPool != expected.Item2 || row.GroundEffect != expected.Item3)
                throw Invalid($"blocks.{row.Name}.residue/drop_pool/ground_effect", $"{row.Residue}/{row.DropPool}/{row.GroundEffect}");
        }
        foreach (var row in tables.SkillLevels.Rows.Where(row => row.WallMs > 0))
            if (!row.Name.StartsWith("fireDash_lv", StringComparison.Ordinal)
                || !tables.Skills.Rows.Any(skill => skill.Id == row.SkillId && skill.Name == "fireDash"))
                throw Invalid("skill_levels.wall_ms", row.Name);
        foreach (var row in tables.Skills.Rows)
        {
            if ((row.Name, row.Trigger, row.EffectKey) is not
                (("regen", "OutOfCombat", "Regen")
                or ("bubble", "Activate", "Bubble")
                or ("blink", "Activate", "Teleport")
                or ("fireAura", "Activate", "FireExposure")
                or ("kick", "MoveIntoBomb", "Kick")
                or ("flyKick", "Activate", "Kick")
                or ("freezeBomb", "PlaceBomb", "Freeze")
                or ("pierceBomb", "PlaceBomb", "Pierce")
                or ("fireDash", "Activate", "FireWall")
                or ("bounceBubble", "Activate", "BubbleKick")
                or ("glacierBomb", "PlaceBomb", "FreezePierce")
                or ("toxinBomb", "PlaceBomb", "Toxin")
                or ("shockBomb", "PlaceBomb", "Shock")
                or ("fireBomb", "PlaceBomb", "FireResidue")
                or ("remoteBomb", "PlaceBomb", "Remote")
                or ("splitBomb", "PlaceBomb", "Split")))
                throw Invalid($"skills.{row.Name}.trigger/effect_key", $"{row.Trigger}/{row.EffectKey}");

            var dormant = row.Name switch
            {
                "fireBomb" => (Kind: "Fire", Code: 2u, Effect: "FireResidue", Duration: 1500u, Range: 0),
                "remoteBomb" => (Kind: "Remote", Code: 7u, Effect: "Remote", Duration: 8000u, Range: 0),
                "splitBomb" => (Kind: "Split", Code: 4u, Effect: "Split", Duration: 500u, Range: 1),
                _ => (Kind: "", Code: 0u, Effect: "", Duration: 0u, Range: 0),
            };
            if (dormant.Kind.Length != 0)
            {
                if (row.Slot != "Bomb" || row.IsCombo || row.CandyWeight != 0
                    || row.BombKindCode != dormant.Code || !row.RemovesProtection
                    || row.Trigger != "PlaceBomb" || row.EffectKey != dormant.Effect
                    || tables.SkillCombos.Rows.Any(combo => combo.LeftSkillId == row.Id
                        || combo.RightSkillId == row.Id || combo.ResultSkillId == row.Id))
                    throw Invalid($"skills.{row.Name}.dormant", row.Name);
                var levels = tables.SkillLevels.Rows.Where(level => level.SkillId == row.Id).ToArray();
                if (levels.Length != 1 || levels[0].Level != 1 || levels[0].DurationMs != dormant.Duration
                    || levels[0].RangeCells != dormant.Range || levels[0].RangeMode != "Fixed"
                    || levels[0].CooldownMs != 0 || levels[0].IntervalMs != 0 || levels[0].HealPoints != 0
                    || levels[0].FreezeMs != 0 || levels[0].PierceLayers != 0 || levels[0].PierceMode != "Fixed"
                    || levels[0].WallMs != 0 || levels[0].KickRangeCells != 0 || levels[0].FavoriteCooldownMs != 0)
                    throw Invalid($"skill_levels.{row.Name}.dormant", levels.Length);
            }

            if (row.Name == "flyKick")
            {
                if (row.Slot != "Active" || row.IsCombo || row.CandyWeight != 0 || row.BombKindCode != 0 || row.RemovesProtection)
                    throw Invalid("skills.flyKick.bound_only", row.Name);
                if (tables.SkillCombos.Rows.Any(combo => combo.LeftSkillId == row.Id || combo.RightSkillId == row.Id || combo.ResultSkillId == row.Id))
                    throw Invalid("skill_combos.flyKick", row.Name);
                var bindings = tables.Characters.Rows.Where(character => character.BoundSkillId == row.Id).ToArray();
                if (bindings.Length != 1 || bindings[0].Name != "kangaroo" || bindings[0].BoundSlot != "Active"
                    || bindings[0].BoundLevel != 1 || bindings[0].BoundMaxLevel != 1 || bindings[0].BaseAttributesProfile != "default")
                    throw Invalid("characters.flyKick.binding", row.Name);
                var levels = tables.SkillLevels.Rows.Where(level => level.SkillId == row.Id).ToArray();
                if (levels.Length != 1) throw Invalid("skill_levels.flyKick.count", levels.Length);
                var level = levels[0];
                // Moving an existing bomb is not an entity producer; reject effect/production parameters.
                if (level.Level != 1 || level.CooldownMs != 4000 || level.FavoriteCooldownMs != 3000
                    || level.RangeCells != 2 || level.RangeMode != "UntilObstacle"
                    || level.DurationMs != 0 || level.IntervalMs != 0 || level.HealPoints != 0
                    || level.FreezeMs != 0 || level.PierceLayers != 0 || level.PierceMode != "Fixed"
                    || level.WallMs != 0 || level.KickRangeCells != 0)
                    throw Invalid("skill_levels.flyKick.parameters", level.Name);
                if (tables.Bomb.Rows.Single().KickSpeedMilli != 8000)
                    throw Invalid("bomb.kick_speed_milli", tables.Bomb.Rows.Single().KickSpeedMilli);
            }

            var kindName = row.Name switch
            {
                "freezeBomb" or "glacierBomb" => "Freeze",
                "pierceBomb" => "Pierce",
                "toxinBomb" => "Toxin",
                "shockBomb" => "Shock",
                _ => null,
            };
            if (kindName is not null
                && !tables.BombKinds.Rows.Any(kind => kind.Enabled && kind.Name == kindName && kind.KindCode == row.BombKindCode))
                throw Invalid("skills.bomb_kind_code", row.Name);
        }
    }

    private static void Positive(int value, string field)
    {
        if (value <= 0) throw Invalid(field, value);
    }

    private static void Exact(int actual, int expected, string field)
    {
        if (actual != expected) throw new InvalidOperationException($"{field}={actual}; first-round supported value is {expected}.");
    }

    private static void RequireCapacity(string field, ulong required, int provisioned)
    {
        if (required > (ulong)provisioned)
            throw new InvalidOperationException($"object_budgets.{field}: required={required}, provisioned={provisioned}.");
    }

    private static InvalidOperationException Invalid(string field, object value) =>
        new($"Unsupported effective Bomber configuration {field}={value}.");
}
