using System.Linq;
using System.Text;
using Lumio.Game.ServerGameplay;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatBoundedInputTests
{
    private const ulong Sender = 101;

    [Fact]
    public void TextAtUtf8CapCommitsAndOneByteOverRejectsWithoutWrite()
    {
        ChatRoomWorld world = new ChatRoomWorld();
        Assert.True(world.TryCreateEntity(Sender));

        string cap = new string('a', ChatMapping.MaxTextUtf8Bytes);
        Assert.Equal(512, Encoding.UTF8.GetByteCount(cap));
        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(Sender, new ChatInput(cap)).Kind);
        ChatTickResult ok = world.RunTick();
        Assert.True(Assert.Single(ok.Results).IsCommitted);
        Assert.Equal(cap, Component(world).LastMessageText);

        string over = new string('a', ChatMapping.MaxTextUtf8Bytes + 1);
        Assert.Equal(513, Encoding.UTF8.GetByteCount(over));
        ChatOperationResult admit = world.AdmitChatInput(Sender, new ChatInput(over));
        Assert.Equal(ChatOperationKind.Rejected, admit.Kind);
        Assert.Equal(ChatErrorCodes.ChatTextTooLong, admit.ErrorCode);

        ChatOperationResult set = world.SetMessage(Sender, over);
        Assert.Equal(ChatOperationKind.Rejected, set.Kind);
        Assert.Equal(ChatErrorCodes.ChatTextTooLong, set.ErrorCode);

        ChatTickResult empty = world.RunTick();
        Assert.Empty(empty.Events);
        Assert.Equal(cap, Component(world).LastMessageText);
        Assert.Equal(ok.AppliedTick, Component(world).LastMessageTick);
    }

    [Fact]
    public void SecondChatInputFromSameSenderInOneTickIsRejected()
    {
        ChatRoomWorld world = new ChatRoomWorld();
        Assert.True(world.TryCreateEntity(Sender));
        Assert.True(world.TryCreateEntity(202));

        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(Sender, new ChatInput("first")).Kind);
        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(Sender, new ChatInput("second")).Kind);
        Assert.Equal(ChatOperationKind.Admitted, world.AdmitChatInput(202, new ChatInput("other")).Kind);

        ChatTickResult tick = world.RunTick();

        Assert.Equal(2, tick.Results.Count(result => result.IsCommitted));
        ChatOperationResult rate = Assert.Single(tick.Results, result => result.ErrorCode == ChatErrorCodes.ChatRateExceeded);
        Assert.Equal(ChatOperationKind.Rejected, rate.Kind);
        Assert.Equal("first", Component(world).LastMessageText);
        Assert.Equal("other", Component(world, 202).LastMessageText);
        Assert.Equal(2, tick.Events.Length);
        Assert.DoesNotContain(tick.Events, item => item.Text == "second");
        Assert.Equal(ChatMapping.MaxChatInputPerSenderPerTick, 1);
        Assert.Equal("reject", ChatMapping.BoundedInputPolicy);
    }

    [Fact]
    public void IngressQueueFullRejectsWithoutComponentWrite()
    {
        ChatRoomWorld world = new ChatRoomWorld();
        Assert.True(world.TryCreateEntity(Sender));

        for (int i = 0; i < ChatMapping.IngressQueueCapacity; i++)
        {
            Assert.Equal(
                ChatOperationKind.Admitted,
                world.AdmitChatInput(Sender, new ChatInput("n" + i)).Kind);
        }

        ChatOperationResult overflow = world.AdmitChatInput(Sender, new ChatInput("overflow"));
        Assert.Equal(ChatOperationKind.Rejected, overflow.Kind);
        Assert.Equal(ChatErrorCodes.QueueFull, overflow.ErrorCode);
        Assert.Equal(string.Empty, Component(world).LastMessageText);

        ChatTickResult tick = world.RunTick();
        Assert.DoesNotContain(tick.Events, item => item.Text == "overflow");
        Assert.Equal("n0", Component(world).LastMessageText);
    }

    private static ChatComponent Component(ChatRoomWorld world, ulong netEntityId = Sender)
    {
        Assert.True(world.TryGetComponent(netEntityId, out ChatComponent? component));
        return component;
    }
}
