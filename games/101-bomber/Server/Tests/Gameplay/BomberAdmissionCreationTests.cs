using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Components.Identity;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberAdmissionCreationTests
{
    [Theory]
    [InlineData(WireProfile.SuccessorBindingV1)]
    [InlineData(WireProfile.SuccessorBindingReceiptsV1)]
    [InlineData(WireProfile.SuccessorBindingPartsV1)]
    [InlineData(WireProfile.SuccessorBindingReceiptsPartsV1)]
    public void FreshNativeAdmissionUsesTheExistingSpawnRulesAndActualCommitClock(WireProfile profile)
    {
        var admission = new BomberAdmissionFixture();
        using WorldManager manager = BomberTestWorld.Start(withMap: true, admission: admission);
        using var bindings = EntityBindingQuery.Create(manager);
        var config = BomberConfigBinding.For(manager.World);
        ulong cut = manager.World.Tick;
        for (int i = 0; i < 8; i++) admission.Enqueue("creation-" + i, "account-" + i, "creation", "player", profile);
        Assert.Empty(manager.World.Each<BomberPlayerState>());
        Assert.Empty(manager.World.Each<BomberParticipantState>());
        manager.Tick();
        var output = manager.DrainOutbox();
        Assert.Equal(cut + 1, manager.World.Tick);
        Assert.Equal(8, output.SuccessorAdmissions.Count);
        foreach (var initial in output.SuccessorAdmissions)
        {
            Assert.Equal(cut.ToString(System.Globalization.CultureInfo.InvariantCulture), initial.CommitTick);
            NetEntityId life = NetEntityId.Parse(initial.Attachment.ControlledLife);
            var player = manager.World.Get<BomberPlayerState>(life);
            var participant = manager.World.Get<BomberParticipantState>(player.Participant.Value);
            Assert.Equal(participant.Slot.Value, player.ParticipantIndex.Value);
            Assert.Equal(life, participant.CurrentLife.Value);
            Assert.Equal(life, participant.LastLife.Value);
            Assert.Equal(1UL, player.LifeGeneration.Value);
            Assert.Equal(1UL, participant.LifeGeneration.Value);
            Assert.Equal(initial.AccountId, manager.World.Get<IdentityComponent>(life).AccountId.Value);
            Assert.Equal(BombSystem.SpawnPosition(config.Map, participant.Slot.Value), manager.World.Get<LogicTransform>(life).LocalPosition);
            Assert.Equal((int)BomberDirection.Down, player.Facing.Value);
            Assert.Equal(config.Life.FirstSpawnProtected ? cut + Ticks.FromMilliseconds(config.Life.ProtectionMs, config.Game.TickRateHz) : 0,
                player.ProtectedUntilTick.Value);
            Assert.Equal((int)(config.Life.FirstSpawnProtected ? BomberLifePhase.Protected : BomberLifePhase.Vulnerable), player.LifePhase.Value);
            Assert.Equal(player.LifePhase.Value, participant.LifePhase.Value);
            Assert.Equal(0UL, player.RespawnAtTick.Value);
            Assert.Equal(0u, manager.World.Get<BomberSkillState>(life).CharacterId.Value);
            Assert.False(manager.World.Get<BomberSuccessorState>(participant.Entity).Eligible.Value);
            var attributes = manager.World.Get<AttributeComponent>(life);
            foreach (string attribute in BomberAttributeNames.All)
                Assert.Equal(config.Attribute(attribute).Initial, attributes.GetBaseValue(attribute));
        }
        admission.PublishAndSettle();
        Assert.Equal(8, manager.World.Each<BomberParticipantState>().Select(p => p.Slot.Value).Distinct().Count());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void CapacityOrAnAdvancedCutRefusesBeforeCreatingAPlayerAndReleasesItsActualOwners(bool advanceCut)
    {
        var admission = new BomberAdmissionFixture();
        using WorldManager manager = BomberTestWorld.Start(withMap: true, admission: admission);
        using var bindings = EntityBindingQuery.Create(manager);
        byte[] before = manager.CaptureSnapshot();
        using WorldManager reference = BomberTestWorld.Start();
        var next = BomberTestWorld.QueuePlayer(reference.World, "allocator-reference");
        reference.Tick();
        ulong expectedCounter = next.AssignedId.Counter;
        byte[] native = NativeWorldVoxelResources.Require(manager).Voxel.Capture();
        var result = admission.TryEnqueue("refused", "account", "creation", "player", WireProfile.SuccessorBindingV1,
            advanceCut ? 8 * 1024 * 1024 : 1, advanceCut ? world => world.Tick() : null);
        Assert.Equal(advanceCut ? "Rejected" : "Capacity", result.Status);
        if (!advanceCut) Assert.Equal(before, manager.CaptureSnapshot());
        Assert.Empty(manager.World.Each<BomberPlayerState>());
        Assert.Empty(manager.World.Each<BomberParticipantState>());
        Assert.False(bindings.TryResolveConnectionState("refused", out _, out _));
        Assert.Equal(native, NativeWorldVoxelResources.Require(manager).Voxel.Capture());
        Assert.Empty(manager.DrainOutbox().SuccessorAdmissions);
        // The same real account can start again after the refused owner's cleanup.
        admission.Enqueue("accepted", "account", "creation", "player", WireProfile.SuccessorBindingV1);
        manager.Tick();
        Assert.Single(manager.DrainOutbox().SuccessorAdmissions);
        admission.PublishAndSettle();
        Assert.Equal(expectedCounter, Assert.Single(manager.World.Each<BomberPlayerState>()).Entity.Counter);
    }
}
