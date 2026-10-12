using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.GameRuntime.Simulation;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberRoomBotTests
{
    [Fact]
    public void SingleHumanWaitsUntilExplicitFillThenAddsOneBotAtThreeSeconds()
    {
        var admission = new BomberAdmissionFixture();
        using var manager = BomberTestWorld.Start(withMap: true, admission: admission);
        using var bindings = EntityBindingQuery.Create(manager);
        admission.Enqueue("room-human", "room-account", "room", "player", WireProfile.SuccessorBindingV1);
        manager.Tick(); manager.DrainOutbox(); admission.PublishAndSettle();
        for (int i = 0; i < 80; i++) manager.Tick();
        Assert.Single(manager.World.Each<BomberPlayerState>());
        Assert.Equal(0UL, manager.World.Single<BomberMatchState>().MatchId.Value);
        var owner = manager.World.Get<AbilityComponent>(Assert.Single(manager.World.Each<BomberPlayerState>()).Entity);
        owner.Activate<SetBotFillAbility, SetBotFillAbility.Input>(new SetBotFillAbility.Input { Enabled = true });
        manager.Tick();
        for (int i = 0; i < 59; i++) manager.Tick();
        Assert.Single(manager.World.Each<BomberPlayerState>());
        manager.Tick();
        Assert.Equal(2, manager.World.Each<BomberPlayerState>().Count());
    }

    [Fact]
    public void RepeatedEnableDoesNotPostponeTheNextJoinAndDisableStopsFurtherJoins()
    {
        using var room = new Room();
        room.Fill(true);
        ulong due = room.World.Single<BomberWorldRuntime>().BotNextJoinTick.Value;
        room.Tick(30);
        room.Fill(true);
        Assert.Equal(due, room.World.Single<BomberWorldRuntime>().BotNextJoinTick.Value);
        room.Tick(29);
        Assert.Equal(2, room.World.Each<BomberPlayerState>().Count());
        room.Tick(59);
        Assert.Equal(2, room.World.Each<BomberPlayerState>().Count());
        room.Tick(1);
        Assert.Equal(3, room.World.Each<BomberPlayerState>().Count());
        room.Fill(false);
        Assert.False(room.World.Single<BomberWorldRuntime>().BotFillEnabled.Value);
        Assert.Equal(0UL, room.World.Single<BomberWorldRuntime>().BotNextJoinTick.Value);
        room.Tick(120);
        Assert.Equal(3, room.World.Each<BomberPlayerState>().Count());
    }

    [Fact]
    public void HumansEnterRemainingSeatsDuringFillAndFullRoomUsesNormalAdmissionRefusal()
    {
        using var room = new Room();
        room.Fill(true);
        room.Tick(60);
        room.Join("second");
        Assert.Equal(3, room.World.Each<BomberPlayerState>().Count());
        room.Tick(300);
        Assert.Equal(8, room.World.Each<BomberParticipantState>().Count());
        Assert.Equal(8, room.World.Each<BomberPlayerState>().Count());
        Assert.False(room.World.Single<BomberWorldRuntime>().BotFillEnabled.Value);
        Assert.Equal(0UL, room.World.Single<BomberWorldRuntime>().BotNextJoinTick.Value);
        Assert.Equal(8, room.World.Each<BomberParticipantState>().Select(p => p.Slot.Value).Distinct().Count());
        var botLives = room.World.Each<BomberPlayerState>().Where(p => p.IsBot.Value).ToArray();
        var botNames = botLives.Select(p => room.World.Get<Lumio.Bomber.Gameplay.Components.Identity.IdentityComponent>(p.Entity).Name.Value).OrderBy(n => n).ToArray();
        Assert.Equal(Enumerable.Range(1, 6).Select(i => $"bot{i:000}"), botNames);
        foreach (var bot in botLives)
        {
            Assert.Equal(0UL, room.World.Get<ObserverComponent>(bot.Entity).ConnectionGeneration);
            Assert.True(string.IsNullOrEmpty(room.World.Get<Lumio.Bomber.Gameplay.Components.Identity.IdentityComponent>(bot.Entity).AccountId.Value));
        }
        var rejected = room.Admission.TryEnqueue("late", "late-account", "room", "player", WireProfile.SuccessorBindingV1);
        Assert.NotEqual("Acquired", rejected.Status);
        room.Tick(80);
        Assert.Equal(8, room.World.Each<BomberParticipantState>().Count());
        Assert.Equal(8, room.World.Each<BomberPlayerState>().Count());
    }

    [Fact]
    public void BotLivesUseMovementAndBombGasThenRespawnAndPlayTheNextMatch()
    {
        using var room = new Room();
        room.Fill(true);
        room.Tick(422);
        var bots = room.World.Each<BomberParticipantState>().Where(p => p.IsBot.Value).ToArray();
        Assert.Equal(7, bots.Length);
        var bot = bots[0];
        NetEntityId oldLife = bot.CurrentLife.Value;
        var before = room.World.Get<LogicTransform>(oldLife).LocalPosition;
        var match = room.World.Single<BomberMatchState>();
        while (match.Phase.Value == (int)BomberMatchPhase.Warmup) room.Tick(1);
        room.Tick(60);
        Assert.NotEqual(before, room.World.Get<LogicTransform>(oldLife).LocalPosition);
        Assert.True(room.World.Get<BomberStatistics>(bot.Entity).Bombs.Value > 0);
        room.World.Get<BomberPlayerState>(oldLife).ProtectedUntilTick.Value = 0;
        room.World.Get<BomberPlayerState>(oldLife).LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        for (ulong chain = 887701; chain < 887704; chain++)
            BomberEffectIntegrationTests.Bomb(room.World, room.Human, oldLife, chain);
        room.Tick(3);
        Assert.False(room.World.IsLive(oldLife));
        room.Tick(180);
        Assert.True(room.World.IsLive(bot.CurrentLife.Value));
        Assert.NotEqual(oldLife, bot.CurrentLife.Value);
        Assert.Equal(2UL, bot.LifeGeneration.Value);
        Assert.True(room.World.Get<BomberPlayerState>(bot.CurrentLife.Value).IsBot.Value);
        Assert.Equal("bot001", room.World.Get<Lumio.Bomber.Gameplay.Components.Identity.IdentityComponent>(bot.CurrentLife.Value).Name.Value);
        ulong previous = match.MatchId.Value;
        var config = BomberConfigBinding.For(room.World);
        match.PhaseEndTick.Value = room.World.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        room.Tick(1);
        match.PhaseEndTick.Value = room.World.Tick;
        for (int i = 0; i < 800 && match.MatchId.Value == previous; i++) room.Tick(1);
        Assert.True(match.MatchId.Value == previous + 1,
            $"Next match did not start: phase={match.Phase.Value} tick={room.World.Tick} end={match.PhaseEndTick.Value} bombs={room.World.Each<BomberBombState>().Count()} pendingDeaths={room.World.Each<BomberParticipantState>().Count(p => p.DeathStructurePending.Value)} terrain={room.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count}");
        Assert.Equal(7, room.World.Each<BomberParticipantState>().Count(p => p.IsBot.Value));
        for (int i = 0; i < 160 && !room.World.IsLive(bot.CurrentLife.Value); i++) room.Tick(1);
        Assert.True(room.World.IsLive(bot.CurrentLife.Value));
    }

    [Fact]
    public void NaturalRoomMatchSettlesAndBotsContinueIntoTheNextGame()
    {
        using var room = new Room();
        room.Fill(true);
        room.Tick(422);
        var match = room.World.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(room.World);
        var bots = room.World.Each<BomberParticipantState>().Where(p => p.IsBot.Value).OrderBy(p => p.Slot.Value).ToArray();
        Assert.Equal(7, bots.Length);
        var names = bots.Select(p => p.BotName.Value).ToArray();
        Assert.Equal(Enumerable.Range(1, 7).Select(i => $"bot{i:000}"), names);
        bool moved = false, bombed = false, podium = false, results = false;
        int limit = checked((int)Ticks.FromMilliseconds(config.Game.MatchDurationMs + config.Game.WarmupMs +
            config.Game.PodiumMs + config.Game.ResultsMs + 30000, config.Game.TickRateHz));
        for (int i = 0; i < limit && match.MatchId.Value < 2; i++)
        {
            room.Tick(1);
            podium |= match.Phase.Value == (int)BomberMatchPhase.Podium;
            results |= match.Phase.Value == (int)BomberMatchPhase.Results;
            foreach (var bot in bots)
            {
                bombed |= room.World.Get<BomberStatistics>(bot.Entity).Bombs.Value > 0;
                if (!bot.CurrentLife.Value.IsDefault && room.World.IsLive(bot.CurrentLife.Value))
                    moved |= room.World.Get<LogicTransform>(bot.CurrentLife.Value).LocalPosition != BombSystem.SpawnPosition(config.Map, bot.Slot.Value);
            }
        }
        Assert.True(moved);
        Assert.True(bombed);
        Assert.True(podium);
        Assert.True(results);
        Assert.Equal(2UL, match.MatchId.Value);
        BomberResults settled = room.World.Single<BomberResults>();
        Assert.Contains(1UL, Enumerable.Range(0, settled.RetainedMatchIds.Count).Select(i => settled.RetainedMatchIds[i]));
        Assert.Equal(8, Enumerable.Range(0, settled.MatchIds.Count).Count(i => settled.MatchIds[i] == 1));
        Assert.True(Enumerable.Range(0, settled.Bombs.Count).Sum(i => settled.Bombs[i]) > 0);
        Assert.Equal(8, room.World.Each<BomberParticipantState>().Count());
        Assert.Equal(names, bots.Select(p => p.BotName.Value));
        for (int i = 0; i < 200 && bots.Any(p => p.CurrentLife.Value.IsDefault || !room.World.IsLive(p.CurrentLife.Value) ||
            room.World.Get<BomberPlayerState>(p.CurrentLife.Value).LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn); i++) room.Tick(1);
        foreach (var bot in bots)
        {
            Assert.True(room.World.IsLive(bot.CurrentLife.Value));
            Assert.Equal(2UL, bot.MatchId.Value);
            Assert.True(room.World.Get<BomberPlayerState>(bot.CurrentLife.Value).IsBot.Value);
            Assert.Equal(bot.BotName.Value, room.World.Get<Lumio.Bomber.Gameplay.Components.Identity.IdentityComponent>(bot.CurrentLife.Value).Name.Value);
        }
        for (int i = 0; i < 200 && match.Phase.Value == (int)BomberMatchPhase.Warmup; i++) room.Tick(1);
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        room.Tick(120);
        Assert.True(bots.Sum(p => room.World.Get<BomberStatistics>(p.Entity).Bombs.Value) > 0);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(7)]
    public void HumanAdmissionOnTheBotDueTickNeverDuplicatesASeatOrOverfills(int humans)
    {
        using var room = new Room();
        for (int i = 1; i < humans; i++) room.Join("existing-" + i);
        room.Fill(true);
        room.Tick(59);
        Assert.Equal(room.World.Tick, room.World.Single<BomberWorldRuntime>().BotNextJoinTick.Value);
        var refused = room.Admission.TryEnqueue("room-on-due-tick", "room-account-on-due-tick", "room", "player", WireProfile.SuccessorBindingV1);
        if (refused.Status == "Acquired")
        {
            room.Tick(1); room.Manager.DrainOutbox(); room.Admission.PublishAndSettle();
        }
        Assert.Equal("Unavailable", refused.Status);
        Assert.Equal("successor_reservation_invalid", refused.Code);
        Assert.Equal(humans, room.World.Each<BomberParticipantState>().Count());
        Assert.Equal(humans, room.World.Each<BomberPlayerState>().Count());
        Assert.False(room.World.TryGetAccount("room-account-on-due-tick", out _));
        room.Tick(1);
        int participants = room.World.Each<BomberParticipantState>().Count();
        Assert.Equal(humans + 1, participants);
        Assert.Equal(participants, room.World.Each<BomberParticipantState>().Select(p => p.Slot.Value).Distinct().Count());
        if (humans == 1)
        {
            room.Join("on-due-tick");
            Assert.Equal(3, room.World.Each<BomberParticipantState>().Count());
            Assert.Equal(3, room.World.Each<BomberParticipantState>().Select(p => p.Slot.Value).Distinct().Count());
        }
        else
        {
            var full = room.Admission.TryEnqueue("room-on-due-tick", "room-account-on-due-tick", "room", "player", WireProfile.SuccessorBindingV1);
            Assert.NotEqual("Acquired", full.Status);
            room.Tick(1);
            Assert.Equal(8, room.World.Each<BomberParticipantState>().Count());
            Assert.False(room.World.Single<BomberWorldRuntime>().BotFillEnabled.Value);
        }
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    public void PreparedPriorCutAdmissionCannotCreateAPartialHumanOnOrAfterTheBotDueCut(int heldTicks)
    {
        using var room = new Room();
        room.Fill(true);
        room.Tick(58);
        var stale = room.Admission.TryEnqueue("delayed", "delayed-account", "room", "player", WireProfile.SuccessorBindingV1,
            beforeValidate: manager => { for (int i = 0; i < heldTicks; i++) manager.Tick(); });
        Assert.Equal("Rejected", stale.Status);
        Assert.InRange(room.World.Each<BomberParticipantState>().Count(), 1, 2);
        Assert.InRange(room.World.Each<BomberPlayerState>().Count(), 1, 2);
        Assert.False(room.World.TryGetAccount("delayed-account", out _));
        room.Tick(1);
        Assert.Equal(2, room.World.Each<BomberParticipantState>().Count());
        Assert.Equal(2, room.World.Each<BomberParticipantState>().Select(p => p.Slot.Value).Distinct().Count());
    }

    [Fact]
    public void DisablingOnTheDueCutLeavesFreshHumanAdmissionOpen()
    {
        using var room = new Room();
        room.Fill(true);
        room.Tick(59);
        Assert.Equal(room.World.Tick, room.World.Single<BomberWorldRuntime>().BotNextJoinTick.Value);
        room.Fill(false);
        room.Join("after-disable");
        Assert.Equal(2, room.World.Each<BomberParticipantState>().Count());
        Assert.All(room.World.Each<BomberParticipantState>(), p => Assert.False(p.IsBot.Value));
    }

    [Fact]
    public void ActiveHumanTakeoverKeepsItsExistingLifeAndIsNotBlockedOnTheBotDueCut()
    {
        using var room = new Room();
        Assert.True(room.Bindings.TryResolveConnectionState("room-first", out NetEntityId human, out _));
        room.Fill(true);
        room.Tick(59);
        var takeover = room.Admission.TryEnqueue("room-takeover", "room-account-first", "room", "player", WireProfile.SuccessorBindingV1,
            bindingAction: "takeover");
        Assert.Equal("Acquired", takeover.Status);
        room.Tick(1); room.Manager.DrainOutbox(); room.Admission.PublishAndSettle();
        Assert.True(room.Bindings.TryResolveConnectionState("room-takeover", out NetEntityId current, out _));
        Assert.Equal(human, current);
        Assert.Equal(2, room.World.Each<BomberParticipantState>().Count());
        Assert.Equal(2, room.World.Each<BomberParticipantState>().Select(p => p.Slot.Value).Distinct().Count());
    }

    private sealed class Room : IDisposable
    {
        internal readonly BomberAdmissionFixture Admission = new();
        internal readonly WorldManager Manager;
        internal readonly EntityBindingQuery Bindings;
        internal World World => Manager.World;
        internal NetEntityId Human;
        internal Room()
        {
            Manager = BomberTestWorld.Start(withMap: true, admission: Admission);
            Bindings = EntityBindingQuery.Create(Manager);
            Join("first");
            Human = Assert.Single(World.Each<BomberPlayerState>()).Entity;
        }
        internal void Join(string name)
        {
            Admission.Enqueue("room-" + name, "room-account-" + name, "room", "player", WireProfile.SuccessorBindingV1);
            Tick(1); Manager.DrainOutbox(); Admission.PublishAndSettle();
        }
        internal void Fill(bool enabled)
        {
            var owner = World.Get<AbilityComponent>(Human);
            owner.Activate<SetBotFillAbility, SetBotFillAbility.Input>(new SetBotFillAbility.Input { Enabled = enabled });
            Tick(1);
        }
        internal void Tick(int count) { for (int i = 0; i < count; i++) Manager.Tick(); }
        public void Dispose() { Bindings.Dispose(); Manager.Dispose(); }
    }
}
