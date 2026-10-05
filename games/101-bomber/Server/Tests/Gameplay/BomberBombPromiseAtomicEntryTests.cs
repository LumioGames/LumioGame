using System;
using System.Linq;
using System.Numerics;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBombPromiseAtomicEntryTests
{
    [Fact]
    public void OneFreshPersistedTransitionQueuesOneActualPublicationAndTransfersItsCredit()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var (participant, row) = UnsubmittedFrenzyFixture(scene);
        int calls = 0;
        EntityOrder order = BomberBombAdmissions.CreateFromPromise(scene.World, row.Token, () =>
        {
            calls++;
            Assert.False(BomberFrenzy.HasSubmittedPromise(scene.World, row.Token));
            SubmitFrenzy(scene.World, participant, row);
            Assert.True(BomberFrenzy.HasSubmittedPromise(scene.World, row.Token));
            Assert.Equal(1, BomberFrenzy.ReservedCount(scene.World));
        });
        Assert.Equal(1, calls);
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, BomberFrenzy.ReservedCount(scene.World));
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token));
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token, () => calls++));
        Assert.Equal(1, calls);
        CompleteFrenzy(order, row, participant);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(row.Token, bomb.PromiseToken.Value);
        Assert.True(bomb.Frenzy.Value);
        Assert.Equal(0, participant.FrenzyBombPromises.Count);
        Assert.Equal(0, BomberFrenzy.ReservedCount(scene.World));
        scene.Manager.Tick();
        Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "bomb_placed"));
    }

    [Fact]
    public void CallbackWithoutSubmissionCannotQueueAnOrderOrChangeItsOwnerSnapshot()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var (_, row) = UnsubmittedFrenzyFixture(scene);
        byte[] before = scene.Manager.CaptureSnapshot();
        int calls = 0;
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token, () => calls++));
        Assert.Equal(1, calls);
        Assert.Equal(before, scene.Manager.CaptureSnapshot());
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, BomberFrenzy.ReservedCount(scene.World));
    }

    [Fact]
    public void KnownFailureBeforeSubmissionLeavesAnUnsubmittedCreditAvailableForOneFreshEntry()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var (participant, row) = UnsubmittedFrenzyFixture(scene);
        byte[] before = scene.Manager.CaptureSnapshot();
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token,
            () => throw new InvalidOperationException("known pre-submission fixture failure")));
        Assert.Equal(before, scene.Manager.CaptureSnapshot());
        Assert.False(BomberFrenzy.HasSubmittedPromise(scene.World, row.Token));
        EntityOrder order = BomberBombAdmissions.CreateFromPromise(scene.World, row.Token,
            () => SubmitFrenzy(scene.World, participant, row));
        CompleteFrenzy(order, row, participant);
        scene.Manager.Tick();
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(0, participant.FrenzyBombPromises.Count);
    }

    [Fact]
    public void FailureAfterPersistingSubmissionRetainsCreditAndCannotReenterAfterPairedRestore()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        var (participant, row) = UnsubmittedFrenzyFixture(scene);
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token, () =>
        {
            SubmitFrenzy(scene.World, participant, row);
            throw new InvalidOperationException("known post-marker fixture failure");
        }));
        Assert.True(BomberFrenzy.HasSubmittedPromise(scene.World, row.Token));
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, BomberFrenzy.ReservedCount(scene.World));
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        byte[] before = restored.CaptureSnapshot();
        int calls = 0;
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(restored.World, row.Token, () => calls++));
        Assert.Equal(0, calls);
        Assert.Equal(before, restored.CaptureSnapshot());
        Assert.Equal(1, BomberFrenzy.ReservedCount(restored.World));
        Assert.Empty(restored.World.Each<BomberBombState>());
    }

    [Theory]
    [InlineData("life")]
    [InlineData("power")]
    [InlineData("position")]
    [InlineData("owner-generation")]
    public void SubmissionCallbackCannotReplaceTheOriginalCanonicalCredit(string mutation)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var (participant, row) = UnsubmittedFrenzyFixture(scene);
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token, () =>
        {
            var changed = row with { CreationSubmitted = true };
            switch (mutation)
            {
                case "life": changed = changed with { Life = scene.Lives[1].ToHex() }; break;
                case "power": changed = changed with { Power = row.Power + 1 }; break;
                case "position": changed = changed with { X = row.X + 1 }; break;
                case "owner-generation": participant.LifeGeneration.Value++; break;
                default: throw new ArgumentOutOfRangeException(nameof(mutation));
            }
            participant.FrenzyBombPromises[0] = BomberFrenzy.Encode(scene.World, participant, changed);
        }));
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.True(BomberFrenzy.HasSubmittedPromise(scene.World, row.Token));
        Assert.Equal(1, BomberFrenzy.ReservedCount(scene.World));
        byte[] retained = scene.Manager.CaptureSnapshot();
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token, () => { }));
        Assert.Equal(retained, scene.Manager.CaptureSnapshot());
    }

    [Fact]
    public void ReentrantCallbackCannotSpendTheSameUnsubmittedCreditBeforeItsOuterTransition()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var (participant, row) = UnsubmittedFrenzyFixture(scene);
        int nestedCalls = 0;
        EntityOrder order = BomberBombAdmissions.CreateFromPromise(scene.World, row.Token, () =>
        {
            Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, row.Token,
                () => nestedCalls++));
            SubmitFrenzy(scene.World, participant, row);
        });
        Assert.Equal(0, nestedCalls);
        CompleteFrenzy(order, row, participant);
        scene.Manager.Tick();
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(0, participant.FrenzyBombPromises.Count);
    }

    [Theory]
    [InlineData("split")]
    [InlineData("barrel")]
    public void OtherDurableOwnersAlsoRefuseAThreeArgumentCallbackWhichDoesNotPersistSubmission(string owner)
    {
        var (scene, token) = OtherOwnerFixture(owner);
        using (scene)
        {
            byte[] before = scene.Manager.CaptureSnapshot();
            int live = scene.World.Each<BomberBombState>().Count();
            Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, token, () => { }));
            Assert.Equal(live, scene.World.Each<BomberBombState>().Count());
            Assert.Equal(before, scene.Manager.CaptureSnapshot());
        }
    }

    [Fact]
    public void EightMaximumWidthSerializedBarrelRowsFitTheExistingUtf8EnvelopeWithFrenzyIncluded()
    {
        const int rowUpperBound = 925;
        const int arrayUpperBound = 7409;
        string identity = new string('f', 32);
        string suffix = new string('\u0001', 16);
        string transaction = $"bomber-terrain:{new string('f', 16)}:{new string('f', 16)}:{suffix}";
        string token = $"barrel:{identity}:{ulong.MaxValue:x16}:{suffix}";
        // This is the maximal primitive-width serialization envelope, not a
        // legal Native transaction or an accepted gameplay clock fixture.
        var envelope = new BomberBarrelBombPromises.Promise(token, transaction, identity, ulong.MaxValue,
            identity, identity, identity, identity, ulong.MaxValue, ulong.MaxValue, ulong.MaxValue,
            7, int.MaxValue, int.MaxValue, ulong.MaxValue, ulong.MaxValue,
            false, false, ulong.MaxValue, identity, false);
        Assert.Equal(rowUpperBound, Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(envelope)));
        Assert.Equal(arrayUpperBound, Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(
            Enumerable.Repeat(envelope, BomberBarrelBombPromises.CountLimit).ToArray())));
        Assert.True(arrayUpperBound < BomberBarrelBombPromises.ByteLimit);

        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        var config = BomberConfigBinding.For(world);
        string actualTransaction = $"bomber-terrain:{world.InstanceId:x16}:{match:x16}:{suffix}";
        string source = new NetEntityId(world.InstanceId, ulong.MaxValue).ToHex();
        // Codec boundary rows exercise every allowed string width and uint64
        // source width. They do not claim real Native publication or Unknown.
        var rows = Enumerable.Range(0, BomberBarrelBombPromises.CountLimit).Select(index =>
        {
            string barrel = new NetEntityId(world.InstanceId, ulong.MaxValue - (ulong)index).ToHex();
            return envelope with { Token = $"barrel:{barrel}:{ulong.MaxValue:x16}:{suffix}", Transaction = actualTransaction,
                Barrel = barrel, SourceBomb = source, Family = source, Participant = source, Life = source,
                Match = match, X = config.Map.Width - 1, Z = config.Map.Depth - 1,
                Occurred = 0, Submitted = 0, Applied = true, CreationSubmitted = true, CreatedAt = world.Tick, Produced = source };
        }).ToArray();
        string encoded = BomberBarrelBombPromises.Encode(world, rows);
        Assert.InRange(Encoding.UTF8.GetByteCount(encoded), 1, arrayUpperBound);
        Assert.Equal(BomberBarrelBombPromises.CountLimit, JsonSerializer.Deserialize<BomberBarrelBombPromises.Promise[]>(encoded)!.Length);
    }

    private static (BomberParticipantState Participant, BomberFrenzy.Promise Row) UnsubmittedFrenzyFixture(
        BomberTerrainProductionTests.Scene scene)
    {
        BomberGrowthHealthTests.Take(scene.Manager, scene.Lives[0], 7);
        World world = scene.World;
        var life = world.Get<BomberPlayerState>(scene.Lives[0]);
        var participant = world.Get<BomberParticipantState>(life.Participant.Value);
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        ulong chain = checked(runtime.NextChainId.Value + 1);
        // An explicit unsubmitted owner-credit fixture isolates the atomic API.
        // This is separate from the real production Ability placement tests.
        var row = new BomberFrenzy.Promise($"frenzy:{participant.Entity.ToHex()}:{chain:x16}", life.Entity.ToHex(),
            life.LifeGeneration.Value, participant.MatchId.Value, chain,
            checked((int)world.Get<AttributeComponent>(life.Entity).GetCurrentValue(BomberAttributeNames.BombPower)),
            7, 5, 1.5f, world.Tick,
            checked(world.Tick + Ticks.FromMilliseconds(config.Game.FrenzyFuseMs, config.Game.TickRateHz)), false);
        participant.FrenzyBombPromises.Add(BomberFrenzy.Encode(world, participant, row, chain));
        runtime.NextChainId.Value = chain;
        participant.FrenzyLastPlacementTick.Value = world.Tick;
        return (participant, row);
    }

    private static void SubmitFrenzy(World world, BomberParticipantState participant, BomberFrenzy.Promise row) =>
        participant.FrenzyBombPromises[0] = BomberFrenzy.Encode(world, participant, row with { CreationSubmitted = true });

    private static void CompleteFrenzy(EntityOrder order, BomberFrenzy.Promise row, BomberParticipantState participant)
    {
        var bomb = order.Get<BomberBombState>();
        bomb.Owner.Value = participant.Entity;
        bomb.SourceLife.Value = NetEntityId.Parse(row.Life);
        bomb.SourceLifeGeneration.Value = row.Generation;
        bomb.Frenzy.Value = true;
        bomb.BombKind.Value = (int)BomberBombKind.Standard;
        bomb.Power.Value = row.Power;
        bomb.Phase.Value = (int)BomberBombPhase.Fuse;
        bomb.PlacedAtTick.Value = row.Placed;
        bomb.FuseEndTick.Value = row.FuseEnd;
        bomb.ChainId.Value = row.Chain;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(row.X + .5f, row.Y, row.Z + .5f));
    }

    private static (BomberTerrainProductionTests.Scene Scene, string Token) OtherOwnerFixture(string owner)
    {
        if (owner == "split")
        {
            var scene = BomberSplitBombProductionTests.Open();
            scene.Write(8, 1, 7, 1025u << 8);
            var mother = BomberSplitBombProductionTests.Mother(scene, 2);
            scene.Manager.Tick(); scene.Manager.Tick();
            Assert.Equal((int)BomberBombPhase.Danger, mother.Phase.Value);
            Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            Assert.Equal(0, mother.SplitSubmittedMask.Value);
            return (scene, $"split:{mother.Entity.ToHex()}:0");
        }
        var barrelScene = new BomberTerrainProductionTests.Scene(0);
        var barrel = barrelScene.World.Commands.Create<BomberBarrelEntity>();
        barrel.Get<BomberBarrelState>().ResourceGeneration.Value = 1;
        barrelScene.Manager.Tick();
        barrelScene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1032,
            barrelScene.World.Registry.WireName(typeof(BomberBarrelEntity))) });
        var before = barrelScene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var write = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1032u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, barrelScene.Adapter.TryStageMutation(new[] { write },
            new[] { new VoxelBindingOp(0, write.CellOffset, barrel.AssignedId.ToHex())
                { ExpectedSectionRevision = write.ExpectedSectionRevision } }, "atomic-credit-fixture-barrel").Status);
        barrelScene.Manager.Tick();
        barrelScene.Bomb(); barrelScene.Manager.Tick(); barrelScene.Manager.Tick();
        var runtime = barrelScene.World.Single<BomberWorldRuntime>();
        var original = Assert.Single(barrelScene.Adapter.CaptureResultCheckpoint().Results,
            result => result.TransactionId == runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(VoxelTxnState.Applied, original.Outcome.State);
        Assert.Equal(Lumio.GameRuntime.Coordination.VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        var row = Assert.Single(JsonSerializer.Deserialize<BomberBarrelBombPromises.Promise[]>(runtime.BarrelBombPromises.Value)!);
        Assert.Equal(row.Transaction, original.TransactionId);
        // Isolate the accepted, not yet structurally submitted owner state. The
        // retained Native receipt is real; this is not a structural Unknown claim.
        BomberBarrelBombPromises.Accept(barrelScene.World, row.Transaction);
        return (barrelScene, row.Token);
    }
}
