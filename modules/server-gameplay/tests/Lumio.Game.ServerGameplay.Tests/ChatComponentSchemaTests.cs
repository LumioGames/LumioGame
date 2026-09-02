using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs.Annotations;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatComponentSchemaTests
{
    [Fact]
    public void ChatComponentUsesN04AnnotationsAndMatchesGeneratedCatalog()
    {
        Assert.NotNull(typeof(ChatComponent).GetCustomAttribute<EcsComponentAttribute>());
        AssertPersistOnly(typeof(ChatComponent).GetProperty(nameof(ChatComponent.LastMessageText)));
        AssertPersistOnly(typeof(ChatComponent).GetProperty(nameof(ChatComponent.LastMessageTick)));

        IReadOnlyList<FieldAttributeDeclaration> scanned = AttributeDeclarationScanner.Scan(typeof(ChatComponent).Assembly);
        IReadOnlyList<FieldAttributeDeclaration> n04 = AttributeDeclarationCatalog.LoadEmbedded();
        FieldAttributeDeclaration[] gameChat = scanned
            .Where(static row => row.AttributeId.StartsWith("ChatComponent.", StringComparison.Ordinal))
            .ToArray();
        FieldAttributeDeclaration[] catalogChat = n04
            .Where(static row => row.AttributeId.StartsWith("ChatComponent.", StringComparison.Ordinal))
            .ToArray();

        Assert.Equal(AttributeDeclarationJson.Format(catalogChat), AttributeDeclarationJson.Format(gameChat));
        Assert.Contains(gameChat, static row => row.AttributeId == "ChatComponent.lastMessageText");
        Assert.Contains(gameChat, static row => row.AttributeId == "ChatComponent.lastMessageTick");
        foreach (FieldAttributeDeclaration row in gameChat)
        {
            Assert.Equal("persistent", row.Persistence);
            Assert.Equal("not-replicated", row.Replication);
            Assert.Equal("server-only", row.Visibility);
        }

        string n04Json = AttributeDeclarationJson.Format(n04);
        Assert.Equal(
            "a47e92d663ba8f9726cf8defdacf2f56ebbaf1b93a8be9b7435430fad48bddc0",
            Sha256Hex(Encoding.UTF8.GetBytes(n04Json)));
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
        Assert.Equal(new[] { "lastMessageText", "lastMessageTick" }, ChatMapping.ComponentFieldOrder);

        byte[] payload = EncodeByFieldOrder(
            ChatMapping.ComponentFieldOrder,
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

    private static void AssertPersistOnly(PropertyInfo? property)
    {
        Assert.NotNull(property);
        PersistAttribute persist = Assert.IsType<PersistAttribute>(property.GetCustomAttribute<PersistAttribute>());
        Assert.Equal(PersistenceKind.Persistent, persist.Kind);
        Assert.Null(property.GetCustomAttribute<ReplicateAttribute>());
        Assert.Null(property.GetCustomAttribute<VisibilityAttribute>());
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
