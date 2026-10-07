using System.Globalization;
using System.Numerics;
using System.Reflection;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class OwnerPresentationBridgeTests
{
    private static string Read(SpectatorReplicaHost host)
    {
        MethodInfo? method = typeof(SpectatorReplicaHost).GetMethod("OwnerPresentation");
        Assert.NotNull(method);
        return Assert.IsType<string>(method.Invoke(host, null));
    }

    [Fact]
    public void BeforeReadinessAndAfterCloseReturnsNoInventedPose()
    {
        using var owner = new BrowserSessionOwner();
        Assert.Equal("null", Read(owner.Host));
        owner.Authorize();
        Assert.Equal("null", Read(owner.Host));
        owner.Host.Dispose();
        Assert.Equal("null", Read(owner.Host));
    }

    [Fact]
    public void ActualNativeSessionRenderReadsOriginalModelWithoutTickInputOrFullDump()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", (owner, self) =>
        {
        World world = owner.Host.World!;
        Assert.True(world.IsLive(self));
        Assert.NotNull(world.Get<ModelTransform>(self));
        using var initial = JsonDocument.Parse(Read(owner.Host));
        ulong tick = world.Tick;
        string inputState = owner.Host.SessionState();
        using var session = JsonDocument.Parse(inputState);
        for (int i = 0; i < 30; i++)
        {
            using var pose = JsonDocument.Parse(Read(owner.Host));
            JsonElement row = pose.RootElement;
            Assert.Equal(self.ToHex(), row.GetProperty("entity").GetString());
            Assert.Equal(world.Get<ObserverComponent>(self).ConnectionGeneration.ToString(CultureInfo.InvariantCulture),
                row.GetProperty("connectionGeneration").GetString());
            Assert.Equal(session.RootElement.GetProperty("generation").GetString(),
                row.GetProperty("sessionGeneration").GetString());
            Assert.Equal(initial.RootElement.GetProperty("publicationSequence").GetString(), row.GetProperty("publicationSequence").GetString());
            Assert.Equal(initial.RootElement.GetProperty("executionTick").GetString(), row.GetProperty("executionTick").GetString());
            Assert.False(row.TryGetProperty("players", out _)); Assert.False(row.TryGetProperty("config", out _));
            Assert.Equal(world.Get<ModelTransform>(self).WorldPose.Position.X,
                row.GetProperty("model").GetProperty("position").GetProperty("x").GetSingle());
            Assert.Equal(tick, world.Tick);
            Assert.Equal(inputState, owner.Host.SessionState());
        }
        });
    }

    [Fact]
    public void OwnerPoseJsonUsesSourceGeneratedMetadataAndExactU64Strings()
    {
        if (Environment.GetEnvironmentVariable("LUMIO_STRICT_JSON") == "1") Assert.False(JsonSerializer.IsReflectionEnabledByDefault);
        Type? type = typeof(SpectatorReplicaHost).Assembly.GetType("Lumio.Bomber.Client.Spectator.OwnerPresentationDto");
        Assert.NotNull(type);
        MethodInfo? convert = type.GetMethod("From", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(convert);
        const ulong large = 9007199254740993;
        var target = new Pose(new Vector3(1, 2, 3), new Quaternion(0.1f, 0.2f, 0.3f, 0.9f));
        var model = new Pose(new Vector3(4, 5, 6), Quaternion.Identity);
        var pose = new OwnerPresentationPose(new(ulong.MaxValue, large), large, ulong.MaxValue, large + 1,
            large + 2, large + 3, OwnerPublicationCause.AuthorityCorrection, target, model);
        object dto = convert.Invoke(null, new object[] { 2UL, pose })!;
        var info = SpectatorJsonContext.Default.GetTypeInfo(type);
        Assert.NotNull(info);
        string json = JsonSerializer.Serialize(dto, info);
        object roundtrip = JsonSerializer.Deserialize(json, info)!;
        Assert.Equal(json, JsonSerializer.Serialize(roundtrip, info));
        using var document = JsonDocument.Parse(json);
        var row = document.RootElement;
        Assert.Equal(pose.Entity.ToHex(), row.GetProperty("entity").GetString());
        Assert.Equal("2", row.GetProperty("sessionGeneration").GetString());
        Assert.Equal(large.ToString(CultureInfo.InvariantCulture), row.GetProperty("connectionGeneration").GetString());
        Assert.Equal(ulong.MaxValue.ToString(CultureInfo.InvariantCulture), row.GetProperty("publicationSequence").GetString());
        Assert.Equal((large + 1).ToString(CultureInfo.InvariantCulture), row.GetProperty("localStepOrdinal").GetString());
        Assert.Equal((large + 2).ToString(CultureInfo.InvariantCulture), row.GetProperty("executionTick").GetString());
        Assert.Equal((large + 3).ToString(CultureInfo.InvariantCulture), row.GetProperty("inputSequence").GetString());
        Assert.Equal("AuthorityCorrection", row.GetProperty("cause").GetString());
        Assert.Equal(3, row.GetProperty("target").GetProperty("position").GetProperty("z").GetSingle());
        Assert.Equal(5, row.GetProperty("model").GetProperty("position").GetProperty("y").GetSingle());
        Assert.Equal(0.9f, row.GetProperty("target").GetProperty("rotation").GetProperty("w").GetSingle());
    }

    [Fact]
    public void CompiledClientRegistryPreservesAllOldPlayerSlotsAndAppendsModelOnly()
    {
        Type[] before = { typeof(ObserverComponent), typeof(Lumio.Bomber.Gameplay.Components.Identity.IdentityComponent),
            typeof(LogicTransform), typeof(Lumio.GameRuntime.Gas.AbilityComponent), typeof(Lumio.GameRuntime.Gas.AttributeComponent),
            typeof(Lumio.GameRuntime.Gas.EffectComponent), typeof(Lumio.Bomber.Gameplay.Contracts.Components.BomberPlayerState),
            typeof(Lumio.Bomber.Gameplay.Contracts.Components.BomberSkillState), typeof(Lumio.Bomber.Gameplay.Contracts.Components.BomberHealthFacts),
            typeof(Lumio.Bomber.Gameplay.Contracts.Components.BomberSuccessorLife) };
        var registry = GeneratedRegistry.Instance;
        var components = registry.CreateComponents(typeof(PlayerEntity));
        Assert.Equal(11, components.Length);
        Assert.Equal("player", registry.WireName(typeof(PlayerEntity)));
        for (int i = 0; i < before.Length; i++)
        {
            Assert.Equal(before[i], components[i].GetType());
            Assert.Equal(i, registry.ComponentIndex(typeof(PlayerEntity), before[i]));
            Assert.Equal(i, registry.ComponentIndex(typeof(PlayerEntity), before[i].Name));
        }
        Assert.IsType<ModelTransform>(components[10]);
        Assert.Equal(10, registry.ComponentIndex(typeof(PlayerEntity), typeof(ModelTransform)));
        Assert.Equal(10, registry.ComponentIndex(typeof(PlayerEntity), nameof(ModelTransform)));
        Assert.DoesNotContain(registry.AttributeDeclarations, row => row.AttributeId.StartsWith("ModelTransform.", StringComparison.Ordinal));
    }
}
