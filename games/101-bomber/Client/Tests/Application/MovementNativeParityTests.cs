using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Numerics;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Lumio.Bomber.Client.Application;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Client.Application;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.Input;
using Lumio.Client.Gameplay.Session;
using Lumio.Client.Log.ZLoggerSink;
using Lumio.Client.Network.Connection;
using Lumio.Engine.NativeLoader;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Config;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Wire;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Lumio.Bomber.Client.Application.Tests;

/// <summary>Real public ClientHost/Session input and fixture-bound Native authority.</summary>
public sealed class MovementNativeParityTests
{
    private static readonly JsonSerializerOptions EvidenceJsonOptions = new() {
        WriteIndented = true, IncludeFields = true,
    };

    [Fact]
    public Task P1SharedInputParity() => RunCase("P1", 46);

    [Fact]
    public Task P2SharedInputParity() => RunCase("P2", 46);

    [Fact]
    public Task P3SharedInputParity() => RunCase("P3", 46);

    [Fact]
    public Task P4SharedInputParity() => RunCase("P4", 46);

    [Fact]
    public Task P5SharedInputParity() => RunCase("P5", 28);

    [Fact]
    public Task P6SharedInputParity() => RunCase("P6", 92);

    [Fact]
    public Task P7SharedInputParity() => RunCase("P7", 59);

    [Fact]
    public Task P8SharedInputParity() => RunCase("P8", 69);

    [Fact]
    public Task P9SharedInputParity() => RunCase("P9", 24);

    [Fact]
    public Task P10SharedInputParity() => RunCase("P10", 40);

    [Fact]
    public Task P5DrySampledMovesUseTypedHostSessionAuthenticatedBytesAndDeferredNativeAuthority()
        => RunCase("P5", 5);

    [Fact]
    public Task TypedIdleAdvancesActualMoveMemoryWithoutPosition() => RunCase("P1", 3, idleAt: 1);

    [Fact]
    public Task AbsentMoveAdvancesActualStepWithoutMoveAdmission() => RunCase("P1", 3, absentAt: 1);

    [Fact]
    public Task BlockedPendingTurnContinuesOnTypedIdle()
        => RunCase("P6", 9, idleAt: 2);

    [Fact]
    public Task BlockedPendingTurnExpiresAcrossAbsentMove()
        => RunCase("P6", 9, absentAt: 2);

    [Fact]
    public Task ReleaseAfterAcceptedAssistUsesTypedIdleMemory()
        => RunCase("P9", 13, idleAt: 11);

    [Fact]
    public Task ReleaseAfterAcceptedAssistWithoutMoveKeepsPriorMemory()
        => RunCase("P9", 13, absentAt: 11);

    [Fact]
    public Task ReleaseWithEffectivePendingCarryContinuesOnTypedIdle()
        => RunCase("P9", 10, idleAt: 8);

    [Fact]
    public Task ReleaseWithEffectivePendingCarryStopsOnAbsentMove()
        => RunCase("P9", 10, absentAt: 8);

    [Fact]
    public Task P10DryToWaterBoundaryUsesCrossedCellSpeed() => RunCase("P10", 5);

    [Fact]
    public Task WetInitialCellUsesWaterSpeedFromSameP10Start()
        => RunCase("P10", 5, scenarioVariant: "water-start");

    [Fact]
    public Task WaterToDryBoundaryUsesRemainingTimeInCrossedCell()
        => RunCase("P10", 9, scenarioVariant: "water-exit");

    [Fact]
    public Task FullyWaterControlFromSameExitStartRemainsAtWaterSpeed()
        => RunCase("P10", 9, scenarioVariant: "water-exit-control");

    [Fact]
    public Task SafeStartRefusesDangerousFallback()
        => RunCase("P5", 3, scenarioVariant: "danger-safe-fallback");

    [Fact]
    public Task AlreadyDangerousStartMayUseFallback()
        => RunCase("P5", 3, scenarioVariant: "danger-already-start");

    [Fact]
    public Task DirectInputUsesSameTimedDangerAsControl()
        => RunCase("P5", 3, scenarioVariant: "danger-direct");

    [Fact]
    public Task StaleClientLifeIsRejectedByActualAuthority() => RunCase("P1", 2, identityInvalidAt: 1);

