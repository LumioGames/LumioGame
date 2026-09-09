using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Lumio.Game.ServerGameplay;
using Xunit;
using RuntimeChatMapping = Lumio.GameRuntime.Replication.Chat.ChatMapping;

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>
/// Pins every chat mapping identifier and envelope-level bound this repository consumes to
/// <c>engine/wire/gameplay-command-envelope-v1.json</c> in the architecture repository. The sibling
/// assertions in <see cref="ChatComponentSchemaTests"/> only reach as far as the Runtime C# constants,
/// which are themselves hand-transcribed; these assertions close the remaining hop to the contract file
/// so a bound changed upstream cannot stay green here.
/// </summary>
public sealed class ChatWireContractTests
{
    [Fact]
    public void ChatInputMappingMatchesWireContract()
    {
        using JsonDocument contract = EngineWireContract.Load(EngineWireContract.GameplayCommandEnvelopeV1);
        JsonElement root = contract.RootElement;

        Assert.Equal(RuntimeChatMapping.ContractId, root.GetProperty("contractId").GetString());

        JsonElement chatInput = root.GetProperty("mappings").GetProperty(RuntimeChatMapping.InputMappingId);
        Assert.Equal("command", chatInput.GetProperty("kind").GetString());
        Assert.Equal("c2s", chatInput.GetProperty("direction").GetString());
        Assert.Equal(RuntimeChatMapping.InputFieldOrder, ReadStringArray(chatInput.GetProperty("fieldOrder")));

        JsonElement textField = chatInput.GetProperty("fields").GetProperty("text");
        Assert.Equal("utf8-string", textField.GetProperty("type").GetString());
        Assert.Equal(RuntimeChatMapping.MaxTextUtf8Bytes, textField.GetProperty("maxUtf8Bytes").GetInt32());

        string violationCode = textField.GetProperty("violationCode").GetString()!;
        Assert.Equal("chat_text_too_long", violationCode);
        Assert.Contains(violationCode, ReadStringArray(root.GetProperty("errorCodes")));
    }

    [Fact]
    public void BoundedInputConstantsMatchWireContract()
    {
        using JsonDocument contract = EngineWireContract.Load(EngineWireContract.GameplayCommandEnvelopeV1);
        JsonElement root = contract.RootElement;

        JsonElement boundedInput = root.GetProperty("boundedInput");
        Assert.Equal(RuntimeChatMapping.BoundedInputPolicy, boundedInput.GetProperty("policy").GetString());

        JsonElement rules = boundedInput.GetProperty("rules");
        Assert.Equal(RuntimeChatMapping.MaxTextUtf8Bytes, rules.GetProperty("chatTextMaxUtf8Bytes").GetInt32());
        Assert.Equal(
            RuntimeChatMapping.MaxChatInputPerSenderPerTick,
            rules.GetProperty("maxChatInputPerSenderPerTick").GetInt32());
        Assert.Equal(
            RuntimeChatMapping.MaxCommandsPerEnvelope,
            rules.GetProperty("maxCommandsPerEnvelope").GetInt32());

        Assert.Equal(
            RuntimeChatMapping.IngressQueueCapacity,
            root.GetProperty("limits").GetProperty("ingressQueuePerConnection").GetInt32());
    }

    [Fact]
    public void ChatInputHashExampleReproducesUnderTheWireFieldOrder()
    {
        using JsonDocument contract = EngineWireContract.Load(EngineWireContract.GameplayCommandEnvelopeV1);
        JsonElement root = contract.RootElement;

        JsonElement example = root.GetProperty("hash").GetProperty("examples").EnumerateArray().Single(
            static entry => entry.GetProperty("mappingId").GetString() == RuntimeChatMapping.InputMappingId);

        byte[] payload = LumioBinV1TestCodec.EncodeByFieldOrder(
            ReadStringArray(root.GetProperty("mappings").GetProperty(RuntimeChatMapping.InputMappingId).GetProperty("fieldOrder")),
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["text"] = example.GetProperty("body").GetProperty("text").GetString()!
            });

        Assert.Equal(example.GetProperty("payload").GetString(), LumioBinV1TestCodec.ToHex(payload));
        Assert.Equal(example.GetProperty("payloadSha256").GetString(), LumioBinV1TestCodec.Sha256Hex(payload));
    }

    [Fact]
    public void GameOwnedChatMappingsAreNotEnvelopeMappings()
    {
        using JsonDocument contract = EngineWireContract.Load(EngineWireContract.GameplayCommandEnvelopeV1);
        JsonElement mappings = contract.RootElement.GetProperty("mappings");

        // ADR-060 / R5-01 removed chat.event and chat.component from the envelope: a chat event is now the
        // ChatComponent.OnChatMessage ClientRpc record, and last-message state is persist-only. Both ids stay
        // Game-owned. Should the envelope ever declare either one, this repository must consume the upstream
        // field order instead of declaring its own — that reconciliation is what a failure here demands.
        Assert.False(mappings.TryGetProperty(ChatGameplayMapping.EventMappingId, out _));
        Assert.False(mappings.TryGetProperty(ChatGameplayMapping.ComponentMappingId, out _));
    }

    [Fact]
    public void ChatEventFieldOrderProjectsTheWireClientRpcRecord()
    {
        using JsonDocument contract = EngineWireContract.Load(EngineWireContract.GameplayCommandEnvelopeV1);
        JsonElement clientRpcRecord = contract.RootElement
            .GetProperty("sharedTypes")
            .GetProperty("ClientRpcRecord")
            .GetProperty("required");

        // chat.event is a local projection of that record. Every name it carries through unchanged must keep
        // existing upstream as a u64, and the 128-bit sender is what its two u64 halves encode (C-1').
        foreach (string field in ChatGameplayMapping.EventFieldOrder.Where(
            static field => !field.StartsWith("sender", StringComparison.Ordinal) && field != "text"))
        {
            Assert.Equal("u64", clientRpcRecord.GetProperty(field).GetString());
        }

        Assert.Equal("hex128", clientRpcRecord.GetProperty("sender").GetString());
        Assert.Equal(
            2,
            ChatGameplayMapping.EventFieldOrder.Count(
                static field => field.StartsWith("senderNetEntityId", StringComparison.Ordinal)));
    }

    private static string[] ReadStringArray(JsonElement array)
    {
        return array.EnumerateArray().Select(static item => item.GetString()!).ToArray();
    }
}
