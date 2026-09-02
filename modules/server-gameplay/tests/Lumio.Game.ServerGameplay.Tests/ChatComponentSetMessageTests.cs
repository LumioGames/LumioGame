using System;
using System.Globalization;
using System.Reflection;
using System.Threading;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Replication.Binding;
using RuntimeChat = Lumio.GameRuntime.Replication.Chat;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatComponentSetMessageTests
{
    [Fact]
    public void GameHasNoPrivateWorldQueueOrRunTick()
    {
        Assembly assembly = typeof(ChatComponent).Assembly;
        Assert.Null(typeof(ChatSetMessageSystem).GetMethod("RunTick"));
        Assert.DoesNotContain(
            typeof(ChatSetMessageSystem).GetFields(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic),
            static field => field.Name.Contains("ingress", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(
            assembly.GetReferencedAssemblies(),
            static name => string.Equals(name.Name, "Lumio.GameRuntime.Ecs", StringComparison.Ordinal));
        Assert.Contains(
            assembly.GetReferencedAssemblies(),
            static name => string.Equals(name.Name, "Lumio.GameRuntime.Replication", StringComparison.Ordinal));
    }

    [Fact]
    public void ValidChatInputUpdatesExactlyOneSenderComponentAtNextFixedTick()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith(2);
        string senderA = Net(runtime, 0);
        string senderB = Net(runtime, 1);

        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("gg")).Kind);
        Assert.Equal(0UL, runtime.CurrentTick);
        Assert.Equal(string.Empty, Component(runtime, senderA).LastMessageText);
        Assert.Equal(string.Empty, Component(runtime, senderB).LastMessageText);

        RuntimeChat.ChatTickResult tick = runtime.RunTick(1);

        Assert.Equal(1UL, runtime.CurrentTick);
        Assert.Equal(1UL, tick.AppliedTick);
        ChatComponent sender = Component(runtime, senderA);
        ChatComponent other = Component(runtime, senderB);
        Assert.Equal("gg", sender.LastMessageText);
        Assert.Equal(1UL, sender.LastMessageTick);
        Assert.Equal(string.Empty, other.LastMessageText);
        Assert.Equal(0UL, other.LastMessageTick);
        RuntimeChat.ChatMessageEvent emitted = Assert.Single(tick.Events);
        Assert.Equal(senderA, emitted.SenderNetEntityId);
        Assert.Equal("gg", emitted.Text);
    }

    [Fact]
    public void EventAndComponentStateCarryTheSameAppliedTick()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        string sender = Net(runtime, 0);

        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("hello")).Kind);
        RuntimeChat.ChatTickResult tick = runtime.RunTick(1);

        ChatComponent component = Component(runtime, sender);
        RuntimeChat.ChatMessageEvent emitted = Assert.Single(tick.Events);
        Assert.Equal(tick.AppliedTick, component.LastMessageTick);
        Assert.Equal(component.LastMessageTick, emitted.AppliedTick);
        Assert.Equal(runtime.CurrentTick, emitted.AppliedTick);
        Assert.Equal("hello", component.LastMessageText);
        Assert.Equal("hello", emitted.Text);
        Assert.Equal(1UL, emitted.MessageId);
        Assert.Equal(1UL, emitted.RoomSequence);
        Assert.Equal(sender, emitted.SenderNetEntityId);
        Assert.True(Assert.Single(tick.Results).Succeeded);
    }

    [Fact]
    public void NetworkThreadSetMessageFailStopsWithZeroComponentWrite()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        string sender = Net(runtime, 0);
        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("keep")).Kind);
        RuntimeChat.ChatTickResult committed = runtime.RunTick(1);
        Assert.Equal("keep", Component(runtime, sender).LastMessageText);
        Assert.Single(committed.Events);

        ChatOperationResult? offThread = null;
        int workerThreadId = 0;
        var worker = new Thread(() =>
        {
            workerThreadId = Environment.CurrentManagedThreadId;
            offThread = ChatSetMessageSystem.SetMessage(runtime, "room-01", sender, "hack");
        });
        worker.IsBackground = true;
        worker.Start();
        Assert.True(worker.Join(TimeSpan.FromSeconds(5)));

        Assert.NotEqual(runtime.OwnerThreadId, workerThreadId);
        Assert.NotNull(offThread);
        Assert.True(offThread!.Value.IsFatal);
        Assert.Equal(ChatErrorCodes.OwnerThreadViolation, offThread.Value.ErrorCode);
        Assert.True(runtime.IsFaulted);
        Assert.Equal("keep", Component(runtime, sender).LastMessageText);
        Assert.Equal(1UL, Component(runtime, sender).LastMessageTick);

        RuntimeChat.ChatTickResult afterFault = runtime.RunTick(2);
        Assert.True(runtime.IsFaulted);
        Assert.Empty(afterFault.Events);
        Assert.Equal("keep", Component(runtime, sender).LastMessageText);
        Assert.Equal("runtime_failure", Assert.Single(afterFault.Results).Code);
    }

    [Fact]
    public void SetMessageAfterEntityDestructionRejectsWithZeroComponentWrite()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith(2);
        string senderA = Net(runtime, 0);
        string senderB = Net(runtime, 1);
        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("first")).Kind);
        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(runtime, "room-01", "C2", 1UL, new ChatInput("peer")).Kind);
        RuntimeChat.ChatTickResult firstTick = runtime.RunTick(1);
        Assert.Equal(2, firstTick.Events.Count);
        Assert.Equal("first", Component(runtime, senderA).LastMessageText);

        Assert.True(runtime.DestroyEntity(senderA));
        Assert.False(ChatSetMessageSystem.TryGetComponent(runtime, senderA, out _));
        Assert.Equal("peer", Component(runtime, senderB).LastMessageText);

        ChatOperationResult destroyedWrite = ChatSetMessageSystem.SetMessage(runtime, "room-01", senderA, "after-destroy");
        Assert.Equal(ChatOperationKind.Rejected, destroyedWrite.Kind);
        Assert.Equal(ChatErrorCodes.EntityDestroyed, destroyedWrite.ErrorCode);
        Assert.False(runtime.IsFaulted);
        Assert.False(ChatSetMessageSystem.TryGetComponent(runtime, senderA, out ChatComponent? resurrected));
        Assert.Null(resurrected);
        Assert.Equal("peer", Component(runtime, senderB).LastMessageText);
    }

    [Fact]
    public void NetworkThreadAdmitQueuesWithoutWritingUntilOwnerTick()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        string sender = Net(runtime, 0);
        ChatOperationResult? admitted = null;
        var worker = new Thread(() =>
        {
            admitted = ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("gg"));
        });
        worker.IsBackground = true;
        worker.Start();
        Assert.True(worker.Join(TimeSpan.FromSeconds(5)));

        Assert.Equal(ChatOperationKind.Admitted, admitted!.Value.Kind);
        Assert.False(runtime.IsFaulted);
        Assert.Equal(string.Empty, Component(runtime, sender).LastMessageText);
        Assert.Equal(0UL, runtime.CurrentTick);

        RuntimeChat.ChatTickResult tick = runtime.RunTick(1);
        Assert.Equal("gg", Component(runtime, sender).LastMessageText);
        Assert.Equal(tick.AppliedTick, Component(runtime, sender).LastMessageTick);
        Assert.Equal("gg", Assert.Single(tick.Events).Text);
    }

    [Fact]
    public void ChatInputTypeCarriesTextOnly()
    {
        var input = new ChatInput("gg");
        Assert.Equal("gg", input.Text);
        Assert.Equal("Text", Assert.Single(typeof(ChatInput).GetProperties()).Name);
    }

    [Fact]
    public void SetMessageCommitsThroughRuntimeCommandBufferPhase()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        string sender = Net(runtime, 0);
        ChatOperationResult committed = ChatSetMessageSystem.SetMessage(runtime, "room-01", sender, "direct");
        Assert.True(committed.IsCommitted);
        ChatComponent component = Component(runtime, sender);
        Assert.Equal("direct", component.LastMessageText);
        Assert.Equal(0UL, component.LastMessageTick);
        Assert.False(runtime.IsFaulted);
    }

    private static RuntimeChat.ChatCommandRuntime RoomWith(int members = 1)
    {
        EntityBindingQuery bindings = EntityBindingQuery.Create();
        for (int i = 0; i < members; i++)
        {
            string connection = i == 0 ? "C1" : "C" + (i + 1).ToString(CultureInfo.InvariantCulture);
            string account = "acct-" + (7 + i).ToString(CultureInfo.InvariantCulture);
            BindingQueryResult admitted = bindings.Admit(connection, account, "room-01", "player");
            Assert.Equal("ok", admitted.Outcome);
        }

        RuntimeChat.ChatCommandRuntime runtime = RuntimeChat.ChatCommandRuntime.Create(bindings, ownsBindings: true);
        for (int i = 0; i < members; i++)
        {
            string connection = i == 0 ? "C1" : "C" + (i + 1).ToString(CultureInfo.InvariantCulture);
            RuntimeChat.ChatMappingResult attached = runtime.AttachMember("room-01", connection);
            Assert.True(attached.Succeeded, attached.Code + " " + attached.Detail);
        }

        return runtime;
    }

    private static string Net(RuntimeChat.ChatCommandRuntime runtime, int index) => runtime.LiveNetEntityIds[index];

    private static ChatComponent Component(RuntimeChat.ChatCommandRuntime runtime, string netEntityId)
    {
        Assert.True(ChatSetMessageSystem.TryGetComponent(runtime, netEntityId, out ChatComponent? component));
        Assert.NotNull(component);
        return component;
    }
}