    [Fact]
    public void NonliveParticipantFieldCannotAdvanceNativeWorld()
    {
        string root = Lumio.Bomber.Tests.MovementNativeParityFixture.FindGameRoot();
        var scenario = Lumio.Bomber.Tests.MovementNativeParityFixture.Load().Cases.Single(row => row.Id == "P1");
        byte[] catalog = File.ReadAllBytes(Path.Combine(root, "Server/Assets/Maps/official-catalog.json"));
        string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")!;
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
            MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024,
            LogMailboxCapacity = 4096, MaxContexts = 64 };
        using var authority = new Authority(root, native, budget, catalog, scenario, null);
        Vector3 before = authority.Position;
        authority.InvalidateIdentity("nonlive-participant");
        Assert.False(authority.Identity.PlayerParticipantLive);
        var error = Assert.Throws<InvalidOperationException>(() => authority.Manager.Tick());
        Assert.Contains("Player life is already assigned to another participant", error.ToString(),
            StringComparison.Ordinal);
        Assert.Equal(before, authority.Position);
        WriteEvidence("nonlive-participant-world-invariant", new {
            outcome = "ProcessorPlan-rejection-before-terminal-Move",
            authority.Identity, error = error.ToString(),
            loaded = CaptureLoadedIdentity("authority", native, authority.Manager.GetType().Assembly,
                authority.ServerGameplayAssembly) });
    }

    [Fact]
    public Task ZeroPlayerGenerationIsRejectedByActualAuthority()
        => RunCase("P1", 2, identityInvalidAt: 1, identityVariant: "zero-player-generation");

    [Fact]
    public Task MismatchedPlayerGenerationIsRejectedByActualAuthority()
        => RunCase("P1", 2, identityInvalidAt: 1, identityVariant: "mismatched-player-generation");

    [Fact]
    public Task ZeroParticipantGenerationIsRejectedByActualAuthority()
        => RunCase("P1", 2, identityInvalidAt: 1, identityVariant: "zero-participant-generation");

    [Fact]
    public Task MismatchedParticipantGenerationIsRejectedByActualAuthority()
        => RunCase("P1", 2, identityInvalidAt: 1, identityVariant: "mismatched-participant-generation");

    [Fact]
    public Task MismatchedParticipantMatchIsRejectedByActualAuthority()
        => RunCase("P1", 2, identityInvalidAt: 1, identityVariant: "mismatched-participant-match");

    [Fact]
    public Task CurrentLifeCanExitItsOwnFuseBomb() => RunCase("P1", 1, bombVariant: "own");

    [Fact]
    public Task WrongSourceGenerationDeniesOwnBombExit() => RunCase("P1", 1, bombVariant: "wrong-generation");

    [Fact]
    public Task WrongOwnerDeniesOwnBombExit() => RunCase("P1", 1, bombVariant: "wrong-owner");

    [Fact]
    public Task WrongSourceLifeDeniesOwnBombExit() => RunCase("P1", 1, bombVariant: "wrong-source");

    [Fact]
    public Task KickStartDeniesOwnBombExit() => RunCase("P1", 1, bombVariant: "kicked-start");

    [Fact]
    public void KickDirectionBeforeHfsmInitializationIsRejected()
        => AssertInvalidBombWorld("kick-direction-before-hfsm",
            "Only a new stationary bomb may initialize its HFSM");

    [Fact]
    public void KickDirectionFieldOnlyDisagreesWithNativeHfsm()
        => AssertInvalidBombWorld("kick-direction-after-hfsm",
            "Bomb projection disagrees with its Native HFSM");

    private static void AssertInvalidBombWorld(string variant, string expected)
    {
        string root = Lumio.Bomber.Tests.MovementNativeParityFixture.FindGameRoot();
        var scenario = Lumio.Bomber.Tests.MovementNativeParityFixture.Load().Cases.Single(row => row.Id == "P1");
        byte[] catalog = File.ReadAllBytes(Path.Combine(root, "Server/Assets/Maps/official-catalog.json"));
        string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")!;
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
            MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024,
            LogMailboxCapacity = 4096, MaxContexts = 64 };
        var error = Assert.Throws<InvalidOperationException>(() =>
            new Authority(root, native, budget, catalog, scenario, variant));
        Assert.Contains(expected, error.ToString(), StringComparison.Ordinal);
        WriteEvidence("bomb-" + variant, new { outcome = "Native-HFSM-invariant-rejection-before-Move",
            variant, expected, error = error.ToString(),
            nativeSha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(native))) });
    }


    private static async Task RunCase(string caseId, int count, int idleAt = -1,
        int absentAt = -1, int identityInvalidAt = -1, string? bombVariant = null,
        string? identityVariant = null, string? scenarioVariant = null)
    {
        string? childDirectory = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_AUTHORITY_CHILD");
        if (childDirectory is not null)
        {
            RunAuthorityChild(childDirectory, caseId, count, absentAt, identityInvalidAt,
                bombVariant, identityVariant, scenarioVariant);
            return;
        }
        var scenario = SelectScenario(caseId, scenarioVariant);
        string root = Lumio.Bomber.Tests.MovementNativeParityFixture.FindGameRoot();
        byte[] catalog = File.ReadAllBytes(Path.Combine(root, "Server/Assets/Maps/official-catalog.json"));
        Lumio.Bomber.Tests.MovementNativeParityFixture.AssertCatalogBytes(catalog);
        string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")
            ?? throw new InvalidOperationException("Selected production Native path is required.");
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
            MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024,
            LogMailboxCapacity = 4096, MaxContexts = 64 };
        string ipc = Path.Combine(Path.GetTempPath(), "lumio-movement-ipc-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(ipc);
        using var server = StartAuthorityChild(ipc, caseId, count, idleAt, absentAt,
            identityInvalidAt, bombVariant, identityVariant, scenarioVariant);
        var ready = JsonSerializer.Deserialize<ServerReady>(
            WaitReadIpc(Path.Combine(ipc, "ready.json"), server, TimeSpan.FromSeconds(30)))!;
        NetEntityId life = NetEntityId.Parse(ready.Life);
        using var transport = new LoopbackTransport();
        string logs = Path.Combine(Path.GetTempPath(), "lumio-movement-native-" + Guid.NewGuid().ToString("N"));
        var firstChance = new List<string>();
        EventHandler<FirstChanceExceptionEventArgs> diagnostics = (_, eventArgs) => {
            lock (firstChance) firstChance.Add(eventArgs.Exception.ToString());
        };
        AppDomain.CurrentDomain.FirstChanceException += diagnostics;
        var logging = new LumioLoggingOptions(logs, LogLevel.Warning, 8, 1, 256);
        var host = ClientHost.Start(native, budget, logging);
        ClientInstance? instance = null;
        try
        {
            var ledger = new ClientLedger(life, ready.WorldIncarnation,
                scenario.SampledControls.Take(count).ToArray(), idleAt, absentAt);
            var options = new ClientInstanceOptions {
                Registry = BomberClientApplication.Registry,
                ConfigDirectory = Path.Combine(root, "Client/Config/Tables"),
                Catalog = catalog,
                Endpoint = new ClientEndpoint(transport.Url, Encoding.UTF8.GetBytes("unit-admission"),
                    ReadOnlyMemory<byte>.Empty, TimeSpan.FromSeconds(5), "fixture-room"),
                InputMapper = new NoSampleMapper(),
                Connections = new WebSocketClientConnectionFactory(host.Engine.Hfsm,
                    new WebSocketTransportOptions(WebSocketTransportOptions.SuccessorMaxMessageBytes,
                        WebSocketTransportOptions.DefaultReceiveBufferBytes,
                        WebSocketTransportOptions.DefaultKeepAliveInterval,
                        requireOperationReceipts: false, requireWorldChangeParts: true, requireSuccessorBinding: true)),
                // Exact bounded preview values from Server/Assets/Maps/bot-voxel-budget.json.
                Voxel = new ClientVoxelOptions {
                    Catalog = catalog, ResidentSectionBudget = 8, ReceiptRetentionEntries = 64,
                    Prediction = new ClientJointPredictionOptions {
                        TotalRetainedPayloadCeiling = 1_048_576, MaxRecords = 32, MaxBlockJournal = 64,
                        MaxBindingJournal = 32, MaxOverlaySlots = 96, MaxValidationSections = 4,
                        MaxValidationCellsPerSection = 64, MaxBindingTextEntries = 32,
                        BindingTextSlotBytes = 64,
                    },
                },
                PredictionSteps = new ClientPredictionStepOptions(ledger.BeforeStep, 5, TimeSpan.FromMilliseconds(250)),
                OutboundObserver = ledger,
                // Production ClientInstanceOptions default for an authenticated WebSocket host;
                // SuccessorAuthorization is still required before Welcome and every data frame.
                AllowWelcomeOnlyAdmission = true,
            };
            instance = BomberClientApplication.CreateInstance(host, options, TestContext.Current.CancellationToken);
            Assert.True(instance.Connect(TestContext.Current.CancellationToken).Succeeded);
            PumpUntil(host, () => transport.Connected);
            transport.Send(Convert.FromBase64String(ready.Authorization));
            transport.Send(Convert.FromBase64String(ready.Welcome));
            PumpUntil(host, () => instance.GetSnapshot().State is ClientSessionState.Synchronizing or ClientSessionState.Faulted);
            Assert.Equal(ClientSessionState.Synchronizing, instance.GetSnapshot().State);
            foreach (string section in ready.Sections) transport.Send(Convert.FromBase64String(section));
            transport.Send(Convert.FromBase64String(ready.Baseline));
            PumpUntil(host, () => instance.GetSnapshot().State is ClientSessionState.Active or ClientSessionState.Faulted);
            Assert.Equal(ClientSessionState.Active, instance.GetSnapshot().State);
            Assert.True(instance.VoxelBaselineReady);
            Assert.True(instance.JointPredictionAttached);
            Assert.True(instance.Session.TryGetReplicaWorld(out var replica));
            Assert.True(replica.InputEnabled);
            WriteIpc(Path.Combine(ipc, "client-loaded-identity.json"), JsonSerializer.Serialize(
                CaptureLoadedIdentity("client", native, replica.Manager.GetType().Assembly,
                    typeof(AbilityComponent).Assembly, typeof(MoveAbility).Assembly,
                    instance.GetType().Assembly, typeof(MovementNativeParityTests).Assembly), EvidenceJsonOptions));
            Lumio.Bomber.Tests.MovementNativeParityFixture.AssertReadback(
                NativeWorldVoxelResources.Require(replica.Manager).Voxel, scenario.Map);
            Assert.Equal(new Vector3(scenario.Start[0] + 0.5f, 1.5f, scenario.Start[1] + 0.5f),
                replica.Manager.ConfirmedWorld.Get<LogicTransform>(life).LocalPosition);
            if (bombVariant is not null)
            {
                NetEntityId bombId = NetEntityId.Parse(ready.Bomb!);
                var bomb = replica.Manager.ConfirmedWorld.Get<BomberBombState>(bombId);
                Assert.Equal(bombVariant == "wrong-owner" ? new NetEntityId(7, 99)
                    : NetEntityId.Parse(ready.Participant), bomb.Owner.Value);
                Assert.Equal(bombVariant == "wrong-source" ? new NetEntityId(7, 98) : life,
                    bomb.SourceLife.Value);
                Assert.Equal(bombVariant == "wrong-generation" ? 2UL : 1UL,
                    bomb.SourceLifeGeneration.Value);
                Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
            }

            // Exercise a real public pump with no due prediction step while the
            // same session and outbound observer are active.
            for (int probe = 0; probe < 16 && ledger.ZeroDuePumps == 0; probe++)
            {
                int prior = ledger.Rows.Count;
                host.Tick();
                if (ledger.Rows.Count == prior) ledger.ZeroDuePumps++;
                ledger.FinalizeAfterHostTick();
            }

            var serverRows = new List<ServerRow>();
            int requestOffset = 0;
            for (int i = 0; i < count; i++)
            {
                int requests = i == absentAt ? 0 : 1 + scenario.SampledControls[i].Actions.Length;
                while (ledger.Rows.Count <= i || ledger.Accepted.Count < requestOffset + requests ||
                    transport.ReceivedCount < requestOffset + requests
                    || !ledger.Rows[i].Certified)
                {
                    Thread.Sleep(1);
                    int priorRows = ledger.Rows.Count;
                    host.Tick();
                    if (ledger.Rows.Count == priorRows) ledger.ZeroDuePumps++;
                    ledger.FinalizeAfterHostTick();
                    if (ledger.WallElapsed > TimeSpan.FromSeconds(12))
                        throw new TimeoutException($"Real Session movement publications did not complete: " +
                            $"index={i} requests={requests} rows={ledger.Rows.Count} accepted={ledger.Accepted.Count} " +
                            $"received={transport.ReceivedCount} row={(ledger.Rows.Count > i ? ledger.Rows[i].Diagnostic : "missing")} " +
                            $"state={instance.GetSnapshot().State} prediction={instance.JointPredictionAttached}.");
                }
                Assert.Equal(requestOffset, ledger.Rows[i].RequestStartOrdinal);
                Assert.Equal(requests, ledger.Rows[i].ExpectedRequests);
                for (int part = 0; part < requests; part++)
                {
                    int ordinal = requestOffset + part;
                    byte[] received = transport.TakeReceived(ordinal);
                    Assert.Equal(i, ledger.Accepted[ordinal].SampleIndex);
                    Assert.Equal(ledger.Accepted[ordinal].ByteLength, received.Length);
                    Assert.Equal(ledger.Accepted[ordinal].Sha256,
                        Convert.ToHexStringLower(SHA256.HashData(received)));
                    Assert.Equal(part, ledger.Accepted[ordinal].RequestPart);
                    WriteIpc(Path.Combine(ipc, $"input-{i}-{part}.json"),
                        JsonSerializer.Serialize(Convert.ToBase64String(received)));
                }
                string output = Path.Combine(ipc, $"output-{i}.json");
                ServerStep step = JsonSerializer.Deserialize<ServerStep>(
                    WaitReadIpc(output, server, TimeSpan.FromSeconds(10)))!;
                serverRows.Add(step.Row);
                if (requests == 0)
                {
                    Assert.Equal("N/A", step.Row.Outcome);
                    Assert.Equal(0UL, step.Row.Sequence);
                    Assert.Equal(0UL, step.Row.ExecutionTick);
                    Assert.Equal(step.Row.BeforeX, step.Row.X);
                    Assert.Equal(step.Row.BeforeZ, step.Row.Z);
                }
                else
                {
                    Assert.Equal(ledger.Accepted[requestOffset].Sequence, step.Row.Sequence);
                    Assert.Equal(life.ToHex(), step.Row.Sender);
                    if (i == identityInvalidAt)
                    {
                        Assert.Equal(OperationOutcomeKind.BusinessReject.ToString(), step.Row.Outcome);
                        Assert.Equal(step.Row.BeforeX, step.Row.X);
                        Assert.Equal(step.Row.BeforeZ, step.Row.Z);
                        Assert.Equal(0UL, step.Row.Memory.LastMoveTick);
                    }
                    else Assert.Equal(OperationOutcomeKind.Succeeded.ToString(), step.Row.Outcome);
                }
                Assert.Equal(requests, step.Operations.Length);
                Assert.Equal(requests, step.DecodedInputs.Length);
                if (i == identityInvalidAt)
                    AssertInvalidIdentitySnapshot(identityVariant ?? "current-life", step.Identity,
                        life, ready.Participant);
                if (bombVariant is not null)
                {
                    Assert.NotNull(step.Bomb);
                    Assert.Equal(bombVariant == "wrong-owner" ? new NetEntityId(7, 99).ToHex() : ready.Participant,
                        step.Bomb.Owner);
                    Assert.Equal(bombVariant == "wrong-source" ? new NetEntityId(7, 98).ToHex() : life.ToHex(),
                        step.Bomb.SourceLife);
                    Assert.Equal(bombVariant == "wrong-generation" ? 2UL : 1UL,
                        step.Bomb.SourceLifeGeneration);
                    Assert.Equal("Fuse", step.Bomb.Phase);
                    Assert.Equal(bombVariant == "kicked-start" ? 1UL : 0UL, step.Bomb.KickStartTick);
                    Assert.Equal(0, step.Bomb.KickDirection);
                    if (bombVariant == "own")
                        Assert.InRange(step.Row.X - step.Row.BeforeX, 0.17499f, 0.17501f);
                    else
                    {
                        Assert.Equal(step.Row.BeforeX, step.Row.X);
                        Assert.True(step.Row.Memory.LastMoveTick > 0);
                    }
                }
                for (int part = 0; part < requests; part++)
                {
                    Assert.Equal(ledger.Accepted[requestOffset + part].Sequence, step.Operations[part].Sequence);
                    Assert.Equal(ledger.Accepted[requestOffset + part].MappingId, step.Operations[part].MappingId);
                    Assert.Equal(ledger.Accepted[requestOffset + part].Sequence, step.DecodedInputs[part].Sequence);
                    Assert.Equal(ledger.Accepted[requestOffset + part].Sender, step.DecodedInputs[part].Sender);
                    Assert.Equal(LoopbackTransport.ConnectionId, step.DecodedInputs[part].Connection);
                    Assert.Equal(ledger.Rows[i].ConnectionGeneration, step.DecodedInputs[part].ConnectionGeneration);
                    Assert.Equal(ready.WorldIncarnation, step.DecodedInputs[part].WorldIncarnation);
                    Assert.Equal(ledger.Accepted[requestOffset + part].Sha256, step.DecodedInputs[part].Sha256);
                    if (i == identityInvalidAt)
                    {
                        Assert.Equal(OperationOutcomeKind.BusinessReject.ToString(), step.Operations[part].Outcome);
                        Assert.Equal("move_source_invalid", step.Operations[part].Code);
                        Assert.Equal(OperationCommitFact.NotApplied.ToString(), step.Operations[part].CommitFact);
                    }
                    else Assert.Equal(OperationOutcomeKind.Succeeded.ToString(), step.Operations[part].Outcome);
                }
                File.WriteAllText(Path.Combine(ipc, $"pair-{i}.json"), JsonSerializer.Serialize(new {
                    caseId, sampleIndex = i, clientWorldIncarnation = ledger.Rows[i].WorldIncarnation,
                    authorityWorldIncarnation = ready.WorldIncarnation,
                    clientPose = new[] { ledger.Rows[i].Pose.X,
                        ledger.Rows[i].Pose.Y, ledger.Rows[i].Pose.Z },
                    ledger.Rows[i].PredictionExecutionTick, ledger.Rows[i].PredictionInputSequence,
                    ledger.Rows[i].Memory, ledger.Rows[i].OwnerStamp,
                    ledger.Rows[i].BoundaryPredictedTick, ledger.Rows[i].BoundaryConfirmedTick,
                    acceptedRequests = ledger.Rows[i].Requests, server = step.Row,
                    bomb = step.Bomb, identity = step.Identity,
                }, EvidenceJsonOptions));
                if (i != identityInvalidAt)
                    Assert.InRange(Vector3.Distance(ledger.Rows[i].Pose,
                        new Vector3(step.Row.X, step.Row.Y, step.Row.Z)), 0, 0.00001f);
                if (i == idleAt)
                {
                    if (caseId == "P6" || caseId == "P9" && idleAt == 8)
                    {
                        Assert.InRange(step.Row.X - step.Row.BeforeX, 0.17499f, 0.17501f);
                        Assert.Equal(serverRows[i - 1].Memory.PendingTurnDirection,
                            step.Row.Memory.PendingTurnDirection);
                    }
                    else Assert.Equal(step.Row.BeforeX, step.Row.X);
                    Assert.True(step.Row.Memory.LastMoveTick > serverRows[i - 1].Memory.LastMoveTick);
                }
                if (i == absentAt)
                {
                    Assert.Equal(serverRows[i - 1].Memory.LastMoveTick, step.Row.Memory.LastMoveTick);
                    Assert.Null(ledger.Rows[i].PredictionExecutionTick);
                    Assert.Null(ledger.Rows[i].PredictionInputSequence);
                    Assert.True(ledger.Rows[i].LocalStepOrdinal > ledger.Rows[i - 1].LocalStepOrdinal);
                }
                foreach (string frame in step.Frames) transport.Send(Convert.FromBase64String(frame));
                host.Tick();
                File.WriteAllText(Path.Combine(ipc, $"client-after-{i}.json"), JsonSerializer.Serialize(new {
                    session = instance.GetSnapshot().State.ToString(),
                    prediction = instance.JointPredictionReport,
                    rows = ledger.Rows.Count, accepted = ledger.Accepted.Count,
                }));
                Assert.NotEqual(ClientSessionState.Faulted, instance.GetSnapshot().State);
                requestOffset += requests;
            }
            Assert.Equal(count, ledger.Rows.Count);
            Assert.Equal(requestOffset, ledger.Accepted.Count);
            Assert.All(ledger.Rows, row => Assert.True(row.Certified, row.Diagnostic));
            if (caseId == "P6" && (idleAt == 2 || absentAt == 2))
            {
                Assert.NotEqual(0, serverRows[1].Memory.PendingTurnDirection);
                Assert.True(serverRows[1].Memory.PendingTurnUntilTick > serverRows[1].Memory.LastMoveTick);
                if (absentAt == 2)
                {
                    Assert.Equal(serverRows[1].Memory.LastMoveTick, serverRows[2].Memory.LastMoveTick);
                    Assert.Equal(serverRows[1].X, serverRows[2].X);
                    Assert.Equal("ClockAdvance", ledger.Rows[2].OwnerStamp?.Cause);
                }
                Assert.True(serverRows[3].Memory.LastMoveTick > serverRows[2].Memory.LastMoveTick);
                Assert.Equal(serverRows[1].Memory.PendingTurnUntilTick,
                    serverRows[6].Memory.PendingTurnUntilTick);
                Assert.Equal(0, serverRows[7].Memory.PendingTurnDirection);
                Assert.Equal(0UL, serverRows[7].Memory.PendingTurnUntilTick);
                Assert.True(serverRows[7].ExecutionTick > serverRows[1].Memory.PendingTurnUntilTick);
            }
            if (caseId == "P9" && (idleAt == 11 || absentAt == 11))
            {
                Assert.True(serverRows[10].Memory.LastAssistTick > 0);
                Assert.Equal(500, serverRows[10].Memory.AssistToleranceMilli);
                Assert.Equal(serverRows[10].Memory.Facing, serverRows[11].Memory.Facing);
                Assert.Equal(serverRows[10].X, serverRows[11].X);
                Assert.Equal(serverRows[10].Z, serverRows[11].Z);
                if (idleAt == 11)
                    Assert.True(serverRows[11].Memory.LastMoveTick > serverRows[10].Memory.LastMoveTick);
                else Assert.Equal(serverRows[10].Memory.LastMoveTick, serverRows[11].Memory.LastMoveTick);
            }
            if (caseId == "P9")
            {
                ClientRow first = ledger.Rows[0];
                Assert.Equal(2, first.ExpectedRequests);
                Assert.Equal(1UL, first.Requests[0].Sequence);
                Assert.Equal(2UL, first.Requests[1].Sequence);
                Assert.Equal(2UL, first.OwnerStamp?.InputSequence);
                Assert.Equal(first.LocalStepOrdinal, first.OwnerStamp?.LocalStepOrdinal);
                Assert.True(ledger.ZeroDuePumps > 0);
                Assert.Equal(first.LocalStepOrdinal, ledger.Rows[1].BeforeActivationStamp?.LocalStepOrdinal);
                Assert.NotEqual(ledger.Rows[1].LocalStepOrdinal,
                    ledger.Rows[1].BeforeActivationStamp?.LocalStepOrdinal);
            }
            var result = JsonSerializer.Deserialize<ServerResult>(
                WaitReadIpc(Path.Combine(ipc, "result.json"), server, TimeSpan.FromSeconds(10)))!;
            Assert.Equal(count, result.Rows.Length);
            bool originalPrototypeTrace = scenarioVariant is null && idleAt < 0 && absentAt < 0 &&
                identityInvalidAt < 0 && bombVariant is null;
            var frozenDocument = Lumio.Bomber.Tests.MovementNativeParityFixture.Load();
            var policyPrototype = scenarioVariant is null ? null :
                frozenDocument.PolicyVariants.Single(row => row.Id == scenarioVariant);
            if (policyPrototype is not null)
            {
                Assert.Equal(caseId, policyPrototype.SourceCaseId);
                Assert.Equal(scenario.Start, policyPrototype.Start);
                Assert.Equal(scenario.Map.Ground, policyPrototype.Map.Ground);
                Assert.Equal(scenario.Map.Obstacle, policyPrototype.Map.Obstacle);
                Assert.Equal(JsonSerializer.Serialize(scenario.SampledControls.Take(count)),
                    JsonSerializer.Serialize(policyPrototype.SampledControls));
            }
            bool waterPolicyDiverged = false;
            double prototypeTolerance = frozenDocument.ConfigRequirements.EqualPolicyPrototypeToleranceMetres;
            for (int i = 0; i < count; i++)
            {
                int firstRequest = i + (caseId == "P9" && i > 0 ? 1 : 0)
                    - (absentAt >= 0 && i > absentAt ? 1 : 0);
                if (i == absentAt) Assert.Equal("N/A", result.Rows[i].Outcome);
                else
                {
                    Assert.Equal(ledger.Accepted[firstRequest].Sequence, result.Rows[i].Sequence);
                    Assert.Equal(life.ToHex(), result.Rows[i].Sender);
                    if (i == identityInvalidAt)
                        Assert.Equal(OperationOutcomeKind.BusinessReject.ToString(), result.Rows[i].Outcome);
                    else Assert.Equal(OperationOutcomeKind.Succeeded.ToString(), result.Rows[i].Outcome);
                }
                if (i != identityInvalidAt)
                    Assert.InRange(Vector3.Distance(ledger.Rows[i].Pose,
                        new Vector3(result.Rows[i].X, result.Rows[i].Y, result.Rows[i].Z)), 0, 0.00001f);
                if (originalPrototypeTrace || policyPrototype is not null)
                {
                    int[][] prototypeTrace = policyPrototype?.PrototypePositionsMilli
                        ?? scenario.PrototypePositionsMilli;
                    int[] prototype = prototypeTrace[i];
                    if (caseId == "P10" && scenarioVariant is null && i == 2)
                    {
                        Assert.Equal("floor", scenario.Map.Ground[1 * scenario.Map.Size + 1]);
                        Assert.Equal("water", scenario.Map.Ground[1 * scenario.Map.Size + 2]);
                        Assert.True(result.Rows[i].BeforeX < 2 && result.Rows[i].X >= 2);
                        Assert.Equal(175, prototype[0] - prototypeTrace[i - 1][0]);
                        Assert.InRange(result.Rows[i].X - result.Rows[i].BeforeX, 0.16749f, 0.16751f);
                        waterPolicyDiverged = true;
                    }
                    if (scenarioVariant == "water-exit" && !waterPolicyDiverged &&
                        result.Rows[i].BeforeX >= 2 && result.Rows[i].X < 2)
                    {
                        Assert.Equal("water", scenario.Map.Ground[1 * scenario.Map.Size + 2]);
                        Assert.Equal("floor", scenario.Map.Ground[1 * scenario.Map.Size + 1]);
                        waterPolicyDiverged = true;
                    }
                    double deltaX = result.Rows[i].X - prototype[0] / 1000d;
                    double deltaZ = result.Rows[i].Z - prototype[1] / 1000d;
                    double distance = Math.Sqrt(deltaX * deltaX + deltaZ * deltaZ);
                    File.WriteAllText(Path.Combine(ipc, $"prototype-comparison-{i}.json"),
                        JsonSerializer.Serialize(new { caseId, stepIndex = i,
                            formal = new[] { result.Rows[i].X, result.Rows[i].Z },
                            prototypeMilli = prototype, distanceMetres = distance,
                            toleranceMetres = prototypeTolerance,
                            scenarioVariant, eligibility = waterPolicyDiverged
                                ? "water-crossing-policy-delta-or-descendant"
                                : "equal-policy" }, EvidenceJsonOptions));
                    if (!waterPolicyDiverged)
                        Assert.True(distance <= prototypeTolerance,
                            $"Formal/prototype pose drift {caseId} step {i}: {distance:R}m > {prototypeTolerance:R}m");
                }
            }
            if (caseId == "P9" && (idleAt == 8 || absentAt == 8))
            {
                ServerRow beforeRelease = serverRows[7];
                ServerRow release = serverRows[8];
                ulong releaseBusinessTick = release.BeforeWorldTick;
                Assert.Equal(beforeRelease.X, release.BeforeX);
                Assert.Equal(beforeRelease.Z, release.BeforeZ);
                Assert.NotEqual(0, beforeRelease.Memory.PendingTurnDirection);
                Assert.True(beforeRelease.Memory.PendingTurnUntilTick > releaseBusinessTick);
                Assert.Equal(releaseBusinessTick - 1, beforeRelease.Memory.LastMoveTick);
                Assert.Equal(releaseBusinessTick + 1, release.WorldTick);
                if (idleAt == 8)
                {
                    Assert.Equal(releaseBusinessTick, release.Memory.LastMoveTick);
                    Assert.Equal(release.WorldTick, release.ExecutionTick);
                }
                else Assert.Equal(0UL, release.ExecutionTick);
                Assert.NotEqual(0, beforeRelease.Memory.LastMoveDirection);
                Assert.Equal(0UL, beforeRelease.Memory.LastAssistTick);
                float remainingCorrectionBefore = Math.Abs(beforeRelease.X -
                    (MathF.Floor(beforeRelease.X) + 0.5f));
                float remainingCorrectionAfter = Math.Abs(release.X -
                    (MathF.Floor(release.X) + 0.5f));
                Assert.InRange(remainingCorrectionBefore, 0.0001f, 0.5f);
                Assert.InRange(remainingCorrectionAfter, 0.0001f, 0.5f);
                Assert.Equal(beforeRelease.Memory.PendingTurnDirection,
                    release.Memory.PendingTurnDirection);
                if (idleAt == 8)
                {
                    Assert.InRange(release.X - release.BeforeX, 0.17499f, 0.17501f);
                    Assert.Equal(beforeRelease.Memory.LastMoveDirection,
                        release.Memory.LastMoveDirection);
                }
                else
                {
                    Assert.Equal(release.BeforeX, release.X);
                    Assert.Equal(release.BeforeZ, release.Z);
                    Assert.Equal(beforeRelease.Memory.LastMoveTick, release.Memory.LastMoveTick);
                }
                Assert.Equal(0, serverRows[9].Memory.PendingTurnDirection);
                Assert.Equal(0UL, serverRows[9].Memory.PendingTurnUntilTick);
            }
            if (caseId == "P5" && count >= 5 && scenarioVariant is null)
                Assert.InRange(result.Rows[4].X - 1.5f, 0.87499f, 0.87501f);
            if (caseId == "P10" && count == 5 && scenarioVariant is null)
            {
                Assert.InRange(serverRows[0].X - serverRows[0].BeforeX, 0.17499f, 0.17501f);
                Assert.True(serverRows[2].BeforeX < 2 && serverRows[2].X >= 2);
                Assert.InRange(serverRows[3].X - serverRows[3].BeforeX, 0.12249f, 0.12251f);
            }
            if (scenarioVariant == "water-start")
                Assert.InRange(serverRows[0].X - serverRows[0].BeforeX, 0.12249f, 0.12251f);
            if (scenarioVariant is "water-exit" or "water-exit-control")
            {
                int exit = serverRows.FindIndex(row => row.BeforeX >= 2 && row.X < 2);
                Assert.InRange(exit, 1, count - 2);
                float nextDisplacement = serverRows[exit + 1].BeforeX - serverRows[exit + 1].X;
                if (scenarioVariant == "water-exit")
                    Assert.InRange(nextDisplacement, 0.17499f, 0.17501f);
                else Assert.InRange(nextDisplacement, 0.12249f, 0.12251f);
            }
            if (scenarioVariant?.StartsWith("danger-", StringComparison.Ordinal) == true)
            {
                Assert.InRange(serverRows[0].X, 1.67499f, 1.67501f);
                Assert.InRange(serverRows[1].X, 1.84999f, 1.85001f);
                BombRow hazard = result.Steps[2].Bomb!;
                Assert.Equal("Fuse", hazard.Phase);
                Assert.Equal(3, hazard.CellX);
                Assert.Equal(1, hazard.CellZ);
                Assert.Equal(scenarioVariant == "danger-already-start" ? 2 : 1, hazard.Power);
                Assert.Equal(8UL, hazard.DangerWindowTicks);
                Assert.True(hazard.FuseEndTick > result.Steps[2].Row.ExecutionTick);
                Assert.True(hazard.FuseEndTick - result.Steps[2].Row.ExecutionTick <= hazard.DangerWindowTicks);
                Assert.Equal("floor", scenario.Map.Ground[1 * scenario.Map.Size + 1]);
                Assert.Equal("floor", scenario.Map.Ground[1 * scenario.Map.Size + 2]);
                Assert.Equal("air", scenario.Map.Obstacle[1 * scenario.Map.Size + 2]);
                int[] prototypeFinal = Assert.Single(frozenDocument.PolicyVariants,
                    row => row.Id == scenarioVariant).PrototypePositionsMilli[2];
                if (scenarioVariant == "danger-safe-fallback")
                {
                    Assert.Equal(serverRows[2].BeforeX, serverRows[2].X);
                    Assert.Equal(serverRows[2].BeforeZ, serverRows[2].Z);
                    Assert.Equal(1850, prototypeFinal[0]);
                    Assert.Equal(1500, prototypeFinal[1]);
                }
                else
                {
                    Assert.InRange(serverRows[2].X - serverRows[2].BeforeX, 0.17499f, 0.17501f);
                    Assert.Equal(serverRows[2].BeforeZ, serverRows[2].Z);
                    Assert.Equal(2025, prototypeFinal[0]);
                    Assert.Equal(1500, prototypeFinal[1]);
                }
            }
            using Process process = Process.GetCurrentProcess();
            string actualNative = Assert.Single(process.Modules.Cast<ProcessModule>(),
                module => module.ModuleName == Path.GetFileName(native)).FileName;
            Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(native))),
                Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(actualNative))));
            Assert.True(server.WaitForExit(10000), "Authority child did not exit after its actual steps.");
            Assert.Equal(0, server.ExitCode);
            string variant = scenarioVariant is not null ? "-" + scenarioVariant
                : idleAt >= 0 ? "-idle" : absentAt >= 0 ? "-absent"
                : identityInvalidAt >= 0 ? "-" + (identityVariant ?? "stale-life")
                : bombVariant is null ? "" : "-" + bombVariant;
            WriteEvidence(caseId + "-" + count + variant, new { status = "ACTUAL_HOST_SESSION_AUTHORITY", caseId, count,
                idleAt, absentAt, identityInvalidAt, identityVariant, bombVariant, scenarioVariant,
                ledger.ZeroDuePumps,
                clientNativePath = actualNative,
                authorityWorldIncarnation = ready.WorldIncarnation,
                clientRows = ledger.Rows, accepted = ledger.Accepted,
                authorityRows = result.Rows, serverNativePath = result.ActualNative,
                result.NativeSha256, serverSteps = result.Steps });
        }
        finally
        {
            AppDomain.CurrentDomain.FirstChanceException -= diagnostics;
            File.WriteAllLines(Path.Combine(ipc, "client-first-chance.txt"), firstChance);
            if (instance is not null)
            {
                Task closing = host.CloseAsync(TestContext.Current.CancellationToken);
                var start = Stopwatch.StartNew();
                while (!closing.IsCompleted && start.Elapsed < TimeSpan.FromSeconds(10)) { host.Tick(); Thread.Sleep(1); }
                Assert.True(closing.IsCompleted, "ClientHost did not close within the original ten-second bound.");
                await closing;
            }
            if (!server.HasExited)
            {
                server.Kill(entireProcessTree: true);
                server.WaitForExit(10000);
            }
            File.WriteAllText(Path.Combine(ipc, "child-exit.json"), JsonSerializer.Serialize(new {
                pid = server.Id, exited = server.HasExited,
                exitCode = server.HasExited ? server.ExitCode : (int?)null,
                reason = File.Exists(Path.Combine(ipc, "result.json")) ? "completed" : "test_failure_owned_cleanup",
            }, EvidenceJsonOptions));
            string? evidencePath = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_EVIDENCE_PATH");
            if (evidencePath is not null && Directory.Exists(evidencePath))
            {
                string archived = Path.Combine(evidencePath, Path.GetFileName(ipc));
                Directory.CreateDirectory(archived);
                foreach (string file in Directory.GetFiles(ipc))
                    File.Copy(file, Path.Combine(archived, Path.GetFileName(file)));
            }
        }
    }

    private static Lumio.Bomber.Tests.MovementNativeParityFixture.Case SelectScenario(
        string caseId, string? variant)
    {
        var fixture = Lumio.Bomber.Tests.MovementNativeParityFixture.Load();
        var source = fixture.Cases.Single(row => row.Id == caseId);
        if (variant is null) return source;
        Assert.True(variant is "water-start" or "water-exit" or "water-exit-control"
            or "danger-safe-fallback" or "danger-already-start" or "danger-direct");
        var ground = source.Map.Ground.ToArray();
        int[] start = source.Start.ToArray();
        var controls = source.SampledControls;
        if (variant.StartsWith("danger-", StringComparison.Ordinal))
        {
            Assert.Equal("P5", caseId);
            controls = source.SampledControls.Select((sample, index) => index == 2 &&
                (variant is "danger-safe-fallback" or "danger-already-start")
                ? new Lumio.Bomber.Tests.MovementNativeParityFixture.Sample {
                    StepIndex = sample.StepIndex, SourceTickBefore = sample.SourceTickBefore,
                    SourceTickAfter = sample.SourceTickAfter, EventIds = sample.EventIds,
                    Move = new Lumio.Bomber.Tests.MovementNativeParityFixture.Move {
                        Kind = "typed", Primary = "up", Secondary = "right", TurnPressed = true,
                    }, Actions = sample.Actions,
                } : sample).ToArray();
        }
        else if (variant == "water-start") ground[1 * source.Map.Size + 1] = "water";
        else
        {
            Assert.Equal("P10", caseId);
            start = [2, 1];
            controls = fixture.Cases.Single(row => row.Id == "P2").SampledControls;
            if (variant == "water-exit-control") ground[1 * source.Map.Size + 1] = "water";
        }
        return new Lumio.Bomber.Tests.MovementNativeParityFixture.Case {
            Id = source.Id, Start = start, Goal = source.Goal.ToArray(),
            Map = new Lumio.Bomber.Tests.MovementNativeParityFixture.Map {
                Size = source.Map.Size, Ground = ground, Obstacle = source.Map.Obstacle.ToArray(),
            },
            SampledControls = controls,
        };
    }

    private static void PumpUntil(ClientHost host, Func<bool> done)
    {
        var start = Stopwatch.StartNew();
        while (!done())
        {
            host.Tick();
            if (start.Elapsed > TimeSpan.FromSeconds(10)) throw new TimeoutException("Public ClientHost state did not advance.");
            Thread.Sleep(1);
        }
    }

    private static Process StartAuthorityChild(string directory, string caseId, int count,
        int idleAt, int absentAt, int identityInvalidAt, string? bombVariant,
        string? identityVariant, string? scenarioVariant)
    {
        var start = new ProcessStartInfo(Path.ChangeExtension(typeof(MovementNativeParityTests).Assembly.Location, ".exe")) {
            WorkingDirectory = Environment.CurrentDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        start.ArgumentList.Add("--filter-method");
        string method = caseId == "P9" && idleAt == 8 ? nameof(ReleaseWithEffectivePendingCarryContinuesOnTypedIdle)
            : caseId == "P9" && absentAt == 8 ? nameof(ReleaseWithEffectivePendingCarryStopsOnAbsentMove)
            : caseId == "P9" && idleAt == 11 ? nameof(ReleaseAfterAcceptedAssistUsesTypedIdleMemory)
            : caseId == "P9" && absentAt == 11 ? nameof(ReleaseAfterAcceptedAssistWithoutMoveKeepsPriorMemory)
            : scenarioVariant == "danger-safe-fallback" ? nameof(SafeStartRefusesDangerousFallback)
            : scenarioVariant == "danger-already-start" ? nameof(AlreadyDangerousStartMayUseFallback)
            : scenarioVariant == "danger-direct" ? nameof(DirectInputUsesSameTimedDangerAsControl)
            : scenarioVariant == "water-start" ? nameof(WetInitialCellUsesWaterSpeedFromSameP10Start)
            : scenarioVariant == "water-exit" ? nameof(WaterToDryBoundaryUsesRemainingTimeInCrossedCell)
            : scenarioVariant == "water-exit-control" ? nameof(FullyWaterControlFromSameExitStartRemainsAtWaterSpeed)
            : caseId == "P10" && count == 5 ? nameof(P10DryToWaterBoundaryUsesCrossedCellSpeed)
            : caseId == "P6" && absentAt == 2 ? nameof(BlockedPendingTurnExpiresAcrossAbsentMove)
            : caseId == "P6" && idleAt == 2 ? nameof(BlockedPendingTurnContinuesOnTypedIdle)
            : absentAt >= 0 ? nameof(AbsentMoveAdvancesActualStepWithoutMoveAdmission)
            : idleAt >= 0 ? nameof(TypedIdleAdvancesActualMoveMemoryWithoutPosition)
            : identityVariant == "zero-player-generation" ? nameof(ZeroPlayerGenerationIsRejectedByActualAuthority)
            : identityVariant == "mismatched-player-generation" ? nameof(MismatchedPlayerGenerationIsRejectedByActualAuthority)
            : identityVariant == "zero-participant-generation" ? nameof(ZeroParticipantGenerationIsRejectedByActualAuthority)
            : identityVariant == "mismatched-participant-generation" ? nameof(MismatchedParticipantGenerationIsRejectedByActualAuthority)
            : identityVariant == "mismatched-participant-match" ? nameof(MismatchedParticipantMatchIsRejectedByActualAuthority)
            : identityInvalidAt >= 0 ? nameof(StaleClientLifeIsRejectedByActualAuthority)
            : bombVariant == "own" ? nameof(CurrentLifeCanExitItsOwnFuseBomb)
            : bombVariant == "wrong-generation" ? nameof(WrongSourceGenerationDeniesOwnBombExit)
            : bombVariant == "wrong-owner" ? nameof(WrongOwnerDeniesOwnBombExit)
            : bombVariant == "wrong-source" ? nameof(WrongSourceLifeDeniesOwnBombExit)
            : bombVariant == "kicked-start" ? nameof(KickStartDeniesOwnBombExit)
            : caseId == "P5" && count == 5
                ? nameof(P5DrySampledMovesUseTypedHostSessionAuthenticatedBytesAndDeferredNativeAuthority)
                : caseId + "SharedInputParity";
        start.ArgumentList.Add(typeof(MovementNativeParityTests).FullName + "." + method);
        start.ArgumentList.Add("--minimum-expected-tests");
        start.ArgumentList.Add("1");
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_CHILD"] = directory;
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_COUNT"] = count.ToString(System.Globalization.CultureInfo.InvariantCulture);
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_IDLE_AT"] = idleAt.ToString(System.Globalization.CultureInfo.InvariantCulture);
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_ABSENT_AT"] = absentAt.ToString(System.Globalization.CultureInfo.InvariantCulture);
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_IDENTITY_INVALID_AT"] =
            identityInvalidAt.ToString(System.Globalization.CultureInfo.InvariantCulture);
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_IDENTITY_VARIANT"] = identityVariant ?? "current-life";
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_SCENARIO_VARIANT"] = scenarioVariant ?? "none";
        start.Environment["MOVEMENT_NATIVE_AUTHORITY_BOMB_VARIANT"] = bombVariant ?? "none";
        Process child = Process.Start(start)!;
        File.WriteAllText(Path.Combine(directory, "child-process.json"), JsonSerializer.Serialize(new {
            pid = child.Id, startUtc = child.StartTime.ToUniversalTime(), executable = start.FileName,
            path = directory, command = start.FileName + " " + string.Join(' ', start.ArgumentList),
        }, EvidenceJsonOptions));
        _ = Task.Run(async () => File.WriteAllText(Path.Combine(directory, "child.stdout.txt"),
            await child.StandardOutput.ReadToEndAsync()));
        _ = Task.Run(async () => File.WriteAllText(Path.Combine(directory, "child.stderr.txt"),
            await child.StandardError.ReadToEndAsync()));
        return child;
    }

    private static bool IsSharingViolation(IOException error) =>
        (uint)error.HResult is 0x80070020u or 0x80070021u;

    [Fact]
    public async Task IpcReadRetriesRealFileLockAndRejectsOtherIoErrors()
    {
        string missing = Path.Combine(Path.GetTempPath(), "movement-ipc-missing-" + Guid.NewGuid().ToString("N"));
        IOException nonSharing = Assert.Throws<FileNotFoundException>(() => File.ReadAllText(missing));
        Assert.False(IsSharingViolation(nonSharing));
        Assert.False(IsSharingViolation(new PathTooLongException("long path")));
        string directory = Path.Combine(Path.GetTempPath(), "movement-ipc-lock-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, "locked.json");
        File.WriteAllText(path, "actual-file-lock");
        using var child = Process.GetCurrentProcess();
        try
        {
            using (var held = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            {
                var release = Task.Run(async () => {
                    await Task.Delay(30, TestContext.Current.CancellationToken);
                    held.Dispose();
                }, TestContext.Current.CancellationToken);
                Assert.Equal("actual-file-lock", WaitReadIpc(path, child, TimeSpan.FromSeconds(1)));
                await release;
            }
            Assert.True(File.Exists(path + ".read-retries.jsonl"));
            Assert.NotEmpty(File.ReadAllLines(path + ".read-retries.jsonl"));
            string? evidencePath = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_EVIDENCE_PATH");
            if (evidencePath is not null)
            {
                Directory.CreateDirectory(evidencePath);
                File.Copy(path + ".read-retries.jsonl",
                    Path.Combine(evidencePath, "real-file-lock-read-retries-" + Path.GetFileName(directory) + ".jsonl"));
            }
        }
        finally { Directory.Delete(directory, recursive: true); }
    }

    private static string WaitReadIpc(string path, Process child, TimeSpan limit)
    {
        var wall = Stopwatch.StartNew();
        TimeSpan retryDeadline = limit < TimeSpan.FromSeconds(12) ? limit : TimeSpan.FromSeconds(12);
        int sharingRetries = 0;
        int? firstSharingHResult = null;
        while (true)
        {
            if (File.Exists(path))
            {
                try { return File.ReadAllText(path); }
                catch (IOException error) when (IsSharingViolation(error) && wall.Elapsed < retryDeadline)
                {
                    firstSharingHResult ??= error.HResult;
                    sharingRetries++;
                    File.AppendAllText(path + ".read-retries.jsonl", JsonSerializer.Serialize(new {
                        path, retryCount = sharingRetries, firstHResult = firstSharingHResult,
                        hResult = error.HResult, elapsedMs = wall.ElapsedMilliseconds,
                        callerDeadlineMs = limit.TotalMilliseconds,
                        retryDeadlineMs = retryDeadline.TotalMilliseconds,
                    }) + Environment.NewLine);
                }
            }
            if (child.HasExited && !File.Exists(path))
                throw new InvalidOperationException($"Authority child exited {child.ExitCode} before {Path.GetFileName(path)}.");
            if (wall.Elapsed > limit) throw new TimeoutException("Authority child IPC deadline: " + Path.GetFileName(path));
            Thread.Sleep(2);
        }
    }

    private static void WriteIpc(string path, string value)
    {
        string staging = path + ".partial";
        File.WriteAllText(staging, value);
        File.Move(staging, path);
    }

    private static void RunAuthorityChild(string directory, string caseId, int count,
        int absentAt, int identityInvalidAt, string? bombVariant, string? identityVariant,
        string? scenarioVariant)
    {
        Assert.Equal(count.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_AUTHORITY_COUNT"));
        var scenario = SelectScenario(caseId, scenarioVariant);
        string root = Lumio.Bomber.Tests.MovementNativeParityFixture.FindGameRoot();
        byte[] catalog = File.ReadAllBytes(Path.Combine(root, "Server/Assets/Maps/official-catalog.json"));
        Lumio.Bomber.Tests.MovementNativeParityFixture.AssertCatalogBytes(catalog);
        string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")!;
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
            MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024,
            LogMailboxCapacity = 4096, MaxContexts = 64 };
        using var authority = new Authority(root, native, budget, catalog, scenario,
            bombVariant, scenarioVariant);
        WriteIpc(Path.Combine(directory, "server-config-reader.json"),
            JsonSerializer.Serialize(authority.ConfigEvidence, EvidenceJsonOptions));
        WriteIpc(Path.Combine(directory, "authority-loaded-identity.json"), JsonSerializer.Serialize(
            CaptureLoadedIdentity("authority", native, authority.Manager.GetType().Assembly,
                typeof(AbilityComponent).Assembly, authority.ServerGameplayAssembly,
                typeof(MovementNativeParityTests).Assembly), EvidenceJsonOptions));
        var authorization = new SuccessorAuthorization("SuccessorAuthorization", "initial",
            WebSocketTransportOptions.SuccessorBindingPartsSubProtocol, new NetEntityId(7, 90).ToHex(),
            LoopbackTransport.ConnectionId, "1", "1", 7, authority.Manager.WorldIncarnation.ToHex(),
            authority.Participant.ToHex(), "1", null,
            new AttachmentRecord(authority.Participant.ToHex(), authority.Life.ToHex(),
                authority.Life.ToHex(), 1, "controlled"), "999");
        var authorizationBuffer = new byte[4096];
        Assert.True(WireCodec.TryWriteSuccessorAuthorization(in authorization,
            WebSocketTransportOptions.SuccessorBindingPartsSubProtocol, authorizationBuffer, out int authLength));
        var grouped = JsonNode.Parse(WireCodec.EncodePack(authority.Baseline, WireProfile.SuccessorBindingPartsV1))!;
        grouped["sectionGroup"] = new JsonObject {
            ["sent"] = new JsonArray(authority.Sections.Select(section => (JsonNode)new JsonObject {
                ["sectionKey"] = $"s:{section.Key.X}:{section.Key.Y}:{section.Key.Z}",
                ["sectionRevision"] = section.Revision }).ToArray()),
            ["deferred"] = new JsonArray(),
        };
        var ready = new ServerReady(authority.Life.ToHex(), authority.Participant.ToHex(),
            authority.Bomb.IsDefault ? null : authority.Bomb.ToHex(),
            authority.Manager.WorldIncarnation.ToHex(),
            Convert.ToBase64String(authorizationBuffer.AsSpan(0, authLength)),
            Convert.ToBase64String(WireCodec.EncodePack(new WelcomeMessage(authority.Life.InstanceId,
                authority.Life, 1) { ControlledLife = authority.Life,
                ControlMode = AttachmentControlMode.Controlled }, WireProfile.SuccessorBindingPartsV1)),
            Convert.ToBase64String(Encoding.UTF8.GetBytes(grouped.ToJsonString())),
            authority.Sections.Select(section => Convert.ToBase64String(SectionFrame(authority.Baseline.Tick, section))).ToArray());
        WriteIpc(Path.Combine(directory, "ready.json"), JsonSerializer.Serialize(ready));
        var rows = new List<ServerRow>();
        var steps = new List<ServerStep>();
        for (int i = 0; i < count; i++)
        {
            if (i == identityInvalidAt) authority.InvalidateIdentity(identityVariant ?? "current-life");
            int requests = i == absentAt ? 0 : 1 + scenario.SampledControls[i].Actions.Length;
            var inputs = new List<InputCommandMessage>();
            var encodedInputs = new List<byte[]>();
            IdentityRow identity = authority.Identity;
            Vector3 before = authority.Position;
            ulong beforeWorldTick = authority.Manager.World.Tick;
            for (int part = 0; part < requests; part++)
            {
                string inputPath = Path.Combine(directory, $"input-{i}-{part}.json");
                var wall = Stopwatch.StartNew();
                string? encodedText = null;
                int sharingRetries = 0;
                int? firstSharingHResult = null;
                while (encodedText is null)
                {
                    if (File.Exists(inputPath))
                    {
                        try { encodedText = File.ReadAllText(inputPath); }
                        catch (IOException error) when (IsSharingViolation(error) &&
                            wall.Elapsed < TimeSpan.FromSeconds(12))
                        {
                            firstSharingHResult ??= error.HResult;
                            sharingRetries++;
                            WriteIpc(Path.Combine(directory, $"input-{i}-{part}-read-retry-{sharingRetries}.json"),
                                JsonSerializer.Serialize(new { path = inputPath, retryCount = sharingRetries,
                                    firstHResult = firstSharingHResult, hResult = error.HResult,
                                    elapsedMs = wall.ElapsedMilliseconds, deadlineMs = 12000 }));
                        }
                    }
                    if (encodedText is not null) break;
                    if (wall.Elapsed > TimeSpan.FromSeconds(12)) throw new TimeoutException("Captured client input deadline.");
                    Thread.Sleep(2);
                }
                if (sharingRetries > 0)
                    WriteIpc(Path.Combine(directory, $"input-{i}-{part}-read-retries.json"),
                        JsonSerializer.Serialize(new { path = inputPath, retryCount = sharingRetries,
                            firstHResult = firstSharingHResult, deadlineMs = 12000 }));
                string encoded = JsonSerializer.Deserialize<string>(encodedText)!;
                byte[] encodedBytes = Convert.FromBase64String(encoded);
                encodedInputs.Add(encodedBytes);
                var received = WireCodec.DecodeAuthenticatedInput(encodedBytes,
                    WireProfile.SuccessorBindingPartsV1, authority.Life, 1,
                    LoopbackTransport.ConnectionId, authority.Manager.WorldIncarnation);
                inputs.Add(received);
                Assert.Equal(WorldIngressEnqueueStatus.Accepted, authority.Manager.TryEnqueue(received));
            }
            authority.Manager.Tick();
            var outbox = authority.Manager.DrainOutbox();
            Assert.Equal(requests, outbox.Operations.Count);
            var operationRows = outbox.Operations.Select((outcome, part) => {
                Assert.Equal(inputs[part].Sequence, outcome.Operation.Sequence);
                return new ServerOperationRow(outcome.Operation.Sequence, outcome.MappingId,
                    outcome.Stage.ToString(), outcome.Outcome.Kind.ToString(), outcome.Outcome.Code,
                    outcome.Outcome.CommitFact.ToString(), outcome.ExecutionTick);
            }).ToArray();
            Vector3 after = authority.Position;
            var row = requests == 0
                ? new ServerRow("N/A", 0, "N/A", 0, beforeWorldTick, authority.Manager.World.Tick,
                    before.X, before.Y, before.Z, after.X, after.Y, after.Z, authority.Memory)
                : new ServerRow(inputs[0].Sender.ToHex(), inputs[0].Sequence,
                    outbox.Operations[0].Outcome.Kind.ToString(), outbox.Operations[0].ExecutionTick,
                    beforeWorldTick, authority.Manager.World.Tick,
                    before.X, before.Y, before.Z, after.X, after.Y, after.Z, authority.Memory);
            rows.Add(row);
            var revisions = authority.Sections.Select(section => {
                var revision = NativeWorldVoxelResources.Require(authority.Manager).Voxel
                    .QuerySectionRevision(section.Key);
                Assert.Equal(section.Revision, revision.SectionRevision);
                return new SectionRevisionEvidence($"s:{section.Key.X}:{section.Key.Y}:{section.Key.Z}",
                    section.Revision, revision.SectionRevision, revision.Presence.ToString());
            }).ToArray();
            var rawHashes = new List<string>();
            var carrierHashes = new List<string>();
            string[] frames = outbox.Frames.OfType<WorldChangeMessage>()
                .Where(frame => frame.ObserverId == authority.Life)
                .Select(frame => {
                    byte[] raw = WireCodec.EncodePack(frame, WireProfile.SuccessorBindingPartsV1);
                    rawHashes.Add(Convert.ToHexStringLower(SHA256.HashData(raw)));
                    // The DS section publisher writes this required empty manifest when
                    // Native confirms none of the four fixture sections changed this tick.
                    var body = JsonNode.Parse(raw)!;
                    body["sectionGroup"] = new JsonObject { ["sent"] = new JsonArray(),
                        ["deferred"] = new JsonArray() };
                    byte[] carrier = Encoding.UTF8.GetBytes(body.ToJsonString());
                    carrierHashes.Add(Convert.ToHexStringLower(SHA256.HashData(carrier)));
                    return Convert.ToBase64String(carrier);
                }).ToArray();
            Assert.NotEmpty(frames);
            var step = new ServerStep(row, operationRows, authority.BombMemory, frames,
                rawHashes.ToArray(), carrierHashes.ToArray(), revisions,
                inputs.Select((input, part) => new DecodedInputRow(input.Sequence,
                    input.Sender.ToHex(), input.Connection, input.ConnectionGeneration,
                    input.WorldIncarnation.ToHex(), input.MappingId,
                    Convert.ToHexStringLower(SHA256.HashData(encodedInputs[part])))).ToArray(), identity);
            steps.Add(step);
            WriteIpc(Path.Combine(directory, $"output-{i}.json"), JsonSerializer.Serialize(step));
        }
        using Process process = Process.GetCurrentProcess();
        string actualNative = Assert.Single(process.Modules.Cast<ProcessModule>(),
            module => module.ModuleName == Path.GetFileName(native)).FileName;
        WriteIpc(Path.Combine(directory, "result.json"), JsonSerializer.Serialize(new ServerResult(
            rows.ToArray(), steps.ToArray(), actualNative,
            Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(actualNative))))));
    }

    private sealed record ServerReady(string Life, string Participant, string? Bomb,
        string WorldIncarnation, string Authorization,
        string Welcome, string Baseline, string[] Sections);
    private sealed record ServerRow(string Sender, ulong Sequence, string Outcome, ulong ExecutionTick,
        ulong BeforeWorldTick, ulong WorldTick,
        float BeforeX, float BeforeY, float BeforeZ, float X, float Y, float Z, MemoryRow Memory);
    private sealed record ServerOperationRow(ulong Sequence, string MappingId, string Stage,
        string Outcome, string? Code, string CommitFact, ulong ExecutionTick);
    private sealed record BombRow(string Owner, string SourceLife, ulong SourceLifeGeneration,
        string Phase, ulong FuseEndTick, ulong KickStartTick, int KickDirection,
        int CellX, int CellZ, int Power, ulong DangerWindowTicks);
    private sealed record MemoryRow(int Facing, int PendingTurnDirection, ulong PendingTurnUntilTick,
        int LastMoveDirection, ulong LastMoveTick, ulong LastAssistTick, int AssistToleranceMilli);
    private sealed record SectionRevisionEvidence(string Key, ulong BaselineRevision,
        ulong CurrentRevision, string Presence);
    private sealed record DecodedInputRow(ulong Sequence, string Sender, string? Connection,
        ulong? ConnectionGeneration, string WorldIncarnation, string MappingId, string Sha256);
    private sealed record IdentityRow(string PlayerParticipant, ulong PlayerGeneration,
        string SeatCurrentLife, ulong SeatGeneration, ulong SeatMatch,
        ulong ActiveMatch, bool PlayerParticipantLive);
    private sealed record ServerStep(ServerRow Row, ServerOperationRow[] Operations, BombRow? Bomb,
        string[] Frames, string[] RawWorldChangeSha256,
        string[] CarrierSha256, SectionRevisionEvidence[] Sections, DecodedInputRow[] DecodedInputs,
        IdentityRow Identity);
    private sealed record ServerResult(ServerRow[] Rows, ServerStep[] Steps, string ActualNative, string NativeSha256);

    private static void AssertInvalidIdentitySnapshot(string variant, IdentityRow identity,
        NetEntityId life, string participant)
    {
        Assert.Equal(55UL, identity.ActiveMatch);
        switch (variant)
        {
            case "current-life": Assert.Equal(default(NetEntityId).ToHex(), identity.SeatCurrentLife); break;
            case "nonlive-participant":
                Assert.Equal(new NetEntityId(7, 99).ToHex(), identity.PlayerParticipant);
                Assert.False(identity.PlayerParticipantLive); break;
            case "zero-player-generation": Assert.Equal(0UL, identity.PlayerGeneration); break;
            case "mismatched-player-generation": Assert.Equal(2UL, identity.PlayerGeneration); break;
            case "zero-participant-generation": Assert.Equal(0UL, identity.SeatGeneration); break;
            case "mismatched-participant-generation": Assert.Equal(2UL, identity.SeatGeneration); break;
            case "mismatched-participant-match": Assert.Equal(56UL, identity.SeatMatch); break;
            default: throw new InvalidDataException("Unknown identity variant: " + variant);
        }
        if (variant != "nonlive-participant") Assert.Equal(participant, identity.PlayerParticipant);
        if (variant != "current-life") Assert.Equal(life.ToHex(), identity.SeatCurrentLife);
    }

    private static byte[] SectionFrame(ulong tick, Lumio.Bomber.Tests.MovementNativeParityFixture.Section section)
        => JsonSerializer.SerializeToUtf8Bytes(new {
            messageType = "SectionFrame", tick,
            sectionKey = $"s:{section.Key.X}:{section.Key.Y}:{section.Key.Z}",
            sectionRevision = section.Revision, encoding = section.Encoding.ToString(),
            payloadLength = section.Payload.Length,
            payload = Convert.ToHexStringLower(section.Payload),
            payloadSha256 = section.Sha256, observerPresence = "absent", deliveryReason = "first",
        });

    private static void WriteEvidence(string caseId, object value)
    {
        string? path = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_EVIDENCE_PATH");
        if (path is not null)
        {
            if (Directory.Exists(path)) path = Path.Combine(path, caseId + "-client-native-join.json");
            File.WriteAllText(path, JsonSerializer.Serialize(value, EvidenceJsonOptions));
        }
    }

    private static object CaptureLoadedIdentity(string role, string native, params Assembly[] selected)
    {
        using Process process = Process.GetCurrentProcess();
        string[] names = selected.Select(assembly => assembly.GetName().Name!).Distinct().ToArray();
        var assemblies = AppDomain.CurrentDomain.GetAssemblies()
            .Where(assembly => names.Contains(assembly.GetName().Name, StringComparer.Ordinal))
            .Select(assembly => new {
                assembly.FullName, assembly.Location, assembly.ManifestModule.ModuleVersionId,
                sha256 = File.Exists(assembly.Location)
                    ? Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(assembly.Location))) : null,
                loadContext = AssemblyLoadContext.GetLoadContext(assembly)?.Name,
            }).ToArray();
        var nativeModules = process.Modules.Cast<ProcessModule>()
            .Where(module => module.ModuleName == Path.GetFileName(native))
            .Select(module => new { module.FileName,
                sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(module.FileName))) }).ToArray();
        return new { role, pid = process.Id, startUtc = process.StartTime.ToUniversalTime(),
            executable = process.MainModule?.FileName, assemblies, nativeModules };
    }

    private sealed class NoSampleMapper : IGameInputMapper
    {
        public bool TryMap(in SequencedInputSample sample, in InputDrainContext context,
            out GameplayCommandCandidate candidate)
        { candidate = default; return false; }
    }

    private sealed class ClientLedger(NetEntityId life, string authorityWorldIncarnation,
        Lumio.Bomber.Tests.MovementNativeParityFixture.Sample[] samples,
        int idleAt, int absentAt)
        : IClientOutboundMessageObserver
    {
        private readonly Stopwatch wall = Stopwatch.StartNew();
        private WorldManager? manager;
        public TimeSpan WallElapsed => wall.Elapsed;
        public List<ClientRow> Rows { get; } = new();
        public List<AcceptedRow> Accepted { get; } = new();
        public int ZeroDuePumps { get; set; }
        public void BeforeStep(ClientPredictionStepContext context)
        {
            manager = context.Manager;
            FinalizePrevious(context.Manager);
            if (Rows.Count >= samples.Length) return;
            var sample = samples[Rows.Count];
            Assert.Equal((ulong)20, context.TickRateHz);
            Assert.Equal(Rows.Count, sample.StepIndex);
            Assert.Equal("typed", sample.Move.Kind);
            bool hasMove = sample.StepIndex != absentAt;
            OwnerStamp? before = context.Manager.TryReadOwnerPresentation(out var currentStamp)
                ? OwnerStamp.From(currentStamp) : null;
            int requestStart = Rows.Count == 0 ? 0 : Rows[^1].RequestStartOrdinal + Rows[^1].ExpectedRequests;
            Rows.Add(new ClientRow(sample.StepIndex, context.ConnectionGeneration,
                context.LocalStepOrdinal, hasMove, requestStart,
                hasMove ? 1 + sample.Actions.Length : 0, before,
                context.Manager.WorldIncarnation.ToHex(), sample.Move.Primary,
                sample.Move.Secondary, sample.Move.TurnPressed, sample.Actions.ToArray()));
            if (!hasMove) return;
            var input = new MoveAbility.Input {
                PrimaryDirection = sample.StepIndex == idleAt ? BomberDirection.None : Direction(sample.Move.Primary),
                SecondaryDirection = sample.StepIndex == idleAt ? BomberDirection.None : Direction(sample.Move.Secondary),
                TurnPressed = sample.StepIndex != idleAt && sample.Move.TurnPressed,
            };
            Assert.True(context.Manager.ConfirmedWorld.Get<AbilityComponent>(life)
                .Activate<MoveAbility, MoveAbility.Input>(in input).Succeeded);
            foreach (string action in sample.Actions)
            {
                Assert.Equal("bomb", action);
                var placement = new PlaceBombAbility.Input();
                Assert.True(context.Manager.ConfirmedWorld.Get<AbilityComponent>(life)
                    .Activate<PlaceBombAbility, PlaceBombAbility.Input>(in placement).Succeeded);
            }
        }
        public void FinalizeAfterHostTick()
        {
            if (manager is not null) FinalizePrevious(manager);
        }
        private void FinalizePrevious(WorldManager current)
        {
            if (Rows.Count == 0 || Rows[^1].BoundaryCaptured) return;
            if (current.PredictedWorld is not World predicted || !predicted.IsLive(life)) return;
            ClientRow row = Rows[^1];
            OwnerStamp? stamp = current.TryReadOwnerPresentation(out var pose)
                ? OwnerStamp.From(pose) : null;
            if (row.HasMove)
            {
                if (stamp is null || stamp.Entity != life.ToHex()
                    || stamp.ConnectionGeneration != row.ConnectionGeneration
                    || stamp.LocalStepOrdinal != row.LocalStepOrdinal
                    || stamp.Cause != "InputPublication"
                    || stamp.PublicationSequence <= (row.BeforeActivationStamp?.PublicationSequence ?? 0))
                    return;
            }
            row.OwnerStamp = stamp;
            row.BoundaryPredictedTick = predicted.Tick;
            row.BoundaryConfirmedTick = current.ConfirmedWorld.Tick;
            row.Pose = predicted.Get<LogicTransform>(life).LocalPosition;
            var memory = predicted.Get<BomberPlayerState>(life);
            row.Memory = new MemoryRow(memory.Facing.Value,
                memory.PendingTurnDirection.Value, memory.PendingTurnUntilTick.Value,
                memory.LastMoveDirection.Value, memory.LastMoveTick.Value,
                memory.LastAssistTick.Value, memory.AssistToleranceMilli.Value);
            row.BoundaryCaptured = true;
            TryCertify(row);
        }
        public void Observe(InputCommandMessage message, ReadOnlyMemory<byte> encodedBytes)
        {
            int ordinal = Accepted.Count;
            int index = 0;
            int previous = 0;
            while (index < samples.Length && ordinal >= previous +
                (samples[index].StepIndex == absentAt ? 0 : 1 + samples[index].Actions.Length))
            {
                previous += samples[index].StepIndex == absentAt ? 0 : 1 + samples[index].Actions.Length;
                index++;
            }
            Assert.True(index < Rows.Count);
            Assert.Equal(life, message.Sender);
            ClientRow row = Rows[index];
            int part = ordinal - row.RequestStartOrdinal;
            Assert.InRange(part, 0, row.ExpectedRequests - 1);
            // The observer sees the message before host transport binding; the
            // authenticated decode below supplies the final wire connection.
            if (message.Connection is not null)
                Assert.Equal(LoopbackTransport.ConnectionId, message.Connection);
            if (message.ConnectionGeneration is not null)
                Assert.Equal(row.ConnectionGeneration, message.ConnectionGeneration);
            if (!message.WorldIncarnation.IsDefault)
                Assert.Equal(authorityWorldIncarnation, message.WorldIncarnation.ToHex());
            if (ordinal > 0) Assert.Equal(checked(Accepted[^1].Sequence + 1), message.Sequence);
            var accepted = new AcceptedRow(index, part, message.Sequence, message.MappingId,
                message.Sender.ToHex(), message.Connection, message.ConnectionGeneration,
                message.WorldIncarnation.ToHex(), message.Commands.Count,
                Convert.ToHexStringLower(SHA256.HashData(encodedBytes.Span)), encodedBytes.Length);
            Accepted.Add(accepted);
            row.Requests.Add(accepted);
            // The public outbound observer runs after this step's prediction tick and
            // before the next due step can replace its latest owner publication.
            if (row.Requests.Count == row.ExpectedRequests && ReferenceEquals(row, Rows[^1])
                && manager is not null)
                FinalizePrevious(manager);
            TryCertify(row);
        }
        private static void TryCertify(ClientRow row)
        {
            if (!row.BoundaryCaptured || row.Requests.Count != row.ExpectedRequests) return;
            if (!row.HasMove)
            {
                Assert.Empty(row.Requests);
                row.Certified = true;
                return;
            }
            if (row.OwnerStamp is null || row.Requests.Count == 0) return;
            Assert.Equal(row.Requests[^1].Sequence, row.OwnerStamp.InputSequence);
            Assert.Equal(row.LocalStepOrdinal, row.OwnerStamp.LocalStepOrdinal);
            Assert.Equal(row.ConnectionGeneration, row.OwnerStamp.ConnectionGeneration);
            Assert.Equal("InputPublication", row.OwnerStamp.Cause);
            Assert.InRange(Vector3.Distance(row.Pose, row.OwnerStamp.TargetPosition), 0, 0.00001f);
            row.PredictionExecutionTick = row.OwnerStamp.ExecutionTick;
            row.PredictionInputSequence = row.OwnerStamp.InputSequence;
            row.Certified = true;
        }
        private static BomberDirection Direction(string name) => name switch {
            "none" => BomberDirection.None, "up" => BomberDirection.Up,
            "right" => BomberDirection.Right, "down" => BomberDirection.Down,
            "left" => BomberDirection.Left, _ => throw new InvalidDataException("Unknown direction: " + name),
        };
    }

    private sealed class ClientRow(int sampleIndex, ulong connectionGeneration, ulong localStepOrdinal,
        bool hasMove, int requestStartOrdinal, int expectedRequests, OwnerStamp? beforeActivationStamp,
        string worldIncarnation, string primary, string secondary, bool turnPressed, string[] actions)
    {
        public int SampleIndex { get; } = sampleIndex;
        public ulong ConnectionGeneration { get; } = connectionGeneration;
        public ulong LocalStepOrdinal { get; } = localStepOrdinal;
        public bool HasMove { get; } = hasMove;
        public string WorldIncarnation { get; } = worldIncarnation;
        public string Primary { get; } = primary;
        public string Secondary { get; } = secondary;
        public bool TurnPressed { get; } = turnPressed;
        public string[] Actions { get; } = actions;
        public int RequestStartOrdinal { get; } = requestStartOrdinal;
        public int ExpectedRequests { get; } = expectedRequests;
        public OwnerStamp? BeforeActivationStamp { get; } = beforeActivationStamp;
        public OwnerStamp? OwnerStamp { get; set; }
        public ulong? BoundaryPredictedTick { get; set; }
        public ulong? BoundaryConfirmedTick { get; set; }
        public List<AcceptedRow> Requests { get; } = new();
        public ulong? PredictionExecutionTick { get; set; }
        public ulong? PredictionInputSequence { get; set; }
        public Vector3 Pose { get; set; }
        public MemoryRow? Memory { get; set; }
        public bool BoundaryCaptured { get; set; }
        public bool Certified { get; set; }
        public string Diagnostic => $"sample={SampleIndex} boundary={BoundaryCaptured} certified={Certified} " +
            $"requests={Requests.Count}/{ExpectedRequests} stamp={JsonSerializer.Serialize(OwnerStamp)}";
    }
    private sealed record AcceptedRow(int SampleIndex, int RequestPart, ulong Sequence,
        string MappingId, string Sender, string? Connection, ulong? ConnectionGeneration,
        string WorldIncarnation, int CommandCount, string Sha256, int ByteLength);
    private sealed record OwnerStamp(string Entity, ulong ConnectionGeneration, ulong PublicationSequence,
        ulong LocalStepOrdinal, ulong ExecutionTick, ulong InputSequence, string Cause,
        Vector3 TargetPosition, Vector3 ModelPosition)
    {
        public static OwnerStamp From(OwnerPresentationPose pose) => new(pose.Entity.ToHex(),
            pose.ConnectionGeneration, pose.PublicationSequence, pose.LocalStepOrdinal,
            pose.ExecutionTick, pose.InputSequence, pose.Cause.ToString(),
            pose.Target.Position, pose.Model.Position);
    }

    private sealed class Authority : IDisposable
    {
        private static readonly string[] ConfigHashTables = ["game", "movement", "attributes", "speed_tiers", "blocks"];
        private readonly LumioEngine engine;
        private readonly AssemblyLoadContext context;
        private readonly ulong dangerWindowTicks;
        public WorldManager Manager { get; }
        public Assembly ServerGameplayAssembly { get; }
        public object ConfigEvidence { get; }
        public NetEntityId Life { get; }
        public NetEntityId Participant { get; }
        public NetEntityId Bomb { get; }
        public WorldChangeMessage Baseline { get; }
        public Lumio.Bomber.Tests.MovementNativeParityFixture.Section[] Sections { get; }
        public Vector3 Position => Manager.World.Get<LogicTransform>(Life).LocalPosition;
        public BombRow? BombMemory
        {
            get
            {
                if (Bomb.IsDefault) return null;
                Component bomb = Manager.World.NamedComponent(Bomb, nameof(BomberBombState))!;
                Vector3 position = Manager.World.Get<LogicTransform>(Bomb).LocalPosition;
                static T Read<T>(Component component, string fieldName)
                {
                    object member = component.GetType().GetField(fieldName)!.GetValue(component)!;
                    return (T)member.GetType().GetProperty("Value")!.GetValue(member)!;
                }
                return new BombRow(Read<NetEntityId>(bomb, nameof(BomberBombState.Owner)).ToHex(),
                    Read<NetEntityId>(bomb, nameof(BomberBombState.SourceLife)).ToHex(),
                    Read<ulong>(bomb, nameof(BomberBombState.SourceLifeGeneration)),
                    ((BomberBombPhase)Read<int>(bomb, nameof(BomberBombState.Phase))).ToString(),
                    Read<ulong>(bomb, nameof(BomberBombState.FuseEndTick)),
                    Read<ulong>(bomb, nameof(BomberBombState.KickStartTick)),
                    Read<int>(bomb, nameof(BomberBombState.KickDirection)),
                    (int)MathF.Floor(position.X), (int)MathF.Floor(position.Z),
                    Read<int>(bomb, nameof(BomberBombState.Power)), dangerWindowTicks);
            }
        }
        public IdentityRow Identity
        {
            get
            {
                Component seat = Manager.World.NamedComponent(Participant, nameof(BomberParticipantState))!;
                Component player = Manager.World.NamedComponent(Life, nameof(BomberPlayerState))!;
                Component match = Manager.World.NamedComponent(new NetEntityId(7, 1), nameof(BomberMatchState))!;
                static T Read<T>(Component component, string fieldName)
                {
                    object member = component.GetType().GetField(fieldName)!.GetValue(component)!;
                    return (T)member.GetType().GetProperty("Value")!.GetValue(member)!;
                }
                NetEntityId playerParticipant = Read<NetEntityId>(player, nameof(BomberPlayerState.Participant));
                return new IdentityRow(playerParticipant.ToHex(),
                    Read<ulong>(player, nameof(BomberPlayerState.LifeGeneration)),
                    Read<NetEntityId>(seat, nameof(BomberParticipantState.CurrentLife)).ToHex(),
                    Read<ulong>(seat, nameof(BomberParticipantState.LifeGeneration)),
                    Read<ulong>(seat, nameof(BomberParticipantState.MatchId)),
                    Read<ulong>(match, nameof(BomberMatchState.MatchId)),
                    Manager.World.IsLive(playerParticipant));
            }
        }
        public void InvalidateIdentity(string variant)
        {
            Component seat = Manager.World.NamedComponent(Participant, nameof(BomberParticipantState))!;
            Component player = Manager.World.NamedComponent(Life, nameof(BomberPlayerState))!;
            switch (variant)
            {
                case "current-life": Set(seat, nameof(BomberParticipantState.CurrentLife), default(NetEntityId)); break;
                case "nonlive-participant": Set(player, nameof(BomberPlayerState.Participant), new NetEntityId(7, 99)); break;
                case "zero-player-generation": Set(player, nameof(BomberPlayerState.LifeGeneration), 0UL); break;
                case "mismatched-player-generation": Set(player, nameof(BomberPlayerState.LifeGeneration), 2UL); break;
                case "zero-participant-generation": Set(seat, nameof(BomberParticipantState.LifeGeneration), 0UL); break;
                case "mismatched-participant-generation": Set(seat, nameof(BomberParticipantState.LifeGeneration), 2UL); break;
                case "mismatched-participant-match": Set(seat, nameof(BomberParticipantState.MatchId), 56UL); break;
                default: throw new InvalidDataException("Unknown identity variant: " + variant);
            }
        }
        public MemoryRow Memory
        {
            get
            {
                Component memory = Manager.World.NamedComponent(Life, nameof(BomberPlayerState))!;
                static T Read<T>(Component component, string name) => (T)component.GetType()
                    .GetField(name, BindingFlags.Instance | BindingFlags.Public)!.GetValue(component)!
                    .GetType().GetProperty("Value")!.GetValue(component.GetType()
                    .GetField(name, BindingFlags.Instance | BindingFlags.Public)!.GetValue(component)!)!;
                return new MemoryRow(Read<int>(memory, nameof(BomberPlayerState.Facing)),
                    Read<int>(memory, nameof(BomberPlayerState.PendingTurnDirection)),
                    Read<ulong>(memory, nameof(BomberPlayerState.PendingTurnUntilTick)),
                    Read<int>(memory, nameof(BomberPlayerState.LastMoveDirection)),
                    Read<ulong>(memory, nameof(BomberPlayerState.LastMoveTick)),
                    Read<ulong>(memory, nameof(BomberPlayerState.LastAssistTick)),
                    Read<int>(memory, nameof(BomberPlayerState.AssistToleranceMilli)));
            }
        }

        public Authority(string root, string native, KernelConfig budget, byte[] catalog,
            Lumio.Bomber.Tests.MovementNativeParityFixture.Case scenario, string? bombVariant,
            string? scenarioVariant = null)
        {
            string assemblyPath = Environment.GetEnvironmentVariable("LUMIO_BOMBER_SERVER_GAMEPLAY_PATH")
                ?? throw new InvalidOperationException("Produced server Gameplay assembly path is required.");
            context = new AssemblyLoadContext("task-m-server-gameplay", isCollectible: true);
            context.Resolving += (_, name) => AssemblyLoadContext.Default.Assemblies
                .SingleOrDefault(assembly => assembly.GetName().Name == name.Name);
            Assembly assembly = context.LoadFromAssemblyPath(Path.GetFullPath(assemblyPath));
            ServerGameplayAssembly = assembly;
            var registry = (EcsRegistry)assembly.GetType("Lumio.Bomber.Gameplay.GeneratedRegistry", true)!
                .GetProperty("Instance", BindingFlags.Public | BindingFlags.Static)!.GetValue(null)!;
            Assert.Equal(RegistrySide.Server, registry.Side);
            engine = LumioEngine.Start(native, budget);
            var entry = registry.CreateGameplayConfigBinding()!;
            var exported = LumioConfigLoader.Load(Path.Combine(root, "Server/Config/Tables"),
                ConfigTarget.Server, requiredTables: entry.RequiredTables, typedTableFactory: entry.CreateTypedTables);
            Assert.True(exported.IsSuccess, exported.ErrorMessage);
            var module = ConfigModule.Create();
            Assert.True(module.Stage(exported.CreateSnapshot(new ConfigSnapshotId(1))).Staged);
            Assert.True(module.ActivateAtBarrier(default).Activated);
            Manager = engine.CreateWorld(new WorldCreationOptions(registry) {
                InstanceId = 7, Catalog = catalog, TickRate = 20,
                Config = new WorldConfigBinding(module, registry, entry),
            });
            Manager.AttachControlAdapter(new FixtureBinding(this));
            Manager.Tick();
            Manager.DrainOutbox();
            // Resolve the activated Reader from the server Gameplay assembly loaded in
            // its dedicated ALC; the test assembly's client Gameplay type is distinct.
            Type binding = ServerGameplayAssembly.GetType(typeof(BomberConfigBinding).FullName!, true)!;
            object config = binding.GetMethod("For", BindingFlags.Public | BindingFlags.Static)!
                .Invoke(null, [Manager.World])!;
            static object Read(object value, string name) => value.GetType()
                .GetProperty(name, BindingFlags.Public | BindingFlags.Instance)!.GetValue(value)!;
            object Attribute(string name) => config.GetType().GetMethod("Attribute")!.Invoke(config, [name])!;
            object SpeedTier(long tier) => config.GetType().GetMethod("SpeedTier")!.Invoke(config, [tier])!;
            long Number(object value, string name) => Convert.ToInt64(Read(value, name),
                System.Globalization.CultureInfo.InvariantCulture);
            object game = Read(config, "Game");
            object movement = Read(config, "Movement");
            dangerWindowTicks = checked((ulong)(Number(Read(config, "Bomb"), "DangerMs") /
                (1000L / Number(game, "TickRateHz"))));
            var blockRows = ((System.Collections.IEnumerable)Read(Read(Read(config, "Tables"), "Blocks"), "Rows"))
                .Cast<object>().Where(row => Lumio.Bomber.Tests.MovementNativeParityFixture.Blocks
                    .ContainsKey((string)Read(row, "Name"))).ToArray();
            Lumio.Bomber.Tests.MovementNativeParityFixture.AssertCatalogBytes(catalog);
            foreach (var (alias, state) in Lumio.Bomber.Tests.MovementNativeParityFixture.Blocks)
            {
                object row = Assert.Single(blockRows, value => (string)Read(value, "Name") == alias);
                Assert.Equal((long)(state >> 8), Number(row, "BlockType"));
                Assert.True((bool)Read(row, "Enabled"));
                Assert.Equal(alias is "air" or "floor" or "water", (bool)Read(row, "Walkable"));
            }
            long initialSpeed = Number(Attribute(BomberAttributeNames.MovementSpeedMilli), "Initial");
            long initialTier = Number(Attribute(BomberAttributeNames.SpeedTier), "Initial");
            object tier0 = SpeedTier(0);
            Assert.Equal(0L, initialTier);
            Assert.Equal(3500L, initialSpeed);
            Assert.Equal(3500L, Number(tier0, "SpeedMilli"));
            Assert.Equal(initialSpeed, Number(tier0, "SpeedMilli"));
            Assert.Equal(100001L, Number(game, "Id"));
            Assert.Equal(103001L, Number(movement, "Id"));
            Assert.Equal(101006L, Number(Attribute(BomberAttributeNames.MovementSpeedMilli), "Id"));
            Assert.Equal(101005L, Number(Attribute(BomberAttributeNames.SpeedTier), "Id"));
            Assert.Equal(102001L, Number(tier0, "Id"));
            ConfigEvidence = new {
                phase = "generated-reader-before-initial-speed-write",
                catalogSha256 = Lumio.Bomber.Tests.MovementNativeParityFixture.CatalogSha256,
                readerAssembly = ServerGameplayAssembly.Location,
                game = new { Id = Number(game, "Id"), TickRateHz = Number(game, "TickRateHz") },
                movement = new { Id = Number(movement, "Id"),
                    WaterSpeedPermille = Number(movement, "WaterSpeedPermille"),
                    CornerAssistMilli = Number(movement, "CornerAssistMilli"),
                    RepeatAssistMilli = Number(movement, "RepeatAssistMilli"),
                    TurnBufferTicks = Number(movement, "TurnBufferTicks") },
                movementSpeed = new { Id = Number(Attribute(BomberAttributeNames.MovementSpeedMilli), "Id"),
                    Name = (string)Read(Attribute(BomberAttributeNames.MovementSpeedMilli), "Name"),
                    Initial = initialSpeed },
                speedTier = new { AttributeId = Number(Attribute(BomberAttributeNames.SpeedTier), "Id"),
                    Initial = initialTier, RowId = Number(tier0, "Id"),
                    Tier = Number(tier0, "Tier"), SpeedMilli = Number(tier0, "SpeedMilli") },
                blocks = blockRows.Select(row => new { Name = Read(row, "Name"),
                    BlockType = Read(row, "BlockType"), Enabled = Read(row, "Enabled"),
                    Walkable = Read(row, "Walkable") }).ToArray(),
                tableHashes = ConfigHashTables
                    .ToDictionary(name => name, name => Convert.ToHexStringLower(SHA256.HashData(
                        File.ReadAllBytes(Path.Combine(root, "Server/Config/Tables/server", name + ".json")))))
            };
            Component match = Manager.World.NamedComponent(new NetEntityId(7, 1), nameof(BomberMatchState))!;
            Assert.NotNull(match);
            Set(match, nameof(BomberMatchState.MatchId), 55UL);
            Set(match, nameof(BomberMatchState.Phase), (int)BomberMatchPhase.Running);
            Set(match, nameof(BomberMatchState.PhaseEndTick), Manager.World.Tick + 1000);
            Assert.True(registry.TryResolveEntityType("bomberParticipant", out Type participantType));
            Assert.True(registry.TryResolveEntityType("player", out Type playerType));
            var participant = Manager.World.Commands.CreateFor(participantType);
            var life = Manager.World.Commands.CreateFor(playerType);
            Manager.Tick();
            Manager.DrainOutbox();
            Participant = participant.AssignedId;
            Life = life.AssignedId;
            Component seat = Manager.World.NamedComponent(Participant, nameof(BomberParticipantState))!;
            Set(seat, nameof(BomberParticipantState.MatchId), 55UL);
            Set(seat, nameof(BomberParticipantState.CurrentLife), Life);
            Set(seat, nameof(BomberParticipantState.LifeGeneration), 1UL);
            Set(seat, nameof(BomberParticipantState.LifePhase), (int)BomberLifePhase.Vulnerable);
            Component player = Manager.World.NamedComponent(Life, nameof(BomberPlayerState))!;
            Set(player, nameof(BomberPlayerState.Participant), Participant);
            Set(player, nameof(BomberPlayerState.LifeGeneration), 1UL);
            Set(player, nameof(BomberPlayerState.LifePhase), (int)BomberLifePhase.Vulnerable);
            Set(player, nameof(BomberPlayerState.InputMemoryMatchId), 55UL);
            var speed = Manager.World.Get<AttributeComponent>(Life);
            Assert.Equal(initialSpeed, speed.GetBaseValue(BomberAttributeNames.MovementSpeedMilli));
            Assert.Equal(initialSpeed, speed.GetCurrentValue(BomberAttributeNames.MovementSpeedMilli));
            speed.SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, initialSpeed);
            Assert.Equal(initialSpeed, speed.GetCurrentValue(BomberAttributeNames.MovementSpeedMilli));
            var transform = Manager.World.Get<LogicTransform>(Life);
            using (transform.BeginWrite(Manager.World.RegisterTransformController(Life, nameof(MoveAbility))))
                transform.SetLocalPosition(new Vector3(scenario.Start[0] + 0.5f, 1.5f, scenario.Start[1] + 0.5f));
            Sections = Lumio.Bomber.Tests.MovementNativeParityFixture.AuthorAndReadback(
                NativeWorldVoxelResources.Require(Manager).Voxel, scenario.Map);
            if (bombVariant is not null || scenarioVariant?.StartsWith("danger-", StringComparison.Ordinal) == true)
            {
                if (bombVariant is not null)
                    Assert.True(bombVariant is "own" or "wrong-generation" or "wrong-owner"
                        or "wrong-source" or "kicked-start" or "kick-direction-before-hfsm"
                        or "kick-direction-after-hfsm");
                Assert.True(registry.TryResolveEntityType("bomberBomb", out Type bombType));
                var bombOrder = Manager.World.Commands.CreateFor(bombType);
                Manager.Tick();
                Manager.DrainOutbox();
                Bomb = bombOrder.AssignedId;
                Component bomb = Manager.World.NamedComponent(Bomb, nameof(BomberBombState))!;
                Set(bomb, nameof(BomberBombState.Owner), bombVariant == "wrong-owner"
                    ? new NetEntityId(7, 99) : Participant);
                Set(bomb, nameof(BomberBombState.SourceLife), bombVariant == "wrong-source"
                    ? new NetEntityId(7, 98) : Life);
                Set(bomb, nameof(BomberBombState.SourceLifeGeneration),
                    bombVariant == "wrong-generation" ? 2UL : 1UL);
                Set(bomb, nameof(BomberBombState.Phase), (int)BomberBombPhase.Fuse);
                Set(bomb, nameof(BomberBombState.FuseEndTick),
                    checked(Manager.World.Tick + (scenarioVariant?.StartsWith("danger-", StringComparison.Ordinal) == true
                        ? 8UL : 60UL)));
                Set(bomb, nameof(BomberBombState.Power), scenarioVariant == "danger-already-start" ? 2 : 1);
                Set(bomb, nameof(BomberBombState.KickStartTick),
                    bombVariant == "kicked-start" ? 1UL : 0UL);
                if (bombVariant == "kick-direction-before-hfsm")
                    Set(bomb, nameof(BomberBombState.KickDirection), 1);
                var bombTransform = Manager.World.Get<LogicTransform>(Bomb);
                using (bombTransform.BeginWrite(Manager.World.RegisterTransformController(Bomb, nameof(MoveAbility))))
                    bombTransform.SetLocalPosition(scenarioVariant?.StartsWith("danger-", StringComparison.Ordinal) == true
                        ? new Vector3(3.5f, 1.5f, 1.5f) : transform.LocalPosition);
                if (bombVariant == "kick-direction-after-hfsm")
                {
                    Manager.Tick();
                    Manager.DrainOutbox();
                    Set(bomb, nameof(BomberBombState.KickDirection), 1);
                }
            }
            var observer = Manager.World.Get<ObserverComponent>(Life);
            observer.Connected = true;
            observer.ConnectionGeneration = 1;
            Manager.Tick();
            var outbox = Manager.DrainOutbox();
            Baseline = Assert.Single(outbox.Frames.OfType<WorldChangeMessage>(), row => row.ObserverId == Life);
        }
        private static void Set(Component component, string name, object value)
        {
            object field = component.GetType().GetField(name, BindingFlags.Instance | BindingFlags.Public)!
                .GetValue(component)!;
            field.GetType().GetProperty("Value")!.SetValue(field, value);
        }
        public void Dispose()
        {
            Manager.Dispose();
            engine.Dispose();
            context.Unload();
        }
        private sealed class FixtureBinding(Authority owner) : IWorldControlAdapter
        {
            public WireProfile ProfileFor(string connection) => connection == LoopbackTransport.ConnectionId
                ? WireProfile.SuccessorBindingPartsV1 : WireProfile.Baseline;
            public bool TryHandle(WorldMessage message, out ErrorMessage? failure)
            { failure = null; return false; }
            public bool TryResolveConnection(NetEntityId observerId, out string connection)
            { connection = observerId == owner.Life ? LoopbackTransport.ConnectionId : ""; return connection.Length != 0; }
            public bool TryResolveConnectionState(string connection, out NetEntityId observerId, out ulong generation)
            {
                bool valid = connection == LoopbackTransport.ConnectionId && !owner.Life.IsDefault;
                observerId = valid ? owner.Life : default;
                generation = valid ? 1UL : 0UL;
                return valid;
            }
        }
    }

    private sealed class LoopbackTransport : IDisposable
    {
        public const string ConnectionId = "movement-fixture-socket";
        private readonly HttpListener listener = new();
        private readonly Task<WebSocket> accepted;
        private readonly Task reader;
        private readonly List<byte[]> received = new();
        public string Url { get; }
        public bool Connected => accepted.IsCompletedSuccessfully;
        public int ReceivedCount { get { lock (received) return received.Count; } }
        public LoopbackTransport()
        {
            var probe = new TcpListener(IPAddress.Loopback, 0);
            probe.Start();
            int port = ((IPEndPoint)probe.LocalEndpoint).Port;
            probe.Stop();
            Url = $"ws://127.0.0.1:{port}/";
            listener.Prefixes.Add($"http://127.0.0.1:{port}/");
            listener.Start();
            accepted = Accept();
            reader = Receive();
        }
        private async Task<WebSocket> Accept()
        {
            HttpListenerContext context = await listener.GetContextAsync();
            if (context.Request.Headers["Authorization"] != "Bearer unit-admission")
                throw new InvalidOperationException("Fixture admission carrier missing.");
            return (await context.AcceptWebSocketAsync(WebSocketTransportOptions.SuccessorBindingPartsSubProtocol)).WebSocket;
        }
        private async Task Receive()
        {
            WebSocket socket = await accepted;
            var buffer = new byte[65536];
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close) {
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None);
                    break;
                }
                if (!result.EndOfMessage) throw new InvalidOperationException("Fixture input exceeded one frame.");
                lock (received) received.Add(buffer.AsSpan(0, result.Count).ToArray());
            }
        }
        public byte[] TakeReceived(int index) { lock (received) return received[index].ToArray(); }
        public void Send(byte[] frame) => accepted.GetAwaiter().GetResult()
            .SendAsync(frame, WebSocketMessageType.Text, true, CancellationToken.None).GetAwaiter().GetResult();
        public void SendAuthorization(Authority authority)
        {
            var auth = new SuccessorAuthorization("SuccessorAuthorization", "initial",
                WebSocketTransportOptions.SuccessorBindingPartsSubProtocol, new NetEntityId(7, 90).ToHex(),
                ConnectionId, "1", "1", 7, authority.Manager.WorldIncarnation.ToHex(),
                authority.Participant.ToHex(), "1", null,
                new AttachmentRecord(authority.Participant.ToHex(), authority.Life.ToHex(),
                    authority.Life.ToHex(), 1, "controlled"), "999");
            var buffer = new byte[4096];
            Assert.True(WireCodec.TryWriteSuccessorAuthorization(in auth,
                WebSocketTransportOptions.SuccessorBindingPartsSubProtocol, buffer, out int length));
            Send(buffer.AsSpan(0, length).ToArray());
        }
        public void Dispose()
        {
            listener.Close();
            if (accepted.IsCompletedSuccessfully) accepted.Result.Dispose();
            if (reader.IsCompleted) reader.GetAwaiter().GetResult();
        }
    }
}
