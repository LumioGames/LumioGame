using System;
using System.Buffers;
using System.Buffers.Binary;
using System.Buffers.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Crypto.Signers;

namespace Lumio.Game.EntityChat.Protocol;

/// <summary>Lowercase hex helpers for C-3 key material.</summary>
public static class Hex
{
    /// <summary>Encodes bytes as lowercase hex.</summary>
    public static string EncodeLower(ReadOnlySpan<byte> bytes) => Convert.ToHexString(bytes).ToLowerInvariant();

    /// <summary>Decodes even-length lowercase hex.</summary>
    public static bool TryDecode(string hex, out byte[] bytes)
    {
        bytes = Array.Empty<byte>();
        if (string.IsNullOrEmpty(hex) || (hex.Length & 1) != 0)
        {
            return false;
        }

        for (int i = 0; i < hex.Length; i++)
        {
            char c = hex[i];
            if (!Uri.IsHexDigit(c) || char.IsUpper(c))
            {
                return false;
            }
        }

        bytes = Convert.FromHexString(hex);
        return true;
    }
}

/// <summary>Base64url without padding, as required by C-3 wire forms.</summary>
public static class Base64Url
{
    /// <summary>Encodes bytes as base64url.</summary>
    public static string Encode(ReadOnlySpan<byte> bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>Decodes base64url.</summary>
    public static bool TryDecode(string text, out byte[] bytes)
    {
        bytes = Array.Empty<byte>();
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        int paddedLength = text.Length + ((4 - (text.Length % 4)) % 4);
        Span<char> buffer = paddedLength <= 256 ? stackalloc char[paddedLength] : new char[paddedLength];
        text.AsSpan().CopyTo(buffer);
        buffer[text.Length..].Fill('=');
        for (int i = 0; i < text.Length; i++)
        {
            if (buffer[i] == '-')
            {
                buffer[i] = '+';
            }
            else if (buffer[i] == '_')
            {
                buffer[i] = '/';
            }
        }

        var utf8 = new byte[paddedLength];
        for (int i = 0; i < paddedLength; i++)
        {
            utf8[i] = (byte)buffer[i];
        }

        int max = Base64.GetMaxDecodedFromUtf8Length(paddedLength);
        var decoded = new byte[max];
        if (Base64.DecodeFromUtf8(utf8, decoded, out _, out int written) != OperationStatus.Done)
        {
            return false;
        }

        bytes = decoded[..written];
        return true;
    }
}

/// <summary>LumioBinV1 writer (ADR-047): little-endian, u32 length-prefixed strings, no padding.</summary>
internal sealed class LumioBinWriter
{
    private readonly List<byte> _bytes = new(128);

    public byte[] ToArray() => _bytes.ToArray();

    public void WriteU8(byte value) => _bytes.Add(value);

    public void WriteU16(ushort value)
    {
        Span<byte> buffer = stackalloc byte[2];
        BinaryPrimitives.WriteUInt16LittleEndian(buffer, value);
        Add(buffer);
    }

    public void WriteU64(ulong value)
    {
        Span<byte> buffer = stackalloc byte[8];
        BinaryPrimitives.WriteUInt64LittleEndian(buffer, value);
        Add(buffer);
    }

    public void WriteAscii(string value)
    {
        byte[] payload = Encoding.ASCII.GetBytes(value);
        Span<byte> length = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(length, (uint)payload.Length);
        Add(length);
        _bytes.AddRange(payload);
    }

    public void WriteFixedBytes(ReadOnlySpan<byte> value)
    {
        foreach (byte b in value)
        {
            _bytes.Add(b);
        }
    }

    private void Add(ReadOnlySpan<byte> value)
    {
        foreach (byte b in value)
        {
            _bytes.Add(b);
        }
    }
}

/// <summary>LumioBinV1 reader.</summary>
internal sealed class LumioBinReader
{
    private readonly byte[] _bytes;
    private int _offset;

    public LumioBinReader(byte[] bytes) => _bytes = bytes ?? throw new ArgumentNullException(nameof(bytes));

    public int Remaining => _bytes.Length - _offset;

    public bool TryReadU8(out byte value)
    {
        value = 0;
        if (Remaining < 1)
        {
            return false;
        }

        value = _bytes[_offset++];
        return true;
    }

    public bool TryReadU16(out ushort value)
    {
        value = 0;
        if (Remaining < 2)
        {
            return false;
        }

        value = BinaryPrimitives.ReadUInt16LittleEndian(_bytes.AsSpan(_offset, 2));
        _offset += 2;
        return true;
    }

    public bool TryReadU64(out ulong value)
    {
        value = 0;
        if (Remaining < 8)
        {
            return false;
        }

        value = BinaryPrimitives.ReadUInt64LittleEndian(_bytes.AsSpan(_offset, 8));
        _offset += 8;
        return true;
    }

