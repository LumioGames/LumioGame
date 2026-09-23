using System;
using System.Reflection;
using System.Threading;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatComponentSetMessageTests
{
    [Fact]
    public void GameHasNoPrivateWorldQueueOrRunTickAndOwnsItsChatComponent()
    {
        Assembly assembly = typeof(ChatSetMessageSystem).Assembly;
        Assert.Null(typeof(ChatSetMessageSystem).GetMethod("RunTick"));
        Assert.DoesNotContain(
            typeof(ChatSetMessageSystem).GetFields(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic),
            static field => field.Name.Contains("ingress", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(
            assembly.GetReferencedAssemblies(),
            static name => string.Equals(name.Name, "Lumio.GameRuntime.Ecs", StringComparison.Ordinal));
        // ADR-117: the component is Game-owned, so the gameplay assembly carries it and references only
        // Runtime production assemblies.
        Assert.Same(assembly, typeof(ChatComponent).Assembly);
        Assert.All(
            assembly.GetReferencedAssemblies(),
            static name => Assert.DoesNotMatch(@"(?i)(Fixture|\.Tests?$|Samples?)", name.Name!));
    }

    [Fact]
    [RequiresEngineNative]
    public void ValidChatInputUpdatesExactlyOneSenderComponentAtNextFixedTick()
    {
        using WorldManager manager = ChatWorldHarness.Boot(2);
        NetEntityId senderA = ChatWorldHarness.Net(manager, 0);
        NetEntityId senderB = ChatWorldHarness.Net(manager, 1);

        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(manager, "room-01", senderA, "C1", 1UL, RuntimeChatInputFixture.Create(1UL, senderA, "gg", "C1")).Kind);
        // Runtime 18b5feb 把 ChatComponent.LastMessageText 从 `public string = ""` 改成
        // `Sync<string>`，而 Sync<T> 没有带初值的构造函数，所以「还没写过」现在读出 null 而非 ""。
        // 这里断言的是意图（尚无消息），对两种表示都成立。
        Assert.Equal(string.Empty, Component(manager, senderA).LastMessageText.Value ?? string.Empty);
        Assert.Equal(string.Empty, Component(manager, senderB).LastMessageText.Value ?? string.Empty);

        manager.Tick();

        ChatComponent sender = Component(manager, senderA);
        ChatComponent other = Component(manager, senderB);
        Assert.Equal("gg", sender.LastMessageText);
        Assert.True(sender.LastMessageTick > 0UL);
        Assert.Equal(string.Empty, other.LastMessageText.Value ?? string.Empty);
        Assert.Equal(0UL, other.LastMessageTick);
        ClientRpcRecord emitted = Assert.Single(DistinctByMessageId(ChatEvents(manager)));
        Assert.Equal(senderA, emitted.Sender);
        Assert.Equal(": gg", Assert.Single(emitted.Args));
    }

    [Fact]
    [RequiresEngineNative]
    public void EventAndComponentStateCarryTheSameAppliedTick()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);

        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(manager, "room-01", sender, "C1", 1UL, RuntimeChatInputFixture.Create(1UL, sender, "hello", "C1")).Kind);
        manager.Tick();

        ChatComponent component = Component(manager, sender);
        ClientRpcRecord emitted = Assert.Single(ChatEvents(manager));
        Assert.Equal(component.LastMessageTick, emitted.AppliedTick);
        Assert.Equal("hello", component.LastMessageText);
        Assert.Equal(": hello", Assert.Single(emitted.Args));
        Assert.Equal(1UL, emitted.MessageId);
        Assert.Equal(1UL, emitted.RoomSequence);
        Assert.Equal(sender, emitted.Sender);
    }

    [Fact]
    [RequiresEngineNative]
    public void NetworkThreadSetMessageRejectsWithZeroComponentWrite()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        Assert.Equal(
            ChatOperationKind.Admitted,
            ChatSetMessageSystem.Admit(manager, "room-01", sender, "C1", 1UL, RuntimeChatInputFixture.Create(1UL, sender, "keep", "C1")).Kind);
        manager.Tick();
        _ = manager.DrainOutbox();
        Assert.Equal("keep", Component(manager, sender).LastMessageText);

        ChatOperationResult? offThread = null;
        int workerThreadId = 0;
        var worker = new Thread(() =>
        {
            workerThreadId = Environment.CurrentManagedThreadId;
            offThread = ChatSetMessageSystem.SetMessage(manager, "room-01", sender, "hack");
        });
        worker.IsBackground = true;
        worker.Start();
        Assert.True(worker.Join(TimeSpan.FromSeconds(5)));

        Assert.NotEqual(manager.OwnerThread?.ManagedThreadId, workerThreadId);
        Assert.NotNull(offThread);
        Assert.True(offThread!.Value.IsFatal);
        Assert.Equal(ChatErrorCodes.OwnerThreadViolation, offThread.Value.ErrorCode);
        Assert.Equal("keep", Component(manager, sender).LastMessageText);

        manager.Tick();
        Assert.Equal("keep", Component(manager, sender).LastMessageText);
        Assert.Empty(ChatEvents(manager));
    }

    [Fact]
    [RequiresEngineNative]
    public void SetMessageOnUnknownEntityRejectsWithZeroComponentWrite()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId live = ChatWorldHarness.Net(manager, 0);
        var missing = new NetEntityId(ChatWorldHarness.InstanceId, 99UL);

        ChatOperationResult destroyedWrite = ChatSetMessageSystem.SetMessage(manager, "room-01", missing, "after-destroy");
        Assert.Equal(ChatOperationKind.Rejected, destroyedWrite.Kind);
        Assert.Equal(ChatErrorCodes.EntityDestroyed, destroyedWrite.ErrorCode);
        Assert.False(ChatSetMessageSystem.TryGetComponent(manager, missing, out ChatComponent? resurrected));
        Assert.Null(resurrected);
        Assert.Equal(string.Empty, Component(manager, live).LastMessageText.Value ?? string.Empty);
    }

    [Fact]
    [RequiresEngineNative]
    public void NetworkThreadAdmitQueuesWithoutWritingUntilOwnerTick()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        ChatOperationResult? admitted = null;
        var worker = new Thread(() =>
        {
            admitted = ChatSetMessageSystem.Admit(manager, "room-01", sender, "C1", 1UL, RuntimeChatInputFixture.Create(1UL, sender, "gg", "C1"));
        });
        worker.IsBackground = true;
        worker.Start();
        Assert.True(worker.Join(TimeSpan.FromSeconds(5)));

        Assert.Equal(ChatOperationKind.Admitted, admitted!.Value.Kind);
        Assert.Equal(string.Empty, Component(manager, sender).LastMessageText.Value ?? string.Empty);

        manager.Tick();
        Assert.Equal("gg", Component(manager, sender).LastMessageText);
        Assert.Equal(": gg", Assert.Single(Assert.Single(ChatEvents(manager)).Args));
    }

    [Fact]
    public void ChatInputTypeCarriesTextOnly()
    {
        var input = new ChatInput("gg");
        Assert.Equal("gg", input.Text);
        Assert.Equal("Text", Assert.Single(typeof(ChatInput).GetProperties()).Name);
    }

    [Fact]
    [RequiresEngineNative]
    public void SetMessageCallsGameChatComponentSendMessage()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        ChatOperationResult committed = ChatSetMessageSystem.SetMessage(manager, "room-01", sender, "direct");
        Assert.True(committed.IsCommitted);
        ChatComponent component = Component(manager, sender);
        Assert.Equal("direct", component.LastMessageText);
        Assert.Equal("Lumio.Game.ServerGameplay", typeof(ChatComponent).Assembly.GetName().Name);
    }

    private static ChatComponent Component(WorldManager manager, NetEntityId netEntityId)
    {
        Assert.True(ChatSetMessageSystem.TryGetComponent(manager, netEntityId, out ChatComponent? component));
        Assert.NotNull(component);
        return component;
    }

    private static System.Collections.Generic.List<ClientRpcRecord> ChatEvents(WorldManager manager)
    {
        var events = new System.Collections.Generic.List<ClientRpcRecord>();
        foreach (WorldMessage message in manager.DrainOutbox())
        {
            if (message is not WorldChangeMessage change)
            {
                continue;
            }

            for (int i = 0; i < change.Rpcs.Count; i++)
            {
                ClientRpcRecord rpc = change.Rpcs[i];
                if (string.Equals(rpc.Method, "OnChatMessage", StringComparison.Ordinal))
                {
                    events.Add(rpc);
                }
            }
        }

        return events;
    }

    private static System.Collections.Generic.List<ClientRpcRecord> DistinctByMessageId(
        System.Collections.Generic.List<ClientRpcRecord> events)
    {
        var seen = new System.Collections.Generic.HashSet<ulong>();
        var unique = new System.Collections.Generic.List<ClientRpcRecord>();
        for (int i = 0; i < events.Count; i++)
        {
            if (seen.Add(events[i].MessageId))
            {
                unique.Add(events[i]);
            }
        }

        return unique;
    }
}
