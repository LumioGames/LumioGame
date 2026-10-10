using System.Globalization;
using System.Numerics;
using System.Runtime.ExceptionServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using KernelConfig = Lumio.Engine.NativeLoader.KernelConfig;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class MovementCarryDependencyNativeTests
{
    [Theory]
    [InlineData(BomberDirection.Right)]
    [InlineData(BomberDirection.None)]
    public void UnbufferedInputsDoNotReplayForLastMoveTickOnlyAuthority(BomberDirection direction)
    {
        using var fixture = new NativeMovementFixture(blocked: direction == BomberDirection.Right);
        for (ulong sequence = 1; sequence <= 15; sequence++) fixture.Input(sequence, direction);
        Assert.Equal(15, fixture.Gas.OutstandingCount);
        var pose = fixture.Pose;
        var before = fixture.Gas.Metrics;
        var replays = new List<ulong>();
        for (ulong covered = 1; covered <= 5; covered++)
        {
            ulong prior = fixture.Gas.Metrics.Replays;
            fixture.Authority(covered, 200 + covered, 200 + covered);
            replays.Add(fixture.Gas.Metrics.Replays - prior);
            fixture.WriteRow("changed-last-tick-prefix", covered, before);
            Assert.Equal(15 - (int)covered, fixture.Gas.OutstandingCount);
            Assert.Equal(pose, fixture.Pose);
            Assert.Equal(115UL, fixture.Memory.LastMoveTick.Value);
            Assert.Equal(0, fixture.Memory.LastMoveDirection.Value);
        }
        WriteEvidence(JsonSerializer.Serialize(new { caseName = nameof(UnbufferedInputsDoNotReplayForLastMoveTickOnlyAuthority), direction,
            first = before.InputExecutions - before.Replays, replays, retained = fixture.Gas.OutstandingCount,
            confirmedTick = fixture.Manager.ConfirmedWorld.Tick, predictedTick = fixture.Manager.PredictedWorld!.Tick,
            pose = new {pose.X, pose.Y, pose.Z}, native = fixture.NativeIdentity }));
        Assert.Equal(15UL, before.InputExecutions - before.Replays);
        Assert.Equal(0UL, fixture.Gas.Metrics.Replays - before.Replays);
    }

    [Theory]
    [InlineData(BomberDirection.Right)]
    [InlineData(BomberDirection.None)]
    public void SameValueLastMoveTickDoesNotChangeUnbufferedPrediction(BomberDirection direction)
    {
        using var fixture = new NativeMovementFixture(blocked: direction == BomberDirection.Right);
        for (ulong sequence = 1; sequence <= 15; sequence++) fixture.Input(sequence, direction);
        var pose = fixture.Pose;
        var before = fixture.Gas.Metrics;
        for (ulong covered = 1; covered <= 5; covered++)
        {
            fixture.Authority(covered, 200 + covered, 100 + covered);
            fixture.WriteRow("same-value-prefix", covered, before);
            Assert.Equal(15 - (int)covered, fixture.Gas.OutstandingCount);
            Assert.Equal(pose, fixture.Pose);
            Assert.Equal(115UL, fixture.Memory.LastMoveTick.Value);
            Assert.Equal(0, fixture.Memory.LastMoveDirection.Value);
        }
        Assert.Equal(15UL, before.InputExecutions - before.Replays);
        Assert.Equal(0UL, fixture.Gas.Metrics.Replays - before.Replays);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void FreeStraightLastMoveTickInterventionPreservesOutputsWithoutReplay(bool changed)
    {
        using var fixture = new NativeMovementFixture();
        for (ulong sequence = 1; sequence <= 15; sequence++) fixture.Input(sequence, BomberDirection.Right);
        var before = fixture.Gas.Metrics;
        var pose = fixture.Pose;
        fixture.Authority(0, 200, changed ? 200UL : 100UL);
        fixture.WriteRow(changed ? "free-straight-changed" : "free-straight-same", 0, before);
        Assert.Equal(15, fixture.Gas.OutstandingCount);
        Assert.Equal(pose, fixture.Pose);
        Assert.Equal(115UL, fixture.Memory.LastMoveTick.Value);
        Assert.Equal((int)BomberDirection.Right, fixture.Memory.LastMoveDirection.Value);
        Assert.Equal(15UL, before.InputExecutions - before.Replays);
        Assert.Equal(0UL, fixture.Gas.Metrics.Replays - before.Replays);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void BufferedCarryStillReplaysWhenPriorMovementTickChanges(bool turnPressed)
    {
        using var fixture = new NativeMovementFixture(carry: true);
        fixture.Input(1, turnPressed ? BomberDirection.Down : BomberDirection.None, turnPressed);
        var before = fixture.Gas.Metrics;
        Assert.InRange(fixture.Pose.X, 7.6749f, 7.6751f);
        Assert.Equal(7.5f, fixture.Pose.Z);
        fixture.Authority(0, 200, 200);
        fixture.WriteRow("buffered-carry-changed-tick", 0, before);
        Assert.True(fixture.Gas.Metrics.Replays > before.Replays);
        Assert.Equal(7.5f, fixture.Pose.X);
        Assert.Equal(7.5f, fixture.Pose.Z);
        Assert.Equal(101UL, fixture.Memory.LastMoveTick.Value);
        Assert.Equal(0, fixture.Memory.LastMoveDirection.Value);
    }

    [Fact]
    public void ActiveExpiryWithNoneDirectionHasNoPreviousMovementDependency()
    {
        using var fixture = new NativeMovementFixture(activeNone: true);
        fixture.Input(1, BomberDirection.None);
        var before = fixture.Gas.Metrics;
        var pose = fixture.Pose;
        fixture.Authority(0, 200, 200);
        fixture.WriteRow("active-until-none-direction", 0, before);
        Assert.Equal(pose, fixture.Pose);
        Assert.Equal(0UL, fixture.Gas.Metrics.Replays - before.Replays);
    }

    [Theory]
    [InlineData(BomberDirection.Right)]
    [InlineData(BomberDirection.None)]
    public void UnrelatedFacingAuthorityDoesNotReplayUnbufferedInputs(BomberDirection direction)
    {
        using var fixture = new NativeMovementFixture();
        for (ulong sequence = 1; sequence <= 15; sequence++) fixture.Input(sequence, direction);
        var before = fixture.Gas.Metrics;
        var pose = fixture.Pose;
        fixture.FacingAuthority(200, (int)BomberDirection.Left);
        fixture.WriteRow("unrelated-facing", 0, before);
        Assert.Equal(15, fixture.Gas.OutstandingCount);
        Assert.Equal(pose, fixture.Pose);
        Assert.Equal(115UL, fixture.Memory.LastMoveTick.Value);
        Assert.Equal((int)direction, fixture.Memory.LastMoveDirection.Value);
        Assert.Equal(0UL, fixture.Gas.Metrics.Replays - before.Replays);
    }

    [Fact]
    public void NearMaximumPredictionTickFaultPreservesConfirmedMemoryAndPose()
    {
        using var fixture = new NativeMovementFixture(authorityTick: ulong.MaxValue - 3);
        var pose = fixture.ConfirmedPose;
        var memory = fixture.ConfirmedMemory;
        OverflowException? firstError = null;
        string? firstStack = null;
        int ownerThread = Environment.CurrentManagedThreadId;
        EventHandler<FirstChanceExceptionEventArgs> capture = (_, args) =>
        {
            if (Environment.CurrentManagedThreadId == ownerThread && firstError is null && args.Exception is OverflowException overflow)
            {
                firstError = overflow;
                firstStack = overflow.StackTrace;
            }
        };
        OverflowException error;
        AppDomain.CurrentDomain.FirstChanceException += capture;
        try { error = Assert.Throws<OverflowException>(() => fixture.Input(1, BomberDirection.Right, true)); }
        finally { AppDomain.CurrentDomain.FirstChanceException -= capture; }
        Assert.Same(error, fixture.Gas.FailureException);
        Assert.Same(error, firstError);
        Assert.NotNull(firstStack);
        WriteEvidence(JsonSerializer.Serialize(new { operation="overflow-first-chance", sameObject=ReferenceEquals(error, firstError), stack=firstStack, finalStack=error.StackTrace, executions=fixture.Gas.Metrics.InputExecutions, native=fixture.NativeIdentity }));

        Assert.True(fixture.Gas.Faulted);
        Assert.False(fixture.Manager.PredictionPublished);
        Assert.Equal(pose, fixture.ConfirmedPose);
        Assert.Equal(memory, fixture.ConfirmedMemory);
        WriteEvidence(JsonSerializer.Serialize(new { operation="near-maximum-prediction-tick-fault", stack=firstStack, finalStack=error.StackTrace, confirmedMemory=memory, native=fixture.NativeIdentity }));
    }

    [Fact]
    public void PublicPredictionAdmissionBudgetRefusalPreservesConfirmedMemoryAndPose()
    {
        long minimum;
        using (var calibration = new NativeMovementFixture()) minimum = calibration.Gas.RetainedBytes;
        using var fixture = new NativeMovementFixture(predictionMaxBytes: checked(minimum + 2048));
        var pose = fixture.ConfirmedPose;
        var memory = fixture.ConfirmedMemory;
        var error = Record.Exception(() => fixture.Input(1, BomberDirection.None, assertComplete: false));
        if (error is not null) Assert.IsType<PredictionUnavailableException>(error);
        Assert.True(fixture.Gas.Suspended);
        Assert.Equal(0UL, fixture.Gas.Metrics.InputExecutions);
        Assert.False(fixture.Gas.Faulted);
        Assert.False(fixture.Manager.PredictionPublished);
        Assert.Equal(pose, fixture.ConfirmedPose);
        Assert.Equal(memory, fixture.ConfirmedMemory);
        WriteEvidence(JsonSerializer.Serialize(new { operation="bounded-budget-refusal", minimum, limit=fixture.Manager.IngressBudget.PredictionMaxBytes,
            error=error?.GetType().FullName, executions=fixture.Gas.Metrics.InputExecutions, confirmedMemory=memory, native=fixture.NativeIdentity }));
    }

    [Fact]
    public void PublicPredictionExecutionBudgetWaitRollsBackMemoryAndPose()
    {
        long retainedAfterInput;
        using (var calibration = new NativeMovementFixture())
        {
            calibration.Input(1, BomberDirection.None);
            retainedAfterInput = calibration.Gas.RetainedBytes;
        }
        using var fixture = new NativeMovementFixture(predictionMaxBytes: checked(retainedAfterInput - 1));
        var pose = fixture.ConfirmedPose;
        var memory = fixture.ConfirmedMemory;
        var error = Record.Exception(() => fixture.Input(1, BomberDirection.None, assertComplete: false));
        WriteEvidence(JsonSerializer.Serialize(new { operation="execution-budget-wait", retainedAfterInput,
            limit=fixture.Manager.IngressBudget.PredictionMaxBytes, error=error?.GetType().FullName,
            executions=fixture.Gas.Metrics.InputExecutions, suspended=fixture.Gas.Suspended,
            published=fixture.Manager.PredictionPublished, predictedMemory=fixture.PredictedMemory,
            confirmedMemory=memory, native=fixture.NativeIdentity }));
        if (error is not null) Assert.IsType<PredictionUnavailableException>(error);
        Assert.True(fixture.Gas.Metrics.InputExecutions > 0);
        Assert.True(fixture.Gas.Suspended);
        Assert.False(fixture.Gas.Faulted);
        Assert.True(fixture.Manager.PredictionPublished);
        Assert.Equal(pose, fixture.ConfirmedPose);
        Assert.Equal(memory, fixture.ConfirmedMemory);
        Assert.Equal(pose, fixture.Pose);
        Assert.Equal(memory, fixture.PredictedMemory);
    }

    private static void WriteEvidence(string line)
    {
        Console.WriteLine(line);
        string? path = Environment.GetEnvironmentVariable("MOVEMENT_CARRY_ROWS_PATH");
        if (!string.IsNullOrWhiteSpace(path))
            File.AppendAllText(path, line + Environment.NewLine);
    }

    private sealed class NativeMovementFixture : IDisposable
    {
        private const string Connection = "movement-carry-native";
        private static readonly NetEntityId Self = new(41, 2);
        private static readonly NetEntityId Participant = new(41, 4);
        private readonly int _thread = Environment.CurrentManagedThreadId;
        private readonly LumioEngine _engine;
        private Exception? _unclosed;
        private readonly bool _blocked;
        private readonly bool _carry;
        private readonly List<ulong> _recordedTicks = [];
        private readonly ulong _authorityBase;
        internal WorldManager Manager { get; }
        internal GasJointPrediction Gas { get; }
        internal object NativeIdentity { get; }
        internal Vector3 Pose => Manager.PredictedWorld!.Get<LogicTransform>(Self).LocalPosition;
        internal BomberPlayerState Memory => Manager.PredictedWorld!.Get<BomberPlayerState>(Self);

        internal NativeMovementFixture(bool blocked = false, bool carry = false, bool activeNone = false, ulong authorityTick = 100, long predictionMaxBytes = 128L << 20)
        {
            _blocked = blocked; _carry = carry; _authorityBase = authorityTick;
            string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH") ?? throw new InvalidOperationException("Official Native image is required");

            _engine = LumioEngine.Start(native, new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
                MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024, LogMailboxCapacity = 4096, MaxContexts = 64 });
            try
            {
                var loaded = System.Diagnostics.Process.GetCurrentProcess().Modules.Cast<System.Diagnostics.ProcessModule>().Single(row => string.Equals(Path.GetFullPath(row.FileName), Path.GetFullPath(native), StringComparison.OrdinalIgnoreCase));
                NativeIdentity = new { pid = Environment.ProcessId, path = loaded.FileName, sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(loaded.FileName))),
                    gameplay = AssemblyIdentity(typeof(MoveAbility)), gas = AssemblyIdentity(typeof(GasJointPrediction)), ecs = AssemblyIdentity(typeof(WorldManager)),
                    hfsm = AssemblyIdentity(typeof(Lumio.Engine.NativeLoader.KernelConfig)), sdkSelection = Environment.GetEnvironmentVariable("LUMIO_ENGINE_CANDIDATE_ROOT") };
                string game = Path.Combine(Environment.GetEnvironmentVariable("MOVEMENT_GAME_ROOT") ?? throw new InvalidOperationException("Actual Game root required"), "games/101-bomber");
                byte[] catalog = File.ReadAllBytes(Path.Combine(game, "Server/Assets/Maps/official-catalog.json"));
                Manager = _engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance) { Catalog = catalog,
                    Config = SpectatorDump.LoadBomberConfig(), IngressBudget = new WorldIngressBudget(256, 1_048_576, 256, 1_048_576, predictionCapacity:512, predictionMaxBytes:predictionMaxBytes) });
                Manager.Enqueue(new WelcomeMessage(41, Self, 1, Connection));
                Manager.Enqueue(new WorldChangeMessage(authorityTick, 0, [
                    new CreateRecord("world", new(41, 1), [new(nameof(WorldSaveComponent), "tickRate", 20UL),
                        new(nameof(BomberMatchState), "phase", (int)BomberMatchPhase.Running), new(nameof(BomberMatchState), "matchId", 1UL)]),
                    new CreateRecord("player", Self, [new(nameof(AttributeComponent), "movementSpeedMilliBase", 3500L), new(nameof(AttributeComponent), "movementSpeedMilliCurrent", 3500L), new(nameof(LogicTransform), "localPosition", blocked ? "7.825,1.5,7.5" : "7.5,1.5,7.5"),
                        new(nameof(BomberPlayerState), "participant", Participant), new(nameof(BomberPlayerState), "lifeGeneration", 3UL),
                        new(nameof(BomberPlayerState), "lifePhase", (int)BomberLifePhase.Vulnerable), new(nameof(BomberPlayerState), "inputMemoryMatchId", 1UL),
                        new(nameof(BomberPlayerState), "lastMoveTick", authorityTick),
                        new(nameof(BomberPlayerState), "lastMoveDirection", carry ? (int)BomberDirection.Right : 0),
                        new(nameof(BomberPlayerState), "pendingTurnUntilTick", carry || activeNone ? 1006UL : 0UL),
                        new(nameof(BomberPlayerState), "pendingTurnDirection", carry ? (int)BomberDirection.Down : 0)]),
                    new CreateRecord("bomberParticipant", Participant, [new(nameof(BomberParticipantState), "matchId", 1UL),
                        new(nameof(BomberParticipantState), "currentLife", Self), new(nameof(BomberParticipantState), "lifeGeneration", 3UL),
                        new(nameof(BomberParticipantState), "lifePhase", (int)BomberLifePhase.Vulnerable)])], [], [], []));
                Manager.Tick(); Manager.DrainOutbox();
                Assert.Equal(20UL, Manager.ConfirmedWorld.Single<WorldSaveComponent>().TickRate.Value);
                Assert.Equal(3500L, Manager.ConfirmedWorld.Get<AttributeComponent>(Self).GetCurrentValue(BomberAttributeNames.MovementSpeedMilli));
                Assert.Equal(20UL, Convert.ToUInt64(BomberConfigBinding.For(Manager.World).Game.TickRateHz));
                var resources = NativeWorldVoxelResources.Require(Manager);
                Ground(resources.Voxel, blocked, carry);
                var abi = new VoxelFacadeNativeAbi(resources.Voxel);
                int status = abi.OpenPrediction(resources.Voxel.NativeHandle, new VoxelPredictionConfig(64UL<<20,512,4096,4096,4096,64,4096,1024,256), out IVoxelPredictionSession? session);
                if (status != 0 || session is null) { var failure = new InvalidOperationException("OpenPrediction status=" + status); if (session is not null) CloseUntransferred(session, failure); throw failure; }
                try { Gas = new GasJointPrediction(Manager, session, Connection, 1, resources.Adapter); }
                catch (Exception primary) { CloseUntransferred(session, primary); throw; }
                Assert.Same(Gas, GasJointPrediction.For(Manager));
                Manager.EnableClientPredictionClock(Connection, 1);
            }
            catch (Exception primary)
            {
                if (_unclosed is not null) throw;
                try { Dispose(); } catch (Exception cleanup) { throw new AggregateException(primary, cleanup); }
                throw;
            }
        }
        internal void Input(ulong sequence, BomberDirection direction, bool turnPressed = false, bool assertComplete = true)
        {
            CheckOwner();
            Manager.TickPredictionInputStep(1, sequence);
            var input = new MoveAbility.Input { PrimaryDirection = direction, TurnPressed = turnPressed };
            Assert.True(Manager.ConfirmedWorld.Get<AbilityComponent>(Self).Activate<MoveAbility, MoveAbility.Input>(in input, sequence).Succeeded);
            var emitted = Assert.Single(Manager.DrainOutbox().Frames.OfType<InputCommandMessage>());
            Assert.Equal(sequence, emitted.Sequence);
            Manager.EnqueueLocalInput(Connection, sequence, new InputCommandMessage(emitted.Sequence, emitted.Sender, emitted.Commands, Connection, 1));
            if (!assertComplete) return;
            Assert.False(Gas.Suspended); Assert.False(Gas.Faulted);
            Assert.Equal(checked(_authorityBase + sequence), Memory.LastMoveTick.Value);
            Assert.Equal(_carry ? (int)BomberDirection.Right : _blocked ? 0 : (int)direction, Memory.LastMoveDirection.Value);
            _recordedTicks.Add(Memory.LastMoveTick.Value);
        }
        internal void Authority(ulong covered, ulong authorityTick, ulong lastMoveTick)
        {
            CheckOwner();
            var update = new WorldChangeMessage(authorityTick, covered, [],
                [new FieldChange(Self, nameof(BomberPlayerState), "lastMoveTick", lastMoveTick, ChangeReason.Sync)], [], []);
            Gas.ApplyAuthority(() => { Manager.Enqueue(update); Manager.Tick(); });
            Assert.False(Gas.Suspended); Assert.False(Gas.Faulted);
            Assert.Equal(authorityTick, Manager.ConfirmedWorld.Tick);
            Assert.Equal(covered, Manager.ConfirmedWorld.Get<ObserverComponent>(Self).AppliedInputSequence);
            Assert.Equal(lastMoveTick, Manager.ConfirmedWorld.Get<BomberPlayerState>(Self).LastMoveTick.Value);
        }
        internal Vector3 ConfirmedPose => Manager.ConfirmedWorld.Get<LogicTransform>(Self).LocalPosition;
        internal object PredictedMemory => MemorySnapshot(Memory);
        private static object AssemblyIdentity(Type type)
        {
            string path = type.Assembly.Location;
            return new { path, bytes = new FileInfo(path).Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path))), mvid = type.Module.ModuleVersionId };
        }
        private static object MemorySnapshot(BomberPlayerState p) => new { match=p.InputMemoryMatchId.Value, tick=p.LastMoveTick.Value, direction=p.LastMoveDirection.Value,
            pendingDirection=p.PendingTurnDirection.Value, until=p.PendingTurnUntilTick.Value, assist=p.LastAssistTick.Value, tolerance=p.AssistToleranceMilli.Value, facing=p.Facing.Value };
        internal object ConfirmedMemory
        {
            get
            {
                var p = Manager.ConfirmedWorld.Get<BomberPlayerState>(Self);
                return MemorySnapshot(p);
            }
        }
        internal void FacingAuthority(ulong tick, int facing)
        {
            var change = new WorldChangeMessage(tick, 0, [], [new FieldChange(Self,nameof(BomberPlayerState),"facing",facing,ChangeReason.Sync)],[],[]);
            Gas.ApplyAuthority(() => {Manager.Enqueue(change);Manager.Tick();});
            Assert.Equal(facing,Manager.ConfirmedWorld.Get<BomberPlayerState>(Self).Facing.Value);
            Assert.False(Gas.Suspended);Assert.False(Gas.Faulted);
        }
        internal void WriteRow(string operation, ulong covered, GasJointPredictionMetrics before)
        {
            var pose = Pose;
            WriteEvidence(JsonSerializer.Serialize(new { operation, covered, confirmedTick = Manager.ConfirmedWorld.Tick,
                predictedTick = Manager.PredictedWorld!.Tick, recordedTicks = _recordedTicks.ToArray(), retained = Gas.OutstandingCount,
                executions = Gas.Metrics.InputExecutions - before.InputExecutions, replays = Gas.Metrics.Replays - before.Replays,
                memory = PredictedMemory,
                pose = new { pose.X, pose.Y, pose.Z }, native = NativeIdentity }));
        }
        private static void Ground(NativeVoxelWorld world, bool blocked, bool carry)
        {
            var config = SpectatorDump.LoadDisplayConfig();
            uint ground = config.Tables.Blocks.Rows.Single(row => row.Name == "floor").BlockType << 8;
            var key = new VoxelSectionKey(0, 0, 0);
            using var bytes = new MemoryStream();
            using (var writer = new BinaryWriter(bytes, Encoding.UTF8, true))
            {
                uint wall = config.Tables.Blocks.Rows.First(row => row.Enabled && !row.Walkable && row.BlastStop && !row.Destructible && row.SparseBinding == "none").BlockType << 8;
                writer.Write((ushort)(blocked || carry ? 3 : 2)); writer.Write(0u); writer.Write(ground); if (blocked || carry) writer.Write(wall);
                for (int i = 0; i < 4096; i++) writer.Write((byte)(i / 256 == config.Map.GroundLayer ? 1 : i / 256 == config.Map.ObstacleLayer && (blocked && (i & 15) == 8 && ((i >> 4) & 15) == 7 || carry && (i & 15) == 7 && ((i >> 4) & 15) == 8) ? 2 : 0));
            }
            byte[] payload = bytes.ToArray();
            world.RequestSection(key); world.DeliverSection(key, 1, VoxelSectionEncoding.Palette, payload, SHA256.HashData(payload), null);
            Assert.Equal(Lumio.Engine.SDK.VoxelPresence.Ready, world.ReadCell(new(7, (byte)config.Map.GroundLayer, 7)).Presence);
        }
        private void CloseUntransferred(IVoxelPredictionSession session, Exception primary)
        {
            try { int status = session.Close(); if (status != 0) throw new InvalidOperationException("Native Close status=" + status); }
            catch (Exception cleanup) { _unclosed = new AggregateException("Unclosed Native session; borrowed resources retained", primary, cleanup); ExceptionDispatchInfo.Capture(_unclosed).Throw(); }
        }
        private void CheckOwner() => Assert.Equal(_thread, Environment.CurrentManagedThreadId);
        public void Dispose()
        {
            CheckOwner();
            if (_unclosed is not null) ExceptionDispatchInfo.Capture(_unclosed).Throw();
            Gas?.Dispose(); Manager?.Dispose(); Assert.Equal(0, _engine.WorldCount); _engine.Dispose();
        }
    }
}
