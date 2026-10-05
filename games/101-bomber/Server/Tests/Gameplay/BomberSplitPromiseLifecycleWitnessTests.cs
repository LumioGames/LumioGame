using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSplitPromiseLifecycleWitnessTests
{
    private static readonly int[] ChildDirections = { 1, 2, 3, 4 };
    [Fact]
    public void SubmissionCallbackCannotChangeActualDangerDeadlineAlongsideItsDirectionBit()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        scene.Write(8, 1, 7, 1025u << 8);
        BomberBombState mother = BomberSplitBombProductionTests.Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        World world = scene.World;
        Assert.True(world.IsLive(mother.Entity));
        Assert.Equal((int)BomberBombPhase.Danger, mother.Phase.Value);
        Assert.True(mother.DangerUntilTick.Value > mother.ExplodedAtTick.Value);
        Assert.Equal(0UL, mother.BurnUntilTick.Value);
        Assert.Equal(4, mother.FutureChildren.Value);
        Assert.Equal(0, mother.SplitSubmittedMask.Value);
        Assert.Equal(0, mother.SplitResolvedMask.Value);
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
            result => result.TransactionId == transaction);
        Assert.Equal(VoxelTxnState.Applied, original.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(8, 1, 7)).BlockId);
        string token = $"split:{mother.Entity.ToHex()}:0";
        int liveBefore = world.Each<BomberBombState>().Count();
        ulong changedDeadline = checked(mother.DangerUntilTick.Value + 1);
        int callbackCalls = 0;

        // Fault-inject only the submission callback on the real published owner.
        // This does not claim an actual structural Unknown checkpoint.
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(world, token, () =>
        {
            callbackCalls++;
            mother.DangerUntilTick.Value = changedDeadline;
            mother.SplitSubmittedMask.Value |= 1;
        }));

        Assert.Equal(1, callbackCalls);
        Assert.Equal(changedDeadline, mother.DangerUntilTick.Value);
        Assert.Equal(1, mother.SplitSubmittedMask.Value);
        Assert.Equal(4, mother.FutureChildren.Value);
        Assert.Equal(liveBefore, world.Each<BomberBombState>().Count());
        Assert.DoesNotContain(world.Each<BomberBombState>(), child => child.HitFamily.Value == mother.Entity);
        // Capture refuses actual pending creates; successful capture proves the
        // rejected callback did not enter structural submission.
        byte[] rejected = scene.Manager.CaptureSnapshot();
        Assert.True(BomberSplitBombs.HasSubmittedPromise(world, token));
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(world, token, () => callbackCalls++));
        Assert.Equal(1, callbackCalls);
        Assert.Equal(rejected, scene.Manager.CaptureSnapshot());
    }

    [Fact]
    public void NormalProductionCallbacksPublishAllFourChildrenWithActualDangerDeadlineUnchanged()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        BomberBombState mother = BomberSplitBombProductionTests.Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        AssertPublishedFamily(scene.World, mother);
        ulong deadline = mother.DangerUntilTick.Value;
        scene.Manager.Tick();
        Assert.Equal(deadline, mother.DangerUntilTick.Value);
        AssertPublishedFamily(scene.World, mother);
    }

    [Fact]
    public void ActualBoundKickCanPrecedeSplitExplosionAndNormalChildSubmission()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        World world = scene.World;
        BomberBombState mother = BomberSplitBombProductionTests.Mother(scene, power: 2);
        mother.FuseEndTick.Value = checked(world.Tick + 4);
        scene.Manager.Tick();
        BomberSourceIdentity source = mother.ReadSource();
        ulong due = mother.FuseEndTick.Value;
        ulong chain = mother.ChainId.Value;
        Vector3 origin = world.Get<LogicTransform>(mother.Entity).LocalPosition;
        NetEntityId kickerId = scene.Lives[1];
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(kickerId), new Vector3(6.5f, 1.5f, 7.5f));
        world.Get<BomberPlayerState>(kickerId).Facing.Value = (int)BomberDirection.Right;
        BomberSkillState skills = world.Get<BomberSkillState>(kickerId);
        skills.CharacterId.Value = 118005;
        skills.ActiveSkillId.Value = 13;
        skills.ActiveSkillLevel.Value = 1;
        skills.ActiveSkillBound.Value = true;
        AbilityComponent owner = world.Get<AbilityComponent>(kickerId);
        var ability = new UseActiveSkillAbility();
        Assert.True(ability.CanActivate(default, owner, out string? reason), reason);
        ability.Execute(default, owner);
        Assert.Equal((int)BomberDirection.Right, mother.KickDirection.Value);
        BomberHfsmState machine = world.Get<BomberHfsmState>(mother.Entity);
        Assert.Equal(BomberHfsmDefinitions.State.BombKicked, machine.ActiveStates[machine.ActiveStates.Count - 1]);

        while (world.Tick <= due) scene.Manager.Tick();

        Assert.NotEqual(origin, world.Get<LogicTransform>(mother.Entity).LocalPosition);
        Assert.Equal(source, mother.ReadSource());
        Assert.Equal(due, mother.FuseEndTick.Value);
        Assert.Equal(chain, mother.ChainId.Value);
        Assert.Equal(0, mother.KickDirection.Value);
        AssertPublishedFamily(world, mother);
        Assert.Single(BomberEffectIntegrationTests.Events(world, "bomb_kicked"), entry =>
            entry.GetProperty("entityId").GetString() == mother.Entity.ToHex());
    }

    [Fact]
    public void ActualBlastChainCanShortenSplitFuseBeforeNormalChildSubmission()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        World world = scene.World;
        BomberBombState mother = BomberSplitBombProductionTests.Mother(scene, power: 2);
        mother.FuseEndTick.Value = checked(world.Tick + 100);
        scene.Manager.Tick();
        BomberSourceIdentity source = mother.ReadSource();
        ulong originalDue = mother.FuseEndTick.Value;
        ulong originalChain = mother.ChainId.Value;
        EntityOrder triggerOrder = BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], scene.Lives[1], 8910);
        BomberBombState trigger = triggerOrder.Get<BomberBombState>();
        trigger.Power.Value = 1;
        trigger.CapacityReturned.Value = true;
        BomberEffectIntegrationTests.Position(triggerOrder.Get<LogicTransform>(), new Vector3(6.5f, 1.5f, 7.5f));
        ulong triggerDue = trigger.FuseEndTick.Value;

        scene.Manager.Tick(); scene.Manager.Tick();

        Assert.Equal((int)BomberBombPhase.Danger, trigger.Phase.Value);
        Assert.Equal(triggerDue, mother.ExplodedAtTick.Value);
        Assert.Equal(triggerDue, mother.FuseEndTick.Value);
        Assert.True(mother.FuseEndTick.Value < originalDue);
        Assert.NotEqual(originalChain, mother.ChainId.Value);
        Assert.Equal(trigger.ChainId.Value, mother.ChainId.Value);
        Assert.Equal(source, mother.ReadSource());
        AssertPublishedFamily(world, mother);
    }

    private static void AssertPublishedFamily(World world, BomberBombState mother)
    {
        Assert.Equal((int)BomberBombPhase.Danger, mother.Phase.Value);
        Assert.True(mother.DangerUntilTick.Value > mother.ExplodedAtTick.Value);
        // Native CanBurn is false for Split, so no fabricated Split Burn phase.
        Assert.Equal(0UL, mother.BurnUntilTick.Value);
        Assert.Equal(0, mother.FutureChildren.Value);
        Assert.Equal(15, mother.SplitSubmittedMask.Value);
        Assert.Equal(15, mother.SplitResolvedMask.Value);
        BomberBombState[] children = world.Each<BomberBombState>().Where(child => child.HitFamily.Value == mother.Entity).ToArray();
        Assert.Equal(4, children.Length);
        Assert.Equal(ChildDirections, children.Select(child => child.ChildDirection.Value).OrderBy(direction => direction).ToArray());
        var config = BomberConfigBinding.For(world);
        ulong delay = Ticks.FromMilliseconds(config.Tables.SkillLevels.Rows.Single(level => level.Name == "splitBomb_lv1").DurationMs,
            config.Game.TickRateHz);
        Assert.All(children, child =>
        {
            Assert.True(world.IsLive(child.Entity));
            Assert.Equal(mother.ReadSource(), child.ReadSource());
            Assert.Equal(mother.ChainId.Value, child.ChainId.Value);
            Assert.Equal(mother.Frenzy.Value, child.Frenzy.Value);
            Assert.Equal((int)BomberBombKind.Standard, child.BombKind.Value);
            Assert.Equal((int)BomberBombPhase.Fuse, child.Phase.Value);
            Assert.Equal(1, child.Power.Value);
            Assert.True(child.CapacityReturned.Value);
            Assert.Equal(delay, child.FuseEndTick.Value - child.PlacedAtTick.Value);
            Assert.Equal($"split:{mother.Entity.ToHex()}:{child.ChildDirection.Value - 1}", child.PromiseToken.Value);
        });
    }
}
