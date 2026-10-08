using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberDamagePersistenceTests
{
    [Fact]
    public void SeparateExplosionsPersistAcrossAuthoritativeTicks()
    {
        using WorldManager manager = BomberTestWorld.Start();
        World world = manager.World;
        EntityOrder[] players = Enumerable.Range(0, 8)
            .Select(i => BomberTestWorld.QueuePlayer(world, "damage-persistence-" + i)).ToArray();
        manager.Tick();
        manager.Tick();
        manager.Tick();

        NetEntityId life = players[0].AssignedId;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        player.ProtectedUntilTick.Value = 0;
        AttributeComponent health = world.Get<AttributeComponent>(life);
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));

        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        ulong generation = player.LifeGeneration.Value;
        ulong matchId = participant.MatchId.Value;
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        var expectedExplosions = new List<(string BombId, string ChainId)>();
        var observations = new List<(long Base, long Current)>();
        for (int blast = 0; blast < 3; blast++)
        {
            EntityOrder order = world.Commands.Create<BomberBombEntity>();
            BomberBombState bomb = order.Get<BomberBombState>();
            bomb.Owner.Value = player.Participant.Value;
            bomb.SourceLife.Value = life;
            bomb.SourceLifeGeneration.Value = player.LifeGeneration.Value;
            bomb.Phase.Value = (int)BomberBombPhase.Fuse;
            bomb.Power.Value = 2;
            bomb.ChainId.Value = (ulong)(blast + 1);
            bomb.FuseEndTick.Value = world.Tick;
            bomb.PlacedAtTick.Value = world.Tick;
            var position = world.Get<LogicTransform>(life).LocalPosition;
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
                FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);

            manager.Tick();
            manager.Tick();
            expectedExplosions.Add((order.AssignedId.ToHex(), (blast + 1).ToString(CultureInfo.InvariantCulture)));
            Assert.Equal(expectedExplosions, Occurrences(journal, "bomb_exploded"));
            Assert.Equal(expectedExplosions.Take(blast).ToList(), Occurrences(journal, "damage_applied", life.ToHex()));
            BomberDamageFacts facts = world.Get<BomberDamageFacts>(order.AssignedId);
            int row = Enumerable.Range(0, facts.Target.Count).Single(i => facts.Target[i] == life);
            Assert.True(facts.Ready[row]);
            Assert.Equal(1, facts.Status[row]);
            Assert.Equal(world.Tick - 1, facts.Tick[row]);
            Assert.Equal(matchId, facts.MatchId[row]);
            Assert.Equal(participant.Entity, facts.Participant[row]);
            Assert.Equal(life, facts.Life[row]);
            Assert.Equal(generation, facts.Generation[row]);
            Assert.Equal(participant.Entity, facts.SourceParticipant[row]);
            Assert.Equal(life, facts.SourceLife[row]);
            Assert.Equal(generation, facts.SourceGeneration[row]);
            Assert.Equal(order.AssignedId, facts.Source[row]);
            Assert.Equal((ulong)(blast + 1), facts.ChainId[row]);
            Assert.Equal(6L - 2L * blast, facts.Before[row]);
            Assert.Equal(4L - 2L * blast, facts.After[row]);
            Assert.Equal(2L, facts.Actual[row]);
            ulong occurrenceTick = world.Tick - 1;
            if (blast == 2)
            {
                Assert.Equal((int)BomberLifePhase.AwaitingRespawn, player.LifePhase.Value);
                Assert.True(participant.DeathStructurePending.Value);
                Assert.Equal(occurrenceTick, participant.DeathTick.Value);
            }
            observations.Add((health.GetBaseValue(BomberAttributeNames.HealthPoints),
                health.GetCurrentValue(BomberAttributeNames.HealthPoints)));

            manager.Tick();
            Assert.Equal(expectedExplosions, Occurrences(journal, "bomb_exploded"));
            Assert.Equal(expectedExplosions, Occurrences(journal, "damage_applied", life.ToHex()));
            if (blast < 2)
                observations.Add((health.GetBaseValue(BomberAttributeNames.HealthPoints), health.GetCurrentValue(BomberAttributeNames.HealthPoints)));
            else
            {
                Assert.False(world.IsLive(life));
                Assert.True(participant.CurrentLife.Value.IsDefault);
                Assert.Equal(life, participant.TerminalLife.Value);
                Assert.Equal(generation, participant.TerminalGeneration.Value);
                Assert.Equal(matchId, participant.TerminalMatchId.Value);
                Assert.Equal(occurrenceTick, participant.TerminalOccurrenceTick.Value);
                Assert.Equal(occurrenceTick + 1, participant.TerminalCaptureTick.Value);
                Assert.Equal(world.Tick - 1, participant.TerminalDestructionTick.Value);
                Assert.Equal(1, participant.TerminalBaseSample.Count);
                Assert.Equal(1, participant.TerminalCurrentSample.Count);
                var terminal = (participant.TerminalBaseSample[0], participant.TerminalCurrentSample[0]);
                Assert.Equal(observations[^1], terminal);
                observations.Add(terminal);
                Assert.Equal(1UL, participant.DeathConsumedCount.Value);
                Assert.False(participant.DeathStructurePending.Value);
                Assert.True(participant.SuccessorPending.Value);
                Assert.True(world.Get<BomberRespawnCarry>(participant.Entity).CarryPresent.Value);
            }
            for (int j = 0; j < journal.Entries.Count; j++)
            {
                using JsonDocument entry = JsonDocument.Parse(journal.Entries[j]);
                var root = entry.RootElement;
                if (root.GetProperty("kind").GetString() == "damage_applied" && root.GetProperty("entityId").GetString() == order.AssignedId.ToHex())
                    Assert.Equal(occurrenceTick, ulong.Parse(root.GetProperty("tick").GetString()!, CultureInfo.InvariantCulture));
            }
        }

        var expectedHealth = new (long Base, long Current)[]
        {
            (4, 4), (4, 4), (2, 2), (2, 2), (0, 0), (0, 0),
        };
        Assert.True(observations.SequenceEqual(expectedHealth),
            $"Expected: {string.Join(", ", expectedHealth)}; Actual: {string.Join(", ", observations)}");
        Assert.Equal(new[] { expectedExplosions[2] }, Occurrences(journal, "death", life.ToHex()));
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
    }

    [Fact]
    public void DamageBaseSurvivesSnapshotRestoreAndCurrentRecomputesOnTheNextTick()
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life, withMap: true, persistence: true);
        BomberPlayerState player = manager.World.Get<BomberPlayerState>(life);
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        player.ProtectedUntilTick.Value = 0;
        AttributeComponent health = manager.World.Get<AttributeComponent>(life);
        BomberEffectIntegrationTests.Bomb(manager.World, life, life, 1);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(4, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(4, health.GetCurrentValue(BomberAttributeNames.HealthPoints));

        Assert.True(manager.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        using WorldManager restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);

        AttributeComponent restoredHealth = restored.World.Get<AttributeComponent>(life);
        Assert.Equal(4, restoredHealth.GetBaseValue(BomberAttributeNames.HealthPoints));
        restored.Tick();
        Assert.Equal(4, restoredHealth.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(4, restoredHealth.GetCurrentValue(BomberAttributeNames.HealthPoints));
    }

    private static List<(string BombId, string ChainId)> Occurrences(
        BomberPresentationJournal journal, string kind, string? lifeId = null)
    {
        var result = new List<(string BombId, string ChainId)>();
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            using JsonDocument occurrence = JsonDocument.Parse(journal.Entries[i]);
            JsonElement root = occurrence.RootElement;
            if (root.GetProperty("kind").GetString() != kind ||
                (lifeId is not null && root.GetProperty("lifeId").GetString() != lifeId)) continue;
            result.Add((root.GetProperty("entityId").GetString()!,
                root.GetProperty("data").GetProperty("chainId").GetString()!));
        }
        return result;
    }
}
