using System;
using System.Buffers.Binary;
using System.Collections;
using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using System.Text;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFireExposureCutBoundaryReviewTests
{
    private const string LastField = "BomberSkillState.fireExposureLastTick";
    private const BindingFlags Members = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ExposureLastAtTheUnprocessedResumeTickRefusesAnActualCutWithoutChangingItsPreimage(bool afterSettlement)
    {
        using var scene = OpenExposure();
        NetEntityId target = scene.Lives[2];
        byte[] captured = CaptureCut(scene, target, afterSettlement);
        byte[] preimage = (byte[])captured.Clone();
        SnapshotView original = ReadActualSnapshot(captured, target);
        Assert.Equal(original.Cut.ResumeTick - 1, original.Last);
        byte[] malformed = ReplaceOnlyCapturedLast(captured, target, original.Last, original.Cut.ResumeTick);
        SnapshotView changed = ReadActualSnapshot(malformed, target);
        Assert.Equal(original.Cut, changed.Cut);
        Assert.Equal(changed.Cut.ResumeTick, changed.Last);
        byte[] sourceBeforeRestore = scene.Manager.CaptureSnapshot();

        // Only the serialized Game scalar is corrupt. The real capture cut,
        // source tuple, Effect memory and original Native source remain intact.
        InvalidOperationException failure = BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
        {
            using WorldManager candidate = BomberTestWorld.Restore(malformed, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
        });
        Assert.Equal("Fire exposure lost its exact stable source or clock.", failure.Message);
        Assert.Equal(preimage, captured);
        Assert.Equal(sourceBeforeRestore, scene.Manager.CaptureSnapshot());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void TheActualLastProcessedExposureTickRestoresStrictlyBeforeEitherResumeCursor(bool afterSettlement)
    {
        using var scene = OpenExposure();
        NetEntityId target = scene.Lives[2];
        byte[] captured = CaptureCut(scene, target, afterSettlement);
        byte[] preimage = (byte[])captured.Clone();
        SnapshotView actual = ReadActualSnapshot(captured, target);
        Exposure expected = ReadExposure(scene.World.Get<BomberSkillState>(target));
        Assert.False(expected.Entity.IsDefault);
        Assert.Equal(actual.Last, expected.Last);
        Assert.Equal(actual.Cut.ResumeTick - 1, expected.Last);
        byte[] sourceBeforeRestore = scene.Manager.CaptureSnapshot();

        // These cases exercise the official ECS capture cut. Coupled voxel
        // checkpoint recovery has its separate existing paired integration cases.
        using WorldManager restored = BomberTestWorld.Restore(captured, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        Assert.Equal(actual.Cut, restored.RestoredCut!.Value);
        Assert.Equal(actual.Cut.ResumeTick, restored.World.Tick);
        Exposure resumed = ReadExposure(restored.World.Get<BomberSkillState>(target));
        Assert.Equal(expected, resumed);
        Assert.True(resumed.Last < restored.World.Tick);
        Assert.Equal((int)BomberBombPhase.Burn, restored.World.Get<BomberBombState>(resumed.Entity).Phase.Value);
        Assert.Equal(6L, restored.World.Get<AttributeComponent>(target).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(preimage, captured);
        Assert.Equal(sourceBeforeRestore, scene.Manager.CaptureSnapshot());
    }

    private static BomberTerrainProductionTests.Scene OpenExposure()
    {
        var scene = BomberSplitBombProductionTests.Open();
        try
        {
            var order = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[0], scene.Lives[0], 9701);
            var bomb = order.Get<BomberBombState>();
            bomb.BombKind.Value = (int)BomberBombKind.ReservedFire;
            bomb.Power.Value = 1;
            bomb.CapacityReturned.Value = true;
            BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(7.5f, 1.5f, 7.5f));
            scene.Manager.Tick();
            scene.Manager.Tick();
            while (scene.World.Tick < bomb.DangerUntilTick.Value) scene.Manager.Tick();
            BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[2]),
                new Vector3(8.5f, 1.5f, 7.5f));
            for (int i = 0; i < 4; i++) scene.Manager.Tick();
            var skill = scene.World.Get<BomberSkillState>(scene.Lives[2]);
            Assert.Equal((int)BomberBombPhase.Burn, bomb.Phase.Value);
            Assert.Equal(bomb.Entity, skill.FireExposureEntity.Value);
            Assert.Equal(scene.World.Tick - 1, skill.FireExposureLastTick.Value);
            Assert.True(skill.FireExposureFromTick.Value <= skill.FireExposureLastTick.Value);
            Assert.True(skill.FireExposureStartedTick.Value <= skill.FireExposureLastTick.Value);
            Assert.Single(scene.World.Each<BomberSkillState>(), s => !s.FireExposureEntity.Value.IsDefault);
            Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Equal(0, scene.World.Get<BomberFireFacts>(scene.World.Get<BomberPlayerState>(scene.Lives[2])
                .Participant.Value).FireStatus.Count);
            return scene;
        }
        catch
        {
            scene.Dispose();
            throw;
        }
    }

    private static byte[] CaptureCut(BomberTerrainProductionTests.Scene scene, NetEntityId target, bool afterSettlement)
    {
        byte[] captured;
        ulong processing = scene.World.Tick;
        if (afterSettlement)
        {
            var sink = new ObservedSaveSink(scene.World, target);
            ISnapshotSink? previous = scene.Manager.SnapshotSink;
            scene.Manager.SnapshotSink = sink;
            try
            {
                scene.World.Single<WorldSaveComponent>().Save("fire-exposure-cut-boundary");
                scene.Manager.Tick();
            }
            finally { scene.Manager.SnapshotSink = previous; }
            Assert.Equal(1, sink.Writes);
            Assert.Equal("fire-exposure-cut-boundary", sink.Slot);
            Assert.Equal(processing, sink.ObservedTick);
            // Last == current Tick is legitimate inside the completed Save
            // phase. OnHydrate later sees the next unprocessed ResumeTick.
            Assert.Equal(processing, sink.ObservedLast);
            Assert.Equal(processing + 1, scene.World.Tick);
            captured = sink.Bytes;
        }
        else captured = scene.Manager.CaptureSnapshot();

        Assert.NotEmpty(captured);
        SnapshotView parsed = ReadActualSnapshot(captured, target);
        Assert.Equal(afterSettlement ? PersistenceCut.AfterSettlement : PersistenceCut.BeforeTick, parsed.Cut.Kind);
        Assert.Equal(processing, parsed.Cut.CaptureTick);
        Assert.Equal(afterSettlement ? processing + 1 : processing, parsed.Cut.ResumeTick);
        Assert.Equal(scene.World.Tick, parsed.Cut.ResumeTick);
        Assert.Equal(parsed.Cut.ResumeTick - 1, parsed.Last);
        return captured;
    }

    private readonly record struct SnapshotView(PersistenceCut Cut, ulong Last);

    private static SnapshotView ReadActualSnapshot(byte[] snapshot, NetEntityId target)
    {
        // Invoke the unchanged official06 decoder as a read-only test observer.
        // It supplies the actual cut and entity field; this helper does not
        // manufacture a cut, save image, EffectResult or Claim.
        Type codec = typeof(World).Assembly.GetType("Lumio.GameRuntime.Ecs.WorldSnapshotCodec", throwOnError: true)!;
        MethodInfo read = codec.GetMethod("Read", BindingFlags.Static | BindingFlags.NonPublic)!;
        Assert.NotNull(read);
        object?[] args = { new ReadOnlyMemory<byte>(snapshot), null, null, false, null };
        object header = read.Invoke(null, args)!;
        Assert.NotNull(header);
        var cut = (PersistenceCut)header.GetType().GetField("Cut", Members)!.GetValue(header)!;
        var rows = Assert.IsAssignableFrom<IEnumerable>(args[1]);
        var matches = new List<object>();
        foreach (object row in rows)
            if ((ulong)row.GetType().GetField("Counter", Members)!.GetValue(row)! == target.Counter) matches.Add(row);
        object entity = Assert.Single(matches);
        var fields = Assert.IsAssignableFrom<IDictionary>(entity.GetType().GetField("Fields", Members)!.GetValue(entity));
        Assert.True(fields.Contains(LastField));
        object blob = fields[LastField]!;
        Assert.Equal((byte)2, (byte)blob.GetType().GetField("Tag", Members)!.GetValue(blob)!);
        byte[] bytes = Assert.IsType<byte[]>(blob.GetType().GetField("Bytes", Members)!.GetValue(blob));
        Assert.Equal(sizeof(ulong), bytes.Length);
        return new(cut, BinaryPrimitives.ReadUInt64LittleEndian(bytes));
    }

    private static byte[] ReplaceOnlyCapturedLast(byte[] captured, NetEntityId target, ulong expected, ulong replacement)
    {
        Assert.Equal(expected, ReadActualSnapshot(captured, target).Last);
        Assert.True(expected > 0);
        byte[] key = Encoding.UTF8.GetBytes(LastField);
        var offsets = new List<int>();
        for (int start = sizeof(uint); start <= captured.Length - key.Length - 1 - sizeof(ulong); start++)
        {
            if (BinaryPrimitives.ReadUInt32LittleEndian(captured.AsSpan(start - sizeof(uint))) != (uint)key.Length ||
                !captured.AsSpan(start, key.Length).SequenceEqual(key) || captured[start + key.Length] != 2) continue;
            int value = start + key.Length + 1;
            if (BinaryPrimitives.ReadUInt64LittleEndian(captured.AsSpan(value)) == expected) offsets.Add(value);
        }
        // Exactly one life has nonempty exposure in the actual source scene.
        int offset = Assert.Single(offsets);
        byte[] malformed = (byte[])captured.Clone();
        BinaryPrimitives.WriteUInt64LittleEndian(malformed.AsSpan(offset), replacement);
        Assert.Equal(captured.AsSpan(0, offset).ToArray(), malformed.AsSpan(0, offset).ToArray());
        Assert.Equal(captured.AsSpan(offset + sizeof(ulong)).ToArray(), malformed.AsSpan(offset + sizeof(ulong)).ToArray());
        Assert.Equal(replacement, ReadActualSnapshot(malformed, target).Last);
        return malformed;
    }

    private readonly record struct Exposure(NetEntityId Entity, NetEntityId Participant, NetEntityId Life,
        ulong Generation, ulong Match, ulong Chain, int Family, int Kind, ulong Started, uint Skill, ulong From, ulong Last);

    private static Exposure ReadExposure(BomberSkillState s) => new(s.FireExposureEntity.Value,
        s.FireExposureParticipant.Value, s.FireExposureLife.Value, s.FireExposureGeneration.Value,
        s.FireExposureMatchId.Value, s.FireExposureChainId.Value, s.FireExposureFamily.Value,
        s.FireExposureKind.Value, s.FireExposureStartedTick.Value, s.FireExposureSkill.Value,
        s.FireExposureFromTick.Value, s.FireExposureLastTick.Value);

    private sealed class ObservedSaveSink(World world, NetEntityId target) : ISnapshotSink
    {
        internal byte[] Bytes { get; private set; } = Array.Empty<byte>();
        internal string Slot { get; private set; } = "";
        internal int Writes { get; private set; }
        internal ulong ObservedTick { get; private set; }
        internal ulong ObservedLast { get; private set; }
        public void Write(string slot, ReadOnlyMemory<byte> snapshot)
        {
            Bytes = snapshot.ToArray();
            Slot = slot;
            Writes++;
            ObservedTick = world.Tick;
            ObservedLast = world.Get<BomberSkillState>(target).FireExposureLastTick.Value;
        }
    }
}