    public bool TryReadAscii(out string value)
    {
        value = string.Empty;
        if (Remaining < 4)
        {
            return false;
        }

        uint length = BinaryPrimitives.ReadUInt32LittleEndian(_bytes.AsSpan(_offset, 4));
        _offset += 4;
        if (length > (uint)Remaining)
        {
            return false;
        }

        ReadOnlySpan<byte> slice = _bytes.AsSpan(_offset, (int)length);
        for (int i = 0; i < slice.Length; i++)
        {
            if (slice[i] > 0x7F)
            {
                return false;
            }
        }

        value = Encoding.ASCII.GetString(slice);
        _offset += (int)length;
        return true;
    }

    public bool TryReadFixedBytes(int length, out byte[] value)
    {
        value = Array.Empty<byte>();
        if (length < 0 || Remaining < length)
        {
            return false;
        }

        value = _bytes.AsSpan(_offset, length).ToArray();
        _offset += length;
        return true;
    }
}

/// <summary>Ed25519 seed/public/signature helpers used by C-3.</summary>
public static class Ed25519Keys
{
    /// <summary>Seed length.</summary>
    public const int SeedLength = 32;

    /// <summary>Public key length.</summary>
    public const int PublicKeyLength = 32;

    /// <summary>Raw signature length.</summary>
    public const int SignatureLength = 64;

    /// <summary>Generates a new seed and public key.</summary>
    public static (byte[] Seed, byte[] PublicKey) Generate()
    {
        var seed = new byte[SeedLength];
        RandomNumberGenerator.Fill(seed);
        return (seed, PublicKeyFromSeed(seed));
    }

    /// <summary>Derives the public key from a 32-byte seed.</summary>
    public static byte[] PublicKeyFromSeed(ReadOnlySpan<byte> seed)
        => CreatePrivate(seed).GeneratePublicKey().GetEncoded();

    /// <summary>Signs <paramref name="message"/> with the seed.</summary>
    public static byte[] Sign(ReadOnlySpan<byte> seed, ReadOnlySpan<byte> message)
    {
        var signer = new Ed25519Signer();
        signer.Init(true, CreatePrivate(seed));
        signer.BlockUpdate(message);
        return signer.GenerateSignature();
    }

    /// <summary>Verifies a raw 64-byte signature.</summary>
    public static bool Verify(ReadOnlySpan<byte> publicKey, ReadOnlySpan<byte> message, ReadOnlySpan<byte> signature)
    {
        if (publicKey.Length != PublicKeyLength || signature.Length != SignatureLength)
        {
            return false;
        }

        var verifier = new Ed25519Signer();
        verifier.Init(false, new Ed25519PublicKeyParameters(publicKey.ToArray()));
        verifier.BlockUpdate(message);
        return verifier.VerifySignature(signature.ToArray());
    }

    private static Ed25519PrivateKeyParameters CreatePrivate(ReadOnlySpan<byte> seed)
    {
        if (seed.Length != SeedLength)
        {
            throw new ArgumentException("Ed25519 seed must be 32 bytes.", nameof(seed));
        }

        return new Ed25519PrivateKeyParameters(seed);
    }
}

/// <summary>LumioSignatureV1 (ADR-042) over SHA-256 digest hex.</summary>
public static class LumioSignature
{
    /// <summary>Builds the domain-separated preimage.</summary>
    public static byte[] Preimage(string trustDomain, string payloadType, ReadOnlySpan<byte> payload)
    {
        string digestHex = Hex.EncodeLower(SHA256.HashData(payload));
        const string prefix = "LumioSignatureV1";
        int length = prefix.Length + 1 + trustDomain.Length + 1 + payloadType.Length + 1 + digestHex.Length;
        var preimage = new byte[length];
        int offset = 0;
        offset += Encoding.ASCII.GetBytes(prefix, preimage.AsSpan(offset));
        preimage[offset++] = 0;
        offset += Encoding.ASCII.GetBytes(trustDomain, preimage.AsSpan(offset));
        preimage[offset++] = 0;
        offset += Encoding.ASCII.GetBytes(payloadType, preimage.AsSpan(offset));
        preimage[offset++] = 0;
        Encoding.ASCII.GetBytes(digestHex, preimage.AsSpan(offset));
        return preimage;
    }

    /// <summary>Signs payload bytes.</summary>
    public static byte[] Sign(ReadOnlySpan<byte> seed, string trustDomain, string payloadType, ReadOnlySpan<byte> payload)
        => Ed25519Keys.Sign(seed, Preimage(trustDomain, payloadType, payload));

    /// <summary>Verifies payload bytes.</summary>
    public static bool Verify(
        ReadOnlySpan<byte> publicKey,
        string trustDomain,
        string payloadType,
        ReadOnlySpan<byte> payload,
        ReadOnlySpan<byte> signature)
        => Ed25519Keys.Verify(publicKey, Preimage(trustDomain, payloadType, payload), signature);
}
