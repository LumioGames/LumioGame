using System;
using System.IO;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberMatchSeedTests
{
    [Theory]
    [InlineData(0u)]
    [InlineData(101u)]
    [InlineData(uint.MaxValue)]
    public void RealFirstMatchUsesTheSelectedImmutableConfigSeed(uint seed)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "initial_seed", seed.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        string export = fixture.Compile();
        using var artifact = JsonDocument.Parse(File.ReadAllText(Path.Combine(export, "server/game.json")));
        Assert.Equal(seed, artifact.RootElement.GetProperty("rows")[0].GetProperty("initial_seed").GetUInt32());
        using WorldManager manager = BomberTestWorld.Start(configDirectory: export);
        for (int slot = 0; slot < 8; slot++) BomberTestWorld.QueuePlayer(manager.World, "seed-" + slot);
        manager.Tick(); manager.Tick(); manager.Tick();
        var match = manager.World.Single<BomberMatchState>();
        Assert.Equal(1UL, match.MatchId.Value);
        Assert.Equal((ulong)seed, match.Seed.Value);
        manager.Tick(); manager.Tick();
        Assert.Equal((ulong)seed, match.Seed.Value);
    }
}
