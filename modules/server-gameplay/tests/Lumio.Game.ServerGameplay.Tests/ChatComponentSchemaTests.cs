using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Samples.Username;
using Xunit;
using RuntimeChatComponent = Lumio.GameRuntime.Samples.Username.Components.Chat.ChatComponent;
using RuntimeChatMapping = Lumio.GameRuntime.Replication.Chat.ChatMapping;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatComponentSchemaTests
{
    [Fact]
    public void GameAssemblyHasNoEcsChatComponentAndRuntimeTableHasLastMessageText()
    {
        Assembly game = typeof(ChatSetMessageSystem).Assembly;
        Assert.DoesNotContain(game.GetTypes(), static type => string.Equals(type.Name, "ChatComponent", StringComparison.Ordinal));
        Assert.DoesNotContain(
            game.GetTypes(),
            static type => type.GetCustomAttribute<EcsComponentAttribute>() is not null
                && string.Equals(type.Name, "ChatComponent", StringComparison.Ordinal));

        Assert.NotNull(typeof(RuntimeChatComponent).GetCustomAttribute<EcsComponentAttribute>());
        Assert.Equal("Lumio.GameRuntime.Samples.Username.Server", typeof(RuntimeChatComponent).Assembly.GetName().Name);

        Assert.Contains(
            GeneratedRegistry.Instance.AttributeDeclarations,
            static row => row.AttributeId == "ChatComponent.lastMessageText");
    }

    [Fact]
    public void FrozenMappingIdsMatchGameplayEnvelopeTenants()
    {
        Assert.Equal("lumio.gameplay-envelope.v1", RuntimeChatMapping.ContractId);
        Assert.Equal("chat.input", RuntimeChatMapping.InputMappingId);
        Assert.Equal("chat.event", ChatGameplayMapping.EventMappingId);
        Assert.Equal("chat.component", ChatGameplayMapping.ComponentMappingId);
        Assert.Equal(new[] { "text" }, RuntimeChatMapping.InputFieldOrder);
        Assert.Equal(
            new[]
            {
                "messageId",
                "roomSequence",
                "senderNetEntityIdInstanceId",
                "senderNetEntityIdCounter",
                "text",
                "appliedTick"
            },
            ChatGameplayMapping.EventFieldOrder);
        Assert.Equal(512, RuntimeChatMapping.MaxTextUtf8Bytes);
        Assert.Equal(1, RuntimeChatMapping.MaxChatInputPerSenderPerTick);
    }

    [Fact]
    public void ComponentFieldOrderMatchesFrozenLumioBinV1HashExample()
    {
        Assert.Equal(new[] { "lastMessageText", "lastMessageTick" }, ChatGameplayMapping.ComponentFieldOrder);

        byte[] payload = EncodeByFieldOrder(
            ChatGameplayMapping.ComponentFieldOrder,
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["lastMessageText"] = "gg",
                ["lastMessageTick"] = 7UL
            });

        Assert.Equal("0200000067670700000000000000", ToHex(payload));
        Assert.Equal("ba9d631032a1ecb5c1b4723b9d9603cf29c8db92736620112cac56b0051d5259", Sha256Hex(payload));
    }

    [Fact]
    public void EventFieldOrderMatchesC1TwoU64SenderHashExample()
    {
        byte[] payload = EncodeByFieldOrder(
            ChatGameplayMapping.EventFieldOrder,
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["messageId"] = 1UL,
                ["roomSequence"] = 1UL,
                ["senderNetEntityIdInstanceId"] = 0UL,
                ["senderNetEntityIdCounter"] = 101UL,
                ["text"] = "gg",
                ["appliedTick"] = 7UL
            });

        Assert.Equal(
            "01000000000000000100000000000000000000000000000065000000000000000200000067670700000000000000",
            ToHex(payload));
        Assert.Equal("019c19137fdcc3eadf322f67067c254ef33fc2f81a7123bc89253d9a41d0d179", Sha256Hex(payload));
    }

    [Fact]
    public void InputFieldOrderMatchesFrozenLumioBinV1HashExample()
    {
        byte[] payload = EncodeByFieldOrder(
            RuntimeChatMapping.InputFieldOrder,
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["text"] = "gg"
            });

        Assert.Equal("020000006767", ToHex(payload));
        Assert.Equal("5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab", Sha256Hex(payload));
    }

    private static byte[] EncodeByFieldOrder(IReadOnlyList<string> fieldOrder, Dictionary<string, object> body)
    {
        var buffer = new List<byte>();
        byte[] lengthPrefix = new byte[4];
        byte[] integerBytes = new byte[8];
        foreach (string field in fieldOrder)
        {
            object value = body[field];
            if (value is string text)
            {
                byte[] utf8 = Encoding.UTF8.GetBytes(text);
                BinaryPrimitives.WriteUInt32LittleEndian(lengthPrefix, (uint)utf8.Length);
                buffer.AddRange(lengthPrefix);
                buffer.AddRange(utf8);
            }
            else if (value is ulong number)
            {
                BinaryPrimitives.WriteUInt64LittleEndian(integerBytes, number);
                buffer.AddRange(integerBytes);
            }
            else
            {
                throw new InvalidOperationException("Unsupported field type " + value.GetType().FullName);
            }
        }

        return buffer.ToArray();
    }

    private static string ToHex(byte[] payload)
    {
        return Convert.ToHexString(payload).ToLowerInvariant();
    }

    private static string Sha256Hex(byte[] payload)
    {
        return Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
    }
}
