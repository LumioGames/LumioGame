using System;
using System.Text;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Samples.Username.Components.Chat;
using Xunit;
using RuntimeChatMapping = Lumio.GameRuntime.Replication.Chat.ChatMapping;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class RuntimeCodecBoundaryTests
{
    [Fact]
    public void RuntimeCodecRoundTripsTypedInputCommand()
    {
        NetEntityId sender = new(ChatWorldHarness.InstanceId, 1UL);
        InputCommandMessage command = new(
            17UL,
            RuntimeChatMapping.InputMappingId,
            sender,
            ChatPayload("hello"),
            "C1");

        byte[] encoded = WireCodec.EncodeInput(command);
        InputCommandMessage decoded = WireCodec.DecodeInput(encoded, sender);

        Assert.Equal(sender, decoded.Sender);
        Assert.Equal(17UL, decoded.Sequence);
        Assert.Equal(RuntimeChatMapping.InputMappingId, decoded.MappingId);
        Assert.True(WireCodec.TryReadUtf8Payload(decoded.Payload.Span, out string text));
        Assert.Equal("hello", text);
    }

    [Fact]
    public void GameAdmitEnvelopeDelegatesValidationToRuntimeCodec()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        byte[] envelope = WireCodec.EncodeInput(new InputCommandMessage(
            1UL,
            RuntimeChatMapping.InputMappingId,
            sender,
            ChatPayload("hello"),
            "C1"));

        ChatOperationResult admitted = ChatSetMessageSystem.AdmitEnvelope(
            manager, "room-01", sender, "C1", 1UL, envelope);

        Assert.Equal(ChatOperationKind.Admitted, admitted.Kind);
        manager.Tick();
        Assert.Equal("hello", ChatSetMessageSystem.TryGetComponent(manager, sender, out ChatComponent? component)
            ? component.LastMessageText
            : null);
    }

    [Fact]
    public void RuntimeCodecHashRejectionMapsToGameErrorWithoutEnqueue()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        string envelope = Encoding.UTF8.GetString(WireCodec.EncodeInput(new InputCommandMessage(
            1UL,
            RuntimeChatMapping.InputMappingId,
            sender,
            ChatPayload("hello"),
            "C1")));
        const string marker = "payloadSha256\":\"";
        int hashStart = envelope.IndexOf(marker, StringComparison.Ordinal) + marker.Length;
        string tampered = envelope[..hashStart] + new string('0', 64) + envelope[(hashStart + 64)..];

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(
            manager, "room-01", sender, "C1", 1UL, Encoding.UTF8.GetBytes(tampered));

        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadPayloadHash, rejected.ErrorCode);
        manager.Tick();
        Assert.True(ChatSetMessageSystem.TryGetComponent(manager, sender, out ChatComponent? component));
        // Runtime 18b5feb 把 ChatComponent.LastMessageText 从 `public string = ""` 改成
        // `Sync<string>`，而 Sync<T> 没有带初值的构造函数，所以「还没写过」现在读出 null 而非 ""。
        // 这里断言的是意图（尚无消息），对两种表示都成立。
        Assert.Equal(string.Empty, component.LastMessageText.Value ?? string.Empty);
    }

    [Fact]
    public void RuntimeCodecUnknownMappingMapsToGameError()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        byte[] envelope = WireCodec.EncodeInput(new InputCommandMessage(
            1UL,
            "chat.unknown",
            sender,
            ChatPayload("hello"),
            "C1"));

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(
            manager, "room-01", sender, "C1", 1UL, envelope);

        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.UnknownCommandType, rejected.ErrorCode);
    }

    [Fact]
    public void RuntimeCodecWrongMessageTypeMapsToBadEnvelope()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        string encoded = Encoding.UTF8.GetString(WireCodec.EncodeInput(new InputCommandMessage(
            1UL,
            RuntimeChatMapping.InputMappingId,
            sender,
            ChatPayload("hello"),
            "C1")));
        byte[] wrongType = Encoding.UTF8.GetBytes(encoded.Replace("InputCommand", "Delta", StringComparison.Ordinal));

        ChatOperationResult rejected = ChatSetMessageSystem.AdmitEnvelope(
            manager, "room-01", sender, "C1", 1UL, wrongType);

        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatErrorCodes.BadEnvelope, rejected.ErrorCode);
    }

    [Fact]
    public void RuntimeCodecRejectsMalformedInputEnvelope()
    {
        Assert.Throws<FormatException>(() => WireCodec.DecodeInput(
            Encoding.UTF8.GetBytes("{\"messageType\":\"InputCommand\",\"commands\":null}")));
    }

    [Fact]
    public void GameAdmitEnvelopePreservesDecodedSequence()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        byte[] envelope = WireCodec.EncodeInput(new InputCommandMessage(
            2UL,
            RuntimeChatMapping.InputMappingId,
            sender,
            ChatPayload("out-of-order"),
            "C1"));

        ChatOperationResult admitted = ChatSetMessageSystem.AdmitEnvelope(
            manager, "room-01", sender, "C1", 1UL, envelope);

        Assert.Equal(ChatOperationKind.Admitted, admitted.Kind);
        manager.Tick();
        Assert.Contains(manager.DrainOutbox(), static message => message is ErrorMessage { Code: "bad_envelope" });
        Assert.Equal(string.Empty, ComponentText(manager, sender));
    }

    [Fact]
    public void GameAdmitEnvelopePreservesHostConnectionGeneration()
    {
        using WorldManager manager = ChatWorldHarness.Boot();
        NetEntityId sender = ChatWorldHarness.Net(manager, 0);
        byte[] envelope = WireCodec.EncodeInput(new InputCommandMessage(
            1UL,
            RuntimeChatMapping.InputMappingId,
            sender,
            ChatPayload("stale-generation"),
            "C1"));

        ChatOperationResult admitted = ChatSetMessageSystem.AdmitEnvelope(
            manager, "room-01", sender, "C1", 2UL, envelope);

        Assert.Equal(ChatOperationKind.Admitted, admitted.Kind);
        manager.Tick();
        Assert.Contains(manager.DrainOutbox(), static message => message is ErrorMessage { Code: "session_closed" });
        Assert.Equal(string.Empty, ComponentText(manager, sender));
    }

    private static string ComponentText(WorldManager manager, NetEntityId sender)
    {
        Assert.True(ChatSetMessageSystem.TryGetComponent(manager, sender, out ChatComponent? component));
        return component.LastMessageText.Value ?? string.Empty;
    }

    private static byte[] ChatPayload(string text)
    {
        byte[] utf8 = Encoding.UTF8.GetBytes(text);
        byte[] payload = new byte[4 + utf8.Length];
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(payload, (uint)utf8.Length);
        Buffer.BlockCopy(utf8, 0, payload, 4, utf8.Length);
        return payload;
    }
}
