using System;
using Lumio.Bomber.Gameplay.Config;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberEnabledFireBudgetTests
{
    [Fact]
    public void EnabledFireOneLessThanBurnResidenceBudgetRejectsExactBombRequirement()
    {
        using var authored = new BomberObjectBudgetTests.AuthoredFixture(
            ("bomb_kinds", "Fire", "enabled", "true"),
            ("object_budgets", "default", "max_bomb_entities", "4063"),
            ("object_budgets", "default", "max_pickup_entities", "1351"));
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(authored.Compile()));
        Assert.Equal("object_budgets.max_bomb_entities: required=4064, provisioned=4063.", error.Message);
    }

    [Fact]
    public void EnabledFireExactBurnAndResourceBudgetAcceptsActualAuthoredReader()
    {
        using var authored = new BomberObjectBudgetTests.AuthoredFixture(
            ("bomb_kinds", "Fire", "enabled", "true"),
            ("object_budgets", "default", "max_bomb_entities", "4064"),
            ("object_budgets", "default", "max_pickup_entities", "1351"));
        var config = BomberConfigBinding.Read(authored.Compile());
        Assert.Equal("LegacyPillars", config.Map.LayoutKind);
        Assert.True(Assert.Single(config.Tables.BombKinds.Rows, row => row.Name == "Fire").Enabled);
        Assert.Equal(1500u, config.SkillLevel(40003u, 1).DurationMs);
        Assert.Equal(4064, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(4064, config.ObjectBudgets.BombCapacity);
        Assert.Equal(1351, config.ObjectBudgets.RequiredPickups);
        Assert.Equal(1351, config.ObjectBudgets.PickupCapacity);
        Assert.Equal(336, config.ObjectBudgets.RequiredFireZones);
    }
}
