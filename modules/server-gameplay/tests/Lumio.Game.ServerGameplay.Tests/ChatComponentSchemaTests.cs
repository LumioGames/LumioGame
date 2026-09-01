using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Lumio.Game.ServerGameplay;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatComponentSchemaTests
{
    [Fact]
    public void LastMessageFieldsArePersistOnlyAndAbsentFromClientPropertySync()
    {
        Assert.Equal(ChatMapping.ComponentMappingId, "chat.component");
        Assert.Equal(2, ChatComponentSchema.Fields.Count);
        Assert.Equal(ChatMapping.ComponentFieldOrder, ChatComponentSchema.FieldOrder.ToArray());

        ChatFieldDeclaration text = ChatComponentSchema.Fields[0];
        ChatFieldDeclaration tick = ChatComponentSchema.Fields[1];
        Assert.Equal("lastMessageText", text.Name);
        Assert.Equal("utf8-string", text.TypeName);
        Assert.Equal("lastMessageTick", tick.Name);
        Assert.Equal("u64", tick.TypeName);

        foreach (ChatFieldDeclaration field in ChatComponentSchema.Fields)
        {
            Assert.Equal(ChatFieldPersistence.PersistOnly, field.Persistence);
            Assert.Equal(ChatFieldReplication.None, field.Replication);
            Assert.Equal(ChatFieldVisibility.ServerOnly, field.Visibility);
        }

        Assert.Empty(ChatComponentSchema.ClientPropertySyncStream);
        Assert.DoesNotContain(
            ChatComponentSchema.Fields,
            field => field.Replication != ChatFieldReplication.None);
    }

    [Fact]
    public void FrozenMappingIdsMatchGameplayEnvelopeTenants()
    {
        Assert.Equal("lumio.gameplay-envelope.v1", ChatMapping.ContractId);
        Assert.Equal("chat.input", ChatMapping.InputMappingId);
        Assert.Equal("chat.event", ChatMapping.EventMappingId);
        Assert.Equal("chat.component", ChatMapping.ComponentMappingId);
        Assert.Equal(new[] { "text" }, ChatMapping.InputFieldOrder);
        Assert.Equal(
            new[] { "messageId", "roomSequence", "senderNetEntityId", "text", "appliedTick" },
            ChatMapping.EventFieldOrder);
        Assert.Equal(512, ChatMapping.MaxTextUtf8Bytes);
        Assert.Equal(1, ChatMapping.MaxChatInputPerSenderPerTick);
    }

    [Fact]
    public void ComponentFieldOrderMatchesFrozenLumioBinV1HashExample()
    {
        Assert.Equal(new[] { "lastMessageText", "lastMessageTick" }, ChatComponentSchema.FieldOrder.ToArray());

        byte[] payload = EncodeByFieldOrder(
            ChatComponentSchema.FieldOrder,
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["lastMessageText"] = "gg",
                ["lastMessageTick"] = 7UL
            });

        Assert.Equal("0200000067670700000000000000", ToHex(payload));
        Assert.Equal("ba9d631032a1ecb5c1b4723b9d9603cf29c8db92736620112cac56b0051d5259", Sha256Hex(payload));
    }

    [Fact]
    public void EventFieldOrderMatchesFrozenLumioBinV1HashExample()
    {
        byte[] payload = EncodeByFieldOrder(
            ChatMapping.EventFieldOrder,
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["messageId"] = 1UL,
                ["roomSequence"] = 1UL,
                ["senderNetEntityId"] = 101UL,
                ["text"] = "gg",
                ["appliedTick"] = 7UL
            });

        Assert.Equal(
            "0100000000000000010000000000000065000000000000000200000067670700000000000000",
            ToHex(payload));
        Assert.Equal("9fafc556e56dc024a90caf7c102dfccfed4189c708e0a51b0139aab28277670c", Sha256Hex(payload));
    }

    [Fact]
    public void InputFieldOrderMatchesFrozenLumioBinV1HashExample()
    {
        byte[] payload = EncodeByFieldOrder(
            ChatMapping.InputFieldOrder,
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
