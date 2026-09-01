using System;
using System.Threading;
using Lumio.Game.ServerGameplay;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatComponentSetMessageTests
{
    private const ulong SenderA = 101;
    private const ulong SenderB = 202;

    [Fact]
    public void ValidChatInputUpdatesExactlyOneSenderComponentAtNextFixedTick()
    {
        ChatRoomWorld world = RoomWith(SenderA, SenderB);

        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(SenderA, new ChatInput("gg")).Kind);
        Assert.Equal(0UL, world.CurrentTick);
        Assert.Equal(string.Empty, Component(world, SenderA).LastMessageText);
        Assert.Equal(string.Empty, Component(world, SenderB).LastMessageText);

        ChatTickResult tick = world.RunTick();

        Assert.Equal(1UL, world.CurrentTick);
        Assert.Equal(1UL, tick.AppliedTick);
        ChatComponent sender = Component(world, SenderA);
        ChatComponent other = Component(world, SenderB);
        Assert.Equal("gg", sender.LastMessageText);
        Assert.Equal(1UL, sender.LastMessageTick);
        Assert.Equal(string.Empty, other.LastMessageText);
        Assert.Equal(0UL, other.LastMessageTick);
        ChatMessageEvent emitted = Assert.Single(tick.Events);
        Assert.Equal(SenderA, emitted.SenderNetEntityId);
        Assert.Equal("gg", emitted.Text);
    }

    [Fact]
    public void EventAndComponentStateCarryTheSameAppliedTick()
    {
        ChatRoomWorld world = RoomWith(SenderA);

        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(SenderA, new ChatInput("hello")).Kind);
        ChatTickResult tick = world.RunTick();

        ChatComponent component = Component(world, SenderA);
        ChatMessageEvent emitted = Assert.Single(tick.Events);
        Assert.Equal(tick.AppliedTick, component.LastMessageTick);
        Assert.Equal(component.LastMessageTick, emitted.AppliedTick);
        Assert.Equal(world.CurrentTick, emitted.AppliedTick);
        Assert.Equal("hello", component.LastMessageText);
        Assert.Equal("hello", emitted.Text);
        Assert.Equal(1UL, emitted.MessageId);
        Assert.Equal(1UL, emitted.RoomSequence);
        Assert.Equal(SenderA, emitted.SenderNetEntityId);
        Assert.True(Assert.Single(tick.Results).IsCommitted);
    }

    [Fact]
    public void NetworkThreadSetMessageFailStopsWithZeroComponentWrite()
    {
        ChatRoomWorld world = RoomWith(SenderA);
        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(SenderA, new ChatInput("keep")).Kind);
        ChatTickResult committed = world.RunTick();
        Assert.Equal("keep", Component(world, SenderA).LastMessageText);
        Assert.Single(committed.Events);

        ChatOperationResult? offThread = null;
        int workerThreadId = 0;
        var worker = new Thread(() =>
        {
            workerThreadId = Environment.CurrentManagedThreadId;
            offThread = world.SetMessage(SenderA, "hack");
        });
        worker.IsBackground = true;
        worker.Start();
        worker.Join();

        Assert.NotEqual(world.OwnerThreadId, workerThreadId);
        Assert.NotNull(offThread);
        Assert.True(offThread!.Value.IsFatal);
        Assert.Equal(ChatErrorCodes.OwnerThreadViolation, offThread.Value.ErrorCode);
        Assert.True(world.IsFaulted);
        Assert.Equal("keep", Component(world, SenderA).LastMessageText);
        Assert.Equal(1UL, Component(world, SenderA).LastMessageTick);

        ChatTickResult afterFault = world.RunTick();
        Assert.True(world.IsFaulted);
        Assert.Empty(afterFault.Events);
        Assert.Equal("keep", Component(world, SenderA).LastMessageText);
        Assert.Equal(ChatErrorCodes.WorldFaulted, Assert.Single(afterFault.Results).ErrorCode);
    }

    [Fact]
    public void SetMessageAfterEntityDestructionRejectsWithZeroComponentWrite()
    {
        ChatRoomWorld world = RoomWith(SenderA, SenderB);
        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(SenderA, new ChatInput("first")).Kind);
        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(SenderB, new ChatInput("peer")).Kind);
        ChatTickResult firstTick = world.RunTick();
        Assert.Equal(2, firstTick.Events.Length);
        Assert.Equal("first", Component(world, SenderA).LastMessageText);

        Assert.True(world.DestroyEntity(SenderA));
        Assert.False(world.TryGetComponent(SenderA, out _));
        Assert.Equal("peer", Component(world, SenderB).LastMessageText);

        ChatOperationResult destroyedWrite = world.SetMessage(SenderA, "after-destroy");
        Assert.Equal(ChatOperationKind.Rejected, destroyedWrite.Kind);
        Assert.Equal(ChatErrorCodes.EntityDestroyed, destroyedWrite.ErrorCode);
        Assert.False(world.IsFaulted);
        Assert.False(world.TryGetComponent(SenderA, out ChatComponent? resurrected));
        Assert.Null(resurrected);
        Assert.Equal("peer", Component(world, SenderB).LastMessageText);

        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(SenderA, new ChatInput("queued-after-destroy")).Kind);
        ChatTickResult secondTick = world.RunTick();
        Assert.DoesNotContain(secondTick.Events, item => item.SenderNetEntityId == SenderA);
        Assert.False(world.TryGetComponent(SenderA, out _));
        Assert.Equal("peer", Component(world, SenderB).LastMessageText);
        Assert.False(world.TryCreateEntity(SenderA));
    }

    [Fact]
    public void NetworkThreadAdmitQueuesWithoutWritingUntilOwnerTick()
    {
        ChatRoomWorld world = RoomWith(SenderA);
        ChatOperationResult? admitted = null;
        var worker = new Thread(() =>
        {
            admitted = world.AdmitChatInput(SenderA, new ChatInput("gg"));
        });
        worker.IsBackground = true;
        worker.Start();
        worker.Join();

        Assert.Equal(ChatOperationKind.Admitted, admitted!.Value.Kind);
        Assert.False(world.IsFaulted);
        Assert.Equal(string.Empty, Component(world, SenderA).LastMessageText);
        Assert.Equal(0UL, world.CurrentTick);

        ChatTickResult tick = world.RunTick();
        Assert.Equal("gg", Component(world, SenderA).LastMessageText);
        Assert.Equal(tick.AppliedTick, Component(world, SenderA).LastMessageTick);
        Assert.Equal("gg", Assert.Single(tick.Events).Text);
    }

    [Fact]
    public void ChatInputTypeCarriesTextOnly()
    {
        var input = new ChatInput("gg");
        Assert.Equal("gg", input.Text);
        Assert.Equal("Text", Assert.Single(typeof(ChatInput).GetProperties()).Name);
    }

    private static ChatRoomWorld RoomWith(params ulong[] entities)
    {
        var world = new ChatRoomWorld();
        foreach (ulong id in entities)
        {
            Assert.True(world.TryCreateEntity(id));
        }

        return world;
    }

    private static ChatComponent Component(ChatRoomWorld world, ulong netEntityId)
    {
        Assert.True(world.TryGetComponent(netEntityId, out ChatComponent? component));
        Assert.NotNull(component);
        return component;
    }
}
