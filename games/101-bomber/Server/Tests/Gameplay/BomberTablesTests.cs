using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class BomberTablesTests
{
    private static readonly int[] ExpectedCircleSides = { 13, 9, 7, 5, 3, 1 };
    private static string RepoRoot => Lumio.Bomber.Tests.EngineRelease.RepoRoot;
    private static string DirectoryFor(string? profile = null) => Path.Combine(RepoRoot, "Server/Config", profile is null ? "Tables" : "Profiles/" + profile);

    [Fact]
    public void RealReadersLoadAllRequiredTablesAndSixAttributeSeeds()
    {
        var config = BomberConfigBinding.Read(DirectoryFor());
        Assert.Equal(27, BomberTypedTables.TableNames.Count);
        Assert.Equal(20u, config.Game.TickRateHz);
        Assert.Equal(420000u, config.Game.MatchDurationMs);
        Assert.Equal(19, config.Map.Width);
        Assert.Equal(2100u, config.Bomb.FuseMs);
        Assert.Equal(125u, config.Movement.PlaceBufferMs);
        Assert.Equal(115000u, config.FinalCircle.DurationMs);
        var expected = new Dictionary<string, long>
        {
            ["HealthPoints"] = 6, ["BombPower"] = 2, ["BombCapacity"] = 1,
            ["AvailableBombs"] = 1, ["SpeedTier"] = 0, ["MovementSpeedMilli"] = 3500,
        };
        Assert.Equal(expected.Keys.OrderBy(name => name), config.Tables.Attributes.Rows.Select(row => row.Name).OrderBy(name => name));
        var seedProvider = Assert.IsAssignableFrom<IAttributeSeedProvider>(config);
        foreach (var pair in expected)
        {
            Assert.True(seedProvider.TryGetSeedValue(typeof(BomberTablesTests), pair.Key, out var seed));
            Assert.Equal(pair.Value, seed);
        }
        Assert.False(seedProvider.TryGetSeedValue(typeof(BomberTablesTests), "Stamina", out _));
        Assert.Throws<ArgumentException>(() => config.Attribute("HatCount"));
    }

    [Fact]
    public void SpeedCapPreservesEightReinforcementsAndHatCountUsesBaseLedgers()
    {
        var config = BomberConfigBinding.Read(DirectoryFor());
        Assert.Equal(6000, config.SpeedTier(8).SpeedMilli);
        Assert.Equal(8, config.HatCount(2, 1, 8));
        Assert.Equal(17, config.HatCount(6, 6, 8));
        var variant = BomberConfigBinding.Read(DirectoryFor("power-1"));
        Assert.Equal(0, variant.HatCount(1, 1, 0));
        Assert.Equal(18, variant.HatCount(6, 6, 8));
        Assert.Throws<InvalidOperationException>(() => config.SpeedTier(9));
    }

    [Fact]
    public void SkillFlagProfilesHaveIndependentImmutableSnapshotsAndSharedBaseSeeds()
    {
        var enabled = BomberConfigBinding.Read(DirectoryFor("skills-on"));
        var disabled = BomberConfigBinding.Read(DirectoryFor("skills-off"));
        Assert.True(enabled.Game.SkillsEnabled);
        Assert.False(disabled.Game.SkillsEnabled);
        Assert.Equal(enabled.Tables.Attributes.Rows, disabled.Tables.Attributes.Rows);
        Assert.Equal(16, enabled.Tables.Skills.Count);
        var skillIds = enabled.Tables.Skills.Rows.ToDictionary(row => row.Name, row => row.Id);
        var legacySkills = new[]
        {
            "regen", "bubble", "blink", "fireAura", "kick", "freezeBomb", "pierceBomb",
            "fireDash", "bounceBubble", "glacierBomb", "toxinBomb", "shockBomb", "flyKick",
        };
        for (var index = 0; index < legacySkills.Length; index++)
            Assert.Equal((uint)(index + 1), skillIds[legacySkills[index]]);
        Assert.Equal(40003u, skillIds["fireBomb"]);
        Assert.Equal(40004u, skillIds["remoteBomb"]);
        Assert.Equal(40005u, skillIds["splitBomb"]);
        Assert.Equal(5, enabled.Tables.Characters.Count);
        Assert.False(enabled.Tables.Attributes.Rows is System.Collections.IList);
        Assert.NotSame(enabled, disabled);
    }

    [Fact]
    public void ReferencesArriveAsStronglyTypedIdsAndSkillLevelDataIsComplete()
    {
        var config = BomberConfigBinding.Read(DirectoryFor());
        foreach (var character in config.Tables.Characters.Rows)
        {
            Assert.True(config.Tables.Skills.TryGet(character.BoundSkillId, out var skill));
            Assert.Equal(character.BoundLevel, config.SkillLevel(skill.Id, character.BoundLevel).Level);
        }
        var freeze = config.Tables.Skills.Rows.Single(row => row.Name == "freezeBomb");
        Assert.Equal(2500u, config.SkillLevel(freeze.Id, 3).FreezeMs);
    }

    [Theory]
    [InlineData("final-circle-90000", 90000u)]
    [InlineData("final-circle-140000", 140000u)]
    public void DurationVariantsKeepAllCircleStagesBeforeTheirDeadline(string profile, uint duration)
    {
        var config = BomberConfigBinding.Read(DirectoryFor(profile));
        Assert.Equal(duration, config.FinalCircle.DurationMs);
        Assert.Equal(ExpectedCircleSides, config.Tables.CircleStages.Rows.Select(row => row.SideCells));
        Assert.All(config.Tables.CircleStages.Rows, row => Assert.True(row.AtMs < duration));
    }

    [Fact]
    public void EveryDeclaredProfileLoadsThroughTheReleaseLoaderAndTypedAdapter()
    {
        var profiles = JsonNode.Parse(File.ReadAllText(Path.Combine(RepoRoot, "Gameplay/Tables/profiles.json")))!["profiles"]!.AsArray();
        Assert.Equal(48, profiles.Count);
        foreach (var profile in profiles)
        {
            var name = profile!["name"]!.GetValue<string>();
            var group = profile["group"]!.GetValue<string>();
            if (group is "authoring" or "room")
            {
                Assert.False(profile["runtimeEligible"]!.GetValue<bool>());
                var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(DirectoryFor(name)));
                Assert.Contains("map.layout_kind", error.Message, StringComparison.Ordinal);
                continue;
            }
            var config = BomberConfigBinding.Read(DirectoryFor(name));
            Assert.Equal(6, config.Tables.Attributes.Count);
            Assert.Equal(9, config.Tables.SpeedTiers.Count);
            Assert.Equal(config.Attribute(BomberAttributeNames.MovementSpeedMilli).Initial, config.SpeedTier(0).SpeedMilli);
        }
    }

    [Fact]
    public void LoaderRejectsCorruptedFingerprintAndMissingExportRoot()
    {
        var scratch = Path.Combine(Path.GetTempPath(), "bomber-config-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(scratch);
        try
        {
            Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(scratch));
            foreach (var file in Directory.EnumerateFiles(DirectoryFor(), "*", SearchOption.AllDirectories))
            {
                var target = Path.Combine(scratch, Path.GetRelativePath(DirectoryFor(), file));
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.Copy(file, target);
            }
            var gameFile = Path.Combine(scratch, "server/game.json");
            var corrupted = JsonNode.Parse(File.ReadAllText(gameFile))!;
            corrupted["contentFingerprint"] = "not-the-compiled-fingerprint";
            File.WriteAllText(gameFile, corrupted.ToJsonString());
            var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(scratch));
            Assert.Contains("TABLE_PACKAGE_FINGERPRINT_MISMATCH", error.Message, StringComparison.Ordinal);
            Assert.Equal(420000u, BomberConfigBinding.Read(DirectoryFor()).Game.MatchDurationMs);
        }
        finally { Directory.Delete(scratch, recursive: true); }
    }
}
