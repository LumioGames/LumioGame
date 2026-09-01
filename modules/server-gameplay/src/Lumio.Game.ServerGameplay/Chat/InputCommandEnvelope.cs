using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace Lumio.Game.ServerGameplay;

/// <summary>One CommandBlock of frozen <c>lumio.gameplay-envelope.v1</c> InputCommand.</summary>
/// <param name="MappingId">Registered mapping id. Chat tenant is <see cref="ChatMapping.InputMappingId"/>.</param>
/// <param name="Payload">LumioBinV1 payload as lowercase hex.</param>
/// <param name="PayloadSha256">SHA-256 of the decoded payload bytes, lowercase hex.</param>
public readonly record struct CommandBlock(string MappingId, string Payload, string PayloadSha256);

/// <summary>
/// Frozen InputCommand envelope consumed by the 101-entity host ingress.
/// ChatInput remains text-only after this envelope is decoded.
/// </summary>
public sealed class InputCommandEnvelope
{
    /// <summary>Wire messageType for this envelope.</summary>
    public const string MessageTypeName = "InputCommand";

    /// <summary>boundedInput.maxCommandsPerEnvelope.</summary>
    public const int MaxCommandsPerEnvelope = 16;

    /// <summary>Creates an envelope from already-encoded command blocks.</summary>
    public InputCommandEnvelope(string messageType, IReadOnlyList<CommandBlock> commands)
    {
        MessageType = messageType ?? string.Empty;
        Commands = commands ?? Array.Empty<CommandBlock>();
    }

    /// <summary>Must be <see cref="MessageTypeName"/>.</summary>
    public string MessageType { get; }

    /// <summary>Command blocks. Chat ingress requires exactly one <c>chat.input</c>.</summary>
    public IReadOnlyList<CommandBlock> Commands { get; }

    /// <summary>Encodes a single chat.input CommandBlock using LumioBinV1 fieldOrder [text].</summary>
    public static InputCommandEnvelope FromChatText(string text)
    {
        byte[] payload = EncodeUtf8Prefixed(text ?? string.Empty);
        return new InputCommandEnvelope(
            MessageTypeName,
            new[]
            {
                new CommandBlock(ChatMapping.InputMappingId, ToHex(payload), Sha256Hex(payload))
            });
    }

    /// <summary>
    /// Validates messageType, mapping kind, payload digest, and LumioBinV1 text.
    /// Hash mismatch is reported before any chat state is interpreted.
    /// </summary>
    public static bool TryDecodeChatText(InputCommandEnvelope? envelope, out string text, out string errorCode)
    {
        text = string.Empty;
        errorCode = ChatErrorCodes.BadEnvelope;
        if (envelope is null
            || !string.Equals(envelope.MessageType, MessageTypeName, StringComparison.Ordinal))
        {
            return false;
        }

        IReadOnlyList<CommandBlock> commands = envelope.Commands;
        if (commands is null || commands.Count == 0 || commands.Count > MaxCommandsPerEnvelope)
        {
            errorCode = commands is null || commands.Count > MaxCommandsPerEnvelope
                ? ChatErrorCodes.BadEnvelope
                : ChatErrorCodes.UnknownCommandType;
            return false;
        }

        string? previous = null;
        string? decoded = null;
        foreach (CommandBlock block in commands)
        {
            if (string.IsNullOrEmpty(block.MappingId))
            {
                errorCode = ChatErrorCodes.UnknownCommandType;
                return false;
            }

            if (previous is not null && string.CompareOrdinal(previous, block.MappingId) >= 0)
            {
                errorCode = ChatErrorCodes.BlockOrderViolation;
                return false;
            }

            previous = block.MappingId;

            if (!TryDecodeHex(block.Payload, out byte[] payload))
            {
                errorCode = ChatErrorCodes.UndecodablePayload;
                return false;
            }

            if (!IsLowerSha256Hex(block.PayloadSha256) || !string.Equals(Sha256Hex(payload), block.PayloadSha256, StringComparison.Ordinal))
            {
                errorCode = ChatErrorCodes.BadPayloadHash;
                return false;
            }

            if (!string.Equals(block.MappingId, ChatMapping.InputMappingId, StringComparison.Ordinal))
            {
                errorCode = ChatErrorCodes.UnknownCommandType;
                return false;
            }

            if (decoded is not null)
            {
                errorCode = ChatErrorCodes.BadEnvelope;
                return false;
            }

            if (!TryDecodeUtf8Prefixed(payload, out decoded))
            {
                errorCode = ChatErrorCodes.UndecodablePayload;
                return false;
            }
        }

        if (decoded is null)
        {
            errorCode = ChatErrorCodes.UnknownCommandType;
            return false;
        }

        text = decoded;
        errorCode = string.Empty;
        return true;
    }

    private static byte[] EncodeUtf8Prefixed(string text)
    {
        byte[] utf8 = Encoding.UTF8.GetBytes(text);
        byte[] payload = new byte[4 + utf8.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(payload, (uint)utf8.Length);
        Buffer.BlockCopy(utf8, 0, payload, 4, utf8.Length);
        return payload;
    }

    private static bool TryDecodeUtf8Prefixed(byte[] payload, out string text)
    {
        text = string.Empty;
        if (payload is null || payload.Length < 4)
        {
            return false;
        }

        uint declared = BinaryPrimitives.ReadUInt32LittleEndian(payload);
        if (declared != (uint)(payload.Length - 4))
        {
            return false;
        }

        text = Encoding.UTF8.GetString(payload, 4, payload.Length - 4);
        return true;
    }

    private static string Sha256Hex(byte[] payload)
    {
#if NETSTANDARD2_1
        using SHA256 sha = SHA256.Create();
        return ToHex(sha.ComputeHash(payload));
#else
        return ToHex(SHA256.HashData(payload));
#endif
    }

    private static string ToHex(byte[] bytes)
    {
        var chars = new char[bytes.Length * 2];
        for (int i = 0; i < bytes.Length; i++)
        {
            byte value = bytes[i];
            chars[i * 2] = ToNibble(value >> 4);
            chars[(i * 2) + 1] = ToNibble(value & 0xF);
        }

        return new string(chars);
    }

    private static char ToNibble(int value) => (char)(value < 10 ? '0' + value : 'a' + (value - 10));

    private static bool IsLowerSha256Hex(string? value)
    {
        if (value is null || value.Length != 64)
        {
            return false;
        }

        for (int i = 0; i < value.Length; i++)
        {
            char c = value[i];
            if ((c < '0' || c > '9') && (c < 'a' || c > 'f'))
            {
                return false;
            }
        }

        return true;
    }

    private static bool TryDecodeHex(string? hex, out byte[] bytes)
    {
        bytes = Array.Empty<byte>();
        if (string.IsNullOrEmpty(hex) || (hex.Length & 1) != 0)
        {
            return false;
        }

        bytes = new byte[hex.Length / 2];
        for (int i = 0; i < bytes.Length; i++)
        {
            int hi = FromNibble(hex[i * 2]);
            int lo = FromNibble(hex[(i * 2) + 1]);
            if (hi < 0 || lo < 0)
            {
                bytes = Array.Empty<byte>();
                return false;
            }

            bytes[i] = (byte)((hi << 4) | lo);
        }

        return true;
    }

    private static int FromNibble(char c)
    {
        if (c >= '0' && c <= '9')
        {
            return c - '0';
        }

        if (c >= 'a' && c <= 'f')
        {
            return c - 'a' + 10;
        }

        return -1;
    }
}
