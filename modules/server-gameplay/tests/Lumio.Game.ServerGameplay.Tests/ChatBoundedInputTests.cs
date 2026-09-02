using System.Globalization;
using System.Linq;
using System.Text;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Replication.Binding;
using RuntimeChat = Lumio.GameRuntime.Replication.Chat;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatBoundedInputTests
{
    [Fact]
    public void TextAtUtf8CapCommitsAndOneByteOverRejectsWithoutWrite()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        string sender = Net(runtime);

        string cap = new string('a', ChatMapping.MaxTextUtf8Bytes);
        Assert.Equal(512, Encoding.UTF8.GetByteCount(cap));
        Assert.Equal(ChatOperationKind.Admitted, ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput(cap)).Kind);
        RuntimeChat.ChatTickResult ok = runtime.RunTick(1);
        Assert.True(Assert.Single(ok.Results).Succeeded);
        Assert.Equal(cap, Component(runtime, sender).LastMessageText);

        string over = new string('a', ChatMapping.MaxTextUtf8Bytes + 1);
        Assert.Equal(513, Encoding.UTF8.GetByteCount(over));
        ChatOperationResult admit = ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput(over));
        Assert.Equal(ChatOperationKind.Rejected, admit.Kind);
        Assert.Equal(ChatErrorCodes.ChatTextTooLong, admit.ErrorCode);

        ChatOperationResult set = ChatSetMessageSystem.SetMessage(runtime, "room-01", sender, over);
        Assert.Equal(ChatOperationKind.Rejected, set.Kind);
        Assert.Equal(ChatErrorCodes.ChatTextTooLong, set.ErrorCode);

        RuntimeChat.ChatTickResult empty = runtime.RunTick(2);
        Assert.Empty(empty.Events);
        Assert.Equal(cap, Component(runtime, sender).LastMessageText);
        Assert.Equal(ok.AppliedTick, Component(runtime, sender).LastMessageTick);
    }

    [Fact]
    public void SecondChatInputFromSameSenderInOneTickIsRejected()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith(2);
        string sender = Net(runtime, 0);
        string other = Net(runtime, 1);

        Assert.Equal(ChatOperationKind.Admitted, ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("first")).Kind);
        Assert.Equal(ChatOperationKind.Admitted, ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("second")).Kind);
        Assert.Equal(ChatOperationKind.Admitted, ChatSetMessageSystem.Admit(runtime, "room-01", "C2", 1UL, new ChatInput("other")).Kind);

        RuntimeChat.ChatTickResult tick = runtime.RunTick(1);

        Assert.Equal(2, tick.Results.Count(static result => result.Succeeded));
        RuntimeChat.ChatMappingResult rate = Assert.Single(tick.Results, static result => result.Code == ChatErrorCodes.ChatRateExceeded);
        Assert.False(rate.Succeeded);
        Assert.Equal("first", Component(runtime, sender).LastMessageText);
        Assert.Equal("other", Component(runtime, other).LastMessageText);
        Assert.Equal(2, tick.Events.Count);
        Assert.DoesNotContain(tick.Events, static item => item.Text == "second");
        Assert.Equal(ChatMapping.MaxChatInputPerSenderPerTick, 1);
        Assert.Equal("reject", ChatMapping.BoundedInputPolicy);
    }

    [Fact]
    public void IngressQueueFullRejectsWithoutComponentWrite()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        string sender = Net(runtime);

        for (int i = 0; i < ChatMapping.IngressQueueCapacity; i++)
        {
            Assert.Equal(
                ChatOperationKind.Admitted,
                ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("n" + i)).Kind);
        }

        ChatOperationResult overflow = ChatSetMessageSystem.Admit(runtime, "room-01", "C1", 1UL, new ChatInput("overflow"));
        Assert.Equal(ChatOperationKind.Rejected, overflow.Kind);
        Assert.Equal(ChatErrorCodes.QueueFull, overflow.ErrorCode);
        Assert.Equal(string.Empty, Component(runtime, sender).LastMessageText);

        RuntimeChat.ChatTickResult tick = runtime.RunTick(1);
        Assert.DoesNotContain(tick.Events, static item => item.Text == "overflow");
        Assert.Equal("n0", Component(runtime, sender).LastMessageText);
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

    private static string Net(RuntimeChat.ChatCommandRuntime runtime, int index = 0) => runtime.LiveNetEntityIds[index];

    private static ChatComponent Component(RuntimeChat.ChatCommandRuntime runtime, string netEntityId)
    {
        Assert.True(ChatSetMessageSystem.TryGetComponent(runtime, netEntityId, out ChatComponent? component));
        return component;
    }
}
