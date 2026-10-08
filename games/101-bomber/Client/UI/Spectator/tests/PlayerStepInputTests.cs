using System.Text;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.Wire;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class PlayerStepInputTests
{
    [Fact]
    public void PhysicalSettersWaitForActualStepAndPublishMoveBombEdgesThenSkill()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
            VerifyPhysicalSetters(owner, self, 9), stepOptions: new BomberPlayerStepOptions(), wireGeneration: 9);
    }

    [Fact]
    public void EveryActualIdleInputStepPublishesExactlyOneTypedMove()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            var manager = host.World!.Manager;
            host.SetInputIntentEnabled(true);
            ulong firstOrdinal = manager.ClientPredictionElapsedStep;
            int firstFrame = owner.ReceivedFrames.Length;
            host.Tick();
            ulong afterImmediate = manager.ClientPredictionElapsedStep;
            Assert.InRange(afterImmediate - firstOrdinal, 0UL, 5UL);
            Assert.Equal((int)(afterImmediate - firstOrdinal), owner.ReceivedFrames.Length - firstFrame);
            owner.PumpUntil(() => manager.ClientPredictionElapsedStep > afterImmediate);
            ulong lastOrdinal = manager.ClientPredictionElapsedStep;
            var frames = owner.ReceivedFrames.Skip(firstFrame).Select(frame => Decode(owner, self, frame)).ToArray();
            Assert.Equal((int)(lastOrdinal - firstOrdinal), frames.Length);
            Assert.All(frames, frame => {
                Assert.Single(frame.Commands);
                Assert.Contains(nameof(MoveAbility), Encoding.UTF8.GetString(frame.Payload.Span));
                Assert.Equal(self, frame.Sender);
                Assert.Equal(1UL, frame.ConnectionGeneration);
            });
            Console.WriteLine($"actual_step_ordinal_first={firstOrdinal} actual_step_ordinal_last={lastOrdinal} idle_move_requests={frames.Length}");
        }, stepOptions: new BomberPlayerStepOptions());
    }

    [Fact]
    public void ShortTapBetweenActualStepsReachesPredictionOnce()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            var manager = host.World!.Manager;
            Assert.True(manager.ClientPredictionClockEnabled);
            host.SetInputIntentEnabled(true);
            int before = owner.ReceivedFrames.Length;
            var confirmed = host.World.Get<LogicTransform>(self).LocalPosition;
            host.SetMoveIntent((int)BomberDirection.Right, 0, true);
            host.SetMoveIntent(0, 0, false);
            Assert.Equal(before, owner.ReceivedFrames.Length);
            owner.PumpUntil(() => owner.ReceivedFrames.Length > before);
            var first = Decode(owner, self, owner.ReceivedFrames[before]);
            Assert.Contains(nameof(MoveAbility), Encoding.UTF8.GetString(first.Payload.Span));
            var predicted = Assert.IsType<World>(manager.PredictedWorld).Get<LogicTransform>(self).LocalPosition;
            Assert.True(predicted.X > confirmed.X);
            Assert.Equal(confirmed, host.World.Get<LogicTransform>(self).LocalPosition);
        }, stepOptions: new BomberPlayerStepOptions());
    }

    private static void VerifyPhysicalSetters(BrowserSessionOwner owner, NetEntityId self, ulong wireGeneration)
    {
        var host = owner.Host;
        Assert.True(host.World!.Manager.ClientPredictionClockEnabled);
        host.SetInputIntentEnabled(true);
        int before = owner.ReceivedFrames.Length;
        ulong tick = host.World!.Tick;
        host.SetMoveIntent((int)BomberDirection.Right, 0, true);
        Assert.Equal("accepted", host.SetBombIntent(1));
        Assert.Equal("accepted", host.SetBombIntent(3));
        host.LatchSkillIntent();
        Assert.Equal(before, owner.ReceivedFrames.Length);
        Assert.Equal(tick, host.World.Tick);

        owner.PumpUntil(() => owner.ReceivedFrames.Length >= before + 4);
        var frames = owner.ReceivedFrames.Skip(before).Take(4)
            .Select(frame => WireCodec.DecodeAuthenticatedInput(frame, owner.WireProfile,
                self, wireGeneration, "game-test-socket", BrowserSessionOwner.Incarnation)).ToArray();
        Assert.Equal(new ulong[] { 1, 2, 3, 4 }, frames.Select(frame => frame.Sequence));
        Assert.All(frames, frame => Assert.Equal(self, frame.Sender));
        Assert.All(frames, frame => Assert.Equal(wireGeneration, frame.ConnectionGeneration));
        Assert.Contains(nameof(MoveAbility), Encoding.UTF8.GetString(frames[0].Payload.Span));
        Assert.Contains(nameof(BombButtonAbility), Encoding.UTF8.GetString(frames[1].Payload.Span));
        Assert.Contains(nameof(BombButtonReleaseAbility), Encoding.UTF8.GetString(frames[2].Payload.Span));
        Assert.Contains(nameof(UseActiveSkillAbility), Encoding.UTF8.GetString(frames[3].Payload.Span));
        Assert.Equal(tick, host.World.Tick);
    }

    [Fact]
    public void SameIdentityDisablePublishesOnlyPendingTypedCancel()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            host.SetInputIntentEnabled(true);
            int before = owner.ReceivedFrames.Length;
            Assert.Equal("accepted", host.SetBombIntent(1));
            owner.PumpUntil(() => owner.ReceivedFrames.Length >= before + 2);
            var published = owner.ReceivedFrames.Skip(before).Take(2).Select(frame => Decode(owner, self, frame)).ToArray();
            Assert.Contains(nameof(BombButtonAbility), Encoding.UTF8.GetString(published[1].Payload.Span));
            var token = host.GetInputIntentResetToken();
            host.SetInputIntentEnabled(false);
            owner.PumpUntil(() => owner.ReceivedFrames.Skip(before + 2)
                .Select(frame => Decode(owner, self, frame))
                .Any(frame => Encoding.UTF8.GetString(frame.Payload.Span).Contains(nameof(BombButtonReleaseAbility))));
            var afterDisable = owner.ReceivedFrames.Skip(before + 2).Select(frame => Decode(owner, self, frame)).ToArray();
            var cancel = Assert.Single(afterDisable, frame =>
                Encoding.UTF8.GetString(frame.Payload.Span).Contains(nameof(BombButtonReleaseAbility)));
            Assert.Contains(nameof(BombButtonReleaseAbility), Encoding.UTF8.GetString(cancel.Payload.Span));
            Assert.True(cancel.Sequence > published[1].Sequence);
            Assert.DoesNotContain(afterDisable, frame => frame.Sequence > cancel.Sequence &&
                Encoding.UTF8.GetString(frame.Payload.Span).Contains(nameof(MoveAbility)));
            Assert.Equal(token, host.GetInputIntentResetToken());
        }, stepOptions: new BomberPlayerStepOptions());
    }

    [Fact]
    public void LifeReplacementInvalidatesPreviouslyPublishedBombDebt()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            host.SetInputIntentEnabled(true);
            int before = owner.ReceivedFrames.Length;
            Assert.Equal("accepted", host.SetBombIntent(1));
            owner.PumpUntil(() => owner.ReceivedFrames.Skip(before)
                .Select(frame => Decode(owner, self, frame))
                .Any(frame => Encoding.UTF8.GetString(frame.Payload.Span).Contains(nameof(BombButtonAbility))));
            string token = host.GetInputIntentResetToken();
            var participant = host.World!.Get<BomberPlayerState>(self).Participant.Value;
            owner.Apply(new WorldChangeMessage(checked(host.World.Tick + 1), 0, Array.Empty<CreateRecord>(), new[] {
                new FieldChange(self, nameof(BomberPlayerState), "lifeGeneration", 4UL, ChangeReason.Sync),
                new FieldChange(participant, nameof(BomberParticipantState), "lifeGeneration", 4UL, ChangeReason.Sync),
            }, Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
            Assert.NotEqual(token, host.GetInputIntentResetToken());
            host.SetInputIntentEnabled(false);
            int cut = owner.ReceivedFrames.Length;
            owner.Pump(10);
            Assert.DoesNotContain(owner.ReceivedFrames.Skip(cut).Select(frame => Decode(owner, self, frame)), frame =>
                Encoding.UTF8.GetString(frame.Payload.Span).Contains(nameof(BombButtonReleaseAbility)));
        }, stepOptions: new BomberPlayerStepOptions());
    }

    [Fact]
    public void ResetTokenChangesForActualLifeGenerationEvenWithoutDuePredictionStep()
    {
        using var owner = ReadyStepOwner();
        Assert.False(owner.Host.World!.Manager.ClientPredictionClockEnabled);
        string first = owner.Host.GetInputIntentResetToken();
        Assert.Equal(first, owner.Host.GetInputIntentResetToken());
        owner.Host.SetInputIntentEnabled(true);
        owner.Host.SetMoveIntent((int)BomberDirection.Left, 0, true);
        owner.Apply(new WorldChangeMessage(2, 0, Array.Empty<CreateRecord>(), new[] {
            new FieldChange(BrowserSessionOwner.Self, nameof(BomberPlayerState), "lifeGeneration", 4UL, ChangeReason.Sync),
            new FieldChange(BrowserSessionOwner.Participant, nameof(BomberParticipantState), "lifeGeneration", 4UL, ChangeReason.Sync),
        }, Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
        string second = owner.Host.GetInputIntentResetToken();
        Assert.NotEqual(first, second);
        Assert.Equal(second, owner.Host.GetInputIntentResetToken());
        Assert.Empty(owner.ReceivedFrames);
    }

    [Fact]
    public void SeparateHostLifetimesNeverShareAnOpaqueResetToken()
    {
        string first;
        using (var owner = ReadyStepOwner()) first = owner.Host.GetInputIntentResetToken();
        using var replacement = ReadyStepOwner();
        Assert.NotEqual(first, replacement.Host.GetInputIntentResetToken());
    }

    [Fact]
    public void RefusedSixthBombGestureIsCountedWithoutTraceOrSetterPublication()
    {
        using var owner = ReadyStepOwner();
        var host = owner.Host;
        host.SetInputIntentEnabled(true);
        for (int i = 0; i < 5; i++)
        {
            Assert.Equal("accepted", host.SetBombIntent(1));
            Assert.Equal("accepted", host.SetBombIntent(3));
        }
        Assert.Equal("player_bomb_intent_capacity", host.SetBombIntent(1));
        Assert.Equal(1, host.GetBombIntentRefusalCount());
        Assert.Equal("player_bomb_intent_capacity", host.GetBombIntentStatusCode());
        Assert.Equal("player_bomb_intent_capacity", host.SetBombIntent(3));
        Assert.Empty(owner.ReceivedFrames);
    }

    private static InputCommandMessage Decode(BrowserSessionOwner owner, NetEntityId self, byte[] frame) =>
        WireCodec.DecodeAuthenticatedInput(frame, owner.WireProfile, self, 1, "game-test-socket", BrowserSessionOwner.Incarnation);

    private static BrowserSessionOwner ReadyStepOwner()
    {
        var owner = new BrowserSessionOwner(stepOptions: new BomberPlayerStepOptions());
        owner.Authorize();
        owner.Apply(new WorldChangeMessage(1, 0,
            new[] {
                new CreateRecord("world", new NetEntityId(7, 1), new[] {
                    new FieldValue(nameof(BomberMatchState), "phase", (int)BomberMatchPhase.Running),
                    new FieldValue(nameof(BomberMatchState), "matchId", 1UL),
                }),
                new CreateRecord("player", BrowserSessionOwner.Self, new[] {
                    new FieldValue(nameof(BomberPlayerState), "participant", BrowserSessionOwner.Participant),
                    new FieldValue(nameof(BomberPlayerState), "lifeGeneration", 3UL),
                    new FieldValue(nameof(BomberPlayerState), "lifePhase", (int)BomberLifePhase.Vulnerable),
                }),
                new CreateRecord("bomberParticipant", BrowserSessionOwner.Participant, new[] {
                    new FieldValue(nameof(BomberParticipantState), "matchId", 1UL),
                    new FieldValue(nameof(BomberParticipantState), "currentLife", BrowserSessionOwner.Self),
                    new FieldValue(nameof(BomberParticipantState), "lifeGeneration", 3UL),
                    new FieldValue(nameof(BomberParticipantState), "lifePhase", (int)BomberLifePhase.Vulnerable),
                }),
            }, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
        Assert.True(owner.Host.InputEnabled);
        return owner;
    }
}
