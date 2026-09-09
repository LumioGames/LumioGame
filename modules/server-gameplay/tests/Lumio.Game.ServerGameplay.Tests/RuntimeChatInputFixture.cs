using System;
using System.Buffers.Binary;
using System.Text;
using Lumio.GameRuntime.Ecs;
using RuntimeChatMapping = Lumio.GameRuntime.Replication.Chat.ChatMapping;

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>Test-only typed command fixture; production framing belongs to Runtime.WireCodec.</summary>
internal static class RuntimeChatInputFixture
{
    public static InputCommandMessage Create(ulong sequence, NetEntityId sender, string text, string? connection = null) =>
        new(sequence, RuntimeChatMapping.InputMappingId, sender, Payload(text), connection);

    private static byte[] Payload(string text)
    {
        byte[] utf8 = Encoding.UTF8.GetBytes(text);
        byte[] payload = new byte[4 + utf8.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(payload, (uint)utf8.Length);
        Buffer.BlockCopy(utf8, 0, payload, 4, utf8.Length);
        return payload;
    }
}
