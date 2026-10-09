using System;
using System.IO;
using Lumio.Bomber.Client.Application;
using Lumio.Client.Application;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.Session;
using Lumio.Client.Network.Connection;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Client.Application.Tests;

public sealed class ClientCompositionTests
{
    [Fact]
    public void CompositionRetainsTheOriginalOptionsIncludingVoxelPredictionRetryAndHooks()
    {
        var prediction = new ClientJointPredictionOptions
        {
            TotalRetainedPayloadCeiling = 65536, MaxRecords = 64, MaxBlockJournal = 128,
            MaxBindingJournal = 64, MaxOverlaySlots = 64, MaxValidationSections = 16,
            MaxValidationCellsPerSection = 256, MaxBindingTextEntries = 64, BindingTextSlotBytes = 128,
        };
        var voxel = new ClientVoxelOptions
        {
            Catalog = ReadOnlyMemory<byte>.Empty, ResidentSectionBudget = 16,
            ReceiptRetentionEntries = 32, Prediction = prediction,
        };
        var retry = new SessionNotServingRetryOptions(3, TimeSpan.FromMilliseconds(20), TimeSpan.FromMilliseconds(80));
        Func<ReplicaRpcHooks> hooks = () => throw new InvalidOperationException("Composition must not instantiate hooks.");
        var predictionSteps = new ClientPredictionStepOptions(_ => throw new InvalidOperationException("Composition must not invoke prediction steps."));
        var outboundObserver = new NullClientOutboundMessageObserver();
        var options = new ClientInstanceOptions
        {
            Registry = BomberClientApplication.Registry,
            ConfigDirectory = Path.Combine(AppContext.BaseDirectory, "config"),
            Endpoint = new ClientEndpoint("ws://127.0.0.1:19001", ReadOnlyMemory<byte>.Empty,
                ReadOnlyMemory<byte>.Empty, TimeSpan.FromSeconds(4), admittedRoomId: "room-from-launch"),
            InputMapper = null!, // No session is created by this pure composition check.
            Voxel = voxel, NotServingRetry = retry, ReplicaRpcHooksFactory = hooks,
            PredictionSteps = predictionSteps, OutboundObserver = outboundObserver,
            AllowWelcomeOnlyAdmission = false,
        };

        var composed = BomberClientApplication.Configure(options);
        Assert.Same(options, composed);
        Assert.Equal("room-from-launch", composed.Endpoint.AdmittedRoomId);
        Assert.Same(voxel, composed.Voxel);
        Assert.Same(prediction, composed.Voxel!.Prediction);
        Assert.Same(retry, composed.NotServingRetry);
        Assert.Same(hooks, composed.ReplicaRpcHooksFactory);
        Assert.Same(predictionSteps, composed.PredictionSteps);
        Assert.Same(outboundObserver, composed.OutboundObserver);
        Assert.False(composed.AllowWelcomeOnlyAdmission);
        Assert.Equal(RegistrySide.Client, composed.Registry.Side);
    }

    [Fact]
    public void CompositionRejectsAnUnboundRegistryBeforeCreatingAnEngineInstance()
    {
        var options = new ClientInstanceOptions
        {
            Registry = null!, ConfigDirectory = "unused", Endpoint = default, InputMapper = null!,
        };
        Assert.Throws<ArgumentException>(() => BomberClientApplication.Configure(options));
    }
}
