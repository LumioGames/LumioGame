using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFireLevelRenameProductionTests
{
    [Fact]
    public void OfficialLevelRenamePreservesBudgetIdentityAndActualPublicFireNativeBurnLifetime()
    {
        using var authored = new BomberObjectBudgetTests.AuthoredFixture(
            ("bomb_kinds", "Fire", "enabled", "true"),
            ("object_budgets", "default", "max_bomb_entities", "4064"),
            ("object_budgets", "default", "max_pickup_entities", "1351"));
        uint originalLevelId = RenameThroughOfficialCompiler(authored.Compile());
        using var scene = new BomberTerrainProductionTests.Scene(0,
            configDirectory: authored.Compile(), controlled: true);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        Assert.Equal(4064, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(1351, config.ObjectBudgets.RequiredPickups);
        Assert.Equal("LegacyPillars", config.Map.LayoutKind);
        Assert.True(config.Game.SkillsEnabled);
        var fire = Assert.Single(config.Tables.BombKinds.Rows, row => row.Name == "Fire");
        Assert.True(fire.Enabled);
        Assert.Equal(2u, fire.KindCode);
        var fireSkill = Assert.Single(config.Tables.Skills.Rows,
            row => row.Slot == "Bomb" && row.BombKindCode == fire.KindCode && !row.IsCombo);
        var fireLevel = config.SkillLevel(fireSkill.Id, 1);
        Assert.Equal(1500u, fireLevel.DurationMs);
        Assert.Equal(originalLevelId, fireLevel.Id);
        Assert.Equal(RenamedLevel, fireLevel.Name);
        Assert.Equal(fireSkill.Id, fireLevel.SkillId);
        Assert.Equal(1, fireLevel.Level);
        Assert.DoesNotContain(config.Tables.SkillLevels.Rows, row => row.Name == "fireBomb_lv1");
        for (int z = 3; z <= 11; z++)
            for (int x = 3; x <= 11; x++) scene.Write(x, 1, z, 0);
        foreach (NetEntityId other in scene.Lives) Position(world, other, 15, 15);
        NetEntityId life = scene.Lives[0];
        Position(world, life, 7, 7);
        var player = world.Get<BomberPlayerState>(life);
        var skill = world.Get<BomberSkillState>(life);
        var attributes = world.Get<AttributeComponent>(life);
        var owner = world.Get<AbilityComponent>(life);
        Assert.Equal(0u, skill.BombSkillId.Value);
        long available = attributes.GetBaseValue(BomberAttributeNames.AvailableBombs);
        Assert.True(available > 0);
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        NetEntityId participant = player.Participant.Value;
        ulong generation = player.LifeGeneration.Value;
        ulong oldChain = world.Single<BomberWorldRuntime>().NextChainId.Value;

        // A physical item is the only fixture-created gameplay input. Neither a
        // bomb, a held-slot result nor a lifecycle phase/clock is hand-written.
        EntityOrder item = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Skill);
        item.Get<BomberPickupItem>().SkillId.Value = fireSkill.Id;
        item.Get<BomberPickupItem>().SkillLevel.Value = 1;
        scene.TickControlled();
        var pickup = new PickupAbility.Input { Target = item.AssignedId };
        Assert.True(new PickupAbility().CanActivate(pickup, owner, out string? pickupReason), pickupReason);
        var picked = owner.Activate<PickupAbility, PickupAbility.Input>(in pickup, 9501);
        Assert.True(picked.Succeeded, picked.FailureCode);
        scene.TickControlled(); scene.TickControlled();
        Assert.False(world.IsLive(item.AssignedId));
        Assert.Equal(fireSkill.Id, skill.BombSkillId.Value);
        Assert.Equal(available, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));

        ulong placedAt = world.Tick;
        Assert.True(new PlaceBombAbility().CanActivate(default, owner, out string? placeReason), placeReason);
        var placed = owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default, 9502);
        Assert.True(placed.Succeeded, placed.FailureCode);
        Assert.Equal(available - 1, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        scene.TickControlled();
        // First Tick publishes the structural order; the next ordinary Tick
        // runs the production HFSM initializer on the actual visible bomb.
        scene.TickControlled();
        BomberBombState bomb = Assert.Single(world.Each<BomberBombState>());
        NetEntityId bombId = bomb.Entity;
        Assert.Equal((int)BomberBombKind.ReservedFire, bomb.BombKind.Value);
        Assert.Equal(participant, bomb.Owner.Value);
        Assert.Equal(life, bomb.SourceLife.Value);
        Assert.Equal(generation, bomb.SourceLifeGeneration.Value);
        Assert.Equal(placedAt, bomb.PlacedAtTick.Value);
        Assert.Equal(checked(oldChain + 1), bomb.ChainId.Value);
        Assert.Equal(0, bomb.PierceLayers.Value);
        Assert.Equal(1, bomb.SkillLevel.Value);
        Assert.Equal(checked(placedAt + Ticks.FromMilliseconds(config.Bomb.FuseMs, config.Game.TickRateHz)),
            bomb.FuseEndTick.Value);
        Assert.False(bomb.CapacityReturned.Value);
        AssertNative(world, bomb, BomberHfsmDefinitions.State.BombStationary);
        Position(world, life, 15, 15);
        ulong fuseEnd = bomb.FuseEndTick.Value;
        while (world.Tick <= fuseEnd) scene.TickControlled();
        Assert.True(world.IsLive(bombId));
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        Assert.Equal(fuseEnd, bomb.ExplodedAtTick.Value);
        ulong dangerEnd = checked(fuseEnd + Ticks.FromMilliseconds(config.Bomb.DangerMs, config.Game.TickRateHz));
        Assert.Equal(dangerEnd, bomb.DangerUntilTick.Value);
        Assert.True(bomb.CapacityReturned.Value);
        Assert.Equal(available, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        AssertNative(world, bomb, BomberHfsmDefinitions.State.BombDanger);
        while (world.Tick <= dangerEnd) scene.TickControlled();
        Assert.True(world.IsLive(bombId));
        Assert.Equal((int)BomberBombPhase.Burn, bomb.Phase.Value);
        ulong burnEnd = checked(dangerEnd + Ticks.FromMilliseconds(fireLevel.DurationMs, config.Game.TickRateHz));
        Assert.Equal(burnEnd, bomb.BurnUntilTick.Value);
        AssertNative(world, bomb, BomberHfsmDefinitions.State.BombBurn);
        Assert.Equal(participant, bomb.Owner.Value);
        Assert.Equal(life, bomb.SourceLife.Value);
        Assert.Equal(generation, bomb.SourceLifeGeneration.Value);
        Assert.Equal(checked(oldChain + 1), bomb.ChainId.Value);
        Assert.Equal(match, world.Single<BomberMatchState>().MatchId.Value);
        Assert.Equal(available, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Empty(world.Each<BomberFireZoneState>());
        while (world.Tick <= burnEnd) scene.TickControlled();
        Assert.False(world.IsLive(bombId));
        Assert.Empty(world.Each<BomberBombState>());
        Assert.Equal(available, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "bomb_placed"));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "bomb_exploded"));
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    private const string RenamedLevel = "authorFireLifetimeLevelOne";

    private static uint RenameThroughOfficialCompiler(string originalExport)
    {
        // AuthoredFixture returns its real out-server directory. No Reader or
        // registry JSON is fabricated: official patch apply owns the migration.
        string root = Directory.GetParent(originalExport)?.FullName
            ?? throw new InvalidOperationException("Author root is missing.");
        string registryPath = Path.Combine(root, "registry", "row-ids.json");
        Assert.True(File.Exists(registryPath));
        var before = ReadSourceRow(root, "fireBomb_lv1");
        uint permanent = uint.Parse(before["id"], System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal("40003", before["skill_id"]);
        Assert.Equal("1", before["level"]);
        Assert.Equal("1500", before["duration_ms"]);
        using (var registryBefore = JsonDocument.Parse(File.ReadAllBytes(registryPath)))
            Assert.Equal(permanent, registryBefore.RootElement.GetProperty("skill_levels").GetProperty("fireBomb_lv1").GetUInt32());
        string schemas = Path.Combine(root, "schemas", "skill_levels.json");
        string tombstones = Path.Combine(root, "registry", "tombstones.json");
        byte[] schemaBefore = File.ReadAllBytes(schemas), tombstonesBefore = File.ReadAllBytes(tombstones);
        string patch = Path.Combine(root, "rename-fire-level.patch.json");
        File.WriteAllText(patch, JsonSerializer.Serialize(new
        {
            table = "skill_levels",
            ops = new[] { new { op = "rename", name = "fireBomb_lv1", to = RenamedLevel } },
        }));
        RunOfficial(root, "rename-validate", "patch", "validate", patch, "--root", root);
        RunOfficial(root, "rename-apply", "patch", "apply", patch, "--root", root);
        RunOfficial(root, "rename-registry", "registry", "verify", "--root", root);
        RunOfficial(root, "rename-source", "validate", "--json", "--root", root);
        var after = ReadSourceRow(root, RenamedLevel);
        Assert.Equal(before.Count, after.Count);
        foreach (var cell in before)
            Assert.Equal(cell.Key == "name" ? RenamedLevel : cell.Value, after[cell.Key]);
        Assert.Equal(schemaBefore, File.ReadAllBytes(schemas));
        Assert.Equal(tombstonesBefore, File.ReadAllBytes(tombstones));
        using var registryAfter = JsonDocument.Parse(File.ReadAllBytes(registryPath));
        var registry = registryAfter.RootElement;
        Assert.False(registry.GetProperty("skill_levels").TryGetProperty("fireBomb_lv1", out _));
        Assert.Equal(permanent, registry.GetProperty("skill_levels").GetProperty(RenamedLevel).GetUInt32());
        Assert.Equal(permanent, registry.GetProperty("aliases").GetProperty("skill_levels").GetProperty("fireBomb_lv1").GetUInt32());
        Console.WriteLine("ACTUAL_OFFICIAL_FIRE_LEVEL_RENAME " + JsonSerializer.Serialize(new
        {
            root, permanent, from = "fireBomb_lv1", to = RenamedLevel,
            registrySha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(registryPath))),
            sourceSha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(Path.Combine(root, "tables", "skill_levels.txt")))),
        }));
        return permanent;
    }

    private static Dictionary<string, string> ReadSourceRow(string root, string name)
    {
        string[] Cells(string line) => line.Trim().Trim('|').Split('|').Select(cell => cell.Trim()).ToArray();
        string[] lines = File.ReadAllLines(Path.Combine(root, "tables", "skill_levels.txt"));
        string[] headers = Cells(lines[3]);
        foreach (string line in lines.Skip(5))
        {
            string[] cells = Cells(line);
            if (cells.Length != headers.Length || cells[1] != name) continue;
            return headers.Select((key, index) => new KeyValuePair<string, string>(key, cells[index]))
                .ToDictionary(cell => cell.Key, cell => cell.Value, StringComparer.Ordinal);
        }
        throw new InvalidOperationException("Missing actual author row: " + name);
    }

    private static void RunOfficial(string root, string label, params string[] arguments)
    {
        string compilerRoot = Environment.GetEnvironmentVariable("LUMIO_CONFIG_ROOT")
            ?? Path.GetFullPath(Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "../../../LumioConfig"));
        string compiler = Path.Combine(compilerRoot, "tools", "lumio_config.py");
        Assert.True(File.Exists(compiler), "Real official LumioConfig CLI is required: " + compiler);
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("LUMIO_PYTHON") ?? "py")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        if (start.FileName == "py") start.ArgumentList.Add("-3");
        start.ArgumentList.Add(compiler);
        foreach (string argument in arguments) start.ArgumentList.Add(argument);
        using Process process = Process.Start(start)
            ?? throw new InvalidOperationException("Real official Config CLI did not start.");
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorsTask = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        string output = outputTask.GetAwaiter().GetResult(), errors = errorsTask.GetAwaiter().GetResult();
        File.WriteAllText(Path.Combine(root, label + ".log"), output + errors);
        File.WriteAllText(Path.Combine(root, label + ".json"), JsonSerializer.Serialize(new
        {
            executable = start.FileName, argv = start.ArgumentList.ToArray(), exitCode = process.ExitCode,
            stdout = output, stderr = errors,
        }));
        Console.WriteLine("ACTUAL_FIRE_RENAME_CLI " + JsonSerializer.Serialize(new { label, root, exitCode = process.ExitCode }));
        Assert.True(process.ExitCode == 0, label + " real CLI failed: " + output + errors);
        Assert.Equal("", errors);
    }

    private static void AssertNative(World world, BomberBombState bomb, uint expected)
    {
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb);
        BomberHfsmState machine = world.Get<BomberHfsmState>(bomb.Entity);
        Assert.True(machine.SnapshotPresent.Value);
        Assert.Equal(expected, machine.ReadSnapshot(definition, BomberHfsmKind.Bomb,
            machine.MachineKey.Value).ActivePath[^1].State);
    }

    private static void Position(World world, NetEntityId life, int x, int z) =>
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(x + .5f, 1.5f, z + .5f));
}
