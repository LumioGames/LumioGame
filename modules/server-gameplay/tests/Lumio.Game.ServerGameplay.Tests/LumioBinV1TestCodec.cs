using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>
/// LumioBinV1 (ADR-047) reference encoder for contract assertions: fixed-width little-endian integers,
/// u32 byte-length-prefixed UTF-8 strings, fieldOrder concatenation without padding, sha256 over the raw
/// payload bytes. Test-only — production payloads are encoded by Runtime, never here.
/// </summary>
internal static class LumioBinV1TestCodec
{
    internal static byte[] EncodeByFieldOrder(IReadOnlyList<string> fieldOrder, Dictionary<string, object> body)
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

    internal static string ToHex(byte[] payload)
    {
        return Convert.ToHexString(payload).ToLowerInvariant();
    }

    internal static string Sha256Hex(byte[] payload)
    {
        return Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
    }
}
