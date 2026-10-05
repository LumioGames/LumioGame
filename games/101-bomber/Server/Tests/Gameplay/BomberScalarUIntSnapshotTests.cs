using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// B-00135 stays an ordinary failing regression until a complete SDK release fixes it.
[Collection("BomberWorld")]
public sealed class BomberScalarUIntSnapshotTests
{
    public static IEnumerable<object[]> Fields()
    {
        foreach (string field in new[] { "characterId", "bombSkillId", "activeSkillId", "passiveSkillId", "comboSourceA", "comboSourceB" })
            yield return new object[] { "skill", field };
        foreach (string field in new[] { "skillId", "comboSourceA", "comboSourceB" })
            yield return new object[] { "pickup", field };
        yield return new object[] { "fire", "sourceSkill" };
    }

    public static IEnumerable<object[]> FieldsAndValues()
    {
        foreach (object[] field in Fields())
            foreach (uint value in new[] { 0U, 0x81234567U, uint.MaxValue })
                yield return new object[] { field[0], field[1], value };
    }

    [Theory]
    [MemberData(nameof(FieldsAndValues))]
    public void RequiredScalarUIntSurvivesRealSnapshot(string component, string field, uint value)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "uint-persist");
        EntityOrder pickup = manager.World.Commands.Create<BomberPickupItemEntity>();
        EntityOrder fire = manager.World.Commands.Create<BomberFireZoneEntity>();
        manager.Tick();
        NetEntityId id = component == "skill" ? player.AssignedId : component == "pickup" ? pickup.AssignedId : fire.AssignedId;
        EcsRegistry.Generated(Get(manager, component, id))!.WriteField(field, value, silent: true);
        byte[] snapshot = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        Assert.Equal(value, (uint)EcsRegistry.Generated(Get(restored, component, id))!.ReadField(field)!);
    }

    [Theory]
    [MemberData(nameof(Fields))]
    public void RequiredScalarUIntChangesRealSnapshotHash(string component, string field)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "uint-persist");
        EntityOrder pickup = manager.World.Commands.Create<BomberPickupItemEntity>();
        EntityOrder fire = manager.World.Commands.Create<BomberFireZoneEntity>();
        manager.Tick();
        NetEntityId id = component == "skill" ? player.AssignedId : component == "pickup" ? pickup.AssignedId : fire.AssignedId;
        IGeneratedComponent generated = EcsRegistry.Generated(Get(manager, component, id))!;
        generated.WriteField(field, 0U, silent: true);
        byte[] before = SHA256.HashData(manager.CaptureSnapshot());
        Assert.Equal(before, SHA256.HashData(manager.CaptureSnapshot()));
        generated.WriteField(field, uint.MaxValue, silent: true);
        Assert.NotEqual(before, SHA256.HashData(manager.CaptureSnapshot()));
    }

    private static Component Get(WorldManager manager, string component, NetEntityId id) => component switch
    {
        "skill" => manager.World.Get<BomberSkillState>(id),
        "pickup" => manager.World.Get<BomberPickupItem>(id),
        "fire" => manager.World.Get<BomberFireZoneState>(id),
        _ => throw new ArgumentOutOfRangeException(nameof(component))
    };
}
