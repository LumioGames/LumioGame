using System;
using System.Reflection;
using Lumio.Game.ServerGameplay;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class InputCommandEnvelopeTests
{
    [Fact]
    public void FromChatTextGgMatchesFrozenLumioBinV1HashExample()
    {
        InputCommandEnvelope envelope = InputCommandEnvelope.FromChatText("gg");
        Assert.Equal("InputCommand", envelope.MessageType);
        CommandBlock block = Assert.Single(envelope.Commands);
        Assert.Equal("chat.input", block.MappingId);
        Assert.Equal("020000006767", block.Payload);
        Assert.Equal("5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab", block.PayloadSha256);
    }

    [Fact]
    public void HostAdmitRequiresInputCommandEnvelopeNotRawText()
    {
        MethodInfo? raw = typeof(GameRoomHost).GetMethod(
            "AdmitChatInput",
            BindingFlags.Instance | BindingFlags.Public,
            binder: null,
            types: new[] { typeof(string), typeof(string) },
            modifiers: null);
        Assert.Null(raw);

        MethodInfo? envelope = typeof(GameRoomHost).GetMethod(
            "AdmitChatInput",
            BindingFlags.Instance | BindingFlags.Public,
            binder: null,
            types: new[] { typeof(string), typeof(InputCommandEnvelope) },
            modifiers: null);
        Assert.NotNull(envelope);
    }

    [Fact]
    public void ValidChatInputEnvelopeIsAdmittedAndDecodedTextReachesTick()
    {
        var host = new GameRoomHost(TimeSpan.FromMinutes(5), new ManualClock());
        Assert.True(host.Admit("room-main", "c-bot01", Bot("Bot01")).Accepted);

        ChatOperationResult admitted = host.AdmitChatInput("c-bot01", InputCommandEnvelope.FromChatText("hello-Bot01"));
        Assert.Equal(ChatOperationKind.Admitted, admitted.Kind);

        RoomTickResult tick = host.RunTick("room-main");
        ChatMessageEvent ev = Assert.Single(tick.Events);
        Assert.Equal("hello-Bot01", ev.Text);
    }

    [Fact]
    public void BadPayloadHashIsRejectedBeforeAnyChatStateChange()
    {
        var host = new GameRoomHost(TimeSpan.FromMinutes(5), new ManualClock());
        Assert.True(host.Admit("room-main", "c-bot01", Bot("Bot01")).Accepted);

        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("hello-Bot01");
        CommandBlock block = Assert.Single(valid.Commands);
        var tampered = new InputCommandEnvelope(
            valid.MessageType,
            new[] { new CommandBlock(block.MappingId, block.Payload, string.Concat("ab", block.PayloadSha256.AsSpan(2))) });

        ChatOperationResult rejected = host.AdmitChatInput("c-bot01", tampered);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadPayloadHash, rejected.ErrorCode);
        Assert.Empty(host.RunTick("room-main").Events);
    }

    [Fact]
    public void UnknownMappingIdIsRejectedAsUnknownCommandType()
    {
        var host = new GameRoomHost(TimeSpan.FromMinutes(5), new ManualClock());
        Assert.True(host.Admit("room-main", "c-bot01", Bot("Bot01")).Accepted);

        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("gg");
        CommandBlock block = Assert.Single(valid.Commands);
        var unknown = new InputCommandEnvelope(
            valid.MessageType,
            new[] { new CommandBlock("chat.not-a-command", block.Payload, block.PayloadSha256) });

        ChatOperationResult rejected = host.AdmitChatInput("c-bot01", unknown);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.UnknownCommandType, rejected.ErrorCode);
    }

    [Fact]
    public void WrongMessageTypeIsRejectedAsBadEnvelope()
    {
        var host = new GameRoomHost(TimeSpan.FromMinutes(5), new ManualClock());
        Assert.True(host.Admit("room-main", "c-bot01", Bot("Bot01")).Accepted);

        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("gg");
        var wrong = new InputCommandEnvelope("Delta", valid.Commands);

        ChatOperationResult rejected = host.AdmitChatInput("c-bot01", wrong);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadEnvelope, rejected.ErrorCode);
    }

    private static VerifiedAdmission Bot(string loginName)
    {
        string hex = Convert.ToHexString(System.Text.Encoding.UTF8.GetBytes(loginName.PadRight(16, 'x'))).ToLowerInvariant();
        if (hex.Length < 32)
        {
            hex = hex.PadRight(32, '0');
        }

        return new VerifiedAdmission("acct_" + hex[..32], loginName, BotToolContext: true);
    }

    private sealed class ManualClock : IHostMonotonicClock
    {
        public long Milliseconds { get; private set; }

        public void Advance(TimeSpan delta) => Milliseconds += (long)delta.TotalMilliseconds;
    }
}
