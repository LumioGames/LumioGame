using System;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberEffectIntegrationTests
{
    internal static WorldManager Start(out NetEntityId[] lives, WireProfile? profile = null, string? configDirectory = null)
    {
        var admission = profile is not null && profile != WireProfile.Baseline ? new BomberAdmissionFixture() : null;
        WorldManager manager = BomberTestWorld.Start(configDirectory: configDirectory, withMap: admission is not null, admission: admission);
        var binding = EntityBindingQuery.Create(manager);
        EntityOrder[] orders = profile is null
            ? Enumerable.Range(0, 8).Select(i => BomberTestWorld.QueuePlayer(manager.World, "effects-" + i)).ToArray()
            : Array.Empty<EntityOrder>();
        if (profile is not null)
            for (int i = 0; i < 8; i++)
                if (admission is not null) admission.Enqueue("pressure-" + i, "effects-" + i, "bomber-test", "player", profile.Value);
                else manager.Enqueue(new AdmitConnectionMessage("pressure-" + i, "effects-" + i, "bomber-test", "player") { Profile = profile.Value });
        manager.Tick(); manager.Tick(); manager.Tick();
        if (admission is not null)
        {
            _ = manager.DrainOutbox();
            admission.PublishAndSettle();
        }
        lives = profile is null ? orders.Select(o => o.AssignedId).ToArray() : Enumerable.Range(0, 8).Select(i =>
        {
            Assert.True(binding.TryResolveConnectionState("pressure-" + i, out NetEntityId life, out _));
            Assert.True(manager.World.Get<ObserverComponent>(life).Connected);
            return life;
        }).ToArray();
        manager.World.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Running;
        foreach (var life in lives)
        {
            var player = manager.World.Get<BomberPlayerState>(life);
            player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
            player.ProtectedUntilTick.Value = 0;
        }
        return manager;
    }

    internal static EntityOrder Bomb(World world, NetEntityId source, NetEntityId target, ulong chain, ulong? generation = null)
    {
        EntityOrder order = world.Commands.Create<BomberBombEntity>();
        BomberBombState bomb = order.Get<BomberBombState>();
        BomberPlayerState player = world.Get<BomberPlayerState>(source);
        bomb.Owner.Value = player.Participant.Value;
        bomb.SourceLife.Value = source;
        bomb.SourceLifeGeneration.Value = generation ?? player.LifeGeneration.Value;
        bomb.ChainId.Value = chain;
        bomb.Phase.Value = (int)BomberBombPhase.Fuse;
        bomb.Power.Value = 2;
        bomb.FuseEndTick.Value = world.Tick + 1;
        bomb.PlacedAtTick.Value = world.Tick;
        Position(order.Get<LogicTransform>(), world.Get<LogicTransform>(target).LocalPosition);
        return order;
    }

    internal static void ScheduleFinalCircle(World world)
    {
        Assert.Equal((int)BomberMatchPhase.Running, world.Single<BomberMatchState>().Phase.Value);
        var config = BomberConfigBinding.For(world);
        world.Single<BomberMatchState>().PhaseEndTick.Value = checked(world.Tick +
            Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz));
    }

    internal static void Position(LogicTransform transform, Vector3 p) => EcsRegistry.Generated(transform)!.WriteField("localPosition",
        FormattableString.Invariant($"{p.X:R},{p.Y:R},{p.Z:R}"), silent: true);

    internal static JsonElement[] Events(World world, string kind)
    {
        var journal = world.Single<BomberPresentationJournal>();
        return Enumerable.Range(0, journal.Entries.Count).Select(i =>
        {
            using JsonDocument document = JsonDocument.Parse(journal.Entries[i]);
            return document.RootElement.Clone();
        }).Where(e => e.GetProperty("kind").GetString() == kind).ToArray();
    }

    [Fact]
    public void FullHandlesAcrossOwnersAndUnrelatedRowsKeepActualAmountsAndRejectCorpse()
    {
        using WorldManager manager = Start(out NetEntityId[] lives);
        World world = manager.World;
        var victim = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(victim.Participant.Value);
        EntityOrder[] orders = Enumerable.Range(0, 4).Select(i => Bomb(world, lives[i + 1], lives[0], (ulong)(101 + i), i == 1 ? 91UL : null)).ToArray();
        manager.Tick();
        // Different committed row prefixes mean result indices cannot identify the target row.
        for (int i = 0; i < orders.Length; i++)
        {
            BomberBombState bomb = world.Get<BomberBombState>(orders[i].AssignedId);
            for (int j = 0; j <= i; j++)
            {
                var other = world.Get<BomberPlayerState>(lives[7 - j]);
                var tuple = new BomberTargetIdentity(other.Participant.Value, other.Entity, other.LifeGeneration.Value);
                Assert.Equal(BomberStorageAdmission.Added, bomb.TryReserveHit(tuple));
                Assert.True(bomb.CommitContact(tuple));
            }
        }
        ulong tick = world.Tick;
        manager.Tick();
        Assert.Equal(0L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0L, world.Get<AttributeComponent>(lives[0]).GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(tick, participant.DeathTick.Value);
        var facts = orders.Select(o => world.Get<BomberDamageFacts>(o.AssignedId)).ToArray();
        for (int i = 0; i < 4; i++)
        {
            int row = Enumerable.Range(0, facts[i].Target.Count).Single(j => facts[i].Target[j] == lives[0]);
            Assert.Equal(i + 1, row);
            Assert.Equal(i < 3 ? 1 : 2, facts[i].Status[row]);
            if (i < 3)
            {
                Assert.Equal(6 - 2L * i, facts[i].Before[row]);
                Assert.Equal(4 - 2L * i, facts[i].After[row]);
                Assert.Equal(2L, facts[i].Actual[row]);
            }
        }
        Assert.Empty(Events(world, "damage_applied"));
        manager.Tick();
        Assert.False(world.IsLive(lives[0]));
        var damage = Events(world, "damage_applied");
        Assert.Equal(3, damage.Length);
        Assert.Single(Events(world, "death"));
        Assert.All(damage, e => Assert.Equal(tick.ToString(System.Globalization.CultureInfo.InvariantCulture), e.GetProperty("tick").GetString()));
        Assert.Equal("91", damage.Single(e => e.GetProperty("entityId").GetString() == orders[1].AssignedId.ToHex()).GetProperty("data").GetProperty("sourceLifeGeneration").GetString());
        Assert.Equal(4, world.Get<BomberBombState>(orders[3].AssignedId).HitParticipants.Count);
        manager.Tick();
        Assert.Equal(3, Events(world, "damage_applied").Length);
        Assert.Single(Events(world, "death"));
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
    }

    [Fact]
    public void ARealDestroyedSourceLifeKeepsItsCapturedAttributionOnLaterDamage()
    {
        using WorldManager manager = Start(out NetEntityId[] lives);
        World world = manager.World;
        var source = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(source.Participant.Value);
        ulong generation = source.LifeGeneration.Value;
        world.Get<AttributeComponent>(lives[0]).SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        Bomb(world, lives[0], lives[0], 701);
        EntityOrder late = Bomb(world, lives[0], lives[1], 702);
        late.Get<BomberBombState>().FuseEndTick.Value = world.Tick + 3;
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(lives[0]));
        Assert.True(participant.SuccessorPending.Value);
        ulong impactTick = world.Tick;
        manager.Tick();
        var fact = world.Get<BomberDamageFacts>(late.AssignedId);
        Assert.Equal(lives[0], fact.SourceLife[0]);
        Assert.Equal(generation, fact.SourceGeneration[0]);
        Assert.Equal(participant.Entity, fact.SourceParticipant[0]);
        Assert.Equal(4L, world.Get<AttributeComponent>(lives[1]).GetBaseValue(BomberAttributeNames.HealthPoints));
        manager.Tick();
        var damage = Events(world, "damage_applied").Single(e => e.GetProperty("entityId").GetString() == late.AssignedId.ToHex());
        Assert.Equal(lives[0].ToHex(), damage.GetProperty("sourceLifeId").GetString());
        Assert.Equal(generation.ToString(System.Globalization.CultureInfo.InvariantCulture), damage.GetProperty("data").GetProperty("sourceLifeGeneration").GetString());
        Assert.Equal(impactTick.ToString(System.Globalization.CultureInfo.InvariantCulture), damage.GetProperty("tick").GetString());
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void AdmissionRefusalAndProtectionDoNotLeakReservationsOrEmitDamage(int transport)
    {
        WireProfile? profile = transport == 0 ? null : transport == 1 ? WireProfile.Baseline : WireProfile.SuccessorBindingReceiptsPartsV1;
        using WorldManager manager = Start(out NetEntityId[] lives, profile);
        World world = manager.World;
        Assert.Equal(transport == 0 ? 0 : 8, world.Each<ObserverComponent>().Count(o => o.Connected));
        var protectedPlayer = world.Get<BomberPlayerState>(lives[1]);
        protectedPlayer.ProtectedUntilTick.Value = world.Tick + 100;
        Position(world.Get<LogicTransform>(lives[1]), world.Get<LogicTransform>(lives[0]).LocalPosition);
        EntityOrder[] bombs = Enumerable.Range(0, 260).Select(i => Bomb(world, lives[2], lives[0], (ulong)(1000 + i))).ToArray();
        if (transport == 1)
        {
            // The first publication already exceeds the negotiated baseline frame.
            var error = Assert.Throws<InvalidOperationException>(() => manager.Tick());
            Assert.Equal("Tick faulted at ReplicationProjection: effect_budget_invariant: WorldChange exceeds its negotiated logical limit", error.Message);
            Assert.Empty(Events(world, "damage_applied"));
            Assert.Empty(Events(world, "death"));
            Assert.Equal(6L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Equal(6L, world.Get<AttributeComponent>(lives[1]).GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Equal(0, bombs.Sum(o => world.Get<BomberBombState>(o.AssignedId).HitParticipants.Count));
            foreach (var order in bombs) world.Get<BomberBombState>(order.AssignedId).ValidateStorage();
            return;
        }
        manager.Tick(); manager.Tick();
        int refused = 0;
        foreach (var order in bombs)
        {
            var bomb = world.Get<BomberBombState>(order.AssignedId);
            Assert.Equal(1, bomb.HitParticipants.Count);
            if (bomb.HitHandleGenerations[0] == 0) refused++;
            Assert.DoesNotContain(protectedPlayer.Participant.Value, Enumerable.Range(0, bomb.HitParticipants.Count).Select(i => bomb.HitParticipants[i]));
        }
        Assert.True(refused > 0, "The real generated admission limit must be exercised.");
        Assert.Equal(6L, world.Get<AttributeComponent>(lives[1]).GetBaseValue(BomberAttributeNames.HealthPoints));
        manager.Tick();
        Assert.Equal(3, Events(world, "damage_applied").Length);
        Assert.Single(Events(world, "death"));
        Assert.Equal(3, bombs.Sum(o => world.Get<BomberBombState>(o.AssignedId).HitParticipants.Count));
        foreach (var order in bombs) world.Get<BomberBombState>(order.AssignedId).ValidateStorage();
    }

    [Fact]
    public void DuplicateBombFamilyReservationNeverProducesASecondFact()
    {
        using WorldManager manager = Start(out NetEntityId[] lives);
        World world = manager.World;
        EntityOrder order = Bomb(world, lives[1], lives[0], 444);
        manager.Tick();
        var bomb = world.Get<BomberBombState>(order.AssignedId);
        var victim = world.Get<BomberPlayerState>(lives[0]);
        var tuple = new BomberTargetIdentity(victim.Participant.Value, lives[0], victim.LifeGeneration.Value);
        Assert.Equal(BomberStorageAdmission.Added, bomb.TryReserveHit(tuple));
        Assert.True(bomb.CommitContact(tuple));
        Assert.Equal(BomberStorageAdmission.Duplicate, bomb.TryReserveHit(tuple));
        manager.Tick(); manager.Tick();
        Assert.Equal(6L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Empty(Events(world, "damage_applied"));
        Assert.Equal(1, bomb.HitParticipants.Count);
        Assert.False(world.Get<BomberDamageFacts>(bomb.Entity).Ready[0]);
    }

    [Fact]
    public void FinalCircleCountsBothLethalResultsBeforeChoosingDraw()
    {
        using WorldManager manager = Start(out NetEntityId[] lives);
        World world = manager.World;
        for (int i = 0; i < 8; i++)
        {
            var player = world.Get<BomberPlayerState>(lives[i]);
            if (i < 2) world.Get<AttributeComponent>(lives[i]).SetBaseValue(BomberAttributeNames.HealthPoints, 2);
            else
            {
                player.LifePhase.Value = (int)BomberLifePhase.Eliminated;
                player.EliminatedTick.Value = world.Tick - 1;
                world.Get<BomberParticipantState>(player.Participant.Value).LifePhase.Value = player.LifePhase.Value;
            }
        }
        Bomb(world, lives[0], lives[0], 1); Bomb(world, lives[1], lives[1], 2);
        manager.Tick();
        var match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.FinalCircle;
        match.PhaseEndTick.Value = world.Tick + 100;
        ulong tick = world.Tick;
        manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.Equal(tick, match.EndTick.Value);
        Assert.Equal(0, match.SurvivorCount.Value);
        Assert.True(match.Winner.Value.IsDefault);
        Assert.Equal((int)BomberEndReason.SimultaneousElimination, match.EndReason.Value);
        Assert.Empty(Events(world, "match_end"));
        manager.Tick();
        Assert.False(world.IsLive(lives[0])); Assert.False(world.IsLive(lives[1]));
        Assert.Equal(2, Events(world, "death").Length);
        Assert.Single(Events(world, "match_end"));
        manager.Tick();
        Assert.Single(Events(world, "match_end"));
    }

    [Fact]
    public void EmptyResultDeadlineStillSettlesOutcomeOnThatTick()
    {
        using WorldManager manager = Start(out _);
        var match = manager.World.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.FinalCircle;
        match.PhaseEndTick.Value = manager.World.Tick;
        ulong tick = manager.World.Tick;
        manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.Equal(tick, match.EndTick.Value);
        Assert.Equal(8, match.SurvivorCount.Value);
        Assert.Equal((int)BomberEndReason.TimeLimit, match.EndReason.Value);
        manager.Tick();
        Assert.Single(Events(manager.World, "match_end"));
    }
}
