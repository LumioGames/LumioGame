using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.Reflection;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Config.Generated.Server;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBombLoadoutTests
{
    [Theory]
    [InlineData(6u, 1)]
    [InlineData(7u, 3)]
    [InlineData(11u, 5)]
    public void QueuedEquipPreservesCharacterAndCapturesFixedBombKind(uint skillId, int kind)
    {
        using var scene = new Scene();
        BomberSkillState skill = scene.Skills;
        skill.ActiveSkillId.Value = 2;
        skill.ActiveSkillLevel.Value = 2;
        skill.ActiveSkillBound.Value = true;
        skill.PassiveSkillId.Value = 1;
        skill.PassiveSkillLevel.Value = 3;
        skill.PassiveSkillBound.Value = true;
        skill.CooldownFromTick.Value = scene.World.Tick;
        skill.CooldownUntilTick.Value = scene.World.Tick + 200;
        ulong cooldown = skill.CooldownUntilTick.Value;
        skill.ComboSourceA.Value = 6;
        skill.ComboSourceB.Value = 7;
        skill.ComboLevelA.Value = 3;
        skill.ComboLevelB.Value = 2;
        NetEntityId item = scene.Spawn(skillId, level: 99);
        scene.Pick(item);
        Assert.Equal(skillId, skill.BombSkillId.Value);
        Assert.Equal(1, skill.BombSkillLevel.Value);
        Assert.Equal(0u, skill.ComboSourceA.Value);
        Assert.Equal(0u, skill.ComboSourceB.Value);
        Assert.Equal(0, skill.ComboLevelA.Value);
        Assert.Equal(0, skill.ComboLevelB.Value);
        Assert.Equal((2u, 2, true), (skill.ActiveSkillId.Value, skill.ActiveSkillLevel.Value, skill.ActiveSkillBound.Value));
        Assert.Equal((1u, 3, true), (skill.PassiveSkillId.Value, skill.PassiveSkillLevel.Value, skill.PassiveSkillBound.Value));
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);
        Assert.False(scene.World.IsLive(item));
        scene.Queue(scene.Life, nameof(PlaceBombAbility), new PlaceBombAbility.Input());
        scene.Manager.Tick();
        BomberBombState bomb = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(kind, bomb.BombKind.Value);
        Assert.Equal(1, bomb.SkillLevel.Value);
        Assert.Equal(kind == (int)BomberBombKind.Pierce ? 1 : 0, bomb.PierceLayers.Value);
        skill.BombSkillId.Value = skillId == 7u ? 6u : 7u;
        Assert.Equal(kind, bomb.BombKind.Value);
    }

    [Fact]
    public void DifferentKindExchangesTheGroundPayloadAndRecordsIncomingValues()
    {
        using var scene = new Scene();
        scene.Skills.BombSkillId.Value = 6;
        scene.Skills.BombSkillLevel.Value = 9;
        Vector3 feet = scene.Position + new Vector3(0.15f, 0, 0);
        MoveAbility.WritePosition(scene.World, scene.Life, feet, nameof(MoveAbility));
        NetEntityId itemId = scene.Spawn(7, level: 17, offset: new Vector3(0.2f, 0, 0));
        BomberPickupItem item = scene.World.Get<BomberPickupItem>(itemId);
        item.ComboSourceA.Value = 8;
        item.ComboSourceB.Value = 9;
        item.ComboLevelA.Value = 2;
        item.ComboLevelB.Value = 3;
        item.Phase.Value = 7;
        ulong tick = scene.World.Tick;
        scene.Pick(itemId);
        Assert.Single(scene.World.Each<BomberPickupItem>());
        Assert.Equal(7u, scene.Skills.BombSkillId.Value);
        Assert.Equal(6u, item.SkillId.Value);
        Assert.Equal(1, item.SkillLevel.Value);
        Assert.Equal(default, item.ClaimedBy.Value);
        Assert.Equal(scene.Life, item.DroppedBy.Value);
        Assert.Equal(tick, item.SpawnTick.Value);
        Assert.Equal(0UL, item.ProtectedUntilTick.Value);
        Assert.Equal(0, item.Phase.Value);
        Assert.Equal((0u, 0u, 0, 0), (item.ComboSourceA.Value, item.ComboSourceB.Value, item.ComboLevelA.Value, item.ComboLevelB.Value));
        Assert.Equal(feet, scene.World.Get<LogicTransform>(itemId).LocalPosition);
        JsonElement taken = Assert.Single(scene.Occurrences("pickup_taken"));
        Assert.Equal("7", taken.GetProperty("data").GetProperty("skillId").GetString());
        Assert.Equal("17", taken.GetProperty("data").GetProperty("skillLevel").GetString());
    }

    [Theory]
    [InlineData("same")]
    [InlineData("active")]
    [InlineData("passive")]
    [InlineData("unknown")]
    [InlineData("glacier")]
    [InlineData("shock")]
    [InlineData("disabled-kind")]
    [InlineData("skills-off")]
    [InlineData("invalid-held")]
    [InlineData("stale-life")]
    [InlineData("stale-match")]
    [InlineData("missing-participant")]
    [InlineData("wrong-participant-type")]
    [InlineData("dead")]
    [InlineData("claimed")]
    public void InvalidPickupLeavesBothInventoriesAndOccurrenceUntouched(string scenario)
    {
        using var scene = new Scene();
        scene.Skills.BombSkillId.Value = scenario == "invalid-held" ? 10u : 6u;
        scene.Skills.BombSkillLevel.Value = 9;
        scene.Skills.ComboSourceA.Value = 8;
        uint incoming = scenario switch { "same" => 6u, "active" => 2u, "passive" => 5u,
            "unknown" => 999u, "glacier" => 10u, "shock" => 12u, _ => 7u };
        NetEntityId itemId = scene.Spawn(incoming);
        BomberPickupItem item = scene.World.Get<BomberPickupItem>(itemId);
        BomberPlayerState player = scene.World.Get<BomberPlayerState>(scene.Life);
        BomberParticipantState participant = scene.World.Get<BomberParticipantState>(player.Participant.Value);
        if (scenario == "disabled-kind") scene.DisableKind(3);
        if (scenario == "skills-off") scene.DisableSkills();
        if (scenario == "stale-life") player.LifeGeneration.Value++;
        if (scenario == "stale-match") participant.MatchId.Value++;
        if (scenario == "missing-participant") player.Participant.Value = default;
        if (scenario == "wrong-participant-type") player.Participant.Value = itemId;
        if (scenario == "dead") player.LifePhase.Value = (int)BomberLifePhase.AwaitingRespawn;
        if (scenario == "claimed") item.ClaimedBy.Value = scene.Other;
        NetEntityId claim = item.ClaimedBy.Value;
        string before = EcsRegistry.Generated(item)!.ToString()!;
        uint held = scene.Skills.BombSkillId.Value;
        if (scenario is "wrong-participant-type" or "missing-participant" or "dead")
            scene.World.Get<AbilityComponent>(scene.Life).Activate<PickupAbility, PickupAbility.Input>(
                new PickupAbility.Input { Target = itemId });
        else scene.Pick(itemId);
        Assert.True(scene.World.IsLive(itemId));
        Assert.Equal(incoming, item.SkillId.Value);
        Assert.Equal(claim, item.ClaimedBy.Value);
        Assert.Equal(held, scene.Skills.BombSkillId.Value);
        Assert.Equal(9, scene.Skills.BombSkillLevel.Value);
        Assert.Equal(8u, scene.Skills.ComboSourceA.Value);
        Assert.Empty(scene.Occurrences("pickup_taken"));
    }

    [Fact]
    public void ExplosionProtectionDoesNotBlockPickup()
    {
        using var scene = new Scene();
        NetEntityId item = scene.Spawn(7);
        scene.World.Get<BomberPickupItem>(item).ProtectedUntilTick.Value = scene.World.Tick + 100;
        scene.Pick(item);
        Assert.Equal(7u, scene.Skills.BombSkillId.Value);
        Assert.False(scene.World.IsLive(item));
    }

    [Theory]
    [InlineData("solid")]
    [InlineData("water")]
    [InlineData("pending")]
    [InlineData("missing")]
    public void ExchangeRejectsUnavailableLandingWithoutLosingEitherItem(string terrain)
    {
        using var scene = new Scene();
        scene.Skills.BombSkillId.Value = 6;
        NetEntityId itemId = scene.Spawn(7);
        int x = BomberMatchRules.CellX(scene.Position), z = BomberMatchRules.CellZ(scene.Position);
        if (terrain == "solid") scene.Terrain.SetObstacle(x, z, 1023u << 8);
        if (terrain == "water") scene.Terrain.SetWater(x, z);
        if (terrain == "pending") scene.Terrain.SetPending(x, z);
        if (terrain == "missing") scene.Unbind();
        scene.Pick(itemId);
        Assert.Equal(6u, scene.Skills.BombSkillId.Value);
        Assert.Equal(7u, scene.World.Get<BomberPickupItem>(itemId).SkillId.Value);
        Assert.Equal(default, scene.World.Get<BomberPickupItem>(itemId).ClaimedBy.Value);
        Assert.Empty(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData(0.5f, true)]
    [InlineData(0.5001f, false)]
    public void PickupUsesConfiguredInclusiveRadius(float distance, bool accepted)
    {
        using var scene = new Scene();
        Assert.Equal(500, scene.Config.Drops.PickupDistanceMilli);
        NetEntityId item = scene.Spawn(6, offset: new Vector3(distance, 0, 0));
        scene.Pick(item);
        Assert.Equal(accepted ? 6u : 0u, scene.Skills.BombSkillId.Value);
        Assert.Equal(!accepted, scene.World.IsLive(item));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void CompetingQueuedClaimsConserveHeldAndGroundItems(bool exchange)
    {
        using var scene = new Scene();
        MoveAbility.WritePosition(scene.World, scene.Other, scene.Position, nameof(MoveAbility));
        if (exchange)
        {
            scene.Skills.BombSkillId.Value = 6;
            scene.World.Get<BomberSkillState>(scene.Other).BombSkillId.Value = 11;
        }
        NetEntityId item = scene.Spawn(7);
        scene.Queue(scene.Life, nameof(PickupAbility), new PickupAbility.Input { Target = item });
        scene.Queue(scene.Other, nameof(PickupAbility), new PickupAbility.Input { Target = item });
        scene.Manager.Tick();
        uint[] held = scene.World.Each<BomberSkillState>().Select(s => s.BombSkillId.Value).Where(id => id != 0).ToArray();
        uint[] ground = scene.World.Each<BomberPickupItem>().Select(s => s.SkillId.Value).ToArray();
        if (exchange && scene.Occurrences("pickup_taken").Length != 2)
            Assert.True(new PickupAbility().CanActivate(new PickupAbility.Input { Target = item },
                scene.World.Get<AbilityComponent>(scene.Other), out string? reason), reason);
        Assert.Equal(exchange ? new uint[] { 6, 7, 11 } : new uint[] { 7 }, held.Concat(ground).OrderBy(id => id));
        Assert.Equal(exchange ? 1 : 0, ground.Length);
        Assert.Equal(exchange ? 2 : 1, scene.Occurrences("pickup_taken").Length);
    }

    [Fact]
    public void DropperCannotReclaimAcrossTicksButOtherPlayerCan()
    {
        using var scene = new Scene();
        scene.Skills.BombSkillId.Value = 6;
        NetEntityId item = scene.Spawn(7);
        scene.Pick(item);
        for (int i = 0; i < 25; i++) scene.Pick(item);
        Assert.Equal(7u, scene.Skills.BombSkillId.Value);
        Assert.Equal(6u, scene.World.Get<BomberPickupItem>(item).SkillId.Value);
        MoveAbility.WritePosition(scene.World, scene.Other, scene.Position, nameof(MoveAbility));
        Assert.True(new PickupAbility().CanActivate(new PickupAbility.Input { Target = item },
            scene.World.Get<AbilityComponent>(scene.Other), out string? reason), reason);
        scene.Queue(scene.Other, nameof(PickupAbility), new PickupAbility.Input { Target = item });
        scene.Manager.Tick();
        Assert.Equal(6u, scene.World.Get<BomberSkillState>(scene.Other).BombSkillId.Value);
        Assert.False(scene.World.IsLive(item));
    }

    [Theory]
    [InlineData("move")]
    [InlineData("blink")]
    [InlineData("generation")]
    public void LeavingAndReturningWithinOneTickOrNewLifeReleasesDropper(string release)
    {
        using var scene = new Scene();
        scene.Skills.BombSkillId.Value = 6;
        NetEntityId item = scene.Spawn(7);
        scene.Pick(item);
        if (release == "generation")
        {
            BomberPlayerState player = scene.World.Get<BomberPlayerState>(scene.Life);
            player.LifeGeneration.Value++;
            scene.World.Get<BomberParticipantState>(player.Participant.Value).LifeGeneration.Value = player.LifeGeneration.Value;
        }
        else if (release == "blink")
        {
            SelectCharacterAbility.BindCharacter(scene.Skills, scene.Config.Tables.Characters.Rows
                .Single(row => row.Id == 118003u));
            scene.World.Get<BomberPlayerState>(scene.Life).Facing.Value = (int)BomberDirection.Right;
            scene.Queue(scene.Life, nameof(UseActiveSkillAbility), new UseActiveSkillAbility.Input());
            scene.Manager.Tick();
            Assert.Equal(1UL, scene.Skills.TeleportSequence.Value);
            MoveAbility.WritePosition(scene.World, scene.Life, scene.World.Get<LogicTransform>(item).LocalPosition, nameof(MoveAbility));
        }
        else
        {
            Vector3 start = scene.Position;
            MoveAbility.WritePosition(scene.World, scene.Life, start + Vector3.UnitX, nameof(MoveAbility));
            MoveAbility.WritePosition(scene.World, scene.Life, start, nameof(MoveAbility));
        }
        scene.Pick(item);
        Assert.Equal(6u, scene.Skills.BombSkillId.Value);
        Assert.Equal(7u, scene.World.Get<BomberPickupItem>(item).SkillId.Value);
    }

    [Fact]
    public void OutgoingItemAndExclusionSurviveSnapshotRestore()
    {
        using var scene = new Scene();
        scene.Skills.BombSkillId.Value = 6;
        NetEntityId itemId = scene.Spawn(7);
        scene.Pick(itemId);
        BomberPickupItem before = scene.World.Get<BomberPickupItem>(itemId);
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        BomberPickupItem after = restored.World.Get<BomberPickupItem>(itemId);
        Assert.Equal(before.ExcludedLife.Value, after.ExcludedLife.Value);
        Assert.Equal(before.ExcludedLifeGeneration.Value, after.ExcludedLifeGeneration.Value);
        Assert.Equal(before.SpawnTick.Value, after.SpawnTick.Value);
        Assert.Equal(before.SkillId.Value, after.SkillId.Value);
    }

    [Fact]
    public void FavoriteCooldownRemainsFixedAfterLaterCandyExchange()
    {
        using var scene = new Scene();
        BomberSkillState skill = scene.Skills;
        skill.CharacterId.Value = 118005;
        skill.ActiveSkillId.Value = 13;
        skill.ActiveSkillLevel.Value = 1;
        skill.ActiveSkillBound.Value = true;
        skill.BombSkillId.Value = 7;
        scene.World.Get<BomberPlayerState>(scene.Life).Facing.Value = (int)BomberDirection.Right;
        scene.Queue(scene.Life, nameof(PlaceBombAbility), new PlaceBombAbility.Input());
        scene.Manager.Tick();
        BomberBombState bomb = Assert.Single(scene.World.Each<BomberBombState>());
        MoveAbility.WritePosition(scene.World, bomb.Entity, scene.Position + Vector3.UnitX, nameof(BombSystem));
        scene.Queue(scene.Life, nameof(UseActiveSkillAbility), new UseActiveSkillAbility.Input());
        scene.Manager.Tick();
        ulong cooldown = skill.CooldownUntilTick.Value;
        Assert.True(cooldown > scene.World.Tick);
        NetEntityId candy = scene.Spawn(6);
        scene.Pick(candy);
        Assert.Equal(6u, skill.BombSkillId.Value);
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);
    }

    [Theory]
    [InlineData(2u)]
    [InlineData(10u)]
    [InlineData(12u)]
    [InlineData(999u)]
    public void InvalidOccupiedPlacementIsRejectedBeforeReservationAndStock(uint skill)
    {
        using var scene = new Scene();
        scene.Skills.BombSkillId.Value = skill;
        BomberWorldRuntime runtime = scene.World.Single<BomberWorldRuntime>();
        ulong chain = runtime.NextChainId.Value;
        scene.Queue(scene.Life, nameof(PlaceBombAbility), new PlaceBombAbility.Input());
        scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, scene.World.Get<AttributeComponent>(scene.Life).GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(chain, runtime.NextChainId.Value);
        Assert.Equal(0, runtime.BombPlacementCells.Count);
        Assert.Empty(scene.Occurrences("bomb_placed"));
    }

    internal sealed class Scene : IDisposable
    {
        internal readonly WorldManager Manager;
        internal readonly NetEntityId Life;
        internal readonly SkillAuthorityTests.BlinkVoxelAbi Terrain;
        private IDisposable? binding;
        private readonly Dictionary<NetEntityId, uint> sequences = new();
        internal World World => Manager.World;
        internal IBomberConfig Config => BomberConfigBinding.For(World);
        internal BomberSkillState Skills => World.Get<BomberSkillState>(Life);
        internal NetEntityId Other => World.Each<BomberPlayerState>().First(row => row.Entity != Life).Entity;
        internal Vector3 Position => World.Get<LogicTransform>(Life).LocalPosition;

        internal Scene()
        {
            Manager = SkillAuthorityTests.StartedMatch(out Life);
            Terrain = new SkillAuthorityTests.BlinkVoxelAbi(Config.Map);
            binding = VoxelGameplayBinding.Bind(Manager,
                new HostVoxelWorldAdapter(new Lumio.Engine.NativeLoader.KernelHandle { Generation = 1 }, Terrain) { World = World });
            MoveAbility.WritePosition(World, Life, new Vector3(3.5f, Config.Map.ObstacleLayer + 0.5f, 3.5f), nameof(MoveAbility));
        }

        internal NetEntityId Spawn(uint skill, int level = 1, Vector3 offset = default)
        {
            Vector3 point = Position + offset;
            EntityOrder order = World.Commands.Create<BomberPickupItemEntity>();
            BomberPickupItem item = order.Get<BomberPickupItem>();
            item.Kind.Value = (int)BomberPickupKind.Skill;
            item.SkillId.Value = skill;
            item.SkillLevel.Value = level;
            Vector3 staging = Position + new Vector3(1, 0, 1);
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
                FormattableString.Invariant($"{staging.X:R},{staging.Y:R},{staging.Z:R}"), silent: true);
            Manager.Tick();
            EcsRegistry.Generated(World.Get<LogicTransform>(order.AssignedId))!.WriteField("localPosition",
                FormattableString.Invariant($"{point.X:R},{point.Y:R},{point.Z:R}"), silent: true);
            return order.AssignedId;
        }

        internal void Pick(NetEntityId target)
        {
            Queue(Life, nameof(PickupAbility), new PickupAbility.Input { Target = target });
            Manager.Tick();
        }

        internal void Queue(NetEntityId life, string ability, IAbilityInput input)
        {
            uint sequence = sequences.TryGetValue(life, out uint previous) ? previous + 1 : 1;
            sequences[life] = sequence;
            var args = new List<object?> { ability };
            input.Write(args);
            args.Add(sequence.ToString(CultureInfo.InvariantCulture));
            MethodInfo encode = typeof(WireCodec).GetMethod("EncodeServerRpc", BindingFlags.Static | BindingFlags.NonPublic,
                null, new[] { typeof(string), typeof(string), typeof(object[]) }, null)!;
            byte[] payload = (byte[])encode.Invoke(null, new object[] { nameof(AbilityComponent), "Activate", args.ToArray() })!;
            Manager.Enqueue(new InputCommandMessage(sequence, WireCodec.ServerRpc, life, payload));
        }

        internal JsonElement[] Occurrences(string kind)
        {
            var result = new List<JsonElement>();
            var entries = World.Single<BomberPresentationJournal>().Entries;
            for (int i = 0; i < entries.Count; i++)
            {
                using JsonDocument doc = JsonDocument.Parse(entries[i]);
                if (doc.RootElement.GetProperty("kind").GetString() == kind)
                    result.Add(doc.RootElement.Clone());
            }
            return result.ToArray();
        }

        internal void DisableSkills()
        {
            GameRow old = Config.Game;
            SetProperty(Config, "Game", new GameRow(old.Id, old.Name, old.TickRateHz, old.PlayerCount,
                old.MapSize, old.WarmupMs, old.MatchDurationMs, old.PodiumMs, old.ResultsMs,
                false, old.DefaultBotProfile, old.SourceStatus, old.SourceRef, old.InitialSeed,
                old.CentralSupplyEnabled, old.CentralSupplyAnnounceMs, old.CentralSupplyOpenMs,
                old.CentralSupplyStrengtheningCount, old.CentralSupplyHealthCount, old.CentralSupplyFrenzyCount,
                old.CentralSupplySpecialCount, old.CentralSupplyGoldenHeartCount, old.FrenzyEnabled,
                old.FrenzyDurationMs, old.FrenzyFuseMs, old.FrenzyConcurrentLimit, old.FrenzyMinPlacementTicks));
        }

        internal void DisableKind(uint kind) => SetProperty(Config.Tables, "BombKinds", new BombKindsTable(
            Config.Tables.BombKinds.Rows.Select(row => new BombKindsRow(row.Id, row.Name, row.KindCode,
                row.KindCode == kind ? false : row.Enabled, row.EffectKey, row.SourceStatus, row.SourceRef)).ToArray()));

        private static void SetProperty(object target, string property, object value) => target.GetType()
            .GetField("<" + property + ">k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(target, value);

        internal void Unbind() { binding?.Dispose(); binding = null; }
        public void Dispose() { Unbind(); Manager.Dispose(); }
    }
}

