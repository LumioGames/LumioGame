using System;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberCentralSupplyProductionTests
{
    [Fact]
    public void RealNativeCustomRoomAnnouncesAtFiftySecondsAndIssuesNineNonSkillItemsOnceAtSixty()
    {
        // A source-authored UGC 19/8 room exercises this producer independently.
        // It does not admit or substitute for the formal 23/12 and 27/16 rooms.
        using var config = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "central_supply_enabled", "true"),
            ("game", "default", "skills_enabled", "false"));
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: config.Compile());
        OpenPlaza(scene);
        var world = scene.World;
        var rule = BomberConfigBinding.For(world).Game;
        var match = world.Single<BomberMatchState>();
        var runtime = world.Single<BomberWorldRuntime>();
        ulong announce = checked(match.StartTick.Value + Ticks.FromMilliseconds(rule.CentralSupplyAnnounceMs, rule.TickRateHz));
        ulong open = checked(match.StartTick.Value + Ticks.FromMilliseconds(rule.CentralSupplyOpenMs, rule.TickRateHz));
        while (world.Tick < announce) scene.Manager.Tick();
        Assert.Equal(0UL, runtime.SupplyAnnouncedMatchId.Value);
        Assert.Empty(world.Each<BomberPickupItem>());
        scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        Assert.Equal(match.MatchId.Value, runtime.SupplyAnnouncedMatchId.Value);
        Assert.Equal(1, Occurrences(world, "supply_announced"));
        while (world.Tick < open) scene.Manager.Tick();
        Assert.Equal(0UL, runtime.SupplyIssuedMatchId.Value);
        Assert.Empty(world.Each<BomberPickupItem>());
        scene.Manager.Tick();
        Assert.Equal(match.MatchId.Value, runtime.SupplyIssuedMatchId.Value);
        var items = world.Each<BomberPickupItem>().Where(item => world.IsLive(item.Entity)).ToArray();
        Assert.Equal(9, items.Length);
        Assert.Equal(5, items.Count(item => item.Kind.Value is 0 or 1 or 2));
        Assert.Equal(2, items.Count(item => item.Kind.Value == (int)BomberPickupKind.Health));
        Assert.Equal(1, items.Count(item => item.Kind.Value == (int)BomberPickupKind.Frenzy));
        Assert.Equal(1, items.Count(item => item.Kind.Value == (int)BomberPickupKind.GoldenHeart));
        Assert.All(items, item => Assert.Equal(match.MatchId.Value, item.SupplyMatchId.Value));
        Assert.Equal(9, items.Select(item => item.SupplyOrdinal.Value).Distinct().Count());
        Assert.Equal("", runtime.SupplyPending.Value);
        Assert.Equal(1, Occurrences(world, "supply_opened"));
        for (int i = 0; i < 20; i++) scene.Manager.Tick();
        Assert.Equal(9, world.Each<BomberPickupItem>().Count(item => world.IsLive(item.Entity)));
        Assert.Equal(1, Occurrences(world, "supply_opened"));
    }

    [Fact]
    public void RealNativeDefaultNineteenRoomKeepsCentralSupplyDisabledPastItsOpeningTime()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        OpenPlaza(scene);
        var world = scene.World;
        var rule = BomberConfigBinding.For(world).Game;
        Assert.False(rule.CentralSupplyEnabled);
        ulong open = checked(world.Single<BomberMatchState>().StartTick.Value +
            Ticks.FromMilliseconds(rule.CentralSupplyOpenMs, rule.TickRateHz));
        while (world.Tick <= open) scene.Manager.Tick();
        Assert.Equal(0UL, world.Single<BomberWorldRuntime>().SupplyAnnouncedMatchId.Value);
        Assert.Equal(0UL, world.Single<BomberWorldRuntime>().SupplyIssuedMatchId.Value);
        Assert.Empty(world.Each<BomberPickupItem>());
        Assert.Equal(0, Occurrences(world, "supply_announced"));
        Assert.Equal(0, Occurrences(world, "supply_opened"));
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

    private static int Occurrences(World world, string kind)
    {
        var entries = world.Single<BomberPresentationJournal>().Entries;
        int count = 0;
        for (int i = 0; i < entries.Count; i++)
        {
            using var document = JsonDocument.Parse(entries[i]);
            if (document.RootElement.GetProperty("kind").GetString() == kind) count++;
        }
        return count;
    }
}
