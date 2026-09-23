using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Lumio.Game.ServerGameplay;
using Lumio.GameRuntime.Ecs;
using Xunit;
using RuntimeChatMapping = Lumio.GameRuntime.Replication.Chat.ChatMapping;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class ChatComponentSchemaTests
{
    [Fact]
    public void GameAssemblyOwnsExactlyOneEcsChatAndIdentityComponentAndItsRegistryDeclaresThem()
    {
        // ADR-117 decision 4: chat is gameplay, so ChatComponent / IdentityComponent live in this assembly and
        // are registered by this assembly's generated registry, not borrowed from an engine test fixture.
        Assembly game = typeof(ChatSetMessageSystem).Assembly;
        foreach (string component in new[] { "ChatComponent", "IdentityComponent" })
        {
            Type declared = Assert.Single(
                game.GetTypes(),
                type => type.GetCustomAttribute<EcsComponentAttribute>() is not null
                    && string.Equals(type.Name, component, StringComparison.Ordinal));
            Assert.Equal(typeof(ChatSetMessageSystem).Namespace, declared.Namespace);
        }

        Assert.Same(game, GeneratedRegistry.Instance.GetType().Assembly);
        Assert.Equal(RegistrySide.Server, GeneratedRegistry.Instance.Side);
        Assert.True(GeneratedRegistry.Instance.TryResolveEntityType("player", out Type player));
        Assert.Equal(typeof(PlayerEntity), player);
        Assert.Equal(0, GeneratedRegistry.Instance.ComponentIndex(typeof(PlayerEntity), typeof(ObserverComponent)));
        Assert.True(GeneratedRegistry.Instance.ComponentIndex(typeof(PlayerEntity), typeof(IdentityComponent)) > 0);
        Assert.True(GeneratedRegistry.Instance.ComponentIndex(typeof(PlayerEntity), typeof(ChatComponent)) > 0);

        string[] attributeIds = GeneratedRegistry.Instance.AttributeDeclarations.Select(static row => row.AttributeId).ToArray();
        Assert.Contains("ChatComponent.lastMessageText", attributeIds);
        Assert.Contains("ChatComponent.lastMessageTick", attributeIds);
        Assert.Contains("IdentityComponent.name", attributeIds);
        Assert.Contains("IdentityComponent.accountId", attributeIds);
    }

    [Fact]
    public void RegistryDeclaresNoGameplayConfigContractSoWorldsBootWithoutABinding()
    {
        // ServerWorldBoot creates worlds without a WorldConfigBinding. That is only correct while this registry
        // declares no config contract: Runtime requires declaration and binding to agree. Declaring one without
        // a real binding turns this red instead of letting the boot drift into a null/default binding.
        Assert.Null(GeneratedRegistry.Instance.RequiredGameplayConfigContract);
        Assert.Null(GeneratedRegistry.Instance.CreateGameplayConfigBinding());
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

        byte[] payload = LumioBinV1TestCodec.EncodeByFieldOrder(
            ChatGameplayMapping.ComponentFieldOrder,
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["lastMessageText"] = "gg",
                ["lastMessageTick"] = 7UL
            });

        Assert.Equal("0200000067670700000000000000", LumioBinV1TestCodec.ToHex(payload));
        Assert.Equal("ba9d631032a1ecb5c1b4723b9d9603cf29c8db92736620112cac56b0051d5259", LumioBinV1TestCodec.Sha256Hex(payload));
    }

    [Fact]
    public void EventFieldOrderMatchesC1TwoU64SenderHashExample()
    {
        byte[] payload = LumioBinV1TestCodec.EncodeByFieldOrder(
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
            LumioBinV1TestCodec.ToHex(payload));
        Assert.Equal("019c19137fdcc3eadf322f67067c254ef33fc2f81a7123bc89253d9a41d0d179", LumioBinV1TestCodec.Sha256Hex(payload));
    }

    [Fact]
    public void InputFieldOrderMatchesFrozenLumioBinV1HashExample()
    {
        byte[] payload = LumioBinV1TestCodec.EncodeByFieldOrder(
            RuntimeChatMapping.InputFieldOrder,
            new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["text"] = "gg"
            });

        Assert.Equal("020000006767", LumioBinV1TestCodec.ToHex(payload));
        Assert.Equal("5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab", LumioBinV1TestCodec.Sha256Hex(payload));
    }
}
