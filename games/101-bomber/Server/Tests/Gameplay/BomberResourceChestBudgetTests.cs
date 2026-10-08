using System;
using System.Globalization;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// Authoring draft only. Root must release the source window before this file is
// copied into Server/Tests/Gameplay. These are calculator/storage witnesses;
// no Native resource birth, drop distribution or M2 admission is claimed.
[Collection("BomberWorld")]
public sealed class BomberResourceChestBudgetTests
{
    [Theory]
    [InlineData(true, 1351)]
    [InlineData(false, 1106)]
    public void EnabledResourceChestsAccountForEveryPossibleWaveAndAllGoldRewards(bool skills, int pickups)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "central_supply_enabled", "false"),
            ("game", "default", "skills_enabled", skills ? "true" : "false"),
            ("object_budgets", "default", "max_pickup_entities", pickups.ToString(CultureInfo.InvariantCulture)));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal("LegacyPillars", config.Map.LayoutKind);
        Assert.Equal(8000u, config.Regeneration.FirstTriggerMs);
        Assert.Equal(8000u, config.Regeneration.IntervalMs);
        Assert.Equal(2, config.Regeneration.MaxMirrorOrbits);
        Assert.Equal(420000u, config.Game.MatchDurationMs);
        Assert.Equal(115000u, config.FinalCircle.DurationMs);
        Assert.Equal(60000u, config.Regeneration.StopBeforeFinalMs);
        Assert.Equal(6u, config.Regeneration.ChestRollDenominator);
        Assert.Equal(skills ? 4 : 3, BomberResourceRewardRules.Maximum(config, BomberResourceRewardRules.Named(config, "Gold")));
        Assert.Equal(skills ? 6 : 5, BomberResourceRewardRules.Maximum(config, config.Chest));
        // Thirty real opportunities (8..240s), eight cells each. All may be
        // Gold; 1/6 and reward probabilities never discount structural debt.
        Assert.Equal(pickups, config.ObjectBudgets.RequiredPickups);
        Assert.Equal(245, config.ObjectBudgets.ChestLimit);
        Assert.Equal(2624, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(336, config.ObjectBudgets.RequiredFireZones);
    }

    [Theory]
    [InlineData(true, 807)]
    [InlineData(false, 698)]
    public void OneHundredFiveSecondExclusiveStopIncludesThirteenFullChestOpportunities(bool skills, int pickups)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "match_duration_ms", "240000"),
            ("game", "default", "central_supply_enabled", "false"),
            ("game", "default", "skills_enabled", skills ? "true" : "false"),
            ("regeneration", "default", "stop_before_final_ms", "20000"),
            ("object_budgets", "default", "max_pickup_entities", pickups.ToString(CultureInfo.InvariantCulture)));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(115000u, config.FinalCircle.DurationMs);
        Assert.Equal(8000u, config.Regeneration.FirstTriggerMs);
        // Thirteen whole waves (8..104s), never the112s wave; 104 potential
        // chest identities plus five independent strong-chest issuances.
        Assert.Equal(pickups, config.ObjectBudgets.RequiredPickups);
        Assert.Equal(109, config.ObjectBudgets.ChestLimit);
        Assert.Equal(2624, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(336, config.ObjectBudgets.RequiredFireZones);
    }

    [Theory]
    [InlineData(true, 1351)]
    [InlineData(false, 1106)]
    public void OneFewerPickupCreditIsRejectedBeforeEnabledChestSourceAdmission(bool skills, int required)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "central_supply_enabled", "false"),
            ("game", "default", "skills_enabled", skills ? "true" : "false"),
            ("object_budgets", "default", "max_pickup_entities", (required - 1).ToString(CultureInfo.InvariantCulture)));
        string directory = fixture.Compile();
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
        Assert.Contains("object_budgets.max_pickup_entities", error.Message, StringComparison.Ordinal);
        Assert.Contains($"required={required}, provisioned={required - 1}", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(true, 391)]
    [InlineData(false, 386)]
    public void ExplicitlyClosedRegenerationSourceKeepsOnlyLegacyInitialAndStrongIssuances(bool skills, int pickups)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "central_supply_enabled", "false"),
            ("game", "default", "skills_enabled", skills ? "true" : "false"),
            ("regeneration", "default", "max_mirror_orbits", "0"),
            ("object_budgets", "default", "max_pickup_entities", pickups.ToString(CultureInfo.InvariantCulture)));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal("LegacyPillars", config.Map.LayoutKind);
        Assert.Equal(0, config.Regeneration.MaxMirrorOrbits);
        Assert.Equal(pickups, config.ObjectBudgets.RequiredPickups);
        Assert.Equal(5, config.ObjectBudgets.ChestLimit);
        Assert.Equal(2624, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(336, config.ObjectBudgets.RequiredFireZones);
    }

    [Fact]
    public void FirstTriggerExactlyAtExclusiveStopCannotIssueChestOrRewardCredits()
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "central_supply_enabled", "false"),
            ("game", "default", "skills_enabled", "true"),
            ("regeneration", "default", "first_trigger_ms", "245000"),
            ("object_budgets", "default", "max_pickup_entities", "1351"));
        var config = BomberConfigBinding.Read(fixture.Compile());
        Assert.Equal(245000u, config.Regeneration.FirstTriggerMs);
        Assert.Equal(2, config.Regeneration.MaxMirrorOrbits);
        Assert.Equal(391, config.ObjectBudgets.RequiredPickups);
        Assert.Equal(5, config.ObjectBudgets.ChestLimit);
    }

    [Fact]
    public void OneBombCanRetainSixDistinctResourceChestIdentitiesWithoutLosingDuplicateHistory()
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "central_supply_enabled", "false"),
            ("game", "default", "skills_enabled", "true"),
            ("object_budgets", "default", "max_pickup_entities", "1351"));
        using WorldManager manager = BomberTestWorld.Start(configDirectory: fixture.Compile());
        EntityOrder bombOrder = manager.World.Commands.Create<BomberBombEntity>();
        EntityOrder[] chests = Enumerable.Range(0, 6).Select(_ => manager.World.Commands.Create<BomberChestEntity>()).ToArray();
        manager.Tick();
        var config = BomberConfigBinding.For(manager.World);
        uint wood = config.Tables.Chest.Rows.Single(row => row.Name == "Wood").Id;
        var bomb = manager.World.Get<BomberBombState>(bombOrder.AssignedId);
        // Genuine ECS storage witness. These six published identities are not
        // claimed to be a production Native birth or a six-cell blast trace.
        for (int index = 0; index < chests.Length; index++)
        {
            NetEntityId id = chests[index].AssignedId;
            Assert.True(manager.World.IsLive(id));
            manager.World.Get<BomberChestState>(id).InitializeTier(wood, checked((ulong)index + 1));
            Assert.Equal(BomberStorageAdmission.Added, bomb.TryObserveChest(id));
        }
        Assert.Equal(6, bomb.ContactedChests.Count);
        Assert.Equal(BomberStorageAdmission.Duplicate, bomb.TryObserveChest(chests[0].AssignedId));
        Assert.Equal(6, bomb.ContactedChests.Count);
        Assert.All(chests, chest => Assert.Equal(1, Enumerable.Range(0, bomb.ContactedChests.Count)
            .Count(index => bomb.ContactedChests[index] == chest.AssignedId)));
        bomb.ValidateStorage();
    }
}
