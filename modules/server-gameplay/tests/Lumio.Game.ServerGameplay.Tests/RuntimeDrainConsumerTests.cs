using System;
using System.Linq;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.GameRuntime.Ecs.GameplayFixture.Host;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class RuntimeDrainConsumerTests
{
    [Fact]
    public void DrainKeepsRuntimeQueriesOutOfC1Frames()
    {
        using EntityBindingQuery binding = CreateBinding();
        Assert.Equal("accepted", binding.Admit("C1", "acct-drain", "room-01", "player").Outcome);
        binding.Manager.Tick();
        RuntimeDrainBatch admission = RuntimeDrainConsumer.Drain(binding.Manager);
        NetEntityId entity = NetEntityId.Parse(
            Assert.IsType<WelcomeMessage>(admission.Frames.Single(message => message is WelcomeMessage)).Self.ToHex());

        RuntimeDrainConsumer.EnqueueBindingResolution(binding.Manager, "resolve-1", "room-01", entity, connection: "C1");
        RuntimeDrainConsumer.EnqueueAttributeQuery(
            binding.Manager, "attribute-1", "server-authoritative", "room-01", entity, "IdentityComponent.name");
        binding.Manager.Tick();

        RuntimeDrainBatch drained = RuntimeDrainConsumer.Consume(binding.Manager.DrainOutbox());
        Assert.DoesNotContain(drained.Frames, static message => message is ResolveBindingResult or AttributeQueryResult);
        Assert.Contains(drained.Queries, static message => message is ResolveBindingResult result && result.Outcome == "ok");
        Assert.Contains(drained.Queries, static message => message is AttributeQueryResult result && result.Outcome == "ok");
    }

    [Fact]
    public void ExpiryIsSubmittedToRuntimeAndReportsTombstoneOnRepeatedRequest()
    {
        using EntityBindingQuery binding = CreateBinding();
        Assert.Equal("accepted", binding.Admit("C1", "acct-expiry", "room-01", "player").Outcome);
        binding.Manager.Tick();
        RuntimeDrainBatch admission = RuntimeDrainConsumer.Drain(binding.Manager);
        NetEntityId entity = NetEntityId.Parse(
            Assert.IsType<WelcomeMessage>(admission.Frames.Single(message => message is WelcomeMessage)).Self.ToHex());

        RuntimeDrainConsumer.EnqueueExpiry(binding.Manager, "expire-1", entity);
        Assert.True(binding.Manager.World.IsLive(entity));
        binding.Manager.Tick();
        RuntimeDrainBatch first = RuntimeDrainConsumer.Consume(binding.Manager.DrainOutbox());
        Assert.Equal("accepted", Assert.IsType<ExpireEntityResult>(Assert.Single(first.Queries)).Outcome);
        Assert.Contains(first.Frames, message => message is WorldChangeMessage change && change.Destroys.Any(record => record.NetEntityId == entity));

        RuntimeDrainConsumer.EnqueueExpiry(binding.Manager, "expire-2", entity);
        binding.Manager.Tick();
        RuntimeDrainBatch second = RuntimeDrainConsumer.Consume(binding.Manager.DrainOutbox());
        Assert.Equal("tombstoned", Assert.IsType<ExpireEntityResult>(Assert.Single(second.Queries)).Outcome);
    }

    private static EntityBindingQuery CreateBinding()
    {
        WorldManager manager = ServerBootstrap.Boot(ChatWorldHarness.InstanceId);
        return EntityBindingQuery.Create(manager);
    }
}
