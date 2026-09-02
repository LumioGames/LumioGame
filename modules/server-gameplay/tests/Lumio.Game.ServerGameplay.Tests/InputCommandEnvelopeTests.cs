using System;
using System.Reflection;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Replication.Binding;
using RuntimeChat = Lumio.GameRuntime.Replication.Chat;
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
        MethodInfo? raw = typeof(ChatSetMessageSystem).GetMethod(
            "AdmitChatInput",
            BindingFlags.Static | BindingFlags.Public,
            binder: null,
            types: new[] { typeof(RuntimeChat.ChatCommandRuntime), typeof(string), typeof(string) },
            modifiers: null);
        Assert.Null(raw);

        MethodInfo? envelope = typeof(ChatSetMessageSystem).GetMethod(
            nameof(ChatSetMessageSystem.AdmitEnvelope),
            BindingFlags.Static | BindingFlags.Public);
        Assert.NotNull(envelope);
    }

    [Fact]
    public void ValidChatInputEnvelopeIsAdmittedAndDecodedTextReachesTick()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        ChatOperationResult admitted = ChatSetMessageSystem.AdmitEnvelope(
            runtime,
            "room-01",
            "C1",
            1UL,
            InputCommandEnvelope.FromChatText("hello-Bot01"));
        Assert.Equal(ChatOperationKind.Admitted, admitted.Kind);

        RuntimeChat.ChatTickResult tick = runtime.RunTick(1);
        RuntimeChat.ChatMessageEvent ev = Assert.Single(tick.Events);
        Assert.Equal("hello-Bot01", ev.Text);
    }

    [Fact]
    public void BadPayloadHashIsRejectedBeforeAnyChatStateChange()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        string sender = runtime.LiveNetEntityIds[0];
        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("hello-Bot01");
        CommandBlock block = Assert.Single(valid.Commands);
        var tampered = new InputCommandEnvelope(
            valid.MessageType,
            new[] { new CommandBlock(block.MappingId, block.Payload, string.Concat("ab", block.PayloadSha256.AsSpan(2))) });

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(runtime, "room-01", "C1", 1UL, tampered);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadPayloadHash, rejected.ErrorCode);
        Assert.Empty(runtime.RunTick(1).Events);
        Assert.True(ChatSetMessageSystem.TryGetComponent(runtime, sender, out ChatComponent component));
        Assert.Equal(string.Empty, component.LastMessageText);
    }

    [Fact]
    public void UnknownMappingIdIsRejectedAsUnknownCommandType()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("gg");
        CommandBlock block = Assert.Single(valid.Commands);
        var unknown = new InputCommandEnvelope(
            valid.MessageType,
            new[] { new CommandBlock("chat.not-a-command", block.Payload, block.PayloadSha256) });

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(runtime, "room-01", "C1", 1UL, unknown);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.UnknownCommandType, rejected.ErrorCode);
    }

    [Fact]
    public void WrongMessageTypeIsRejectedAsBadEnvelope()
    {
        using RuntimeChat.ChatCommandRuntime runtime = RoomWith();
        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("gg");
        var wrong = new InputCommandEnvelope("Delta", valid.Commands);

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(runtime, "room-01", "C1", 1UL, wrong);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadEnvelope, rejected.ErrorCode);
    }

    private static RuntimeChat.ChatCommandRuntime RoomWith()
    {
        EntityBindingQuery bindings = EntityBindingQuery.Create();
        BindingQueryResult admitted = bindings.Admit("C1", "acct-07", "room-01", "player");
        Assert.Equal("ok", admitted.Outcome);
        RuntimeChat.ChatCommandRuntime runtime = RuntimeChat.ChatCommandRuntime.Create(bindings, ownsBindings: true);
        RuntimeChat.ChatMappingResult attached = runtime.AttachMember("room-01", "C1");
        Assert.True(attached.Succeeded, attached.Code + " " + attached.Detail);
        return runtime;
    }
}
