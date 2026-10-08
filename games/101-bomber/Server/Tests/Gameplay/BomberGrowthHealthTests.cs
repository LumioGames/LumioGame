using System;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Coordination;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberGrowthHealthTests
{
    // Items and bombs are fixture-created inputs. All pickup, health and death outcomes use ordinary Tick.
    internal static EntityOrder Item(World world, NetEntityId life, int kind)
    {
        EntityOrder order = world.Commands.Create<BomberPickupItemEntity>();
        order.Get<BomberPickupItem>().Kind.Value = kind;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), world.Get<LogicTransform>(life).LocalPosition);
        return order;
    }

    internal static void Take(WorldManager manager, NetEntityId life, int kind)
    {
        EntityOrder order = Item(manager.World, life, kind);
        manager.Tick();
        manager.World.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = order.AssignedId });
        manager.Tick(); manager.Tick();
        Assert.False(manager.World.IsLive(order.AssignedId));
    }

    [Theory]
    [InlineData(3)]
    [InlineData(0)]
    [InlineData(5)]
    public void SettledOriginalPickupPublishesItsActualNonzeroCell(int kind)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        if (kind == 3)
        {
            BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 890);
            manager.Tick(); manager.Tick(); manager.Tick();
        }
        EntityOrder item = Item(world, lives[0], kind);
        var position = item.Get<LogicTransform>().LocalPosition;
        int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
        Assert.True(x != 0 || z != 0);
        manager.Tick();
        world.Get<AbilityComponent>(lives[0]).Activate<PickupAbility, PickupAbility.Input>(
            new PickupAbility.Input { Target = item.AssignedId });
        manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(item.AssignedId));
        var occurrence = Assert.Single(BomberEffectIntegrationTests.Events(world, "pickup_taken"));
        Assert.Equal(item.AssignedId.ToHex(), occurrence.GetProperty("entityId").GetString());
        Assert.Equal(x, occurrence.GetProperty("x").GetInt32());
        Assert.Equal(z, occurrence.GetProperty("z").GetInt32());
        var player = world.Get<BomberPlayerState>(lives[0]);
        Assert.Equal(player.Participant.Value.ToHex(), occurrence.GetProperty("participantId").GetString());
        Assert.Equal(lives[0].ToHex(), occurrence.GetProperty("lifeId").GetString());
        Assert.Equal(player.LifeGeneration.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),
            occurrence.GetProperty("lifeGeneration").GetString());
        string? output = Environment.GetEnvironmentVariable("LUMIO_GROWTH_OCCURRENCE_OUTPUT");
        if (output is not null) File.WriteAllText(Path.Combine(output, $"pickup-{kind}.json"), occurrence.GetRawText());
    }

    [Fact]
    public void ChangedOriginalItemRejectsLiveReservationThenCompetingGoldPickupSucceeds()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        EntityOrder original = Item(world, lives[0], 5);
        manager.Tick();
        world.Get<AbilityComponent>(lives[0]).Activate<PickupAbility, PickupAbility.Input>(
            new PickupAbility.Input { Target = original.AssignedId });
        var reserved = world.Get<BomberPickupItem>(original.AssignedId);
        Assert.Equal(lives[0], reserved.ClaimedBy.Value);
        Assert.Equal(0, world.Get<BomberHealthFacts>(lives[0]).Status[0]);
        reserved.Kind.Value = -1;
        manager.Tick();
        var facts = world.Get<BomberHealthFacts>(lives[0]);
        Assert.Equal(2, facts.Status[0]);
        Assert.False(facts.Ready[0]);
        manager.Tick();
        Assert.True(world.IsLive(original.AssignedId));
        Assert.True(reserved.ClaimedBy.Value.IsDefault);
        Assert.Equal(0, world.Get<BomberPlayerState>(lives[0]).GoldenHeartCount.Value);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "pickup_taken"));
        EntityOrder competing = Item(world, lives[0], 5);
        manager.Tick(); manager.Tick();
        manager.Tick();
        Assert.False(world.IsLive(competing.AssignedId));
        Assert.Equal(1, world.Get<BomberPlayerState>(lives[0]).GoldenHeartCount.Value);
        Assert.True(world.IsLive(original.AssignedId));
        Assert.True(reserved.ClaimedBy.Value.IsDefault);
        Assert.Single(BomberEffectIntegrationTests.Events(world, "gold_heart_picked"));
    }

    [Fact]
    public void InjuredLifeGainsOnlyNewHeartsAtFourAndEightActualUpgrades()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 801);
        manager.Tick(); manager.Tick(); manager.Tick();
        var player = world.Get<BomberPlayerState>(lives[0]);
        var attributes = world.Get<AttributeComponent>(lives[0]);
        Assert.Equal(4L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        for (int hats = 1; hats <= 12; hats++)
        {
            Take(manager, lives[0], hats <= 4 ? 0 : hats <= 9 ? 1 : 2);
            Assert.Equal(hats, player.HatCount.Value);
            if (hats < 4) continue;
            int bonus = hats < 8 ? 2 : 4;
            Assert.Equal(6 + bonus, player.MaximumHealth.Value);
            Assert.Equal(4L + bonus, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Equal(4L + bonus, attributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
        }
        manager.Tick(); manager.Tick();
        Assert.Equal(8L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        EntityOrder capped = Item(world, lives[0], 0);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.True(world.IsLive(capped.AssignedId));
        Assert.True(world.Get<BomberPickupItem>(capped.AssignedId).ClaimedBy.Value.IsDefault);
        Assert.Equal(12, player.HatCount.Value);
    }

    [Fact]
    public void ThreeGoldenHeartPickupsFillNewHeartsAndFourthStaysOnGround()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 802);
        manager.Tick(); manager.Tick(); manager.Tick();
        for (int gold = 1; gold <= 3; gold++)
        {
            Take(manager, lives[0], 5);
            Assert.Equal(6 + gold * 2, world.Get<BomberPlayerState>(lives[0]).MaximumHealth.Value);
            Assert.Equal(4L + gold * 2, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
            var life = world.Get<BomberPlayerState>(lives[0]);
            var facts = world.Get<BomberHealthFacts>(lives[0]);
            Assert.Equal(1, facts.Status[0]);
            Assert.Equal(2L, facts.Actual[0]);
            Assert.Equal(lives[0], facts.Target[0]);
            Assert.Equal(life.Participant.Value, facts.Participant[0]);
            Assert.Equal(life.LifeGeneration.Value, facts.Generation[0]);
            Assert.NotEqual(0UL, facts.HandleInstance[0]);
            var picked = BomberEffectIntegrationTests.Events(world, "gold_heart_picked")[gold - 1];
            Assert.Equal(facts.MatchId[0].ToString(System.Globalization.CultureInfo.InvariantCulture), picked.GetProperty("matchId").GetString());
            Assert.Equal(facts.Tick[0].ToString(System.Globalization.CultureInfo.InvariantCulture), picked.GetProperty("tick").GetString());
            Assert.Equal(facts.Item[0].ToHex(), picked.GetProperty("entityId").GetString());
            Assert.Equal(life.Participant.Value.ToHex(), picked.GetProperty("participantId").GetString());
            Assert.Equal(lives[0].ToHex(), picked.GetProperty("lifeId").GetString());
            Assert.Equal(life.LifeGeneration.Value.ToString(System.Globalization.CultureInfo.InvariantCulture), picked.GetProperty("lifeGeneration").GetString());
            Assert.Equal(life.Participant.Value.ToHex(), picked.GetProperty("sourceParticipantId").GetString());
            Assert.Equal(lives[0].ToHex(), picked.GetProperty("sourceLifeId").GetString());
            Assert.Equal(life.LifeGeneration.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),
                picked.GetProperty("data").GetProperty("sourceLifeGeneration").GetString());
            Assert.NotEqual("0", picked.GetProperty("sequence").GetString());
            Assert.False(picked.GetProperty("data").TryGetProperty("restoreIntent", out _));
        }
        EntityOrder fourth = Item(world, lives[0], 5);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.True(world.IsLive(fourth.AssignedId));
        Assert.True(world.Get<BomberPickupItem>(fourth.AssignedId).ClaimedBy.Value.IsDefault);
        Assert.Equal(3, BomberEffectIntegrationTests.Events(world, "gold_heart_picked").Length);
        Assert.Single(BomberEffectIntegrationTests.Events(world, "boss_formed"));
    }

    [Fact]
    public void MaximumSixteenIsIndependentOfInitialSixAndOrdinaryHealingClampsToLife()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        Assert.Equal(6L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        for (int i = 0; i < 8; i++) Take(manager, lives[0], i < 4 ? 0 : 1);
        for (int i = 0; i < 3; i++) Take(manager, lives[0], 5);
        Assert.Equal(16, world.Get<BomberPlayerState>(lives[0]).MaximumHealth.Value);
        Assert.Equal(16L, world.Get<AttributeComponent>(lives[0]).GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, BomberConfigBinding.For(world).Attribute(BomberAttributeNames.HealthPoints).Initial);
        Assert.Equal(16L, BomberConfigBinding.For(world).Attribute(BomberAttributeNames.HealthPoints).Maximum);
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 803);
        manager.Tick(); manager.Tick(); manager.Tick();
        Take(manager, lives[0], 3);
        Assert.Equal(16L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        EntityOrder full = Item(world, lives[0], 3);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.True(world.IsLive(full.AssignedId));
    }

    [Fact]
    public void SameTickContendersReserveOneItemAndOneHealthSlotWithoutLosingOtherItems()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        // Fixture premise: both live contestants occupy the same open position.
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(lives[1]), world.Get<LogicTransform>(lives[0]).LocalPosition);
        EntityOrder a = Item(world, lives[0], 5), b = Item(world, lives[0], 5), c = Item(world, lives[0], 5);
        manager.Tick(); manager.Tick();
        Assert.Equal(1, world.Get<BomberPlayerState>(lives[0]).GoldenHeartCount.Value);
        Assert.Equal(1, world.Get<BomberPlayerState>(lives[1]).GoldenHeartCount.Value);
        Assert.Equal(2, world.Each<BomberPickupItem>().Count(i => !i.ClaimedBy.Value.IsDefault));
        Assert.Single(world.Each<BomberPickupItem>(), i => i.ClaimedBy.Value.IsDefault);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "gold_heart_picked"));
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(3, world.Get<BomberPlayerState>(lives[0]).GoldenHeartCount.Value + world.Get<BomberPlayerState>(lives[1]).GoldenHeartCount.Value);
        Assert.False(world.IsLive(a.AssignedId)); Assert.False(world.IsLive(b.AssignedId)); Assert.False(world.IsLive(c.AssignedId));
        var picked = BomberEffectIntegrationTests.Events(world, "gold_heart_picked");
        Assert.Equal(3, picked.Length);
        Assert.Equal(3, picked.Select(e => e.GetProperty("entityId").GetString()).Distinct().Count());
    }

    [Fact]
    public void RealEffectAdmissionExhaustionKeepsGoldenItemAndHoldingsUntouched()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        EntityOrder item = Item(world, lives[0], 5);
        for (int i = 0; i < 260; i++) BomberEffectIntegrationTests.Bomb(world, lives[6], lives[7], (ulong)(1000 + i));
        manager.Tick(); manager.Tick();
        Assert.True(world.IsLive(item.AssignedId));
        Assert.True(world.Get<BomberPickupItem>(item.AssignedId).ClaimedBy.Value.IsDefault);
        Assert.Equal(0, world.Get<BomberPlayerState>(lives[0]).GoldenHeartCount.Value);
        Assert.Equal(6, world.Get<BomberPlayerState>(lives[0]).MaximumHealth.Value);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "gold_heart_picked"));
    }

    [Theory]
    [InlineData(5)]
    [InlineData(0)]
    public void DeathBeforeSettlementRejectsReservedPickupAndNeverHealsAnotherLife(int kind)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var player = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        EntityOrder item = Item(world, lives[0], kind);
        for (int i = 0; i < 3; i++) BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], (ulong)(810 + i));
        manager.Tick(); manager.Tick();
        var facts = world.Get<BomberHealthFacts>(lives[0]);
        Assert.Equal(2, facts.Status[0]);
        Assert.False(facts.Ready[0]);
        Assert.Equal(lives[0], facts.Target[0]);
        Assert.Equal(player.LifeGeneration.Value, facts.Generation[0]);
        Assert.Equal(0, player.GoldenHeartCount.Value);
        Assert.Equal(0L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(lives[0]));
        Assert.True(participant.CurrentLife.Value.IsDefault);
        Assert.True(participant.SuccessorPending.Value);
        Assert.True(world.IsLive(item.AssignedId));
        Assert.True(world.Get<BomberPickupItem>(item.AssignedId).ClaimedBy.Value.IsDefault);
        Assert.Equal(0, world.Get<BomberRespawnCarry>(participant.Entity).PendingGoldenHearts.Value);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "gold_heart_picked"));
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
        // A real new-Life restore is a separate released Runtime dependency; no same-body revival.
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void GoldDeathWealthSurvivesNoLandingRolloverAndPartialPlacementExactlyOnce(bool final)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        WorldManager manager = scene.Manager;
        NetEntityId[] lives = scene.Lives;
        World world = manager.World;
        var map = BomberConfigBinding.For(world).Map;
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++) scene.Write(x, 0, z, 1027u << 8);
        for (int i = 0; i < 3; i++) Take(manager, lives[0], 5);
        var player = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        ulong originalMatch = participant.MatchId.Value, originalGeneration = player.LifeGeneration.Value;
        if (final) BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        for (int i = 0; i < 6; i++) BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], (ulong)(820 + i));
        manager.Tick(); manager.Tick();
        ulong deathTick = participant.DeathTick.Value;
        manager.Tick();
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.False(world.IsLive(lives[0]));
        Assert.Equal(3, carry.PendingGoldenHearts.Value);
        Assert.Equal(3, carry.SelectedDropCount.Value);
        Assert.Equal(0, carry.PlacedDropCount.Value);
        Assert.Equal(!final, participant.SuccessorPending.Value);
        Assert.Single(BomberEffectIntegrationTests.Events(world, "boss_down"));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "gold_heart_dropped"));
        var down = BomberEffectIntegrationTests.Events(world, "boss_down")[0];
        var transferred = BomberEffectIntegrationTests.Events(world, "gold_heart_dropped")[0];
        Assert.Equal(deathTick.ToString(System.Globalization.CultureInfo.InvariantCulture), transferred.GetProperty("tick").GetString());
        Assert.Equal("3", transferred.GetProperty("data").GetProperty("count").GetString());
        Assert.Equal("12", down.GetProperty("data").GetProperty("maximumHealth").GetString());
        var attacker = world.Get<BomberPlayerState>(lives[1]);
        Assert.Equal(attacker.Participant.Value.ToHex(), down.GetProperty("sourceParticipantId").GetString());
        Assert.Equal(lives[1].ToHex(), down.GetProperty("sourceLifeId").GetString());
        Assert.Equal(attacker.LifeGeneration.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),
            down.GetProperty("data").GetProperty("sourceLifeGeneration").GetString());
        Assert.Equal(originalGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture),
            transferred.GetProperty("data").GetProperty("sourceLifeGeneration").GetString());
        foreach (var occurrence in new[] { down, transferred })
        {
            Assert.Equal(originalMatch.ToString(System.Globalization.CultureInfo.InvariantCulture), occurrence.GetProperty("matchId").GetString());
            Assert.Equal(participant.Entity.ToHex(), occurrence.GetProperty("participantId").GetString());
            Assert.Equal(lives[0].ToHex(), occurrence.GetProperty("lifeId").GetString());
            Assert.Equal(originalGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture), occurrence.GetProperty("lifeGeneration").GetString());
            Assert.Equal(participant.Entity.ToHex(), transferred.GetProperty("sourceParticipantId").GetString());
            Assert.Equal(lives[0].ToHex(), transferred.GetProperty("sourceLifeId").GetString());
            Assert.NotEqual("0", occurrence.GetProperty("sequence").GetString());
        }
        Assert.Equal(0, carry.PlacedDropCount.Value);
        string? output = Environment.GetEnvironmentVariable("LUMIO_GROWTH_OCCURRENCE_OUTPUT");
        if (output is not null && !final)
        {
            string[] kinds = { "gold_heart_picked", "boss_formed", "boss_down", "gold_heart_dropped" };
            var journal = world.Single<BomberPresentationJournal>();
            var events = Enumerable.Range(0, journal.Entries.Count).Select(i => journal.Entries[i]).Where(entry =>
            {
                using JsonDocument document = JsonDocument.Parse(entry);
                return kinds.Contains(document.RootElement.GetProperty("kind").GetString());
            }).ToArray();
            File.WriteAllText(Path.Combine(output, "growth-normal.json"), JsonSerializer.Serialize(new {
                tick = world.Tick.ToString(System.Globalization.CultureInfo.InvariantCulture),
                matchId = originalMatch.ToString(System.Globalization.CultureInfo.InvariantCulture), events }));
        }
        // Fixture phase premise drives the real ordinary rollover. It cannot discharge old-match debt.
        var match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick;
        for (int i = 0; i < 80 && match.MatchId.Value == originalMatch; i++) manager.Tick();
        Assert.True(match.MatchId.Value > originalMatch);
        Assert.Equal(originalMatch, carry.DropMatchId.Value);
        Assert.Equal(3, carry.PendingGoldenHearts.Value);
        int capacity = BomberConfigBinding.For(world).ObjectBudgets.PickupCapacity;
        // Commit the capacity premise while Native still offers no destination, then reopen it.
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++) scene.Write(x, 0, z, 1027u << 8);
        EntityOrder[] filler = Enumerable.Range(0, capacity - 1).Select(_ => world.Commands.Create<BomberPickupItemEntity>()).ToArray();
        manager.Tick();
        Assert.Equal(3, carry.PendingGoldenHearts.Value);
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++) scene.Write(x, 0, z, 1022u << 8);
        manager.Tick();
        Assert.Equal(1, carry.PlacedDropCount.Value);
        Assert.Equal(2, carry.PendingGoldenHearts.Value);
        Assert.Equal(capacity, world.Each<BomberPickupItem>().Count());
        manager.Tick();
        Assert.Equal(1, carry.PlacedDropCount.Value);
        world.Commands.Destroy(filler[0].AssignedId); world.Commands.Destroy(filler[1].AssignedId);
        manager.Tick(); manager.Tick();
        Assert.Equal(0, carry.PendingGoldenHearts.Value);
        Assert.Equal(3, carry.PlacedDropCount.Value);
        Assert.False(participant.DeathDropPending.Value);
        var drops = world.Each<BomberPickupItem>().Where(i => i.Kind.Value == 5).ToArray();
        Assert.Equal(3, drops.Length);
        Assert.All(drops, drop => {
            Assert.Equal(originalMatch, drop.DropMatchId.Value);
            Assert.Equal(lives[0], drop.DroppedBy.Value);
            Assert.Equal(originalGeneration, drop.DropLifeGeneration.Value);
            Assert.Equal(participant.Entity, drop.DropParticipant.Value);
            Assert.Equal(deathTick, drop.DropOccurrenceTick.Value);
            Assert.Equal(60UL, drop.ProtectedUntilTick.Value - drop.SpawnTick.Value);
        });
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
    }

    [Fact]
    public void GrowthCaptureChangesHashAndRejectsMalformedCountsAndIdentity()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        byte[] before = manager.CaptureSnapshot();
        Take(manager, lives[0], 5);
        byte[] after = manager.CaptureSnapshot();
        Assert.NotEqual(SHA256.HashData(before), SHA256.HashData(after));
        Assert.Equal(after, manager.CaptureSnapshot());
        using (WorldManager restored = BomberTestWorld.Restore(after, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
        {
            Assert.Equal(1, restored.World.Get<BomberPlayerState>(lives[0]).GoldenHeartCount.Value);
            Assert.Equal(8, restored.World.Get<BomberPlayerState>(lives[0]).MaximumHealth.Value);
        }
        var player = world.Get<BomberPlayerState>(lives[0]);
        // Corruption fixtures only; none of these writes is used as a gameplay outcome.
        player.GoldenHeartCount.Value = 4;
        byte[] malformed = manager.CaptureSnapshot();
        Assert.NotEqual(SHA256.HashData(after), SHA256.HashData(malformed));
        player.GoldenHeartCount.Value = 1;
        Assert.Equal(after, manager.CaptureSnapshot());
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => {
            using WorldManager rejected = BomberTestWorld.Restore(malformed, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
        });
        ulong generation = player.LifeGeneration.Value;
        player.LifeGeneration.Value = 0;
        malformed = manager.CaptureSnapshot();
        player.LifeGeneration.Value = generation;
        Assert.Equal(after, manager.CaptureSnapshot());
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => {
            using WorldManager rejected = BomberTestWorld.Restore(malformed, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
        });
    }

    [Fact]
    public void SettledGrowthColumnsAndPendingDeathGoldRejectCorruptSnapshots()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        Take(manager, lives[0], 5);
        var facts = world.Get<BomberHealthFacts>(lives[0]);
        byte[] valid = manager.CaptureSnapshot();
        // Corruption fixture: one column loses its only entry, without changing any gameplay input.
        facts.GoldAfter.Clear();
        byte[] malformed = manager.CaptureSnapshot();
        Assert.NotEqual(SHA256.HashData(valid), SHA256.HashData(malformed));
        facts.GoldAfter.Add(1);
        Assert.Equal(valid, manager.CaptureSnapshot());
        AssertRejected(malformed);
        NetEntityId participantId = world.Get<BomberPlayerState>(lives[0]).Participant.Value;
        for (int i = 0; i < 4; i++) BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], (ulong)(840 + i));
        manager.Tick(); manager.Tick(); manager.Tick();
        var carry = world.Get<BomberRespawnCarry>(participantId);
        Assert.Equal(1, carry.PendingGoldenHearts.Value);
        valid = manager.CaptureSnapshot();
        using (WorldManager restored = BomberTestWorld.Restore(valid, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
            Assert.Equal(1, restored.World.Get<BomberRespawnCarry>(participantId).PendingGoldenHearts.Value);
        carry.PendingGoldenHearts.Value = 4;
        malformed = manager.CaptureSnapshot();
        Assert.NotEqual(SHA256.HashData(valid), SHA256.HashData(malformed));
        carry.PendingGoldenHearts.Value = 1;
        Assert.Equal(valid, manager.CaptureSnapshot());
        AssertRejected(malformed);
        ulong generation = carry.DropGeneration.Value;
        carry.DropGeneration.Value = 0;
        malformed = manager.CaptureSnapshot();
        carry.DropGeneration.Value = generation;
        Assert.Equal(valid, manager.CaptureSnapshot());
        AssertRejected(malformed);
    }

    private static void AssertRejected(byte[] snapshot) => BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => {
        using WorldManager rejected = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
    });
}