[Collection("BomberWorld")]
public sealed class AutomaticPickupTests
{
    [Theory]
    [InlineData(6u)]
    [InlineData(7u)]
    [InlineData(11u)]
    public void StationaryLifeCollectsSupportedCandyThroughTick(uint skillId)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        NetEntityId item = scene.Spawn(skillId, offset: new Vector3(0.5f, 0, 0));
        scene.Manager.Tick();
        Assert.Equal(skillId, scene.Skills.BombSkillId.Value);
        Assert.False(scene.World.IsLive(item));
        Assert.Single(scene.Occurrences("pickup_taken"));
    }

    [Fact]
    public void CandyOutsideRadiusIsUntouched()
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        NetEntityId item = scene.Spawn(6, offset: new Vector3(0.5001f, 0, 0));
        scene.Manager.Tick();
        Assert.Equal(0u, scene.Skills.BombSkillId.Value);
        Assert.True(scene.World.IsLive(item));
        Assert.Empty(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void MultipleCandiesUseDefaultGasSequenceAndConservePayloads(bool reverseCreation)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        uint firstKind = reverseCreation ? 7u : 6u;
        uint secondKind = reverseCreation ? 6u : 7u;
        NetEntityId first = scene.Spawn(firstKind);
        NetEntityId second = scene.Spawn(secondKind);
        scene.Manager.Tick();
        Assert.Equal(secondKind, scene.Skills.BombSkillId.Value);
        Assert.False(scene.World.IsLive(first));
        Assert.Equal(firstKind, scene.World.Get<BomberPickupItem>(second).SkillId.Value);
        Assert.Equal(2, scene.Occurrences("pickup_taken").Length);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ReversedQueuedInputOrderStillClaimsOneCandy(bool reverseInputs)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        MoveAbility.WritePosition(scene.World, scene.Other, scene.Position, nameof(MoveAbility));
        NetEntityId item = scene.Spawn(7);
        NetEntityId first = reverseInputs ? scene.Other : scene.Life;
        NetEntityId second = reverseInputs ? scene.Life : scene.Other;
        scene.Queue(first, nameof(PickupAbility), new PickupAbility.Input { Target = item });
        scene.Queue(second, nameof(PickupAbility), new PickupAbility.Input { Target = item });
        scene.Manager.Tick();
        Assert.Equal(7u, scene.World.Get<BomberSkillState>(first).BombSkillId.Value);
        Assert.Equal(0u, scene.World.Get<BomberSkillState>(second).BombSkillId.Value);
        Assert.False(scene.World.IsLive(item));
        Assert.Single(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void SortedPlayersCanTakeOutgoingCandyAfterRefusalOrExchange(bool exchange)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        MoveAbility.WritePosition(scene.World, scene.Other, scene.Position, nameof(MoveAbility));
        scene.Skills.BombSkillId.Value = 6;
        NetEntityId item = scene.Spawn(exchange ? 7u : 6u);
        scene.Manager.Tick();
        Assert.Equal(exchange ? 7u : 6u, scene.Skills.BombSkillId.Value);
        Assert.Equal(6u, scene.World.Get<BomberSkillState>(scene.Other).BombSkillId.Value);
        Assert.False(scene.World.IsLive(item));
        Assert.Equal(exchange ? 2 : 1, scene.Occurrences("pickup_taken").Length);
    }

    [Fact]
    public void ExactLifeCannotReclaimOutgoingCandyAcrossTicks()
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        scene.Skills.BombSkillId.Value = 6;
        NetEntityId item = scene.Spawn(7);
        for (int i = 0; i < 30; i++) scene.Manager.Tick();
        Assert.Equal(7u, scene.Skills.BombSkillId.Value);
        Assert.Equal(6u, scene.World.Get<BomberPickupItem>(item).SkillId.Value);
        Assert.Single(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void QueuedAndAutomaticPickupContestOneItem(bool exchange)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        if (exchange) scene.Skills.BombSkillId.Value = 6;
        NetEntityId item = scene.Spawn(7);
        scene.Queue(scene.Life, nameof(PickupAbility), new PickupAbility.Input { Target = item });
        scene.Manager.Tick();
        Assert.Equal(7u, scene.Skills.BombSkillId.Value);
        Assert.Equal(exchange ? 6u : 0u,
            exchange ? scene.World.Get<BomberPickupItem>(item).SkillId.Value : 0u);
        Assert.Single(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void QueuedExchangeLetsOtherLifeCollectOutgoingCandyInSameTick(bool claimantIsFirstSlot)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        NetEntityId firstLife = scene.Life;
        NetEntityId secondLife = scene.Other;
        Assert.Equal(0, scene.World.Get<BomberPlayerState>(firstLife).ParticipantIndex.Value);
        Assert.Equal(1, scene.World.Get<BomberPlayerState>(secondLife).ParticipantIndex.Value);
        MoveAbility.WritePosition(scene.World, secondLife, scene.Position, nameof(MoveAbility));
        NetEntityId claimant = claimantIsFirstSlot ? firstLife : secondLife;
        NetEntityId collector = claimantIsFirstSlot ? secondLife : firstLife;
        scene.World.Get<BomberSkillState>(claimant).BombSkillId.Value = 6;
        NetEntityId item = scene.Spawn(7);

        scene.Queue(claimant, nameof(PickupAbility), new PickupAbility.Input { Target = item });
        scene.Manager.Tick();

        Assert.Equal(7u, scene.World.Get<BomberSkillState>(claimant).BombSkillId.Value);
        Assert.Equal(6u, scene.World.Get<BomberSkillState>(collector).BombSkillId.Value);
        Assert.False(scene.World.IsLive(item));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        JsonElement[] taken = scene.Occurrences("pickup_taken");
        Assert.Equal(2, taken.Length);
        Assert.Equal(claimant.ToHex(), taken[0].GetProperty("lifeId").GetString());
        Assert.Equal(collector.ToHex(), taken[1].GetProperty("lifeId").GetString());
        Assert.Equal(item.ToHex(), taken[0].GetProperty("entityId").GetString());
        Assert.Equal(item.ToHex(), taken[1].GetProperty("entityId").GetString());
        Assert.Equal("7", taken[0].GetProperty("data").GetProperty("skillId").GetString());
        Assert.Equal("6", taken[1].GetProperty("data").GetProperty("skillId").GetString());
        Assert.Equal(taken[0].GetProperty("tick").GetString(), taken[1].GetProperty("tick").GetString());
        ulong firstSequence = ulong.Parse(taken[0].GetProperty("sequence").GetString()!, CultureInfo.InvariantCulture);
        ulong secondSequence = ulong.Parse(taken[1].GetProperty("sequence").GetString()!, CultureInfo.InvariantCulture);
        Assert.Equal(firstSequence + 1, secondSequence);
    }

    [Fact]
    public void ClaimedCandyIsNotCollectedAutomatically()
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        NetEntityId item = scene.Spawn(6);
        scene.World.Get<BomberPickupItem>(item).ClaimedBy.Value = scene.Other;
        scene.Manager.Tick();
        Assert.Equal(0u, scene.Skills.BombSkillId.Value);
        Assert.Empty(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData("same")]
    [InlineData("invalid")]
    [InlineData("skills-off")]
    [InlineData("invalid-held")]
    [InlineData("stale-match")]
    [InlineData("blocked")]
    public void InvalidAutomaticCandidateDoesNotMutateInventory(string scenario)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        uint incoming = scenario == "invalid" ? 999u : 7u;
        if (scenario == "same") scene.Skills.BombSkillId.Value = incoming;
        if (scenario == "invalid-held") scene.Skills.BombSkillId.Value = 999;
        if (scenario == "blocked") scene.Skills.BombSkillId.Value = 6;
        NetEntityId itemId = scene.Spawn(incoming);
        if (scenario == "skills-off") scene.DisableSkills();
        if (scenario == "stale-match")
        {
            BomberPlayerState player = scene.World.Get<BomberPlayerState>(scene.Life);
            scene.World.Get<BomberParticipantState>(player.Participant.Value).MatchId.Value++;
        }
        if (scenario == "blocked")
            scene.Terrain.SetObstacle(BomberMatchRules.CellX(scene.Position), BomberMatchRules.CellZ(scene.Position), 1023u << 8);
        uint held = scene.Skills.BombSkillId.Value;
        scene.Manager.Tick();
        Assert.Equal(held, scene.Skills.BombSkillId.Value);
        Assert.Equal(incoming, scene.World.Get<BomberPickupItem>(itemId).SkillId.Value);
        Assert.Empty(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData("generation")]
    [InlineData("exit-return")]
    public void ExactLifeExclusionReleasesAfterGenerationOrCellExit(string release)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        scene.Skills.BombSkillId.Value = 6;
        NetEntityId item = scene.Spawn(7);
        scene.Manager.Tick();
        if (release == "generation")
        {
            BomberPlayerState player = scene.World.Get<BomberPlayerState>(scene.Life);
            player.LifeGeneration.Value++;
            scene.World.Get<BomberParticipantState>(player.Participant.Value).LifeGeneration.Value = player.LifeGeneration.Value;
        }
        else
        {
            Vector3 start = scene.Position;
            MoveAbility.WritePosition(scene.World, scene.Life, start + Vector3.UnitX, nameof(MoveAbility));
            MoveAbility.WritePosition(scene.World, scene.Life, start, nameof(MoveAbility));
        }
        scene.Manager.Tick();
        Assert.Equal(6u, scene.Skills.BombSkillId.Value);
        Assert.Equal(7u, scene.World.Get<BomberPickupItem>(item).SkillId.Value);
        Assert.Equal(2, scene.Occurrences("pickup_taken").Length);
    }

    [Fact]
    public void ExplosionProtectionDoesNotBlockAutomaticCollection()
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        NetEntityId item = scene.Spawn(11);
        scene.World.Get<BomberPickupItem>(item).ProtectedUntilTick.Value = scene.World.Tick + 100;
        scene.Manager.Tick();
        Assert.Equal(11u, scene.Skills.BombSkillId.Value);
        Assert.False(scene.World.IsLive(item));
    }

    [Fact]
    public void OrdinaryPickupStillRequiresExplicitGasInput()
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        EntityOrder order = scene.World.Commands.Create<BomberPickupItemEntity>();
        BomberPickupItem item = order.Get<BomberPickupItem>();
        item.Kind.Value = (int)BomberPickupKind.Power;
        Vector3 staging = scene.Position + new Vector3(1, 0, 1);
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{staging.X:R},{staging.Y:R},{staging.Z:R}"), silent: true);
        scene.Manager.Tick();
        Vector3 point = scene.Position;
        EcsRegistry.Generated(scene.World.Get<LogicTransform>(order.AssignedId))!.WriteField("localPosition",
            FormattableString.Invariant($"{point.X:R},{point.Y:R},{point.Z:R}"), silent: true);
        scene.Manager.Tick();
        Assert.True(scene.World.IsLive(order.AssignedId));
        Assert.Empty(scene.Occurrences("pickup_taken"));
        scene.Pick(order.AssignedId);
        Assert.False(scene.World.IsLive(order.AssignedId));
        Assert.Single(scene.Occurrences("pickup_taken"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ConfiguredPickupCapacityIsAcceptedAndOverflowFailsBeforeClaims(bool overflow)
    {
        using var scene = new BomberBombLoadoutTests.Scene();
        int capacity = scene.Config.ObjectBudgets.PickupCapacity;
        Assert.Equal(703, capacity);
        Vector3 staging = scene.Position + new Vector3(1, 0, 1);
        EntityOrder first = QueueCandy(scene, staging);
        for (int i = 1; i < capacity + (overflow ? 1 : 0); i++) QueueCandy(scene, staging);
        scene.Manager.Tick();
        Vector3 point = scene.Position;
        EcsRegistry.Generated(scene.World.Get<LogicTransform>(first.AssignedId))!.WriteField("localPosition",
            FormattableString.Invariant($"{point.X:R},{point.Y:R},{point.Z:R}"), silent: true);

        if (overflow)
        {
            InvalidOperationException error = Assert.Throws<InvalidOperationException>(() => scene.Manager.Tick());
            Assert.Contains("Automatic pickup item count exceeds the configured budget", error.ToString());
            Assert.Equal(0u, scene.Skills.BombSkillId.Value);
            Assert.Equal(6u, first.Get<BomberPickupItem>().SkillId.Value);
            Assert.Equal(default, first.Get<BomberPickupItem>().ClaimedBy.Value);
            Assert.Empty(scene.Occurrences("pickup_taken"));
        }
        else
        {
            scene.Manager.Tick();
            Assert.Equal(6u, scene.Skills.BombSkillId.Value);
            Assert.Single(scene.Occurrences("pickup_taken"));
        }
    }

    private static EntityOrder QueueCandy(BomberBombLoadoutTests.Scene scene, Vector3 position)
    {
        EntityOrder order = scene.World.Commands.Create<BomberPickupItemEntity>();
        BomberPickupItem item = order.Get<BomberPickupItem>();
        item.Kind.Value = (int)BomberPickupKind.Skill;
        item.SkillId.Value = 6;
        item.SkillLevel.Value = 1;
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);
        return order;
    }
}
