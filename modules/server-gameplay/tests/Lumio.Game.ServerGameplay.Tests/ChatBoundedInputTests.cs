using System;
using System.Text;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Samples.Username.Components.Chat;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatBoundedInputTests
{
    [Fact]
    public void TextAtUtf8CapCommitsAndOneByteOverRejectsWithoutWrite()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);

        string cap = new string('a', 64);
        Assert.Equal(ChatOperationKind.Admitted, ChatSetMessageSystem.Admit(manager, "room-01", "C1", 1UL, new ChatInput(cap)).Kind);
        manager.Tick();
        _ = manager.DrainOutbox();
        Assert.Equal(cap, Component(manager, sender).LastMessageText);
        Assert.Equal(512, ChatMapping.MaxTextUtf8Bytes);

        string over = new string('a', ChatMapping.MaxTextUtf8Bytes + 1);
        Assert.Equal(513, Encoding.UTF8.GetByteCount(over));
        ChatOperationResult admit = ChatSetMessageSystem.Admit(manager, "room-01", "C1", 1UL, new ChatInput(over));
        Assert.Equal(ChatOperationKind.Rejected, admit.Kind);
        Assert.Equal(ChatErrorCodes.ChatTextTooLong, admit.ErrorCode);

        ChatOperationResult set = ChatSetMessageSystem.SetMessage(manager, "room-01", sender, over);
        Assert.Equal(ChatOperationKind.Rejected, set.Kind);
        Assert.Equal(ChatErrorCodes.ChatTextTooLong, set.ErrorCode);

        manager.Tick();
        Assert.Empty(DrainChat(manager));
        Assert.Equal(cap, Component(manager, sender).LastMessageText);
    }

    [Fact]
    public void RuntimeSendMessageIsTheSingleWritePathForTwoSendersInOneTick()
    {
        using WorldManager manager = ChatWorldHarness.Boot(2);
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        NetEntityId other = ChatWorldHarness.Net(manager, 1);

        Assert.Equal(ChatOperationKind.Admitted, ChatSetMessageSystem.Admit(manager, "room-01", "C1", 1UL, new ChatInput("first")).Kind);
        Assert.Equal(ChatOperationKind.Admitted, ChatSetMessageSystem.Admit(manager, "room-01", "C2", 1UL, new ChatInput("other")).Kind);

        manager.Tick();

        Assert.Equal("first", Component(manager, sender).LastMessageText);
        Assert.Equal("other", Component(manager, other).LastMessageText);
        var seen = new System.Collections.Generic.HashSet<ulong>();
        foreach (ClientRpcRecord rpc in DrainChat(manager))
        {
            seen.Add(rpc.MessageId);
        }

        Assert.Equal(2, seen.Count);
        Assert.Equal(ChatMapping.MaxChatInputPerSenderPerTick, 1);
        Assert.Equal("reject", ChatMapping.BoundedInputPolicy);
    }

    private static ChatComponent Component(WorldManager manager, NetEntityId netEntityId)
    {
        Assert.True(ChatSetMessageSystem.TryGetComponent(manager, netEntityId, out ChatComponent? component));
        return component;
    }

    private static System.Collections.Generic.List<ClientRpcRecord> DrainChat(WorldManager manager)
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
                if (string.Equals(change.Rpcs[i].Method, "OnChatMessage", StringComparison.Ordinal))
                {
                    events.Add(change.Rpcs[i]);
                }
            }
        }

        return events;
    }
}
