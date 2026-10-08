using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Linq;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Replication.Binding;
using Xunit;

namespace Lumio.Bomber.Bots;

// A client-read boundary fixture, not an authoritative world or end-to-end acceptance substitute.
public sealed class BotObservationTests
{
    [Fact]
    public void TourSubmitsARealConfiguredCharacterBeforeMatchStart()
    {
        var source = new ObservationReplica { Tour = true, Waiting = true };
        var sink = new Commands();
        var scenario = new BomberMatchScenario(1, [118002]);
        var context = new BotDriverContext(0, View(source), BotInputVocabulary.FromRegistry(GeneratedRegistry.Instance), sink, 0);
        scenario.Step(in context);
        Assert.Single(sink.Items);
        Assert.Equal("SelectCharacterAbility", sink.Items[0].Arguments[0]);
        Assert.Equal("118002", sink.Items[0].Arguments[1]);
    }
    [Fact]
    public void NextMatchGenerationMustRetainPublicLifecycleContinuity()
    {
        string oldLife = new NetEntityId(7, 17).ToHex(), newLife = new NetEntityId(7, 19).ToHex();
        Assert.True(BomberMatchScenario.IsCurrentGeneration(oldLife, 2, newLife, 4));
        Assert.True(BomberMatchScenario.IsCurrentGeneration(oldLife, 2, oldLife, 2));
        Assert.False(BomberMatchScenario.IsCurrentGeneration(oldLife, 2, newLife, 1));
        Assert.False(BomberMatchScenario.IsCurrentGeneration(oldLife, 2, newLife, 0));
        Assert.False(BomberMatchScenario.IsCurrentGeneration(oldLife, 2, oldLife, 4));
        Assert.False(BomberMatchScenario.IsCurrentGeneration(oldLife, 2, new NetEntityId(8, 19).ToHex(), 4));
    }

    [Fact]
    public void MatchTourReadsPackedBaseMapAndUsesDistinctSequencesWithinOneTick()
    {
        var source = new ObservationReplica { Tour = true };
        var sink = new Commands();
        var context = new BotDriverContext(20, View(source), BotInputVocabulary.FromRegistry(GeneratedRegistry.Instance), sink, 0);
        var scenario = new BomberMatchScenario(1);
        scenario.Step(in context);
        var assertions = new BotAssertionSink(); scenario.Assert(in context, assertions);
        Assert.DoesNotContain("basemap_observed", assertions.Failed);
        Assert.Equal(2, sink.Items.Count);
        Assert.Equal(2, sink.Items.Select(command => command.Arguments[^1]).Distinct().Count());
    }

    [Fact]
    public void MatchTourContinuesPublicWorldObservationWhileSelfIsGone()
    {
        var source = new ObservationReplica { Tour = true };
        var context = new BotDriverContext(20, View(source), BotInputVocabulary.FromRegistry(null), new Commands(), 0);
        var scenario = new BomberMatchScenario(1);
        scenario.Step(in context);
        source.NoSelf = true;
        source.FieldReads.Clear();
        scenario.Step(in context);
        Assert.Contains("BomberMatchState.phase", source.FieldReads);
    }

    [Fact]
    public void TourRespawnUsesPublishedDeathAndNewLifeAcrossObservingWorldReplacement()
    {
        var source = new ObservationReplica { Tour = true, Lifecycle = true };
        var scenario = new BomberMatchScenario(1);
        for (int stage = 0; stage < 3; stage++)
        {
            source.Stage = stage;
            var context = new BotDriverContext(20 + stage, View(source), BotInputVocabulary.FromRegistry(null), new Commands(), 0);
            scenario.Step(in context);
        }
        var last = new BotDriverContext(23, View(source), BotInputVocabulary.FromRegistry(null), new Commands(), 0);
        var assertions = new BotAssertionSink(); scenario.Assert(in last, assertions);
        Assert.DoesNotContain("respawned", assertions.Failed);
    }

    [Theory]
    [InlineData("no-death")]
    [InlineData("wrong-dead-life")]
    [InlineData("wrong-match")]
    [InlineData("same-generation")]
    [InlineData("dead-successor")]
    public void TourRejectsIncompleteOrContradictoryRespawnFacts(string mutation)
    {
        var source = new ObservationReplica { Tour = true, Lifecycle = true, LifecycleMutation = mutation };
        var scenario = new BomberMatchScenario(1);
        for (int stage = 0; stage < 3; stage++)
        {
            source.Stage = stage;
            var context = new BotDriverContext(20 + stage, View(source), BotInputVocabulary.FromRegistry(null), new Commands(), 0);
            scenario.Step(in context);
        }
        var last = new BotDriverContext(23, View(source), BotInputVocabulary.FromRegistry(null), new Commands(), 0);
        var assertions = new BotAssertionSink(); scenario.Assert(in last, assertions);
        Assert.Contains("respawned", assertions.Failed);
    }

