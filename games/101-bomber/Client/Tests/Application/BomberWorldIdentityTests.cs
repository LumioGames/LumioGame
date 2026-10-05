using System;
using System.Collections.Generic;
using System.Reflection;
using Lumio.Bomber.Bots;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Client.Application.Tests;

public sealed class BomberWorldIdentityTests
{
    [Fact]
    public void ScenarioReadsMatchFromTheWorldExcludedFromTheVisibleCensus()
    {
        var worldId = new NetEntityId(7, 731);
        var source = new ReadOnlyReplica(new ReplicaIdentityRecord(worldId.ToHex(), "world", string.Empty));
        Step(source);

        Assert.Contains((worldId.ToHex(), "BomberMatchState.matchId"), source.FieldReads);
        Assert.Equal(1, source.WorldIdentityReads);
        Assert.DoesNotContain(source.CopyIdentityRecords(), identity => identity.EntityType == "world");
    }

    [Theory]
    [InlineData("absent")]
    [InlineData("foreign-world")]
    [InlineData("wrong-type")]
    [InlineData("invalid-id")]
    [InlineData("default-id")]
    public void ScenarioDoesNotReadMatchFromAnInvalidWorldIdentity(string mutation)
    {
        ReplicaIdentityRecord identity = mutation switch
        {
            "absent" => default,
            "foreign-world" => new(new NetEntityId(8, 731).ToHex(), "world", string.Empty),
            "wrong-type" => new(new NetEntityId(7, 731).ToHex(), "player", string.Empty),
            "invalid-id" => new("invalid", "world", string.Empty),
            "default-id" => new(default(NetEntityId).ToHex(), "world", string.Empty),
            _ => throw new ArgumentOutOfRangeException(nameof(mutation)),
        };
        var source = new ReadOnlyReplica(identity);
        Step(source);

        Assert.DoesNotContain(source.FieldReads, read => read.Field == "BomberMatchState.matchId");
    }

    private static void Step(ReadOnlyReplica source)
    {
        // The host owns view construction. This fixture tests only the game's observation routing.
        var view = (BotWorldView)typeof(BotWorldView).GetMethod("Over", BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, new object[] { source })!;
        var context = new BotDriverContext(0, view, BotInputVocabulary.FromRegistry(null), new NoCommands(), 0);
        Assert.Equal(BotStepStatus.Continue, new BomberMatchScenario(8).Step(in context).Status);
    }

    private sealed class NoCommands : IBotCommandSink
    {
        public BotIssueResult Issue(in BotIssuedCommand command) =>
            throw new InvalidOperationException("This observation fixture has no enabled input.");
    }

    private sealed class ReadOnlyReplica(ReplicaIdentityRecord worldIdentity) : IReplicaWorld
    {
        private static readonly NetEntityId Self = new(7, 17);
        public List<(string Entity, string Field)> FieldReads { get; } = new();
        public int WorldIdentityReads { get; private set; }
        public WorldManager Manager => throw new InvalidOperationException("The scenario cannot access Runtime state.");
        public bool InputEnabled => false;
        public int VisibleEntityCount => 1;
        public ReplicaConnectionSuperseded LastConnectionSuperseded => default;
        public string LastRejectCode => string.Empty;
        public ReplicaBindingLookup SelfLookup() => new(true, string.Empty,
            new ReplicaBinding("owner", "room-1", Self.ToHex(), "player", 1));
        public IReadOnlyList<ReplicaIdentityRecord> CopyIdentityRecords() =>
            new[] { new ReplicaIdentityRecord(Self.ToHex(), "player", string.Empty) };
        public ReplicaIdentityRecord ReadWorldIdentity()
        {
            WorldIdentityReads++;
            return worldIdentity;
        }
        public ReplicaFieldObservation ReadField(string netEntityId, string attributeId, ulong? connectionGeneration = null)
        {
            FieldReads.Add((netEntityId, attributeId));
            return default;
        }
        public ReplicaVoxelCell ReadConfirmedVoxel(ulong sectionKey, int cellOffset) => default;
        public ReplicaWorldPosition ReadWorldPosition(string netEntityId) => throw new NotSupportedException();
        public ReplicaAttributeQueryResult QueryAttribute(in ReplicaAttributeQuery query) => throw new NotSupportedException();
        public ReplicaEntityResolve Resolve(string roomId, string netEntityId, ulong connectionGeneration, bool hasConnectionGeneration) => throw new NotSupportedException();
        public IReadOnlyList<ReplicaChatLine> CopyChatWindow() => throw new NotSupportedException();
        public IReadOnlyList<WorldMessage> DrainOutbound() => throw new NotSupportedException();
        public IReadOnlyList<WorldMessage> DrainQueries() => throw new NotSupportedException();
        public WorldDrainResponse Drain() => throw new NotSupportedException();
    }
}
