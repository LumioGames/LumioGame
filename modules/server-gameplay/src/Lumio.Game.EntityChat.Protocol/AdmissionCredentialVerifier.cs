using System;

namespace Lumio.Game.EntityChat.Protocol;

/// <summary>Decoded C-3 admission credential payload.</summary>
/// <param name="KeyId">Issuer key id.</param>
/// <param name="AccountId">Stable account id.</param>
/// <param name="LoginName">Authenticated login name.</param>
/// <param name="BotToolContext">Whether Bot-tool context was present at login.</param>
/// <param name="IssuedAt">Epoch seconds issued.</param>
/// <param name="ExpiresAt">Epoch seconds expiry.</param>
public readonly record struct AdmissionPayload(
    byte KeyId,
    string AccountId,
    string LoginName,
    bool BotToolContext,
    ulong IssuedAt,
    ulong ExpiresAt);

/// <summary>Offline C-3 verify_admission using the Account Server public key.</summary>
public static class AdmissionCredentialVerifier
{
    /// <summary>Verifies an opaque admission credential. Never logs the wire value.</summary>
    public static bool TryVerify(
        string wire,
        byte expectedKeyId,
        ReadOnlySpan<byte> publicKey,
        ulong unixSeconds,
        out AdmissionPayload payload,
        out string errorCode)
    {
        payload = default;
        errorCode = "admission_credential_malformed";
        if (string.IsNullOrEmpty(wire)
            || !Base64Url.TryDecode(wire, out byte[] framed)
            || framed.Length <= Ed25519Keys.SignatureLength)
        {
            return false;
        }

        byte[] payloadBytes = framed[..^Ed25519Keys.SignatureLength];
        byte[] signature = framed[^Ed25519Keys.SignatureLength..];
        if (!TryDecode(payloadBytes, out payload))
        {
            return false;
        }

        if (payload.KeyId != expectedKeyId
            || !LumioSignature.Verify(
                publicKey,
                AccountPortPin.AdmissionTrustDomain,
                AccountPortPin.AdmissionPayloadType,
                payloadBytes,
                signature))
        {
            errorCode = "admission_credential_invalid_signature";
            return false;
        }

        if (unixSeconds > payload.ExpiresAt)
        {
            errorCode = "admission_credential_expired";
            return false;
        }

        if (IsBotNamespace(payload.LoginName) && !payload.BotToolContext)
        {
            errorCode = "bot_namespace_admission_forbidden";
            return false;
        }

        errorCode = string.Empty;
        return true;
    }

    private static bool TryDecode(byte[] bytes, out AdmissionPayload payload)
    {
        payload = default;
        var reader = new LumioBinReader(bytes);
        if (!reader.TryReadU16(out ushort version) || version != AccountPortPin.AdmissionPayloadVersion)
        {
            return false;
        }

        if (!reader.TryReadU8(out byte keyId)
            || !reader.TryReadAscii(out string accountId)
            || !reader.TryReadAscii(out string loginName)
            || !reader.TryReadU8(out byte bot)
            || (bot != 0 && bot != 1)
            || !reader.TryReadU64(out ulong issuedAt)
            || !reader.TryReadU64(out ulong expiresAt)
            || !reader.TryReadFixedBytes(16, out _)
            || reader.Remaining != 0)
        {
            return false;
        }

        payload = new AdmissionPayload(keyId, accountId, loginName, bot == 1, issuedAt, expiresAt);
        return true;
    }

    private static bool IsBotNamespace(string loginName)
    {
        if (loginName.Length < 4 || !loginName.StartsWith("Bot", StringComparison.Ordinal))
        {
            return false;
        }

        for (int i = 3; i < loginName.Length; i++)
        {
            if (loginName[i] < '0' || loginName[i] > '9')
            {
                return false;
            }
        }

        return true;
    }
}