    private sealed class Commands : IBotCommandSink
    {
        internal List<BotIssuedCommand> Items { get; } = [];
        public BotIssueResult Issue(in BotIssuedCommand command) { Items.Add(command); return BotIssueResult.Accept; }
    }

    [Fact]
    public void PackedVoxelAndUnsignedAttributesAreReadThroughThePublishedView()
    {
        var source = new ObservationReplica();
        BotWorldView view = View(source);
        IBomberConfig config = BomberConfigBinding.Read(Path.Combine(AppContext.BaseDirectory, "config"));
        Assert.True(BomberPlayObservation.TryRead(view, config, new HashSet<string>(), out var observation));
        Assert.All(observation.Cells, cell => Assert.True(cell.Known && cell.Passable));
        Assert.Equal(6, observation.Self.Health);
        Assert.Equal(2, observation.BombPower);
        Assert.Equal(1, observation.AvailableBombs);
        Assert.Equal(source.Participant.ToHex(), observation.Self.Participant);
        Assert.Equal(10, observation.Tick);
        Assert.Equal(6, observation.TicksPerCell);
        Assert.Equal(9, observation.WaterTicksPerCell);
        Assert.Equal(ulong.MaxValue, BomberPlayObservation.Unsigned(view, source.World.ToHex(), "BomberMatchState.seed"));
    }

    [Theory]
    [InlineData("pending-voxel")]
    [InlineData("foreign-field")]
    [InlineData("missing-health")]
    public void MissingOrForeignObservationDoesNotBecomePlayableState(string mutation)
    {
        var source = new ObservationReplica { Mutation = mutation };
        bool ready = BomberPlayObservation.TryRead(View(source),
            BomberConfigBinding.Read(Path.Combine(AppContext.BaseDirectory, "config")), new HashSet<string>(), out var observation);
        if (mutation == "pending-voxel")
        {
            Assert.True(ready);
            Assert.All(observation.Cells, cell => Assert.False(cell.Known || cell.Passable));
            BotPolicy policy = new(0, 0, 1, 0, 0, 0, 2, 0, 0, 1, 4, 10, 2, 3, 6, 80, 180, 5, 3, 1, 1);
            BotDecision decision = new BomberBotBrain(policy, 1).Decide(observation);
            Assert.Equal(BotMove.None, decision.Move);
            Assert.False(decision.Bomb);
        }
        else Assert.False(ready);
    }

    private static BotWorldView View(IReplicaWorld source) => (BotWorldView)typeof(BotWorldView)
        .GetMethod("Over", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, [source])!;

