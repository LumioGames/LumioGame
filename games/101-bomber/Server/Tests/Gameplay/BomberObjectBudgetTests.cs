using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberObjectBudgetTests
{
    private static string Root() => Lumio.Bomber.Tests.EngineRelease.RepoRoot;
    private static string Export(string? profile = null) => Path.Combine(Root(), "Server/Config", profile is null ? "Tables" : "Profiles/" + profile);

    [Theory]
    [InlineData(3024u)]
    [InlineData(3050u)]
    public void AuthoredWarmupAndProtectionUseTheEngineTickConversion(uint milliseconds)
    {
        string value = milliseconds.ToString(CultureInfo.InvariantCulture);
        using var fixture = new AuthoredFixture(("game", "default", "warmup_ms", value),
            ("life", "default", "protection_ms", value));
        using WorldManager manager = BomberTestWorld.Start(configDirectory: fixture.Compile());
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        for (int slot = 0; slot < config.Game.PlayerCount; slot++)
            BomberTestWorld.QueuePlayer(manager.World, "authored-timing-" + slot);
        manager.Tick();
        ulong spawnTick = manager.World.Tick;
        manager.Tick();
        manager.Tick();

        ulong duration = Ticks.FromMilliseconds(milliseconds, config.Game.TickRateHz);
        BomberMatchState match = manager.World.Single<BomberMatchState>();
        Assert.True(match.MatchId.Value > 0);
        Assert.Equal((int)BomberMatchPhase.Warmup, match.Phase.Value);
        Assert.Equal(match.StartTick.Value + duration, match.PhaseEndTick.Value);
        Assert.All(manager.World.Each<BomberPlayerState>(), player =>
            Assert.Equal(spawnTick + duration, player.ProtectedUntilTick.Value));
    }

    [Theory]
    [InlineData(null, 2496, 1351, 336, 245)]
    [InlineData("skills-on", 2496, 1351, 336, 245)]
    [InlineData("fuse-1800", 2208, 1351, 336, 245)]
    [InlineData("danger-300", 2400, 1351, 336, 245)]
    [InlineData("danger-500", 2592, 1351, 336, 245)]
    [InlineData("match-360000", 2496, 1127, 336, 189)]
    [InlineData("match-480000", 2496, 1607, 336, 309)]
    [InlineData("final-circle-90000", 2496, 1447, 336, 269)]
    [InlineData("final-circle-140000", 2496, 1255, 336, 221)]
    [InlineData("skills-off", 2496, 1106, 336, 245)]
    public void EffectiveProfilesHaveIndependentRequiredCapacity(string? profile, int bombs, int pickups, int walls, int chests)
    {
        var config = BomberConfigBinding.Read(Export(profile));
        Assert.Equal((2784, 1607, 336), (config.ObjectBudgets.BombCapacity, config.ObjectBudgets.PickupCapacity, config.ObjectBudgets.FireZoneCapacity));
        Assert.Equal((bombs + 128, pickups, walls), (config.ObjectBudgets.RequiredBombs, config.ObjectBudgets.RequiredPickups, config.ObjectBudgets.RequiredFireZones));
        Assert.Equal((8, chests, 3), (config.ObjectBudgets.ParticipantLimit, config.ObjectBudgets.ChestLimit, config.ObjectBudgets.ChestHitLimit));
        Assert.Equal(new BomberBombState().ContactedChests.MaxCapacity, config.ObjectBudgets.PerBombContactLimit);
        Assert.Equal((6, 1, 2), (config.ObjectBudgets.PlacementsPerParticipantTick, config.ObjectBudgets.WallCastsPerParticipantTick, config.ObjectBudgets.ReservationRetirementSlackTicks));
        Assert.Equal(126001u, config.ObjectBudgetRules.Id);
    }

    [Fact]
    public void EveryShippedProfilePassesTheEffectiveCalculator()
    {
        var authoring = new HashSet<string>(StringComparer.Ordinal)
        {
            "m2-map-19", "m2-map-23", "m2-map-27",
            "m2-room-19", "m2-room-23", "m2-room-27",
        };
        foreach (var path in Directory.EnumerateDirectories(Path.Combine(Root(), "Server/Config/Profiles")))
        {
            var profile = Path.GetFileName(path);
            if (authoring.Remove(profile))
            {
                var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(Export(profile)));
                Assert.Contains("map.layout_kind", error.Message, StringComparison.Ordinal);
                continue;
            }
            var config = BomberConfigBinding.Read(Export(profile));
            Assert.True(config.ObjectBudgets.RequiredBombs <= config.ObjectBudgets.BombCapacity, profile);
            Assert.True(config.ObjectBudgets.RequiredPickups <= config.ObjectBudgets.PickupCapacity, profile);
            Assert.True(config.ObjectBudgets.RequiredFireZones <= config.ObjectBudgets.FireZoneCapacity, profile);
        }
        Assert.Empty(authoring);
    }

    [Fact]
    public void LongerFuseProfileProvidesItsExactEffectiveLifetimeAndTerrainReserve()
    {
        var config = BomberConfigBinding.Read(Export("fuse-2400"));
        Assert.Equal(2912, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(2912, config.ObjectBudgets.BombCapacity);
        Assert.Equal((1607, 336), (config.ObjectBudgets.PickupCapacity, config.ObjectBudgets.FireZoneCapacity));
        using var fixture = new AuthoredFixture(("bomb", "default", "fuse_ms", "2400"),
            ("object_budgets", "default", "max_bomb_entities", "2911"));
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(fixture.Compile()));
        Assert.Contains("required=2912, provisioned=2911", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void RemoteFuseUsesSharedCrossLifeInventoryWithoutMultiplyingItsEightSecondWait()
    {
        using var fixture = new AuthoredFixture(("bomb_kinds", "Remote", "enabled", "true"));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(8000u, config.Tables.SkillLevels.Rows.Single(row => row.Name == "remoteBomb_lv1").DurationMs);
        Assert.Equal(2624, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(2784, config.ObjectBudgets.BombCapacity);
        fixture.Change("object_budgets", "default", "max_bomb_entities", "2623");
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(fixture.Compile()));
        Assert.Contains("required=2624, provisioned=2623", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void EnabledRemoteStillRejectsUnapprovedFuseParameters()
    {
        using var fixture = new AuthoredFixture(("bomb_kinds", "Remote", "enabled", "true"),
            ("skill_levels", "remoteBomb_lv1", "duration_ms", "8001"));
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(fixture.Compile()));
        Assert.Contains("skill_levels.remoteBomb", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("fuse-2400", "danger-500", "bomb", "danger_ms", "500", "object_budgets.max_bomb_entities", "3008")]
    [InlineData("match-480000", "final-circle-90000", "final_circle", "duration_ms", "90000", "object_budgets.max_pickup_entities", "1703")]
    public void CompositeProfilesRecomputeAndRequireMoreThanIndependentProvision(string baseline, string other,
        string table, string column, string value, string expectedField, string expectedRequired)
    {
        _ = other;
        var first = baseline == "fuse-2400" ? ("bomb", "default", "fuse_ms", "2400") : ("game", "default", "match_duration_ms", "480000");
        using var fixture = new AuthoredFixture(first, (table, "default", column, value));
        if (baseline == "match-480000")
        {
            // The final-circle profile scales each stage with its duration.
            foreach (var (stage, atMs) in new[] { ("stage2", "29000"), ("stage3", "44250"), ("stage4", "59500"), ("stage5", "74750"), ("stage6", "86150") })
                fixture.Change("circle_stages", stage, "at_ms", atMs);
        }
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(fixture.Compile()));
        Assert.Contains(expectedField, error.Message, StringComparison.Ordinal);
        Assert.Contains("required=" + expectedRequired, error.Message, StringComparison.Ordinal);
        fixture.Change("object_budgets", "default", baseline == "fuse-2400" ? "max_bomb_entities" : "max_pickup_entities", expectedRequired);
        var accepted = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(int.Parse(expectedRequired, CultureInfo.InvariantCulture), baseline == "fuse-2400" ? accepted.ObjectBudgets.RequiredBombs : accepted.ObjectBudgets.RequiredPickups);
    }

    [Theory]
    [InlineData("object_budgets", "default", "max_bomb_entities", "2623", "max_bomb_entities")]
    [InlineData("object_budgets", "default", "max_pickup_entities", "1350", "max_pickup_entities")]
    [InlineData("object_budgets", "default", "max_firezone_entities", "335", "max_firezone_entities")]
    [InlineData("regeneration", "default", "interval_ms", "0", "regeneration.interval_ms")]
    [InlineData("bomb", "default", "fuse_ms", "0", "bomb.fuse_ms")]
    [InlineData("bomb", "default", "fuse_ms", "49", "bomb.fuse_ms")]
    [InlineData("bomb", "default", "danger_ms", "0", "bomb.danger_ms")]
    [InlineData("bomb", "default", "danger_ms", "49", "bomb.danger_ms")]
    [InlineData("chest", "default", "independent_bomb_hits", "4", "chest.independent_bomb_hits")]
    [InlineData("game", "default", "player_count", "9", "game.player_count")]
    [InlineData("map", "default", "width", "21", "map.width")]
    [InlineData("object_budgets", "default", "initial_mint_generations", "2", "initial_mint_generations")]
    [InlineData("circle_stages", "stage6", "spawn_chest", "true", "circle_stages.spawn_chest")]
    [InlineData("bomb_kinds", "Fire", "enabled", "true", "object_budgets.max_bomb_entities: required=4064, provisioned=2784")]
    [InlineData("bomb_kinds", "Split", "enabled", "true", "bomb_kinds.Split.dormant")]
    [InlineData("bomb_kinds", "Fire", "effect_key", "Reserved", "bomb_kinds.Fire.dormant")]
    [InlineData("bomb_kinds", "Remote", "kind_code", "6", "bomb_kinds.Remote.dormant")]
    [InlineData("skills", "fireBomb", "slot", "Active", "skills.fireBomb.dormant")]
    [InlineData("skills", "remoteBomb", "is_combo", "true", "skills.remoteBomb.dormant")]
    [InlineData("skills", "splitBomb", "candy_weight", "1", "skills.splitBomb.dormant")]
    [InlineData("skills", "fireBomb", "bomb_kind_code", "3", "skills.fireBomb.dormant")]
    [InlineData("skills", "remoteBomb", "effect_key", "Reserved", "skills.remoteBomb.trigger/effect_key")]
    [InlineData("skill_levels", "splitBomb_lv1", "wall_ms", "1000", "skill_levels.wall_ms")]
    [InlineData("skill_levels", "remoteBomb_lv1", "interval_ms", "1000", "skill_levels.remoteBomb.dormant")]
    [InlineData("blocks", "wood", "enabled", "true", "blocks.enabled")]
    [InlineData("blocks", "softBrick", "residue", "firecracker", "blocks.softBrick.residue")]
    [InlineData("blocks", "softBrick", "drop_pool", "fire", "blocks.softBrick.residue")]
    [InlineData("skill_levels", "bubble_lv1", "wall_ms", "1000", "skill_levels.wall_ms")]
    [InlineData("skills", "flyKick", "candy_weight", "1", "skills.flyKick")]
    [InlineData("skills", "flyKick", "is_combo", "true", "skills.flyKick")]
    [InlineData("skills", "flyKick", "slot", "Bomb", "skills.flyKick")]
    [InlineData("skills", "flyKick", "bomb_kind_code", "3", "skills.flyKick")]
    [InlineData("skills", "flyKick", "removes_protection", "true", "skills.flyKick")]
    [InlineData("skill_combos", "fireDash", "result_skill_id", "13", "skill_combos.flyKick")]
    [InlineData("skill_combos", "fireDash", "left_skill_id", "13", "skill_combos.flyKick")]
    [InlineData("skill_combos", "fireDash", "right_skill_id", "13", "skill_combos.flyKick")]
    [InlineData("characters", "kangaroo", "bound_max_level", "3", "characters.flyKick")]
    [InlineData("characters", "bear", "bound_skill_id", "13", "characters.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "wall_ms", "1000", "skill_levels.wall_ms")]
    [InlineData("skill_levels", "flyKick_lv1", "duration_ms", "1000", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "interval_ms", "1000", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "heal_points", "1", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "freeze_ms", "1000", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "pierce_layers", "1", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "pierce_mode", "FullPowerLine", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "kick_range_cells", "5", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "level", "2", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "range_cells", "3", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "range_mode", "Fixed", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "cooldown_ms", "0", "skill_levels.flyKick")]
    [InlineData("skill_levels", "flyKick_lv1", "favorite_cooldown_ms", "0", "skill_levels.flyKick")]
    [InlineData("bomb", "default", "kick_speed_milli", "9000", "bomb.kick_speed_milli")]
    [InlineData("skills", "freezeBomb", "bomb_kind_code", "2", "skills.bomb_kind_code")]
    [InlineData("object_budgets", "default", "max_bomb_placements_per_participant_tick", "-1", "max_bomb_placements_per_participant_tick")]
    public void InvalidAuthoredEffectiveValueFailsBeforeWorldAttachment(string table, string row, string column, string value, string diagnostic)
    {
        using var fixture = new AuthoredFixture((table, row, column, value));
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(fixture.Compile()));
        Assert.Contains(diagnostic, error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("fireDash", "effect_key", "UnknownWall")]
    [InlineData("freezeBomb", "trigger", "UnknownPlaceBomb")]
    [InlineData("regen", "trigger", "UnknownOutOfCombat")]
    [InlineData("bubble", "effect_key", "UnknownBubble")]
    [InlineData("glacierBomb", "effect_key", "UnknownFreezePierce")]
    [InlineData("shockBomb", "trigger", "UnknownPlaceBomb")]
    [InlineData("flyKick", "trigger", "PlaceBomb")]
    [InlineData("flyKick", "effect_key", "FireWall")]
    public void KnownSkillWithUnsupportedDispatchIsRejectedBeforeWorldAttachment(string skill, string column, string value)
    {
        using var fixture = new AuthoredFixture(("skills", skill, column, value));
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(fixture.Compile()));
        Assert.Contains("skills.", error.Message, StringComparison.Ordinal);
        Assert.Contains(skill, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ArithmeticOverflowIsRejected()
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "tick_rate_hz", uint.MaxValue.ToString(CultureInfo.InvariantCulture)),
            ("game", "default", "match_duration_ms", uint.MaxValue.ToString(CultureInfo.InvariantCulture)),
            ("regeneration", "default", "interval_ms", "1"),
            ("regeneration", "default", "max_mirror_orbits", int.MaxValue.ToString(CultureInfo.InvariantCulture)));
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(fixture.Compile()));
        Assert.Contains("arithmetic exceeds", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ExactEffectiveMinimumCapacitiesAreAdmitted()
    {
        using var fixture = new AuthoredFixture(
            ("object_budgets", "default", "max_bomb_entities", "2624"),
            ("object_budgets", "default", "max_pickup_entities", "1351"),
            ("object_budgets", "default", "max_firezone_entities", "336"));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(config.ObjectBudgets.BombCapacity, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(config.ObjectBudgets.PickupCapacity, config.ObjectBudgets.RequiredPickups);
        Assert.Equal(config.ObjectBudgets.FireZoneCapacity, config.ObjectBudgets.RequiredFireZones);
    }

    [Fact]
    public void LoadAlsoRejectsUnderprovisionBeforeWorldAttachment()
    {
        using var fixture = new AuthoredFixture(("object_budgets", "default", "max_bomb_entities", "2623"));
        var export = fixture.Compile();
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Load(export));
        Assert.Contains("required=2624, provisioned=2623", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("max_bomb_entities", 2647, 2648, true)]
    [InlineData("max_bomb_entities", 2648, 2648, false)]
    [InlineData("max_pickup_entities", 1114, 1115, true)]
    [InlineData("max_pickup_entities", 1115, 1115, false)]
    public void SupplyFrenzyMinimumBoundariesUseWholeIssuance(string field, int provisioned, int required, bool reject)
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "central_supply_enabled", "true"),
            ("game", "default", "skills_enabled", "false"),
            ("object_budgets", "default", field, provisioned.ToString(CultureInfo.InvariantCulture)));
        string directory = fixture.Compile();
        if (reject)
        {
            var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
            Assert.Contains($"required={required}, provisioned={provisioned}", error.Message, StringComparison.Ordinal);
        }
        else
        {
            var config = BomberConfigBinding.Read(directory);
            Assert.Equal(2648, config.ObjectBudgets.RequiredBombs);
            Assert.Equal(1115, config.ObjectBudgets.RequiredPickups);
            Assert.Equal(336, config.ObjectBudgets.RequiredFireZones);
        }
    }

    [Theory]
    [InlineData(false, true, 2624, 1351)]
    [InlineData(true, false, 2648, 1115)]
    [InlineData(true, true, 2648, 1362)]
    public void SupplyFrenzyEnableAndSkillFlagsProduceIndependentBounds(bool supply, bool skills, int bombs, int pickups)
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "central_supply_enabled", supply ? "true" : "false"),
            ("game", "default", "skills_enabled", skills ? "true" : "false"));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(bombs, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(pickups, config.ObjectBudgets.RequiredPickups);
    }

    [Fact]
    public void SupplyFrenzyTwoSequentialCandySourcesRequireFortyEightAcceptedBombCredits()
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "central_supply_enabled", "true"),
            ("game", "default", "skills_enabled", "false"),
            ("game", "default", "central_supply_frenzy_count", "2"),
            ("game", "default", "central_supply_golden_heart_count", "0"));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(2672, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(1115, config.ObjectBudgets.RequiredPickups);
    }

    [Fact]
    public void SupplyFrenzyElevenSupportedSourcesAreRejectedByTheUnchangedFormalMaximum()
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "central_supply_enabled", "true"),
            ("game", "default", "skills_enabled", "false"),
            ("game", "default", "central_supply_strengthening_count", "0"),
            ("game", "default", "central_supply_health_count", "0"),
            ("game", "default", "central_supply_special_count", "0"),
            ("game", "default", "central_supply_golden_heart_count", "0"),
            ("game", "default", "central_supply_frenzy_count", "11"));
        string directory = fixture.Compile();
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
        Assert.Contains("required=2888, provisioned=2784", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void SupplyFrenzyUsesTheExclusiveEndTickAndActualConfiguredDuration()
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "central_supply_enabled", "true"),
            ("game", "default", "skills_enabled", "false"),
            ("game", "default", "frenzy_duration_ms", "6001"));
        Assert.Equal(2648, BomberConfigBinding.Read(fixture.Compile()).ObjectBudgets.RequiredBombs);
        fixture.Change("game", "default", "frenzy_duration_ms", "6050");
        Assert.Equal(2649, BomberConfigBinding.Read(fixture.Compile()).ObjectBudgets.RequiredBombs);
    }

    [Theory]
    [InlineData("game", "default", "central_supply_open_ms", "50000", "central_supply")]
    [InlineData("game", "default", "central_supply_open_ms", "420000", "central_supply")]
    [InlineData("game", "default", "central_supply_strengthening_count", "8", "central_supply")]
    [InlineData("game", "default", "frenzy_duration_ms", "49", "frenzy_duration_ms")]
    [InlineData("game", "default", "frenzy_fuse_ms", "49", "frenzy_fuse_ms")]
    [InlineData("pickup_kinds", "Frenzy", "soft_weight", "1", "Frenzy")]
    [InlineData("pickup_kinds", "Frenzy", "kind_code", "8", "Frenzy")]
    [InlineData("pickup_kinds", "Frenzy", "ledger_mode", "Heal", "Frenzy")]
    [InlineData("pickup_kinds", "Fire", "kind_code", "7", "Frenzy")]
    [InlineData("game", "default", "central_supply_strengthening_count", "2147483647", "central_supply")]
    public void SupplyFrenzyRejectsUnmeteredOrInvalidAuthoredSources(string table, string row, string column, string value, string diagnostic)
    {
        using var fixture = new AuthoredFixture((table, row, column, value));
        string directory = fixture.Compile();
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
        Assert.Contains(diagnostic, error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SupplyFrenzyDisabledConsumerCannotBeAnEnabledCandySource()
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "central_supply_enabled", "true"),
            ("game", "default", "frenzy_enabled", "false"));
        string directory = fixture.Compile();
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
        Assert.Contains("central_supply_frenzy_count", error.Message, StringComparison.Ordinal);
        fixture.Change("game", "default", "central_supply_frenzy_count", "0");
        var disabled = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(2624, disabled.ObjectBudgets.RequiredBombs);
        Assert.Equal(1361, disabled.ObjectBudgets.RequiredPickups);
    }

    [Fact]
    public void SupplyFrenzyVeryLargeFiniteWindowCannotWrapTheRequiredBombCountToAnInt()
    {
        using var fixture = new AuthoredFixture(
            ("game", "default", "tick_rate_hz", "1000"),
            ("game", "default", "central_supply_enabled", "true"),
            ("game", "default", "skills_enabled", "false"),
            ("game", "default", "central_supply_strengthening_count", "0"),
            ("game", "default", "central_supply_health_count", "0"),
            ("game", "default", "central_supply_special_count", "0"),
            ("game", "default", "central_supply_golden_heart_count", "0"),
            ("game", "default", "central_supply_frenzy_count", "11"),
            ("game", "default", "frenzy_duration_ms", uint.MaxValue.ToString(CultureInfo.InvariantCulture)),
            ("bomb", "default", "fuse_ms", "1"),
            ("bomb", "default", "danger_ms", "1"));
        string directory = fixture.Compile();
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
        Assert.Contains("required=9448928369, provisioned=2784", error.Message, StringComparison.Ordinal);
    }

    internal sealed class AuthoredFixture : IDisposable
    {
        private readonly string root = Path.Combine(Root(), ".artifacts", "authored-config", Guid.NewGuid().ToString("N"));

        public AuthoredFixture(params (string Table, string Row, string Column, string Value)[] changes)
        {
            Directory.CreateDirectory(root);
            foreach (var folder in new[] { "schemas", "tables", "registry" })
            {
                Directory.CreateDirectory(Path.Combine(root, folder));
                foreach (var source in Directory.EnumerateFiles(Path.Combine(Root(), "Gameplay/Tables", folder)))
                    File.Copy(source, Path.Combine(root, folder, Path.GetFileName(source)));
            }
            File.Copy(Path.Combine(Root(), "Gameplay/Tables/repository.yaml"), Path.Combine(root, "repository.yaml"));
            File.WriteAllText(Path.Combine(root, "profiles.json"), "{\"profiles\":[]}");
            foreach (var change in changes) Change(change.Table, change.Row, change.Column, change.Value);
        }

        public void Change(string table, string row, string column, string value)
        {
            var file = Path.Combine(root, "tables", table + ".txt");
            var lines = File.ReadAllLines(file);
            var headers = Cells(lines[3]);
            var index = Array.IndexOf(headers, column);
            if (index < 0) throw new InvalidOperationException("Fixture column missing: " + column);
            for (var i = 5; i < lines.Length; i++)
            {
                var cells = Cells(lines[i]);
                if (cells.Length != headers.Length || cells[1] != row) continue;
                cells[index] = value;
                lines[i] = "| " + string.Join(" | ", cells) + " |";
                File.WriteAllLines(file, lines);
                return;
            }
            throw new InvalidOperationException("Fixture row missing: " + table + "." + row);
        }

        public string Compile()
        {
            var compilerRoot = Environment.GetEnvironmentVariable("LUMIO_CONFIG_ROOT")
                ?? Path.GetFullPath(Path.Combine(Root(), "../../../LumioConfig"));
            var compiler = Path.Combine(compilerRoot, "tools/lumio_config.py");
            if (!File.Exists(compiler)) throw new InvalidOperationException("BLOCKED_ENV: real LumioConfig compiler is required at " + compiler);
            var server = Path.Combine(root, "out-server");
            var client = Path.Combine(root, "out-client");
            var csharp = Path.Combine(root, "out-csharp");
            foreach (var directory in new[] { server, client, csharp }) Directory.CreateDirectory(directory);
            var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("LUMIO_PYTHON") ?? "py")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            if (start.FileName == "py") start.ArgumentList.Add("-3");
            foreach (var argument in new[] { compiler, "export", "--root", root, "--client-out", client, "--server-out", server, "--csharp-out", csharp })
                start.ArgumentList.Add(argument);
            using var process = Process.Start(start) ?? throw new InvalidOperationException("BLOCKED_ENV: LumioConfig compiler did not start.");
            var output = process.StandardOutput.ReadToEnd();
            var errors = process.StandardError.ReadToEnd();
            process.WaitForExit();
            File.WriteAllText(Path.Combine(root, "compile.log"), output + errors);
            if (process.ExitCode != 0) throw new InvalidOperationException($"LumioConfig export failed ({process.ExitCode}): {output} {errors}");
            return server;
        }

        private static string[] Cells(string line) => line.Trim().Trim('|').Split('|').Select(cell => cell.Trim()).ToArray();
        public void Dispose() { } // Retain effective inputs, official outputs and failed runs for review.
    }
}
