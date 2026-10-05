using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberParticipantSnapshotTests
{
    [Fact]
    public void DestroyedLifeLeavesParticipantStatisticsCarryAndNativeMachineRestorable()
    {
        using WorldManager manager = BomberTestWorld.Start();
        int playerCount = BomberConfigBinding.For(manager.World).Game.PlayerCount;
        EntityOrder[] seats = Enumerable.Range(0, playerCount)
            .Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        EntityOrder[] oldLives = Enumerable.Range(0, playerCount)
            .Select(i => BomberTestWorld.QueuePlayer(manager.World, "participant-snapshot-" + i)).ToArray();
        manager.Tick();
        NetEntityId participantId = seats[0].AssignedId;
        NetEntityId oldId = oldLives[0].AssignedId;
        for (int i = 1; i < playerCount; i++)
        {
            BomberParticipantState other = manager.World.Get<BomberParticipantState>(seats[i].AssignedId);
            other.Slot.Value = i;
            other.MatchId.Value = 17;
            other.CurrentLife.Value = oldLives[i].AssignedId;
            other.LastLife.Value = oldLives[i].AssignedId;
            other.LifeGeneration.Value = 1;
            manager.World.Get<BomberStatistics>(seats[i].AssignedId).Kills.Value = i;
            BomberPlayerState otherBody = manager.World.Get<BomberPlayerState>(oldLives[i].AssignedId);
            otherBody.Participant.Value = seats[i].AssignedId;
            otherBody.LifeGeneration.Value = 1;
        }
        BomberParticipantState participant = manager.World.Get<BomberParticipantState>(participantId);
        participant.Slot.Value = 0;
        participant.MatchId.Value = 17;
        participant.CurrentLife.Value = oldId;
        participant.LastLife.Value = oldId;
        participant.LifeGeneration.Value = 1;
        participant.DeathTick.Value = 100;
        participant.RespawnAtTick.Value = 160;
        participant.DeathStructurePending.Value = true;
        participant.DeathStructureLife.Value = oldId;
        participant.DeathStructureGeneration.Value = 1;
        participant.DeathStructureTick.Value = 100;
        participant.PendingFinalRespawn.Value = true;
        participant.NextCharacterId.Value = 2;
        participant.SelectedForMatchCharacterId.Value = 1;
        participant.Validate(playerCount);
        BomberPlayerState body = manager.World.Get<BomberPlayerState>(oldId);
        body.Participant.Value = participantId;
        body.LifeGeneration.Value = 1;
        body.NextCharacterId.Value = 2;
        BomberStatistics stats = manager.World.Get<BomberStatistics>(participantId);
        stats.Kills.Value = 3;
        stats.Bombs.Value = 4;
        stats.DestroyedBlocks.Value = 5;
        stats.Pickups.Value = 6;
        stats.BestChain.Value = 7;
        stats.PeakHats.Value = 8;
        stats.HatKingTicks.Value = 9;
        stats.SkillCasts.Value = 10;
        stats.Evolutions.Value = 11;
        BomberRespawnCarry carry = manager.World.Get<BomberRespawnCarry>(participantId);
        carry.CarryPresent.Value = true;
        carry.PowerBase.Value = 4;
        carry.ActiveSkillId.Value = 12;
        carry.ActiveCombinationOriginA.Value = 13;
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.PlayerLife);
        BomberHfsmState machine = manager.World.Get<BomberHfsmState>(participantId);
        Assert.True(machine.StorePlan(definition.Start(211, 1), definition, BomberHfsmKind.PlayerLife, 211));
        participant.CurrentLife.Value = default;
        manager.World.Commands.Destroy(oldId);
        manager.Tick();
        byte[] bytes = manager.CaptureSnapshot();
        byte[] hash = SHA256.HashData(bytes);
        using WorldManager restored = BomberTestWorld.Restore(bytes, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();

        Assert.False(restored.World.IsLive(oldId));
        Assert.True(restored.World.TypeOf(participantId).Is<BomberParticipantEntity>());
        Assert.Equal(playerCount, restored.World.Each<BomberParticipantState>().Count());
        for (int i = 1; i < playerCount; i++)
        {
            BomberParticipantState other = restored.World.Get<BomberParticipantState>(seats[i].AssignedId);
            other.Validate(playerCount);
            Assert.Equal(oldLives[i].AssignedId, other.CurrentLife.Value);
            Assert.Equal(i, restored.World.Get<BomberStatistics>(seats[i].AssignedId).Kills.Value);
        }
        BomberParticipantState after = restored.World.Get<BomberParticipantState>(participantId);
        after.Validate(playerCount);
        Assert.Equal(oldId, after.LastLife.Value);
        Assert.True(after.CurrentLife.Value.IsDefault);
        Assert.Equal(160UL, after.RespawnAtTick.Value);
        Assert.True(after.PendingFinalRespawn.Value);
        Assert.Equal(3, restored.World.Get<BomberStatistics>(participantId).Kills.Value);
        Assert.Equal(11, restored.World.Get<BomberStatistics>(participantId).Evolutions.Value);
        Assert.Equal(12, restored.World.Get<BomberRespawnCarry>(participantId).ActiveSkillId.Value);
        using NativeHfsmDefinition restoredDefinition = BomberHfsmDefinitions.Compile(restored.World, BomberHfsmKind.PlayerLife);
        Assert.Equal(machine.MachineKey.Value,
            restored.World.Get<BomberHfsmState>(participantId).ReadSnapshot(restoredDefinition, BomberHfsmKind.PlayerLife, 211).MachineKey);
        Assert.Equal(hash, SHA256.HashData(restored.CaptureSnapshot()));
        Assert.Throws<OverflowException>(() =>
        {
            after.LifeGeneration.Value = ulong.MaxValue;
            _ = after.NextLifeGeneration();
        });
    }
}
