using System;
using System.Reflection;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Samples.Username.Components.Chat;
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
            BindingFlags.Static | BindingFlags.Public);
        Assert.Null(raw);

        MethodInfo? envelope = typeof(ChatSetMessageSystem).GetMethod(
            nameof(ChatSetMessageSystem.AdmitEnvelope),
            BindingFlags.Static | BindingFlags.Public);
        Assert.NotNull(envelope);
    }

    [Fact]
    public void ValidChatInputEnvelopeIsAdmittedAndDecodedTextReachesTick()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        ChatOperationResult admitted = ChatSetMessageSystem.AdmitEnvelope(
            manager,
            "room-01",
            "C1",
            1UL,
            InputCommandEnvelope.FromChatText("hello-Bot01"));
        Assert.Equal(ChatOperationKind.Admitted, admitted.Kind);

        manager.Tick();
        ClientRpcRecord ev = Assert.Single(DrainChat(manager));
        Assert.Equal(": hello-Bot01", Assert.Single(ev.Args));
    }

    [Fact]
    public void BadPayloadHashIsRejectedBeforeAnyChatStateChange()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("hello-Bot01");
        CommandBlock block = Assert.Single(valid.Commands);
        var tampered = new InputCommandEnvelope(
            valid.MessageType,
            new[] { new CommandBlock(block.MappingId, block.Payload, string.Concat("ab", block.PayloadSha256.AsSpan(2))) });

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(manager, "room-01", "C1", 1UL, tampered);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadPayloadHash, rejected.ErrorCode);
        manager.Tick();
        Assert.Empty(DrainChat(manager));
        Assert.True(ChatSetMessageSystem.TryGetComponent(manager, sender, out ChatComponent component));
        Assert.Equal(string.Empty, component.LastMessageText);
    }

    [Fact]
    public void UnknownMappingIdIsRejectedAsUnknownCommandType()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("gg");
        CommandBlock block = Assert.Single(valid.Commands);
        var unknown = new InputCommandEnvelope(
            valid.MessageType,
            new[] { new CommandBlock("chat.not-a-command", block.Payload, block.PayloadSha256) });

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(manager, "room-01", "C1", 1UL, unknown);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.UnknownCommandType, rejected.ErrorCode);
    }

    [Fact]
    public void WrongMessageTypeIsRejectedAsBadEnvelope()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        InputCommandEnvelope valid = InputCommandEnvelope.FromChatText("gg");
        var wrong = new InputCommandEnvelope("Delta", valid.Commands);

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(manager, "room-01", "C1", 1UL, wrong);
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadEnvelope, rejected.ErrorCode);
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
