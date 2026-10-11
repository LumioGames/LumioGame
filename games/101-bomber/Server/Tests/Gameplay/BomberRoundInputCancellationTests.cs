using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberRoundInputCancellationTests
{
    private static readonly JsonSerializerOptions TraceOptions = new() { IncludeFields = true, WriteIndented = true };
    private static readonly int[] RequestedPart = { 0 };
    private static readonly int[] MultipartParts = { 0, 1 };
    [Fact]
    public void ResultsReceiveCutSettlesTwoConnectionsInBoundedPrefixesAndAcceptsNewInput()
    {
        using var h = new Harness();
        h.Queue(0, 1, nameof(MoveAbility));
        h.Manager.Tick();
        var applied = Assert.Single(h.Manager.DrainOutbox().Operations);
        Assert.Equal(OperationCommitFact.Applied, applied.Outcome.CommitFact);
        h.Queue(0, 2, nameof(MoveAbility));
        h.Queue(0, 3, nameof(MoveAbility));
        h.Queue(0, 4, nameof(PlaceBombAbility));
        h.Queue(0, 5, nameof(UseActiveSkillAbility));
        h.Queue(1, 1, nameof(MoveAbility));
        h.Queue(1, 2, nameof(PlaceBombAbility));
        h.Queue(1, 3, nameof(UseActiveSkillAbility));
        var generations = h.Generations();
        ulong oldMatch = h.Match.MatchId.Value;
        h.EndResults();
        h.Manager.Tick();
        var beforeCut = Assert.Single(h.Manager.DrainOutbox().Operations);
        Trace("receive-cut", new { applied, beforeCut, oldMatch, newMatch = h.Match.MatchId.Value,
            generations, afterGenerations = h.Generations(), pending = h.Manager.PendingIngressCount, bytes = h.Manager.PendingIngressBytes });
        Assert.Equal(OperationOutcomeKind.BusinessReject, beforeCut.Outcome.Kind);
        Assert.Equal(2UL, beforeCut.Operation.Sequence);
        Assert.Equal(oldMatch + 1, h.Match.MatchId.Value);
        Assert.Equal((int)BomberMatchPhase.Warmup, h.Match.Phase.Value);
        Assert.Equal(generations, h.Generations());
        Assert.Equal(6, h.Manager.PendingIngressCount);
        h.Queue(0, 6, nameof(MoveAbility));
        h.Queue(1, 4, nameof(MoveAbility));
        var expected = new[] { (0, 3UL), (0, 4UL), (0, 5UL), (1, 1UL), (1, 2UL), (1, 3UL) };
        var cancelled = new List<WorldOperationResult>();
        for (int i = 0; i < expected.Length; i++)
        {
            long bytes = h.Manager.PendingIngressBytes;
            int count = h.Manager.PendingIngressCount;
            h.Manager.Tick();
            var result = Assert.Single(h.Manager.DrainOutbox().Operations);
            Trace("bounded-prefix-" + i, new { result, countBefore = count, countAfter = h.Manager.PendingIngressCount,
                bytesBefore = bytes, bytesAfter = h.Manager.PendingIngressBytes,
                ack0 = h.Ack(0), ack1 = h.Ack(1) });
            AssertCancelled(result);
            Assert.Equal(h.Lives[expected[i].Item1], result.Operation.Sender);
            Assert.Equal(expected[i].Item2, result.Operation.Sequence);
            Assert.Equal(expected[i].Item2, h.Ack(expected[i].Item1));
            Assert.Equal(count - 1, h.Manager.PendingIngressCount);
            Assert.True(h.Manager.PendingIngressBytes < bytes);
            cancelled.Add(result);
        }
        Assert.Equal(6, cancelled.Select(r => r.ExecutionTick).Distinct().Count());
        Assert.Equal(OperationCommitFact.Applied, applied.Outcome.CommitFact);
        Assert.Empty(h.World.Each<BomberBombState>());
        Assert.Equal(0UL, h.World.Get<BomberSkillState>(h.Lives[0]).TeleportSequence.Value);
        h.Manager.Tick();
        var firstNew = Assert.Single(h.Manager.DrainOutbox().Operations);
        Assert.Equal(6UL, firstNew.Operation.Sequence);
        Assert.Equal(OperationOutcomeKind.Succeeded, firstNew.Outcome.Kind);
        Assert.Equal(OperationCommitFact.Applied, firstNew.Outcome.CommitFact);
        h.Manager.Tick();
        var newInput = Assert.Single(h.Manager.DrainOutbox().Operations);
        Trace("post-cut", new { firstNew, newInput, generations = h.Generations() });
        Assert.Equal(4UL, newInput.Operation.Sequence);
        Assert.Equal(OperationOutcomeKind.Succeeded, newInput.Outcome.Kind);
        Assert.Equal(OperationCommitFact.Applied, newInput.Outcome.CommitFact);
        Assert.Equal(generations, h.Generations());
        Assert.Equal(0, h.Manager.PendingIngressCount);
        Assert.Equal(0, h.Manager.PendingIngressBytes);
    }

    [Fact]
    public void StartedMultipartFactsSurviveCancellationOfTheWaitingEnvelope()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        var life = scene.Lives[0];
        var ability = scene.World.Get<AbilityComponent>(life);
        bool cancelled = false;
        ability.ActivationContext = new AbilityActivationContext(static () => 10, _ =>
        {
            if (cancelled) return;
            cancelled = true;
            scene.Manager.RequestCancelPendingInputs(life);
        }, static _ => { });
        var part = MovementInputMemoryTests.Message(life, nameof(MoveAbility),
            new MoveAbility.Input { PrimaryDirection = BomberDirection.Right }, 1);
        scene.Manager.Enqueue(new InputCommandMessage(1, life, new[] {
            new InputCommandPart(part.MappingId, part.Payload), new InputCommandPart(part.MappingId, part.Payload) }));
        scene.Manager.Enqueue(MovementInputMemoryTests.Message(life, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 2));
        scene.Manager.Tick();
        var started = scene.Manager.DrainOutbox().Operations;
        Trace("started-multipart", started);
        Assert.True(cancelled);
        Assert.Equal(2, started.Count);
        Assert.Equal(MultipartParts, started.Select(r => r.Operation.PartIndex));
        Assert.Equal(OperationCommitFact.Applied, started[0].Outcome.CommitFact);
        Assert.Equal(OperationOutcomeKind.BusinessReject, started[1].Outcome.Kind);
        Assert.DoesNotContain(started, r => r.Outcome.Code == "operation_input_cancelled");
        scene.Manager.Tick();
        AssertCancelled(Assert.Single(scene.Manager.DrainOutbox().Operations));
        Assert.Empty(scene.World.Each<BomberBombState>());
    }

    [Fact]
    public void RoundCutCancelsEveryUnstartedMultipartPartWithoutChangingItsEnvelopeIdentity()
    {
        using var h = new Harness(3);
        bool closed = false;
        h.World.Get<AbilityComponent>(h.Lives[0]).ActivationContext = new AbilityActivationContext(static () => 10, _ =>
        {
            if (closed) return;
            closed = true;
            h.EndResults();
        }, static _ => { });
        h.Queue(0, 1, nameof(MoveAbility));
        h.Queue(0, 2, nameof(MoveAbility));
        var bomb = MovementInputMemoryTests.Message(h.Lives[0], nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 3);
        var skill = MovementInputMemoryTests.Message(h.Lives[0], nameof(UseActiveSkillAbility), new UseActiveSkillAbility.Input(), 4);
        h.Enqueue(0, 3, new[] { new InputCommandPart(bomb.MappingId, bomb.Payload), new InputCommandPart(skill.MappingId, skill.Payload) }, MultipartParts);
        h.Manager.Tick();
        Assert.True(closed);
        Assert.Equal(OperationCommitFact.Applied, Assert.Single(h.Manager.DrainOutbox().Operations).Outcome.CommitFact);
        Assert.Equal(2UL, h.Match.MatchId.Value);
        h.Manager.Tick();
        var cancelled = h.Manager.DrainOutbox().Operations;
        Trace("unstarted-multipart", new { cancelled, ack = h.Ack(0), pending = h.Manager.PendingIngressCount, bytes = h.Manager.PendingIngressBytes });
        Assert.Equal(3, cancelled.Count);
        Assert.All(cancelled, AssertCancelled);
        var parts = cancelled.Where(r => r.Operation.Sequence == 3).ToArray();
        Assert.Equal(MultipartParts, parts.Select(r => r.Operation.PartIndex));
        Assert.All(parts, result => { Assert.Equal(h.Lives[0], result.Operation.Sender); Assert.Equal(1UL, result.Operation.ConnectionGeneration); Assert.True(result.ReceiptRequested); });
        Assert.Equal(3UL, h.Ack(0));
        Assert.Equal(0, h.Manager.PendingIngressCount);
        Assert.Equal(0, h.Manager.PendingIngressBytes);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void DeathOrDisconnectOverridesTheRoundCancelMarkWithInvalidation(bool disconnect)
    {
        using var h = new Harness();
        h.Queue(0, 1, nameof(MoveAbility));
        h.Queue(0, 2, nameof(PlaceBombAbility));
        h.EndResults();
        if (!disconnect) h.World.Commands.Destroy(h.Lives[0]);
        h.Manager.Tick();
        _ = h.Manager.DrainOutbox();
        Assert.Equal(1, h.Manager.PendingIngressCount);
        if (disconnect)
        {
            h.Manager.Enqueue(new DisconnectConnectionMessage("successor-0"));
            h.Manager.Tick();
            Assert.Empty(h.Manager.DrainOutbox().Operations);
        }
        h.Manager.Tick();
        var result = Assert.Single(h.Manager.DrainOutbox().Operations);
        Trace("invalidation-" + disconnect, new { result, ack = h.AckIfLive(0), pending = h.Manager.PendingIngressCount });
        Assert.Equal(OperationResultStage.Admission, result.Stage);
        Assert.Equal(OperationOutcomeKind.NotExecuted, result.Outcome.Kind);
        Assert.Equal(OperationCommitFact.NotApplied, result.Outcome.CommitFact);
        Assert.Equal("operation_input_invalidated", result.Outcome.Code);
        Assert.Equal(2UL, result.Operation.Sequence);
        Assert.Equal(disconnect ? 1UL : null, h.AckIfLive(0));
        Assert.Equal(0, h.Manager.PendingIngressCount);
        Assert.Equal(0, h.Manager.PendingIngressBytes);
        Assert.Empty(h.World.Each<BomberBombState>());
    }

    [Fact]
    public void LaterGenerationPreflightFaultRetainsEarlierCancellationAndOldMatchIdentity()
    {
        using var h = new Harness();
        h.Queue(0, 1, nameof(MoveAbility));
        h.Queue(0, 2, nameof(MoveAbility));
        h.EndResults();
        h.Manager.Tick();
        h.Manager.Tick(); // Sequence 2 terminal cancellation remains in the outbox.
        var barrel = h.World.Commands.Create<BomberBarrelEntity>();
        barrel.Get<BomberBarrelState>().ResourceGeneration.Value = 1;
        h.Manager.Tick();
        Assert.True(h.World.IsLive(barrel.AssignedId));
        Assert.Equal(0UL, barrel.Get<BomberBarrelState>().InitialResourceMatch.Value);
        ulong match = h.Match.MatchId.Value;
        ulong index = h.Match.MatchIndex.Value;
        h.Queue(0, 3, nameof(MoveAbility));
        h.Queue(0, 4, nameof(PlaceBombAbility));
        h.EndResults();
        var error = Assert.ThrowsAny<Exception>(h.Manager.Tick);
        string fault = error.ToString();
        Assert.Contains("A new match cannot change the identity of an outstanding terrain receipt.", fault, StringComparison.Ordinal);
        Assert.Contains("BomberRoundTransition.StartNextGeneration", fault, StringComparison.Ordinal);
        Assert.Contains("BombSystem.AdvanceMatch", fault, StringComparison.Ordinal);
        Assert.Equal(match, h.Match.MatchId.Value);
        Assert.Equal(index, h.Match.MatchIndex.Value);
        Assert.Equal((int)BomberMatchPhase.Results, h.Match.Phase.Value);
        var results = h.Manager.DrainOutbox().Operations;
        Trace("generation-preflight-fault", new { fault, matchBefore = match, matchAfter = h.Match.MatchId.Value,
            indexBefore = index, indexAfter = h.Match.MatchIndex.Value, results, pending = h.Manager.PendingIngressCount,
            bytes = h.Manager.PendingIngressBytes, barrel = barrel.AssignedId });
        AssertCancelled(Assert.Single(results, r => r.Operation.Sequence == 2));
        var remaining = Assert.Single(results, r => r.Operation.Sequence == 4);
        Assert.Equal(OperationOutcomeKind.NotExecuted, remaining.Outcome.Kind);
        Assert.Equal(OperationCommitFact.NotApplied, remaining.Outcome.CommitFact);
        Assert.Equal("operation_instance_faulted", remaining.Outcome.Code);
        Assert.DoesNotContain(results, r => r.Outcome.CommitFact == OperationCommitFact.Applied);
        Assert.Equal(0, h.Manager.PendingIngressCount);
        Assert.Equal(0, h.Manager.PendingIngressBytes);
        Assert.Equal(WorldIngressEnqueueStatus.Closed, h.Manager.TryEnqueue(MovementInputMemoryTests.Message(
            h.Lives[0], nameof(MoveAbility), default(MoveAbility.Input), 5)));
    }

    [Fact]
    public void RoundTestsLoadTheSelectedSdkAndProductionNative()
    {
        using var h = new Harness();
        var release = Lumio.Bomber.Tests.EngineRelease.Root;
        string rid = Lumio.Bomber.Tests.EngineRelease.Rid;
        foreach (var assembly in new[] { typeof(WorldManager).Assembly, typeof(AbilityComponent).Assembly })
            Lumio.Bomber.Tests.EngineRelease.ValidateLoadedAssembly(assembly, $"server/{rid}/SDK/Managed/{Path.GetFileName(assembly.Location)}");
        using Process process = Process.GetCurrentProcess();
        string nativeName = Path.GetFileName(Lumio.Bomber.Tests.EngineRelease.NativeLibrary);
        string actual = Assert.Single(process.Modules.Cast<ProcessModule>(), module => module.ModuleName == nativeName).FileName;
        Lumio.Bomber.Tests.EngineRelease.ValidateNative(actual);
        Trace("loaded-identity", new { release, ecs = typeof(WorldManager).Assembly.Location,
            ecsMvid = typeof(WorldManager).Assembly.ManifestModule.ModuleVersionId,
            gas = typeof(AbilityComponent).Assembly.Location, gasMvid = typeof(AbilityComponent).Assembly.ManifestModule.ModuleVersionId,
            testAssembly = typeof(BomberRoundInputCancellationTests).Assembly.Location,
            testMvid = typeof(BomberRoundInputCancellationTests).Assembly.ManifestModule.ModuleVersionId,
            gameplay = typeof(BombSystem).Assembly.Location, gameplayMvid = typeof(BombSystem).Assembly.ManifestModule.ModuleVersionId,
            testProof = BinaryProof(typeof(BomberRoundInputCancellationTests).Assembly, "Server/Tests/Gameplay/BomberRoundInputCancellationTests.cs"),
            gameplayProof = BinaryProof(typeof(BombSystem).Assembly, "Gameplay/BombSystem.Server.cs"),
            native = actual, identity = Lumio.Bomber.Tests.EngineRelease.NativeBuildInfo() });
    }

    private static object BinaryProof(Assembly assembly, string source)
    {
        string binary = assembly.Location;
        string pdb = Path.ChangeExtension(binary, ".pdb");
        using var peStream = File.OpenRead(binary);
        using var pe = new PEReader(peStream);
        var metadata = pe.GetMetadataReader();
        Assert.Equal(assembly.ManifestModule.ModuleVersionId, metadata.GetGuid(metadata.GetModuleDefinition().Mvid));
        var codeView = pe.ReadCodeViewDebugDirectoryData(Assert.Single(pe.ReadDebugDirectory(), entry => entry.Type == DebugDirectoryEntryType.CodeView));
        using var pdbStream = File.OpenRead(pdb);
        using var provider = MetadataReaderProvider.FromPortablePdbStream(pdbStream);
        var reader = provider.GetMetadataReader();
        var pdbId = new Guid(reader.DebugMetadataHeader!.Id.AsSpan(0, 16));
        Assert.Equal(codeView.Guid, pdbId);
        var document = reader.GetDocument(Assert.Single(reader.Documents,
            handle => reader.GetString(reader.GetDocument(handle).Name).Replace('\\', '/').EndsWith("/" + source, StringComparison.Ordinal)));
        string sourcePath = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, source);
        string sourceHash = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(sourcePath)));
        string documentHash = Convert.ToHexStringLower(reader.GetBlobBytes(document.Hash));
        Assert.Equal(sourceHash, documentHash);
        return new { binary, binarySha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(binary))),
            pdb, pdbSha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(pdb))),
            codeViewGuid = codeView.Guid, pdbId, sourcePath, sourceHash, documentHash };
    }

    private static void AssertCancelled(WorldOperationResult result)
    {
        Assert.Equal(OperationResultStage.Admission, result.Stage);
        Assert.Equal(OperationOutcomeKind.NotExecuted, result.Outcome.Kind);
        Assert.Equal(OperationCommitFact.NotApplied, result.Outcome.CommitFact);
        Assert.Equal("operation_input_cancelled", result.Outcome.Code);
    }

    private static void Trace(string name, object value)
    {
        string? directory = Environment.GetEnvironmentVariable("G2C_TEST_EVIDENCE");
        if (directory is not null) File.WriteAllText(Path.Combine(directory, name + ".json"),
            JsonSerializer.Serialize(value, TraceOptions));
    }

    private sealed class Harness : IDisposable
    {
        internal readonly WorldManager Manager;
        internal readonly NetEntityId[] Lives;
        private readonly EntityBindingQuery binding;
        internal World World => Manager.World;
        internal BomberMatchState Match => World.Single<BomberMatchState>();
        internal Harness(int maxMessagesPerTick = 1)
        {
            var admission = new BomberAdmissionFixture();
            Manager = BomberTestWorld.Start(withMap: true, budget: new WorldIngressBudget(256, 1048576, maxMessagesPerTick, 1048576), admission: admission);
            binding = EntityBindingQuery.Create(Manager);
            for (int i = 0; i < 8; i++)
            {
                admission.Enqueue("successor-" + i, "round-" + i, "bomber-test", "player", WireProfile.SuccessorBindingReceiptsPartsV1);
                for (int tick = 0; tick < 12; tick++)
                {
                    Manager.Tick();
                    Trace("admission-" + i + "-tick-" + tick, Manager.DrainOutbox());
                    if (binding.TryResolveConnectionState("successor-" + i, out _, out _)) break;
                }
                admission.PublishAndSettle();
                Trace("admission-" + i, Manager.DrainOutbox());
            }
            Lives = Enumerable.Range(0, 8).Select(i =>
            {
                Assert.True(binding.TryResolveConnectionState("successor-" + i, out NetEntityId life, out _));
                return life;
            }).ToArray();
            Manager.Tick();
            Assert.Equal(1UL, Match.MatchId.Value);
            _ = Manager.DrainOutbox();
            Match.Phase.Value = (int)BomberMatchPhase.Running;
            Match.PhaseEndTick.Value = World.Tick + 10000;
            for (int i = 0; i < 8; i++)
            {
                World.Get<BomberPlayerState>(Lives[i]).LifePhase.Value = (int)BomberLifePhase.Vulnerable;
                BomberEffectIntegrationTests.Position(World.Get<LogicTransform>(Lives[i]), new Vector3(1.5f, 1.5f, 1.5f + i));
            }
        }
        internal ulong[] Generations() => Enumerable.Range(0, 2).Select(i =>
        {
            Assert.True(binding.TryResolveConnectionState("successor-" + i, out var life, out ulong generation));
            Assert.Equal(Lives[i], life);
            Assert.Equal(life, World.Each<BomberParticipantState>().Single(p => p.Slot.Value == i).CurrentLife.Value);
            return generation;
        }).ToArray();
        internal ulong Ack(int i) => World.Get<ObserverComponent>(Lives[i]).AppliedInputSequence;
        internal ulong? AckIfLive(int i) => World.IsLive(Lives[i]) ? Ack(i) : null;
        internal void EndResults() { Match.Phase.Value = (int)BomberMatchPhase.Results; Match.PhaseEndTick.Value = World.Tick; }
        internal void Queue(int i, uint sequence, string ability)
        {
            IAbilityInput input = ability == nameof(MoveAbility) ? new MoveAbility.Input { PrimaryDirection = BomberDirection.Right } :
                ability == nameof(PlaceBombAbility) ? new PlaceBombAbility.Input() : new UseActiveSkillAbility.Input();
            var message = MovementInputMemoryTests.Message(Lives[i], ability, input, sequence);
            Enqueue(i, sequence, message.Commands, RequestedPart);
        }
        internal void Enqueue(int i, uint sequence, IReadOnlyList<InputCommandPart> parts, IReadOnlyList<int> requested)
        {
            Assert.True(binding.TryResolveConnectionState("successor-" + i, out _, out ulong generation));
            Assert.Equal(WorldIngressEnqueueStatus.Accepted, Manager.TryEnqueue(new InputCommandMessage(sequence,
                Lives[i], parts, "successor-" + i, generation)
            { Profile = WireProfile.SuccessorBindingReceiptsPartsV1, WorldIncarnation = Manager.WorldIncarnation, ReceiptParts = requested }));
        }
        public void Dispose() => Manager.Dispose();
    }
}