    private sealed class ObservationReplica : IReplicaWorld
    {
        internal NetEntityId Self { get; } = new(7, 17);
        internal NetEntityId Participant { get; } = new(7, 18);
        internal NetEntityId World { get; } = new(7, 1);
        internal string Mutation { get; init; } = string.Empty;
        internal bool Tour { get; init; }
        internal bool Waiting { get; init; }
        internal bool NoSelf { get; set; }
        internal bool Lifecycle { get; init; }
        internal string LifecycleMutation { get; init; } = string.Empty;
        internal int Stage { get; set; }
        private NetEntityId Current => Lifecycle && Stage == 2 ? new NetEntityId(7, 20) : Self;
        internal List<string> FieldReads { get; } = [];
        private NetEntityId Bomb { get; } = new(7, 19);
        public WorldManager Manager => throw new InvalidOperationException("Game Bots cannot read Runtime Manager.");
        public bool InputEnabled => !(Lifecycle && Stage == 1);
        public int VisibleEntityCount => 1;
        public ReplicaConnectionSuperseded LastConnectionSuperseded => default;
        public string LastRejectCode => string.Empty;
        public ReplicaBindingLookup SelfLookup() => NoSelf ? default : Lifecycle && Stage == 1
            ? new(true, string.Empty, new ReplicaBinding("owner", "room-1", Participant.ToHex(), "bomberParticipant", 2))
            : new(true, string.Empty, new ReplicaBinding("owner", "room-1", Current.ToHex(), "player", 1));
        public IReadOnlyList<ReplicaIdentityRecord> CopyIdentityRecords() => Tour
            ? [new(Current.ToHex(), "player", string.Empty), new(Participant.ToHex(), "bomberParticipant", string.Empty), new(Bomb.ToHex(), "bomberBomb", string.Empty)]
            : [new(Self.ToHex(), "player", string.Empty)];
        public ReplicaIdentityRecord ReadWorldIdentity() => new(World.ToHex(), "world", string.Empty);
        public ReplicaFieldObservation ReadField(string netEntityId, string attributeId, ulong? connectionGeneration = null)
        {
            FieldReads.Add(attributeId);
            Assert.Contains(GeneratedRegistry.Instance.AttributeDeclarations,
                field => field.AttributeId == attributeId && field.Replication == "replicated" && field.Visibility != "server-only");
            object? value = attributeId switch
            {
                "AttributeComponent.healthPointsCurrent" => 6L,
                "AttributeComponent.bombPowerCurrent" => 2L,
                "AttributeComponent.availableBombsCurrent" => 1L,
                "AttributeComponent.movementSpeedMilliCurrent" => 3500L,
                "BomberPlayerState.lifePhase" => 1,
                "BomberPlayerState.participant" => Participant,
                "BomberPlayerState.lifeGeneration" => Lifecycle && Stage == 2 ? 2UL : 1UL,
                "BomberParticipantState.matchId" => Tour ? 1UL : 0UL,
                "BomberParticipantState.currentLife" => Current,
                "BomberParticipantState.lastLife" => Current,
                "BomberParticipantState.lifePhase" => Lifecycle && Stage == 1 ? 2 : 0,
                "BomberParticipantState.deathTick" => Lifecycle && Stage > 0 ? 11UL : 0UL,
                "BomberMatchState.matchId" => Tour && !Waiting ? 1UL : 0UL,
                "BomberBombState.owner" => Participant,
                "BomberMatchState.phase" => Waiting ? 0 : 2,
                "BomberMatchState.seed" => ulong.MaxValue,
                _ => 0,
            };
            if (Stage == 1)
            {
                if (LifecycleMutation == "no-death" && attributeId == "BomberParticipantState.deathTick") value = 0UL;
                if (LifecycleMutation == "wrong-dead-life" && attributeId == "BomberParticipantState.lastLife") value = new NetEntityId(7, 999);
                if (LifecycleMutation == "wrong-match" && attributeId == "BomberParticipantState.matchId") value = 2UL;
            }
            if (Stage == 2)
            {
                if (LifecycleMutation == "same-generation" && attributeId == "BomberPlayerState.lifeGeneration") value = 1UL;
                if (LifecycleMutation == "dead-successor" && attributeId == "AttributeComponent.healthPointsCurrent") value = 0L;
            }
            if (Mutation == "missing-health" && attributeId == "AttributeComponent.healthPointsCurrent") return default;
            var result = new BindingQueryResult("ok", NetEntityId: netEntityId,
                RoomId: Mutation == "foreign-field" ? "room-other" : "room-1", AttributeId: attributeId,
                Value: value, ObservedTick: 10, ObservedRevision: 4);
            return (ReplicaFieldObservation)Activator.CreateInstance(typeof(ReplicaFieldObservation),
                BindingFlags.Instance | BindingFlags.NonPublic, null, [result], null)!;
        }
        public ReplicaVoxelCell ReadConfirmedVoxel(ulong sectionKey, int cellOffset)
        {
            if (Mutation == "pending-voxel") return default;
            uint block = cellOffset >> 8 == 0 ? 1022U << 8 : 0;
            var value = new VoxelCellQuery(true, VoxelPresence.Ready, block, 1);
            return (ReplicaVoxelCell)Activator.CreateInstance(typeof(ReplicaVoxelCell),
                BindingFlags.Instance | BindingFlags.NonPublic, null, [value], null)!;
        }
        public ReplicaWorldPosition ReadWorldPosition(string netEntityId) => netEntityId != Self.ToHex() ? default
            : (ReplicaWorldPosition)Activator.CreateInstance(typeof(ReplicaWorldPosition), BindingFlags.Instance | BindingFlags.NonPublic,
                null, [5.5f, 1f, 5.5f, 10UL, 4UL], null)!;
        public ReplicaAttributeQueryResult QueryAttribute(in ReplicaAttributeQuery query) => throw new NotSupportedException();
        public ReplicaEntityResolve Resolve(string roomId, string netEntityId, ulong connectionGeneration, bool hasConnectionGeneration) => throw new NotSupportedException();
        public IReadOnlyList<ReplicaChatLine> CopyChatWindow() => throw new NotSupportedException();
        public IReadOnlyList<WorldMessage> DrainOutbound() => throw new NotSupportedException();
        public IReadOnlyList<WorldMessage> DrainQueries() => throw new NotSupportedException();
        public WorldDrainResponse Drain() => throw new NotSupportedException();
    }
}
