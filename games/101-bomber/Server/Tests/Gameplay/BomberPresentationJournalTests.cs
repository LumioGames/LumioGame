using System;
using System.Linq;
using System.Globalization;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberPresentationJournalTests
{
    [Fact]
    public void JournalKeepsOrderedBoundedEntriesAndLosslessIdentity()
    {
        using WorldManager manager = BomberTestWorld.Start();
        World world = manager.World;
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        ulong matchId = 9007199254740993UL;
        for (int i = 1; i <= BomberPresentationJournal.MaxEntries + 2; i++)
            journal.Append(world, "bomb_placed", matchId, (ulong)i);

        Assert.Equal(BomberPresentationJournal.MaxEntries, journal.Entries.Count);
        using JsonDocument first = JsonDocument.Parse(journal.Entries[0]);
        using JsonDocument last = JsonDocument.Parse(journal.Entries[journal.Entries.Count - 1]);
        Assert.Equal("3", first.RootElement.GetProperty("sequence").GetString());
        Assert.Equal((BomberPresentationJournal.MaxEntries + 2).ToString(CultureInfo.InvariantCulture), last.RootElement.GetProperty("sequence").GetString());
        Assert.Equal(matchId.ToString(CultureInfo.InvariantCulture), first.RootElement.GetProperty("matchId").GetString());
        Assert.Equal(1, first.RootElement.GetProperty("version").GetInt32());
    }

    [Fact]
    public void JournalExpiresByTickAndResetDropsPreviousMatch()
    {
        using WorldManager manager = BomberTestWorld.Start();
        World world = manager.World;
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        journal.Append(world, "match_started", 1, 1);
        ulong origin = world.Tick;
        while (world.Tick - origin <= BomberPresentationJournal.RetentionTicks) manager.Tick();
        journal.Expire(world.Tick);
        Assert.Equal(0, journal.Entries.Count);
        journal.Append(world, "match_end", 1, 2);
        journal.Reset();
        journal.Append(world, "match_started", 2, 3);
        Assert.Equal(1, journal.Entries.Count);
        using JsonDocument next = JsonDocument.Parse(journal.Entries[0]);
        Assert.Equal("2", next.RootElement.GetProperty("matchId").GetString());
    }

    [Fact]
    public void ExpiryScansPastANewerOccurrenceToRemoveOlderPlacement()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberPresentationJournal journal = manager.World.Single<BomberPresentationJournal>();
        journal.Append(manager.World, "skill_cast", 1, 1, occurredTick: 100);
        journal.Append(manager.World, "bomb_placed", 1, 2, occurredTick: 1);
        journal.Expire(300);
        Assert.Equal(1, journal.Entries.Count);
        using JsonDocument retained = JsonDocument.Parse(journal.Entries[0]);
        Assert.Equal("skill_cast", retained.RootElement.GetProperty("kind").GetString());
    }

    [Fact]
    public void MalformedPersistedOccurrenceFailsSnapshotRecovery()
    {
        using WorldManager manager = BomberTestWorld.Start();
        manager.World.Single<BomberPresentationJournal>().Entries.Add("{bad json");
        byte[] snapshot = manager.CaptureSnapshot();
        Assert.ThrowsAny<Exception>(() =>
        {
            using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
        });
    }

    [Fact]
    public void InvalidIdentityAndOversizedJournalFailSnapshotRecovery()
    {
        using WorldManager malformed = BomberTestWorld.Start();
        malformed.World.Single<BomberPresentationJournal>().Entries.Add(
            "{\"version\":1,\"kind\":\"death\",\"matchId\":\"1\",\"tick\":\"1\",\"sequence\":\"1\",\"participantId\":\"7\"}");
        byte[] invalidIdentity = malformed.CaptureSnapshot();
        Assert.ThrowsAny<Exception>(() =>
        {
            using WorldManager restored = BomberTestWorld.Restore(invalidIdentity, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
        });

        using WorldManager oversized = BomberTestWorld.Start();
        BomberPresentationJournal journal = oversized.World.Single<BomberPresentationJournal>();
        const string valid = "{\"version\":1,\"kind\":\"match_started\",\"matchId\":\"1\",\"tick\":\"1\",\"sequence\":\"1\"}";
        for (int i = 0; i < BomberPresentationJournal.MaxEntries; i++) journal.Entries.Add(valid);
        byte[] original = oversized.CaptureSnapshot();
        byte[] overLimit = BomberSnapshotCorruption.AppendListEntries(original,
            "BomberPresentationJournal.entries", BomberPresentationJournal.MaxEntries, valid);
        FormatException capacityError = BomberTestWorld.AssertOwnerFailure<FormatException>(() =>
        {
            using WorldManager restored = BomberTestWorld.Restore(overLimit, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
        });
        Assert.Equal("exceeds_max_capacity", capacityError.Message);
        Assert.Equal(original, oversized.CaptureSnapshot());
    }

    [Fact]
    public void ExplosionDamageAndDeathRetainChainSourceFacts()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        WorldManager manager = scene.Manager;
        World world = manager.World;
        NetEntityId lifeId = scene.Lives[0];
        BomberPlayerState player = world.Get<BomberPlayerState>(lifeId);
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        player.ProtectedUntilTick.Value = 0;
        world.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Running;
        for (ulong chain = 35; chain < 37; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], lifeId, chain);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(2L, world.Get<AttributeComponent>(lifeId).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(2L, world.Get<AttributeComponent>(lifeId).GetCurrentValue(BomberAttributeNames.HealthPoints));
        world.Single<BomberPresentationJournal>().Reset();
        EntityOrder order = world.Commands.Create<BomberBombEntity>();
        BomberBombState bomb = order.Get<BomberBombState>();
        bomb.Owner.Value = player.Participant.Value;
        bomb.SourceLife.Value = lifeId;
        bomb.SourceLifeGeneration.Value = player.LifeGeneration.Value;
        bomb.Phase.Value = (int)BomberBombPhase.Fuse;
        bomb.Power.Value = 2;
        bomb.ChainId.Value = 37;
        bomb.FuseEndTick.Value = world.Tick;
        bomb.PlacedAtTick.Value = world.Tick;
        var position = world.Get<LogicTransform>(lifeId).LocalPosition;
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);
        manager.Tick();
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        player.ProtectedUntilTick.Value = 0;
        manager.Tick();

        NetEntityId sourceParticipant = player.Participant.Value;
        ulong lethalTick = world.Tick - 1;
        Assert.True(world.Get<BomberParticipantState>(sourceParticipant).DeathStructurePending.Value);
        Assert.Equal(0L, world.Get<AttributeComponent>(lifeId).GetBaseValue(BomberAttributeNames.HealthPoints));
        manager.Tick();
        Assert.False(world.IsLive(lifeId));
        BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
        using JsonDocument explosion = Find(journal, "bomb_exploded");
        JsonElement blast = explosion.RootElement.GetProperty("data");
        Assert.Equal("37", blast.GetProperty("chainId").GetString());
        Assert.Equal("1", blast.GetProperty("indexInChain").GetString());
        Assert.True(int.Parse(blast.GetProperty("cellCount").GetString()!, CultureInfo.InvariantCulture) > 1);
        using JsonDocument damage = Find(journal, "damage_applied");
        Assert.Equal("37", damage.RootElement.GetProperty("data").GetProperty("chainId").GetString());
        Assert.Equal(bomb.Entity.ToHex(), damage.RootElement.GetProperty("entityId").GetString());
        using JsonDocument death = Find(journal, "death");
        Assert.Equal("37", death.RootElement.GetProperty("data").GetProperty("chainId").GetString());
        Assert.Equal(sourceParticipant.ToHex(), death.RootElement.GetProperty("sourceParticipantId").GetString());
        Assert.Equal(lethalTick.ToString(CultureInfo.InvariantCulture), death.RootElement.GetProperty("tick").GetString());
    }

    [Fact]
    public void SkillCastAndPickupCaptureCommittedPublicValues()
    {
        using WorldManager manager = StartedMatch(out EntityOrder[] players);
        World world = manager.World;
        NetEntityId lifeId = players[0].AssignedId;
        BomberSkillState skill = world.Get<BomberSkillState>(lifeId);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows
            .Single(row => row.Id == 118002u));
        var before = world.Get<LogicTransform>(lifeId).LocalPosition;
        new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(lifeId));
        manager.Tick(); manager.Tick();
        using JsonDocument cast = Find(world.Single<BomberPresentationJournal>(), "skill_cast");
        JsonElement castData = cast.RootElement.GetProperty("data");
        Assert.Equal(BomberMatchRules.CellX(before).ToString(CultureInfo.InvariantCulture), castData.GetProperty("fromX").GetString());
        Assert.Equal(BomberMatchRules.CellZ(before).ToString(CultureInfo.InvariantCulture), castData.GetProperty("fromZ").GetString());
        Assert.False(castData.TryGetProperty("cooldownUntilTick", out _));
        Assert.Equal(BomberMatchRules.CellX(before), cast.RootElement.GetProperty("x").GetInt32());
        Assert.Equal(BomberMatchRules.CellZ(before), cast.RootElement.GetProperty("z").GetInt32());
        Assert.Equal(skill.BubbleUntilTick.Value.ToString(CultureInfo.InvariantCulture), castData.GetProperty("untilTick").GetString());

        EntityOrder itemOrder = world.Commands.Create<BomberPickupItemEntity>();
        BomberPickupItem item = itemOrder.Get<BomberPickupItem>();
        item.Kind.Value = (int)BomberPickupKind.Skill;
        item.SkillId.Value = 7;
        item.SkillLevel.Value = 4;
        var after = world.Get<LogicTransform>(lifeId).LocalPosition;
        var staging = after + new System.Numerics.Vector3(1, 0, 1);
        EcsRegistry.Generated(itemOrder.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{staging.X:R},{staging.Y:R},{staging.Z:R}"), silent: true);
        manager.Tick();
        EcsRegistry.Generated(world.Get<LogicTransform>(itemOrder.AssignedId))!.WriteField("localPosition",
            FormattableString.Invariant($"{after.X:R},{after.Y:R},{after.Z:R}"), silent: true);
        new PickupAbility().Execute(new PickupAbility.Input { Target = itemOrder.AssignedId }, world.Get<AbilityComponent>(lifeId));
        using JsonDocument pickup = Find(world.Single<BomberPresentationJournal>(), "pickup_taken");
        Assert.Equal("4", pickup.RootElement.GetProperty("data").GetProperty("skillLevel").GetString());
    }

    private static WorldManager StartedMatch(out EntityOrder[] players)
    {
        WorldManager manager = BomberTestWorld.Start();
        players = Enumerable.Range(0, 8).Select(i => BomberTestWorld.QueuePlayer(manager.World, "journal-" + i)).ToArray();
        manager.Tick(); manager.Tick(); manager.Tick();
        return manager;
    }

    private static JsonDocument Find(BomberPresentationJournal journal, string kind)
    {
        for (int i = 0; i < journal.Entries.Count; i++)
        {
            JsonDocument parsed = JsonDocument.Parse(journal.Entries[i]);
            if (parsed.RootElement.GetProperty("kind").GetString() == kind) return parsed;
            parsed.Dispose();
        }
        throw new InvalidOperationException("Missing occurrence: " + kind);
    }
}
