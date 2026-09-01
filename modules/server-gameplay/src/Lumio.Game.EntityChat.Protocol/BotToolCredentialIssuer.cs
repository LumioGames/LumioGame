using System;
using System.Security.Cryptography;

namespace Lumio.Game.EntityChat.Protocol;

/// <summary>Issues C-3 Bot-tool credentials. The private seed stays in the harness process.</summary>
public static class BotToolCredentialIssuer
{
    /// <summary>Issues one Bot-tool credential for the Bot launcher context.</summary>
    public static string Issue(ReadOnlySpan<byte> privateSeed, ulong issuedAt, ulong expiresAt, string toolId = "bot-launcher")
    {
        var nonce = new byte[16];
        RandomNumberGenerator.Fill(nonce);
        var writer = new LumioBinWriter();
        writer.WriteU16(AccountPortPin.BotToolPayloadVersion);
        writer.WriteAscii(toolId);
        writer.WriteAscii(AccountPortPin.BotToolScope);
        writer.WriteU64(issuedAt);
        writer.WriteU64(expiresAt);
        writer.WriteFixedBytes(nonce);
        byte[] payload = writer.ToArray();
        byte[] signature = LumioSignature.Sign(
            privateSeed,
            AccountPortPin.BotToolTrustDomain,
            AccountPortPin.BotToolPayloadType,
            payload);
        var framed = new byte[payload.Length + Ed25519Keys.SignatureLength];
        payload.CopyTo(framed, 0);
        signature.CopyTo(framed.AsSpan(payload.Length));
        return Base64Url.Encode(framed);
    }
}
