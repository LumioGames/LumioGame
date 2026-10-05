using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.GameRuntime.Simulation;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFreezeReplicaTests
{
    [Fact]
    public void RealAuthorityFreezeAndImmunityProjectThroughEncodedFramesIntoTheActualClientCompilation()
    {
        var provider = new BomberAdmissionFixture();
        using WorldManager manager = BomberTestWorld.Start(withMap: true, admission: provider);
        using EntityBindingQuery bindings = EntityBindingQuery.Create(manager);
        using var factory = new BomberJournalReplicaFactory();
        IClientReplica replica = factory.Create();
        Assert.True(replica.ResetForNewSession(new ReplicaResetRequest(1, "freeze-replica")).Succeeded);
        using var socket = new BomberReplicaSocket();
        using var admission = new SuccessorAdmission(socket.Connection, replica);
        var queued = new List<WorldMessage>();
        bool authorized = false;
        var sections = new ReplicaSectionEnvelopeReader();
        void ApplyAuthority(byte[] payload)
        {
            var authenticated = socket.Send(payload);
            Assert.True(admission.TryConsumeDataFrame(in authenticated));
            var committed = replica.GetSnapshot().Committed;
            ulong next = committed.Revision + 1;
            var request = new ReplicaStageRequest(committed.Generation,
                committed.HasBaseline ? ReplicaUpdateKind.Delta : ReplicaUpdateKind.FullSnapshot,
                committed.Baseline, committed.Revision, next, next, authenticated.Bytes.ToArray(),
                ReadOnlyMemory<ulong>.Empty, ReadOnlyMemory<ulong>.Empty);
            Assert.Equal(ReplicaStageStatus.Staged, replica.StageAuthority(in request, out var handle, out _).Status);
            var outcome = replica.ObserveRuntimeOutcome(handle, ReplicaRuntimeOutcome.CommittedOutcome(), out _);
            Assert.True(outcome == ReplicaOutcomeStatus.Observed,
                $"Native authority outcome {outcome}: {replica.GetLastApplyResult()?.Error}");
            var applied = Assert.IsType<WorldChangeApplyResult>(replica.GetLastApplyResult());
            Assert.True(applied.AuthorityApplied && applied.PredictionCompleted, applied.Error?.ToString());
        }
        void ReceiveInitial(string connection, string kind, byte[] bytes)
        {
            if (connection != "freeze-0") return;
            if (kind == "entity")
            {
                if (Environment.GetEnvironmentVariable("LUMIO_BOMBER_ADMISSION_EVIDENCE") is string evidence)
                    System.IO.File.WriteAllBytes(System.IO.Path.Combine(evidence, "initial-native-census.json"), bytes);
                ApplyAuthority(bytes); return;
            }
            var receipt = socket.Send(bytes);
            if (kind == "authorization")
            {
                Assert.Equal(SuccessorAuthorizationAcceptance.Pending, admission.TryReceiveSuccessorAuthorization(in receipt));
                authorized = true;
            }
            else if (kind == "welcome")
            {
                Assert.Equal(SuccessorWelcomeAcceptance.Initial, admission.TryConsumeSuccessorWelcome(in receipt, out var validated));
                Assert.True(replica.TryObserveSuccessorWelcome(validated));
            }
            else
            {
                Assert.Equal("section", kind);
                Assert.True(admission.TryConsumeDataFrame(in receipt));
                Assert.Equal(ReplicaSectionFrameStatus.Read, sections.ReadSectionFrame(bytes, out var section));
                var key = new VoxelSectionKey(section.SectionKey.X, checked((byte)section.SectionKey.Y), section.SectionKey.Z);
                var native = NativeWorldVoxelResources.Require(replica.World.Manager).Voxel;
                native.RequestSection(key);
                native.DeliverSection(key, section.SectionRevision, Enum.Parse<VoxelSectionEncoding>(section.Encoding.ToString()),
                    section.Payload.Span, section.PayloadSha256.Span,
                    section.Encoding == ReplicaSectionEncoding.Delta ? section.BaseSectionRevision : null);
            }
        }
        void Tick()
        {
            manager.Tick();
            queued.AddRange(manager.DrainOutbox().Frames.Where(frame => frame.Connection == "freeze-0"));
            if (!authorized) provider.PublishAndSettle(ReceiveInitial);
            Assert.InRange(queued.Count, 0, 128);
            foreach (WorldMessage message in queued)
            {
                Assert.IsNotType<WelcomeMessage>(message); // The original frozen provider owns Welcome.
                if (message is WorldChangeMessage frame)
                {
                    Assert.DoesNotContain(frame.Fields, field => field.ComponentId == nameof(BomberSkillState) &&
                        (field.FieldId.StartsWith("freezeEffect", StringComparison.Ordinal) || field.FieldId.StartsWith("freezeImmunityEffect", StringComparison.Ordinal)));
                    ApplyAuthority(WireCodec.EncodePack(frame, WireProfile.SuccessorBindingV1));
                }
            }
            queued.Clear();
        }
        for (int i = 0; i < 8; i++)
            provider.Enqueue("freeze-" + i, "freeze-account-" + i, "freeze-replica", "player", WireProfile.SuccessorBindingV1);
        Tick();
        NetEntityId[] lives = Enumerable.Range(0, 8).Select(i => NetEntityId.Parse(bindings.ResolveByConnection("freeze-replica", "freeze-" + i).Binding!.Value.NetEntityId)).ToArray();
        int wait = 0;
        while (lives.Any(life => !new PlaceBombAbility().CanActivate(default, manager.World.Get<AbilityComponent>(life), out _)) && wait++ < 100) Tick();
        Assert.True(wait <= 100);
        while (manager.World.Tick <= lives.Max(life => manager.World.Get<BomberPlayerState>(life).ProtectedUntilTick.Value)) Tick();
        Assert.All(lives, life => Assert.Equal((int)BomberLifePhase.Vulnerable, manager.World.Get<BomberPlayerState>(life).LifePhase.Value));
        var first = BomberEffectIntegrationTests.Bomb(manager.World, lives[1], lives[0], 290);
        first.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        Tick(); Tick();
        var frozen = Assert.Single(manager.World.Get<EffectComponent>(lives[0]).ActiveEffects);
        Assert.Equal(10108u, frozen.TypeId);
        Assert.True(authorized);
        Assert.Equal((frozen.EndTick, 0UL), factory.ReadFreeze(replica, lives[0]));
        BomberEffectIntegrationTests.Bomb(manager.World, lives[2], lives[0], 291);
        Tick(); Tick();
        var immune = Assert.Single(manager.World.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10109u);
        Assert.Equal((0UL, immune.EndTick), factory.ReadFreeze(replica, lives[0]));
        while (manager.World.Tick <= immune.EndTick) Tick();
        Assert.Equal((0UL, 0UL), factory.ReadFreeze(replica, lives[0]));
    }
}
