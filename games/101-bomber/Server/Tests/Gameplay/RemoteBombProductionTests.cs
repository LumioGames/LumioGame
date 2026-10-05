using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class RemoteBombProductionTests
{
    [Fact]
    public void SameTickTapPlacesRemoteWithTheActualEightSecondFallback()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        BombButtonProductionTests.Queue(scene, 1, 1);
        BombButtonProductionTests.Queue(scene, 3, 2);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(7, bomb.BombKind.Value);
        Assert.Equal(160UL, bomb.FuseEndTick.Value - bomb.PlacedAtTick.Value);
        MovementInputMemoryTests.Position(scene, new Vector3(3.5f, 1.5f, 3.5f));
        while (scene.World.Tick < bomb.FuseEndTick.Value) scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        Assert.Equal(3, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void ActualHeldTicksDetonateOnlyOwnRemoteBombsTogetherAndNeverPlaceAnother()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var first = fixture.Place(0, 7, 7);
        var second = fixture.Place(0, 9, 7);
        var foreign = fixture.Place(1, 13, 7);
        MovementInputMemoryTests.Position(scene, new Vector3(3.5f, 1.5f, 3.5f));
        Queue(scene, 1, 1); scene.Manager.Tick();
        var pressed = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        Assert.Equal(2, pressed.BombButtonMode.Value);
        for (uint sequence = 2; sequence <= 6; sequence++)
        {
            Queue(scene, 2, sequence); scene.Manager.Tick();
            Assert.Equal((int)BomberBombPhase.Fuse, first.Phase.Value);
            Assert.Equal((int)BomberBombPhase.Fuse, second.Phase.Value);
            Assert.Equal(scene.World.Tick - 1, pressed.BombButtonLastInputTick.Value);
        }
        Queue(scene, 2, 7); scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Danger, first.Phase.Value);
        Assert.Equal((int)BomberBombPhase.Danger, second.Phase.Value);
        Assert.Equal(first.ChainId.Value, second.ChainId.Value);
        Assert.Equal((int)BomberBombPhase.Fuse, foreign.Phase.Value);
        Queue(scene, 2, 8);
        Queue(scene, 3, 9); scene.Manager.Tick();
        Assert.Equal(3, scene.World.Each<BomberBombState>().Count());
        Assert.Equal(3, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void CancelOrMissingHeldInputCannotDetonateOrBecomeAShortTap(bool cancel)
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var bomb = fixture.Place(0, 7, 7);
        MovementInputMemoryTests.Position(scene, new Vector3(3.5f, 1.5f, 3.5f));
        Queue(scene, 1, 1);
        if (cancel) Queue(scene, 4, 2);
        scene.Manager.Tick();
        for (int i = 0; i < 8; i++) scene.Manager.Tick();
        Queue(scene, 3, cancel ? 3u : 2u); scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(2, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void SuccessfulActualCatBlinkDetonatesOwnRemoteWithoutChangingForeignOwner()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var own = fixture.Place(0, 7, 7);
        var foreign = fixture.Place(1, 13, 7);
        var config = BomberConfigBinding.For(scene.World);
        var skills = scene.World.Get<BomberSkillState>(scene.Lives[0]);
        var cat = config.Tables.Characters.Rows.Single(c => c.BoundSkillId == 3);
        SelectCharacterAbility.BindCharacter(skills, cat);
        scene.World.Get<BomberParticipantState>(scene.World.Get<BomberPlayerState>(scene.Lives[0]).Participant.Value).SelectedForMatchCharacterId.Value = checked((int)cat.Id);
        fixture.Equip(0);
        scene.World.Get<BomberPlayerState>(scene.Lives[0]).Facing.Value = (int)BomberDirection.Right;
        MovementInputMemoryTests.Position(scene, new Vector3(3.5f, 1.5f, 3.5f));
        MovementInputMemoryTests.Queue(scene, nameof(UseActiveSkillAbility), default(UseActiveSkillAbility.Input), 1, 100);
        scene.Manager.Tick();
        Assert.Equal(1UL, skills.TeleportSequence.Value);
        Assert.Equal(new Vector3(6.5f, 1.5f, 3.5f), MovementInputMemoryTests.Position(scene));
        Assert.Equal((int)BomberBombPhase.Danger, own.Phase.Value);
        Assert.Equal((int)BomberBombPhase.Fuse, foreign.Phase.Value);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void SlotChangesCannotChangeTheCapturedGestureMode(bool startedRemote)
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var remote = fixture.Place(0, 7, 7);
        MovementInputMemoryTests.Position(scene, new Vector3(3.5f, 1.5f, 3.5f));
        var skills = scene.World.Get<BomberSkillState>(scene.Lives[0]);
        if (!startedRemote) skills.BombSkillId.Value = 0;
        Queue(scene, 1, 1); scene.Manager.Tick();
        if (startedRemote) skills.BombSkillId.Value = 0;
        else fixture.Equip(0);
        for (uint sequence = 2; sequence <= 7; sequence++)
        { Queue(scene, 2, sequence); scene.Manager.Tick(); }
        Queue(scene, 3, 8); scene.Manager.Tick();
        Assert.Equal(startedRemote ? (int)BomberBombPhase.Danger : (int)BomberBombPhase.Fuse, remote.Phase.Value);
        Assert.Equal(startedRemote ? 1 : 2, scene.World.Each<BomberBombState>().Count());
    }

    [Theory]
    [InlineData("match")]
    [InlineData("life")]
    [InlineData("phase")]
    [InlineData("death")]
    [InlineData("freeze")]
    public void OldOrLockedLifeCannotContinueOrReleaseTheGesture(string boundary)
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var bomb = fixture.Place(0, 7, 7);
        MovementInputMemoryTests.Position(scene, new Vector3(3.5f, 1.5f, 3.5f));
        Queue(scene, 1, 1); scene.Manager.Tick();
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        switch (boundary)
        {
            case "match": scene.World.Get<BomberParticipantState>(player.Participant.Value).MatchId.Value++; break;
            case "life": player.LifeGeneration.Value++; break;
            case "phase": scene.World.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Podium; break;
            case "death": player.LifePhase.Value = (int)BomberLifePhase.AwaitingRespawn; break;
            default: _ = BomberFiniteFreezeTests.FreezeForInputFixture(scene.Manager, scene.Lives[0]); break;
        }
        for (uint sequence = 2; sequence <= 8; sequence++)
        { Queue(scene, 2, sequence); scene.Manager.Tick(); }
        Queue(scene, 3, 9); scene.Manager.Tick();
        Assert.Equal(0, player.BombButtonMode.Value);
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.Single(scene.World.Each<BomberBombState>(), b => b.BombKind.Value == 7);
    }

    private static void Queue(BomberTerrainProductionTests.Scene scene, int phase, uint sequence) =>
        MovementInputMemoryTests.Queue(scene, phase is 3 or 4 ? nameof(BombButtonReleaseAbility) : nameof(BombButtonAbility),
            phase is 3 or 4 ? new BombButtonReleaseAbility.Input { Phase = phase } : new BombButtonAbility.Input { Phase = phase },
            sequence, sequence + 100UL);

    [Fact]
    public void ActualDeathAndSuccessorTransferCannotReplayAnOldRemoteRelease()
    {
        using var fixture = new Fixture(controlled: true);
        var scene = fixture.Scene;
        var world = scene.World;
        NetEntityId old = scene.Lives[0];
        var bomb = fixture.Place(0, 7, 7);
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        MovementInputMemoryTests.Position(scene, new Vector3(11.5f, 1.5f, 11.5f));
        var owner = world.Get<AbilityComponent>(old);
        Assert.True(owner.Activate<BombButtonAbility, BombButtonAbility.Input>(new() { Phase = 1 }, 100).Succeeded);
        long health = world.Get<AttributeComponent>(old).GetBaseValue(BomberAttributeNames.HealthPoints);
        for (ulong chain = 7991; chain < 7991 + checked((ulong)((health + 1) / 2)); chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.False(world.IsLive(old));
        for (int tick = 0; tick < 100 && participant.CurrentLife.Value == old; tick++) scene.TickControlled();
        var continuity = world.Get<BomberSuccessorState>(participant.Entity);
        Assert.True(old != participant.CurrentLife.Value,
            $"phase={participant.LifePhase.Value} pending={participant.SuccessorPending.Value} eligible={continuity.Eligible.Value} slot={continuity.ReservationSlot.Value} dormant={continuity.DormantLife.Value} restore={continuity.RestoreOutcome.Value} transfer={continuity.TransferRequest.Value} results={string.Join("; ", scene.TransferResults.Select(result => $"{result.Operation}:{result.Kind}:{result.Code}").Distinct())}");
        Assert.False(world.IsLive(old));
        var successor = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
        Assert.Equal(0, successor.BombButtonMode.Value);
        var nextOwner = world.Get<AbilityComponent>(successor.Entity);
        Assert.True(nextOwner.Activate<BombButtonReleaseAbility, BombButtonReleaseAbility.Input>(new() { Phase = 3 }, 101).Succeeded);
        scene.TickControlled();
        Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity && b.Phase.Value == (int)BomberBombPhase.Fuse);
        Assert.Equal(old, bomb.SourceLife.Value);
        Assert.Equal(0, successor.BombButtonMode.Value);
    }

    private sealed class Fixture : IDisposable
    {
        private readonly BomberObjectBudgetTests.AuthoredFixture authored = new(("bomb_kinds", "Remote", "enabled", "true"));
        internal readonly BomberTerrainProductionTests.Scene Scene;

        internal Fixture(bool controlled = false)
        {
            Scene = new BomberTerrainProductionTests.Scene(0, configDirectory: authored.Compile(), controlled: controlled);
            for (int z = 3; z <= 7; z++)
            for (int x = 3; x <= 13; x++) Scene.Write(x, 1, z, 0);
            for (int slot = 0; slot < 2; slot++)
            {
                Equip(slot);
                var attributes = Scene.World.Get<AttributeComponent>(Scene.Lives[slot]);
                attributes.SetBaseValue(BomberAttributeNames.BombCapacity, 3);
                attributes.SetCurrentValue(BomberAttributeNames.BombCapacity, 3);
                attributes.SetBaseValue(BomberAttributeNames.AvailableBombs, 3);
                attributes.SetCurrentValue(BomberAttributeNames.AvailableBombs, 3);
            }
            MovementInputMemoryTests.Position(Scene, new Vector3(7.5f, 1.5f, 7.5f));
        }

        internal void Equip(int slot)
        {
            var config = BomberConfigBinding.For(Scene.World);
            var skill = Scene.World.Get<BomberSkillState>(Scene.Lives[slot]);
            skill.BombSkillId.Value = config.Tables.Skills.Rows.Single(s => s.Slot == "Bomb" && s.BombKindCode == 7 && !s.IsCombo).Id;
            skill.BombSkillLevel.Value = 1;
        }

        internal BomberBombState Place(int slot, int x, int z)
        {
            var world = Scene.World;
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(Scene.Lives[slot]), new Vector3(x + .5f, 1.5f, z + .5f));
            var ability = world.Get<AbilityComponent>(Scene.Lives[slot]);
            Assert.True(PlaceBombAbility.CanPlace(ability, out string? why), why);
            ability.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
            Scene.Manager.Tick();
            return world.Each<BomberBombState>().Single(b =>
                world.Get<LogicTransform>(b.Entity).LocalPosition == new Vector3(x + .5f, 1.5f, z + .5f));
        }

        public void Dispose() { Scene.Dispose(); authored.Dispose(); }
    }
}
