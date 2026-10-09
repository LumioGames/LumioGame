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
    public Task StaleClientLifeIsRejectedByActualAuthority() => RunCase("P1", 2, identityInvalidAt: 1);

    [Fact]
    public Task CurrentLifeCanExitItsOwnFuseBomb() => RunCase("P1", 1, bombVariant: "own");

    [Fact]
    public Task WrongSourceGenerationDeniesOwnBombExit() => RunCase("P1", 1, bombVariant: "wrong-generation");

    private static async Task RunCase(string caseId, int count, int idleAt = -1,
        int absentAt = -1, int identityInvalidAt = -1, string? bombVariant = null)
    {
        string? childDirectory = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_AUTHORITY_CHILD");
        if (childDirectory is not null)
        {
            RunAuthorityChild(childDirectory, caseId, count, absentAt, identityInvalidAt, bombVariant);
            return;
        }
        var scenario = Lumio.Bomber.Tests.MovementNativeParityFixture.Load().Cases.Single(row => row.Id == caseId);
        string root = Lumio.Bomber.Tests.MovementNativeParityFixture.FindGameRoot();
        byte[] catalog = File.ReadAllBytes(Path.Combine(root, "Server/Assets/Maps/official-catalog.json"));
        string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")
            ?? throw new InvalidOperationException("Selected production Native path is required.");
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
            MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024,
            LogMailboxCapacity = 4096, MaxContexts = 64 };
        string ipc = Path.Combine(Path.GetTempPath(), "lumio-movement-ipc-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(ipc);
        using var server = StartAuthorityChild(ipc, caseId, count, idleAt, absentAt,
            identityInvalidAt, bombVariant);
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
            var ledger = new ClientLedger(life, scenario.SampledControls.Take(count).ToArray(), idleAt, absentAt);
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
            Lumio.Bomber.Tests.MovementNativeParityFixture.AssertReadback(
                NativeWorldVoxelResources.Require(replica.Manager).Voxel, scenario.Map);
            Assert.Equal(new Vector3(scenario.Start[0] + 0.5f, 1.5f, scenario.Start[1] + 0.5f),
                replica.Manager.ConfirmedWorld.Get<LogicTransform>(life).LocalPosition);
            if (bombVariant is not null)
            {
                NetEntityId bombId = NetEntityId.Parse(ready.Bomb!);
                var bomb = replica.Manager.ConfirmedWorld.Get<BomberBombState>(bombId);
                Assert.Equal(NetEntityId.Parse(ready.Participant), bomb.Owner.Value);
                Assert.Equal(life, bomb.SourceLife.Value);
                Assert.Equal(bombVariant == "own" ? 1UL : 2UL, bomb.SourceLifeGeneration.Value);
                Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
            }

            var serverRows = new List<ServerRow>();
            int requestOffset = 0;
            for (int i = 0; i < count; i++)
            {
                int requests = i == absentAt ? 0 : 1 + scenario.SampledControls[i].Actions.Length;
                while (ledger.Rows.Count <= i || ledger.Accepted.Count < requestOffset + requests ||
                    transport.ReceivedCount < requestOffset + requests
                    || !ledger.Rows[i].Published)
                {
                    Thread.Sleep(1);
                    host.Tick();
                    ledger.FinalizeAfterHostTick();
                    if (ledger.WallElapsed > TimeSpan.FromSeconds(12))
                        throw new TimeoutException($"Real Session movement publications did not complete: " +
                            $"index={i} requests={requests} rows={ledger.Rows.Count} accepted={ledger.Accepted.Count} " +
                            $"received={transport.ReceivedCount} published={(ledger.Rows.Count > i && ledger.Rows[i].Published)} " +
                            $"state={instance.GetSnapshot().State} prediction={instance.JointPredictionAttached}.");
                }
                for (int part = 0; part < requests; part++)
                {
                    int ordinal = requestOffset + part;
                    byte[] received = transport.TakeReceived(ordinal);
                    Assert.Equal(i, ledger.Accepted[ordinal].SampleIndex);
                    Assert.Equal(ledger.Accepted[ordinal].ByteLength, received.Length);
                    Assert.Equal(ledger.Accepted[ordinal].Sha256,
                        Convert.ToHexStringLower(SHA256.HashData(received)));
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
                if (bombVariant is not null)
                {
                    Assert.NotNull(step.Bomb);
                    Assert.Equal(ready.Participant, step.Bomb.Owner);
                    Assert.Equal(life.ToHex(), step.Bomb.SourceLife);
                    Assert.Equal(bombVariant == "own" ? 1UL : 2UL, step.Bomb.SourceLifeGeneration);
                    Assert.Equal("Fuse", step.Bomb.Phase);
                    Assert.Equal(0UL, step.Bomb.KickStartTick);
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
                    if (i == identityInvalidAt)
                    {
                        Assert.Equal(OperationOutcomeKind.BusinessReject.ToString(), step.Operations[part].Outcome);
                        Assert.Equal("move_source_invalid", step.Operations[part].Code);
                        Assert.Equal(OperationCommitFact.NotApplied.ToString(), step.Operations[part].CommitFact);
                    }
                    else Assert.Equal(OperationOutcomeKind.Succeeded.ToString(), step.Operations[part].Outcome);
                }
                File.WriteAllText(Path.Combine(ipc, $"pair-{i}.json"), JsonSerializer.Serialize(new {
                    caseId, sampleIndex = i, clientPose = new[] { ledger.Rows[i].Pose.X,
                        ledger.Rows[i].Pose.Y, ledger.Rows[i].Pose.Z },
                    ledger.Rows[i].PredictionExecutionTick, ledger.Rows[i].PredictionInputSequence,
                    ledger.Rows[i].Memory, server = step.Row,
                }));
                if (i != identityInvalidAt)
                    Assert.InRange(Vector3.Distance(ledger.Rows[i].Pose,
                        new Vector3(step.Row.X, step.Row.Y, step.Row.Z)), 0, 0.00001f);
                if (i == idleAt)
                {
                    Assert.Equal(step.Row.BeforeX, step.Row.X);
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
            Assert.All(ledger.Rows, row => Assert.True(row.Published));
            var result = JsonSerializer.Deserialize<ServerResult>(
                WaitReadIpc(Path.Combine(ipc, "result.json"), server, TimeSpan.FromSeconds(10)))!;
            Assert.Equal(count, result.Rows.Length);
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
            }
            if (caseId == "P5") Assert.InRange(result.Rows[4].X - 1.5f, 0.87499f, 0.87501f);
            using Process process = Process.GetCurrentProcess();
            string actualNative = Assert.Single(process.Modules.Cast<ProcessModule>(),
                module => module.ModuleName == Path.GetFileName(native)).FileName;
            Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(native))),
                Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(actualNative))));
            Assert.True(server.WaitForExit(10000), "Authority child did not exit after its actual steps.");
            Assert.Equal(0, server.ExitCode);
            string variant = idleAt >= 0 ? "-idle" : absentAt >= 0 ? "-absent"
                : identityInvalidAt >= 0 ? "-stale-life" : bombVariant is null ? "" : "-" + bombVariant;
            WriteEvidence(caseId + "-" + count + variant, new { status = "ACTUAL_HOST_SESSION_AUTHORITY", caseId, count,
                idleAt, absentAt, identityInvalidAt, bombVariant,
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
        int idleAt, int absentAt, int identityInvalidAt, string? bombVariant)
    {
        var start = new ProcessStartInfo(Path.ChangeExtension(typeof(MovementNativeParityTests).Assembly.Location, ".exe")) {
            WorkingDirectory = Environment.CurrentDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        start.ArgumentList.Add("--filter-method");
        string method = absentAt >= 0 ? nameof(AbsentMoveAdvancesActualStepWithoutMoveAdmission)
            : idleAt >= 0 ? nameof(TypedIdleAdvancesActualMoveMemoryWithoutPosition)
            : identityInvalidAt >= 0 ? nameof(StaleClientLifeIsRejectedByActualAuthority)
            : bombVariant == "own" ? nameof(CurrentLifeCanExitItsOwnFuseBomb)
            : bombVariant == "wrong-generation" ? nameof(WrongSourceGenerationDeniesOwnBombExit)
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

    private static string WaitReadIpc(string path, Process child, TimeSpan limit)
    {
        var wall = Stopwatch.StartNew();
        while (true)
        {
            if (File.Exists(path))
            {
                try { return File.ReadAllText(path); }
                catch (IOException) when (wall.Elapsed < limit) { }
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
        int absentAt, int identityInvalidAt, string? bombVariant)
    {
        Assert.Equal(count.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_AUTHORITY_COUNT"));
        var scenario = Lumio.Bomber.Tests.MovementNativeParityFixture.Load().Cases.Single(row => row.Id == caseId);
        string root = Lumio.Bomber.Tests.MovementNativeParityFixture.FindGameRoot();
        byte[] catalog = File.ReadAllBytes(Path.Combine(root, "Server/Assets/Maps/official-catalog.json"));
        string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")!;
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
            MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024,
            LogMailboxCapacity = 4096, MaxContexts = 64 };
        using var authority = new Authority(root, native, budget, catalog, scenario, bombVariant);
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
            if (i == identityInvalidAt) authority.InvalidateCurrentLife();
            int requests = i == absentAt ? 0 : 1 + scenario.SampledControls[i].Actions.Length;
            var inputs = new List<InputCommandMessage>();
            Vector3 before = authority.Position;
            for (int part = 0; part < requests; part++)
            {
                string inputPath = Path.Combine(directory, $"input-{i}-{part}.json");
                var wall = Stopwatch.StartNew();
                while (!File.Exists(inputPath))
                {
                    if (wall.Elapsed > TimeSpan.FromSeconds(12)) throw new TimeoutException("Captured client input deadline.");
                    Thread.Sleep(2);
                }
                string encoded = JsonSerializer.Deserialize<string>(File.ReadAllText(inputPath))!;
                var received = WireCodec.DecodeAuthenticatedInput(Convert.FromBase64String(encoded),
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
                ? new ServerRow("N/A", 0, "N/A", 0,
                    before.X, before.Y, before.Z, after.X, after.Y, after.Z, authority.Memory)
                : new ServerRow(inputs[0].Sender.ToHex(), inputs[0].Sequence,
                    outbox.Operations[0].Outcome.Kind.ToString(), outbox.Operations[0].ExecutionTick,
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
                rawHashes.ToArray(), carrierHashes.ToArray(), revisions);
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
        float BeforeX, float BeforeY, float BeforeZ, float X, float Y, float Z, MemoryRow Memory);
    private sealed record ServerOperationRow(ulong Sequence, string MappingId, string Stage,
        string Outcome, string? Code, string CommitFact, ulong ExecutionTick);
    private sealed record BombRow(string Owner, string SourceLife, ulong SourceLifeGeneration,
        string Phase, ulong FuseEndTick, ulong KickStartTick, int KickDirection);
    private sealed record MemoryRow(int Facing, int PendingTurnDirection, ulong PendingTurnUntilTick,
        int LastMoveDirection, ulong LastMoveTick, ulong LastAssistTick, int AssistToleranceMilli);
    private sealed record SectionRevisionEvidence(string Key, ulong BaselineRevision,
        ulong CurrentRevision, string Presence);
    private sealed record ServerStep(ServerRow Row, ServerOperationRow[] Operations, BombRow? Bomb,
        string[] Frames, string[] RawWorldChangeSha256,
        string[] CarrierSha256, SectionRevisionEvidence[] Sections);
    private sealed record ServerResult(ServerRow[] Rows, ServerStep[] Steps, string ActualNative, string NativeSha256);

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

    private sealed class NoSampleMapper : IGameInputMapper
    {
        public bool TryMap(in SequencedInputSample sample, in InputDrainContext context,
            out GameplayCommandCandidate candidate)
        { candidate = default; return false; }
    }

    private sealed class ClientLedger(NetEntityId life, Lumio.Bomber.Tests.MovementNativeParityFixture.Sample[] samples,
        int idleAt, int absentAt)
        : IClientOutboundMessageObserver
    {
        private readonly Stopwatch wall = Stopwatch.StartNew();
        private WorldManager? manager;
        public TimeSpan WallElapsed => wall.Elapsed;
        public List<ClientRow> Rows { get; } = new();
        public List<AcceptedRow> Accepted { get; } = new();
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
            Rows.Add(new ClientRow(sample.StepIndex, context.ConnectionGeneration,
                context.LocalStepOrdinal, hasMove));
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
            if (Rows.Count == 0 || Rows[^1].Published) return;
            if (current.PredictedWorld is not World predicted || !predicted.IsLive(life)) return;
            if (Rows[^1].HasMove && !current.TryReadOwnerPresentation(out _)) return;
            Rows[^1].Pose = predicted.Get<LogicTransform>(life).LocalPosition;
            if (Rows[^1].HasMove && current.TryReadOwnerPresentation(out var pose))
            {
                Rows[^1].PredictionExecutionTick = pose.ExecutionTick;
                Rows[^1].PredictionInputSequence = pose.InputSequence;
            }
            var memory = predicted.Get<BomberPlayerState>(life);
            Rows[^1].Memory = new MemoryRow(memory.Facing.Value,
                memory.PendingTurnDirection.Value, memory.PendingTurnUntilTick.Value,
                memory.LastMoveDirection.Value, memory.LastMoveTick.Value,
                memory.LastAssistTick.Value, memory.AssistToleranceMilli.Value);
            Rows[^1].Published = true;
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
            Accepted.Add(new AcceptedRow(index, message.Sequence,
                Convert.ToHexStringLower(SHA256.HashData(encodedBytes.Span)), encodedBytes.Length));
        }
        private static BomberDirection Direction(string name) => name switch {
            "none" => BomberDirection.None, "up" => BomberDirection.Up,
            "right" => BomberDirection.Right, "down" => BomberDirection.Down,
            "left" => BomberDirection.Left, _ => throw new InvalidDataException("Unknown direction: " + name),
        };
    }

    private sealed class ClientRow(int sampleIndex, ulong connectionGeneration, ulong localStepOrdinal, bool hasMove)
    {
        public int SampleIndex { get; } = sampleIndex;
        public ulong ConnectionGeneration { get; } = connectionGeneration;
        public ulong LocalStepOrdinal { get; } = localStepOrdinal;
        public bool HasMove { get; } = hasMove;
        public ulong? PredictionExecutionTick { get; set; }
        public ulong? PredictionInputSequence { get; set; }
        public Vector3 Pose { get; set; }
        public MemoryRow? Memory { get; set; }
        public bool Published { get; set; }
    }
    private sealed record AcceptedRow(int SampleIndex, ulong Sequence, string Sha256, int ByteLength);

    private sealed class Authority : IDisposable
    {
        private readonly LumioEngine engine;
        private readonly AssemblyLoadContext context;
        public WorldManager Manager { get; }
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
                    Read<int>(bomb, nameof(BomberBombState.KickDirection)));
            }
        }
        public void InvalidateCurrentLife()
        {
            Component seat = Manager.World.NamedComponent(Participant, nameof(BomberParticipantState))!;
            Assert.Equal(Life, (NetEntityId)seat.GetType().GetField(nameof(BomberParticipantState.CurrentLife))!
                .GetValue(seat)!.GetType().GetProperty("Value")!.GetValue(
                    seat.GetType().GetField(nameof(BomberParticipantState.CurrentLife))!.GetValue(seat)!)!);
            Set(seat, nameof(BomberParticipantState.CurrentLife), default(NetEntityId));
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
            Lumio.Bomber.Tests.MovementNativeParityFixture.Case scenario, string? bombVariant)
        {
            string assemblyPath = Environment.GetEnvironmentVariable("LUMIO_BOMBER_SERVER_GAMEPLAY_PATH")
                ?? throw new InvalidOperationException("Produced server Gameplay assembly path is required.");
            context = new AssemblyLoadContext("task-m-server-gameplay", isCollectible: true);
            context.Resolving += (_, name) => AssemblyLoadContext.Default.Assemblies
                .SingleOrDefault(assembly => assembly.GetName().Name == name.Name);
            Assembly assembly = context.LoadFromAssemblyPath(Path.GetFullPath(assemblyPath));
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
            Manager.World.Get<AttributeComponent>(Life).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 3500);
            var transform = Manager.World.Get<LogicTransform>(Life);
            using (transform.BeginWrite(Manager.World.RegisterTransformController(Life, nameof(MoveAbility))))
                transform.SetLocalPosition(new Vector3(scenario.Start[0] + 0.5f, 1.5f, scenario.Start[1] + 0.5f));
            Sections = Lumio.Bomber.Tests.MovementNativeParityFixture.AuthorAndReadback(
                NativeWorldVoxelResources.Require(Manager).Voxel, scenario.Map);
            if (bombVariant is not null)
            {
                Assert.True(bombVariant is "own" or "wrong-generation");
                Assert.True(registry.TryResolveEntityType("bomberBomb", out Type bombType));
                var bombOrder = Manager.World.Commands.CreateFor(bombType);
                Manager.Tick();
                Manager.DrainOutbox();
                Bomb = bombOrder.AssignedId;
                Component bomb = Manager.World.NamedComponent(Bomb, nameof(BomberBombState))!;
                Set(bomb, nameof(BomberBombState.Owner), Participant);
                Set(bomb, nameof(BomberBombState.SourceLife), Life);
                Set(bomb, nameof(BomberBombState.SourceLifeGeneration), bombVariant == "own" ? 1UL : 2UL);
                Set(bomb, nameof(BomberBombState.Phase), (int)BomberBombPhase.Fuse);
                Set(bomb, nameof(BomberBombState.FuseEndTick), checked(Manager.World.Tick + 60UL));
                Set(bomb, nameof(BomberBombState.Power), 1);
                var bombTransform = Manager.World.Get<LogicTransform>(Bomb);
                using (bombTransform.BeginWrite(Manager.World.RegisterTransformController(Bomb, nameof(MoveAbility))))
                    bombTransform.SetLocalPosition(transform.LocalPosition);
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
