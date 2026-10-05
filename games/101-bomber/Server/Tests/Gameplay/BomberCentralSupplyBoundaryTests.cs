using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Persistence;
using Lumio.GameRuntime.Simulation;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberCentralSupplyBoundaryTests
{
    [Theory]
    [InlineData(false, 9)]
    [InlineData(true, 11)]
    public void ActualFiftyAndSixtySecondTicksIssueTheConfiguredQuotaExactlyOnce(bool skills, int expected)
    {
        // Explicit UGC 19/8 consumer, not formal 23/12 or 27/16 admission.
        // The skills-on row deliberately retains all production shape guards.
        using var authored = SupplyConfig(skills);
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: authored.Compile());
        OpenPlaza(scene);
        World world = scene.World;
        var game = BomberConfigBinding.For(world).Game;
        Assert.Equal(50000u, game.CentralSupplyAnnounceMs);
        Assert.Equal(60000u, game.CentralSupplyOpenMs);
        BomberMatchState match = world.Single<BomberMatchState>();
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        ulong announce = checked(match.StartTick.Value + Ticks.FromMilliseconds(50000, game.TickRateHz));
        ulong open = Opening(world);
        while (world.Tick < announce) scene.Manager.Tick();
        Assert.Equal(0UL, runtime.SupplyAnnouncedMatchId.Value);
        scene.Manager.Tick();
        Assert.Equal(match.MatchId.Value, runtime.SupplyAnnouncedMatchId.Value);
        JsonElement announced = Occurrence(world, "supply_announced");
        Assert.Equal(announce, OccurredTick(announced));
        Assert.Equal(open.ToString(CultureInfo.InvariantCulture), announced.GetProperty("data").GetProperty("openTick").GetString());
        while (world.Tick < open) scene.Manager.Tick();
        Assert.Equal(0UL, runtime.SupplyIssuedMatchId.Value);
        Assert.Empty(world.Each<BomberPickupItem>());
        scene.Manager.Tick();

        BomberPickupItem[] items = Supplied(world);
        Assert.Equal(expected, items.Length);
        Assert.Equal(5, items.Count(item => item.Kind.Value is 0 or 1 or 2));
        Assert.Equal(2, items.Count(item => item.Kind.Value == (int)BomberPickupKind.Health));
        Assert.Equal(1, items.Count(item => item.Kind.Value == (int)BomberPickupKind.Frenzy));
        Assert.Equal(1, items.Count(item => item.Kind.Value == (int)BomberPickupKind.GoldenHeart));
        Assert.Equal(skills ? 2 : 0, items.Count(item => item.Kind.Value == (int)BomberPickupKind.Skill));
        Assert.Equal(Enumerable.Range(0, expected).ToArray(), items.Select(item => item.SupplyOrdinal.Value).OrderBy(value => value).ToArray());
        string[] specialNames = { "fireBomb", "freezeBomb", "remoteBomb", "splitBomb", "pierceBomb", "toxinBomb" };
        var config = BomberConfigBinding.For(world);
        Assert.All(items, item =>
        {
            Assert.Equal(match.MatchId.Value, item.SupplyMatchId.Value);
            Assert.Equal(open, item.SpawnTick.Value);
            if (item.Kind.Value == (int)BomberPickupKind.Skill)
            {
                var skill = config.Tables.Skills.Rows.Single(row => row.Id == item.SkillId.Value);
                Assert.Contains(skill.Name, specialNames);
                Assert.Equal(1, item.SkillLevel.Value);
            }
            else Assert.Equal(0u, item.SkillId.Value);
        });
        Assert.Equal("", runtime.SupplyPending.Value);
        Assert.Equal(0, BomberCentralSupply.ReservedCount(world));
        Assert.Equal(expected, BomberTerrainTransactions.PickupCreditUsage(world));
        JsonElement opened = Occurrence(world, "supply_opened");
        Assert.Equal(open, OccurredTick(opened));
        Assert.Equal(expected.ToString(CultureInfo.InvariantCulture), opened.GetProperty("data").GetProperty("issuedCount").GetString());
        NetEntityId[] published = items.Select(item => item.Entity).OrderBy(id => id).ToArray();
        for (int tick = 0; tick < 20; tick++) scene.Manager.Tick();
        Assert.Equal(published, Supplied(world).Select(item => item.Entity).OrderBy(id => id).ToArray());
        Assert.Equal(match.MatchId.Value, runtime.SupplyIssuedMatchId.Value);
        Assert.Equal(open, OccurredTick(Occurrence(world, "supply_opened")));
    }

    [Theory]
    [InlineData(8)]
    [InlineData(9)]
    public void FullBatchAdmissionWaitsForRealRetirementAndTransfersAllNineCreditsOnce(int remaining)
    {
        using var authored = SupplyConfig();
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: authored.Compile());
        OpenPlaza(scene);
        World world = scene.World;
        int capacity = BomberConfigBinding.For(world).ObjectBudgets.PickupCapacity;
        int target = checked(capacity - remaining);
        for (int created = 0; created < target;)
        {
            int batch = Math.Min(32, target - created);
            for (int i = 0; i < batch; i++)
            {
                EntityOrder order = world.Commands.Create<BomberPickupItemEntity>();
                var item = order.Get<BomberPickupItem>();
                item.Kind.Value = (int)BomberPickupKind.Health;
                item.SpawnTick.Value = world.Tick;
                BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(3.5f, 1.5f, 3.5f));
            }
            scene.Manager.Tick();
            created += batch;
        }
        Assert.Equal(target, world.Each<BomberPickupItem>().Count());
        Assert.Equal(target, BomberTerrainTransactions.PickupCreditUsage(world));
        ulong scheduled = Opening(world);
        Assert.True(world.Tick < scheduled);
        ReachOpening(scene);
        var runtime = world.Single<BomberWorldRuntime>();
        if (remaining == 8)
        {
            Assert.Equal(0UL, runtime.SupplyIssuedMatchId.Value);
            Assert.Equal("", runtime.SupplyPending.Value);
            Assert.Empty(Supplied(world));
            Assert.Empty(BomberEffectIntegrationTests.Events(world, "supply_opened"));
            NetEntityId retired = world.Each<BomberPickupItem>().First().Entity;
            world.Commands.Destroy(retired);
            scene.Manager.Tick();
            Assert.False(world.IsLive(retired));
            scene.Manager.Tick();
        }
        Assert.Equal(9, Supplied(world).Length);
        Assert.Equal("", runtime.SupplyPending.Value);
        Assert.Equal(0, BomberCentralSupply.ReservedCount(world));
        Assert.Equal(capacity, BomberTerrainTransactions.PickupCreditUsage(world));
        ulong occurred = OccurredTick(Occurrence(world, "supply_opened"));
        Assert.True(remaining == 8 ? occurred > scheduled : occurred == scheduled);
    }

    [Fact]
    public void ActualNoDestinationDebtRestoresThenMaterializesInResultsBeforeActualRetirementAndRollover()
    {
        using var authored = SupplyConfig();
        string directory = authored.Compile();
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: directory, persistence: true);
        SealInterior(scene);
        ReachOpening(scene);
        World world = scene.World;
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        string pending = runtime.SupplyPending.Value;
        BomberSupplyPromise[] selected = BomberCentralSupply.Decode(pending);
        Assert.Equal(9, selected.Length);
        Assert.All(selected, row => Assert.False(row.Submitted));
        Assert.Empty(Supplied(world));
        Assert.Equal(9, BomberCentralSupply.ReservedCount(world));
        using (WorldManager restored = RestorePaired(scene, directory))
        {
            Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
            for (int tick = 0; tick < 10; tick++) restored.Tick();
            Assert.Equal(pending, restored.World.Single<BomberWorldRuntime>().SupplyPending.Value);
            Assert.Empty(Supplied(restored.World));
            Assert.Equal(9, BomberCentralSupply.ReservedCount(restored.World));
        }
        BomberMatchState match = world.Single<BomberMatchState>();
        ulong oldMatch = match.MatchId.Value;
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick;
        for (int tick = 0; tick < 3; tick++) scene.Manager.Tick();
        Assert.Equal(oldMatch, match.MatchId.Value);
        Assert.Equal(pending, runtime.SupplyPending.Value);
        OpenPlaza(scene);
        scene.Manager.Tick();
        Assert.Equal(oldMatch, match.MatchId.Value);
        BomberPickupItem[] placed = Supplied(world);
        Assert.Equal(9, placed.Length);
        foreach (BomberSupplyPromise row in selected)
        {
            var item = Assert.Single(placed, item => item.SupplyOrdinal.Value == row.Ordinal);
            Assert.Equal(row.Match, item.SupplyMatchId.Value);
            Assert.Equal(row.Kind, item.Kind.Value);
            Assert.Equal(row.Skill, item.SkillId.Value);
            Assert.True(item.SpawnTick.Value > row.Occurred);
        }
        Assert.Equal("", runtime.SupplyPending.Value);
        Assert.Equal(0, BomberCentralSupply.ReservedCount(world));
        NetEntityId[] oldIds = placed.Select(item => item.Entity).ToArray();
        for (int tick = 0; tick < 20 && oldIds.Any(world.IsLive); tick++)
        {
            Assert.Equal(oldMatch, match.MatchId.Value);
            scene.Manager.Tick();
            Assert.Equal(oldMatch, match.MatchId.Value);
        }
        Assert.Equal(oldMatch, match.MatchId.Value);
        Assert.All(oldIds, id => Assert.False(world.IsLive(id)));
        for (int tick = 0; tick < 100 && match.MatchId.Value == oldMatch; tick++) scene.Manager.Tick();
        Assert.Equal(oldMatch + 1, match.MatchId.Value);
        Assert.Equal(0UL, runtime.SupplyAnnouncedMatchId.Value);
        Assert.Equal(0UL, runtime.SupplyIssuedMatchId.Value);
        Assert.Equal("", runtime.SupplyPending.Value);
        Assert.Empty(Supplied(world));
        Assert.Equal((int)BomberMatchPhase.Warmup, match.Phase.Value);
        match.PhaseEndTick.Value = world.Tick;
        scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        OpenPlaza(scene);
        ReachOpening(scene);
        Assert.Equal(9, Supplied(world).Length);
        Assert.All(Supplied(world), item => Assert.Equal(oldMatch + 1, item.SupplyMatchId.Value));
        Assert.Equal(oldMatch + 1, runtime.SupplyAnnouncedMatchId.Value);
        Assert.Equal(oldMatch + 1, runtime.SupplyIssuedMatchId.Value);
        Assert.Equal(Opening(world), OccurredTick(Occurrence(world, "supply_opened")));
    }

    [Fact]
    public void ExplicitSubmittedUnknownFixtureKeepsAllCreditsAfterPairedRestoreAndResultsWithoutReplay()
    {
        using var authored = SupplyConfig();
        string directory = authored.Compile();
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: directory, persistence: true);
        SealInterior(scene);
        ReachOpening(scene);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        BomberSupplyPromise[] selected = BomberCentralSupply.Decode(runtime.SupplyPending.Value);
        Assert.Equal(9, selected.Length);
        Assert.All(selected, row => Assert.False(row.Submitted));
        // Explicit durable unknown-state fixture on a real issued selection.
        // No Commands.Create exception or actual pending structural capture is claimed.
        runtime.SupplyPending.Value = BomberCentralSupply.Encode(selected.Select(row => row with
        {
            Submitted = true, X = 9 + row.Ordinal % 3, Z = 9 + row.Ordinal / 3, SpawnTick = scene.World.Tick,
        }).ToArray());
        OpenPlaza(scene); // Real free Native destinations expose any erroneous replay.
        string unknown = runtime.SupplyPending.Value;
        using WorldManager restored = RestorePaired(scene, directory);
        World world = restored.World;
        var match = world.Single<BomberMatchState>();
        ulong oldMatch = match.MatchId.Value;
        for (int tick = 0; tick < 20; tick++) restored.Tick();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick;
        for (int tick = 0; tick < 20; tick++) restored.Tick();
        Assert.Equal(oldMatch, match.MatchId.Value);
        Assert.Equal(unknown, world.Single<BomberWorldRuntime>().SupplyPending.Value);
        Assert.True(BomberCentralSupply.HasPending(world));
        Assert.Equal(9, BomberCentralSupply.ReservedCount(world));
        Assert.Equal(9, BomberTerrainTransactions.PickupCreditUsage(world));
        Assert.Empty(Supplied(world));
        Assert.Equal(selected[0].Occurred, OccurredTick(Occurrence(world, "supply_opened")));
    }

    [Theory]
    [InlineData("match")]
    [InlineData("ordinal")]
    [InlineData("content")]
    [InlineData("spawn")]
    [InlineData("cell")]
    [InlineData("mixed-source")]
    public void HydrationRejectsAlteredActualPublicationAgainstItsRetainedExactSubmittedTuple(string corruption)
    {
        using var authored = SupplyConfig();
        string directory = authored.Compile();
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: directory);
        OpenPlaza(scene);
        ReachOpening(scene);
        World world = scene.World;
        BomberPickupItem item = Supplied(world).Single(item => item.SupplyOrdinal.Value == 5);
        Assert.Equal((int)BomberPickupKind.Health, item.Kind.Value);
        Vector3 at = world.Get<LogicTransform>(item.Entity).LocalPosition;
        // Fault-injected retained submitted debt copies a real publication, not
        // a fabricated structural result or a claimed Unknown checkpoint.
        var exact = new BomberSupplyPromise(item.SupplyMatchId.Value, item.SupplyOrdinal.Value,
            item.Kind.Value, item.SkillId.Value, item.SpawnTick.Value, true,
            BomberMatchRules.CellX(at), BomberMatchRules.CellZ(at), item.SpawnTick.Value);
        world.Single<BomberWorldRuntime>().SupplyPending.Value = BomberCentralSupply.Encode(new[] { exact });
        Assert.Equal(0, BomberCentralSupply.ReservedCount(world));
        switch (corruption)
        {
            case "match": item.SupplyMatchId.Value++; break;
            case "ordinal": item.SupplyOrdinal.Value = 6; break;
            case "content": item.Kind.Value = (int)BomberPickupKind.Frenzy; break;
            case "spawn": item.SpawnTick.Value++; break;
            case "cell": BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(item.Entity), at + Vector3.UnitX); break;
            case "mixed-source": item.DroppedBy.Value = scene.Lives[0]; break;
            default: throw new InvalidOperationException("Unlisted publication corruption.");
        }
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        var error = BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
            BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance, config: BomberConfigBinding.Load(directory)));
        Assert.Contains("Supply", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("match")]
    [InlineData("duplicate-ordinal")]
    [InlineData("unsubmitted-position")]
    public void HydrationRejectsDamagedActuallyIssuedUnpublishedSupplyMemory(string corruption)
    {
        using var authored = SupplyConfig();
        string directory = authored.Compile();
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: directory);
        SealInterior(scene);
        ReachOpening(scene);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        BomberSupplyPromise[] rows = BomberCentralSupply.Decode(runtime.SupplyPending.Value);
        Assert.Equal(9, rows.Length);
        Assert.All(rows, row => Assert.False(row.Submitted));
        BomberSupplyPromise[] damaged = corruption switch
        {
            "match" => new[] { rows[0] with { Match = rows[0].Match + 1 } },
            "duplicate-ordinal" => new[] { rows[0], rows[0] },
            "unsubmitted-position" => new[] { rows[0] with { X = 9 } },
            _ => throw new InvalidOperationException("Unlisted memory corruption."),
        };
        runtime.SupplyPending.Value = JsonSerializer.Serialize(damaged);
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        var error = BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
            BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance, config: BomberConfigBinding.Load(directory)));
        Assert.Contains("Supply", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ActualSupplySpecialCanExchangeIntoAnOrdinaryDroppedCandyWithoutFaultingTheNextTick()
    {
        // Requires actual skills-on publication; no hand-authored Supply item
        // substitutes for the six-shape producer/admission prerequisite.
        using var authored = SupplyConfig(skills: true);
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: authored.Compile());
        OpenPlaza(scene);
        ReachOpening(scene);
        World world = scene.World;
        Assert.Equal(11, Supplied(world).Length);
        var incoming = Supplied(world).First(item => item.Kind.Value == (int)BomberPickupKind.Skill);
        var config = BomberConfigBinding.For(world);
        uint outgoing = config.Tables.Skills.Rows.First(skill => skill.Id != incoming.SkillId.Value &&
            BomberSpecialBombResolver.TryResolve(config, skill.Id, out _)).Id;
        NetEntityId life = scene.Lives[0];
        BomberSkillState slot = world.Get<BomberSkillState>(life);
        slot.BombSkillId.Value = outgoing;
        slot.BombSkillLevel.Value = 1;
        slot.BombSkillBound.Value = false;
        slot.ComboSourceA.Value = slot.ComboSourceB.Value = 0;
        slot.ComboLevelA.Value = slot.ComboLevelB.Value = 0;
        NetEntityId itemId = incoming.Entity;
        uint selectedSkill = incoming.SkillId.Value;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), world.Get<LogicTransform>(itemId).LocalPosition);
        AbilityComponent owner = world.Get<AbilityComponent>(life);
        var input = new PickupAbility.Input { Target = itemId };
        Assert.True(new PickupAbility().CanActivate(input, owner, out string? reason), reason);
        Assert.True(owner.Activate<PickupAbility, PickupAbility.Input>(input).Succeeded);

        scene.Manager.Tick();

        Assert.Equal(selectedSkill, slot.BombSkillId.Value);
        Assert.True(world.IsLive(itemId));
        var dropped = world.Get<BomberPickupItem>(itemId);
        Assert.Equal(outgoing, dropped.SkillId.Value);
        Assert.Equal(life, dropped.DroppedBy.Value);
        Assert.Equal(life, dropped.ExcludedLife.Value);
        Assert.Equal(0UL, dropped.SupplyMatchId.Value);
        Assert.Equal(-1, dropped.SupplyOrdinal.Value);
        Assert.Equal(10, Supplied(world).Length);
        Assert.Equal(11, BomberTerrainTransactions.PickupCreditUsage(world));
        Assert.Equal("", world.Single<BomberWorldRuntime>().SupplyPending.Value);
        _ = scene.Manager.CaptureSnapshot();
    }

    [Fact]
    public void CodecAcceptsExactUtf8BoundaryAndRejectsByteOverflowRowOverflowAndMissingFields()
    {
        var row = new BomberSupplyPromise(1, 0, 0, 0, 1200);
        string json = BomberCentralSupply.Encode(new[] { row });
        string boundary = json + new string(' ', 8192 - Encoding.UTF8.GetByteCount(json));
        Assert.Equal(8192, Encoding.UTF8.GetByteCount(boundary));
        Assert.Equal(new[] { row }, BomberCentralSupply.Decode(boundary));
        Assert.Throws<InvalidOperationException>(() => BomberCentralSupply.Decode(boundary + " "));
        var error = Assert.Throws<InvalidOperationException>(() => BomberCentralSupply.Decode(new string('é', 4097)));
        Assert.Contains("byte budget", error.Message, StringComparison.Ordinal);
        Assert.Throws<InvalidOperationException>(() => BomberCentralSupply.Encode(Enumerable.Repeat(row, 12).ToArray()));
        Assert.Throws<InvalidOperationException>(() => BomberCentralSupply.Decode("[{\"Match\":1}]"));
    }

    private static BomberObjectBudgetTests.AuthoredFixture SupplyConfig(bool skills = false) => new(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", skills ? "true" : "false"));

    private static ulong Opening(World world)
    {
        var game = BomberConfigBinding.For(world).Game;
        return checked(world.Single<BomberMatchState>().StartTick.Value + Ticks.FromMilliseconds(game.CentralSupplyOpenMs, game.TickRateHz));
    }

    private static void ReachOpening(BomberTerrainProductionTests.Scene scene)
    {
        ulong open = Opening(scene.World);
        while (scene.World.Tick < open) scene.Manager.Tick();
        scene.Manager.Tick();
    }

    private static void SealInterior(BomberTerrainProductionTests.Scene scene)
    {
        var map = BomberConfigBinding.For(scene.World).Map;
        foreach (NetEntityId life in scene.Lives)
            BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(life), new Vector3(15.5f, 1.5f, 15.5f));
        for (int z = map.BoundaryCells; z < map.Depth - map.BoundaryCells; z++)
        for (int x = map.BoundaryCells; x < map.Width - map.BoundaryCells; x++)
            scene.Write(x, map.ObstacleLayer, z, 1024u << 8);
    }

    private static void OpenPlaza(BomberTerrainProductionTests.Scene scene)
    {
        for (int z = 6; z <= 12; z++)
        for (int x = 6; x <= 12; x++)
        {
            scene.Write(x, 0, z, 1022u << 8);
            scene.Write(x, 1, z, 0);
        }
        foreach (NetEntityId life in scene.Lives)
            BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(life), new Vector3(15.5f, 1.5f, 15.5f));
    }

    private static BomberPickupItem[] Supplied(World world) => world.Each<BomberPickupItem>()
        .Where(item => world.IsLive(item.Entity) && item.SupplyMatchId.Value != 0).ToArray();

    private static JsonElement Occurrence(World world, string kind) => Assert.Single(BomberEffectIntegrationTests.Events(world, kind));

    private static ulong OccurredTick(JsonElement occurrence) => ulong.Parse(occurrence.GetProperty("tick").GetString()!, CultureInfo.InvariantCulture);

    private static WorldManager RestorePaired(BomberTerrainProductionTests.Scene scene, string configDirectory)
    {
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        var checkpoint = capture.Checkpoint!.Value;
        return BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
        {
            InstanceId = 1, Config = BomberConfigBinding.Load(configDirectory),
            Catalog = File.ReadAllBytes(Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot,
                "Server", "Assets", "Maps", "official-catalog.json")),
            Snapshot = checkpoint.Runtime, VoxelSnapshot = checkpoint.Voxel,
            Subsystems = new IWorldSubsystem[] { new WorldPersistenceSubsystem() },
        });
    }
}
