using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Xunit;

namespace Lumio.Bomber.Bots;

public sealed class BotConfigurationTests
{
    [Theory]
    [InlineData(7, 3, 3, 1)]
    [InlineData(11, 5, 4, 2)]
    [InlineData(15, 7, 6, 2)]
    public void ExplicitLauncherRosterUsesApprovedRatio(int count, int rookie, int normal, int hard)
    {
        using JsonDocument json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Config/bot_tactics.json")));
        JsonElement row = json.RootElement.GetProperty("rows")[0];
        string[] lineup = Enumerable.Range(0, count).Select(i => BotLineup.Select(i, count,
            row.GetProperty("rookie_weight").GetInt32(), row.GetProperty("normal_weight").GetInt32(), row.GetProperty("hard_weight").GetInt32())).ToArray();
        Assert.Equal(rookie, lineup.Count(name => name == "rookie"));
        Assert.Equal(normal, lineup.Count(name => name == "normal"));
        Assert.Equal(hard, lineup.Count(name => name == "hard"));
    }

    [Fact]
    public void ExportContainsFiveProfilesAndApprovedRookieMistakes()
    {
        using JsonDocument json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Config/bot_profiles.json")));
        JsonElement.ArrayEnumerator rows = json.RootElement.GetProperty("rows").EnumerateArray();
        var profiles = rows.ToDictionary(row => row.GetProperty("name").GetString()!);
        Assert.Equal(5, profiles.Count);
        Assert.Equal(200, profiles["normal"].GetProperty("skill_use_permille").GetInt32());
        JsonElement rookie = profiles["rookie"];
        Assert.Equal(10, rookie.GetProperty("react_min_ticks").GetInt32());
        Assert.Equal(16, rookie.GetProperty("react_max_ticks").GetInt32());
        Assert.Equal(3, rookie.GetProperty("think_every_ticks").GetInt32());
        Assert.Equal(0, rookie.GetProperty("escape_margin_ticks").GetInt32());
        Assert.Equal(0, rookie.GetProperty("skill_use_permille").GetInt32());
        Assert.Equal(250, rookie.GetProperty("underestimate_permille").GetInt32());
        Assert.Equal(300, rookie.GetProperty("risky_pickup_permille").GetInt32());
        Assert.Equal(500, rookie.GetProperty("attack_skip_permille").GetInt32());
    }

    [Theory]
    [InlineData(-1, 7)]
    [InlineData(7, 7)]
    [InlineData(0, 0)]
    public void InvalidLauncherIdentityCannotMasqueradeAsAnotherBot(int index, int count)
        => Assert.Throws<ArgumentOutOfRangeException>(() => BotLineup.Select(index, count, 7, 6, 2));

    [Fact]
    public void EngagementAndAttackWeightsMatchTheApprovedPrototypeSnapshot()
    {
        using JsonDocument json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Config/bot_tactics.json")));
        JsonElement row = json.RootElement.GetProperty("rows")[0];
        Assert.Equal(6, row.GetProperty("engage_steps").GetInt32());
        Assert.Equal(30, row.GetProperty("engage_check_ticks").GetInt32());
        Assert.Equal(550, row.GetProperty("farmer_engage_permille").GetInt32());
        Assert.Equal(950, row.GetProperty("hunter_engage_permille").GetInt32());
        Assert.Equal(550, row.GetProperty("collector_engage_permille").GetInt32());
        Assert.Equal(750, row.GetProperty("roamer_engage_permille").GetInt32());
        Assert.Equal(400, row.GetProperty("farm_blast_permille").GetInt32());
        Assert.Equal(850, row.GetProperty("hunt_blast_permille").GetInt32());
        Assert.Equal(400, row.GetProperty("collect_blast_permille").GetInt32());
        Assert.Equal(500, row.GetProperty("roam_blast_permille").GetInt32());
        Assert.Equal(60, row.GetProperty("engage_min_ticks").GetInt32());
        Assert.Equal(120, row.GetProperty("engage_max_ticks").GetInt32());
    }
}
