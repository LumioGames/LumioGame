using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Lumio.Game.EntityChat.Protocol;

/// <summary>One login-or-register response. Password material is never stored here.</summary>
public sealed class AccountLoginResult
{
    /// <summary>True when Account Server accepted the request.</summary>
    public bool Accepted { get; init; }

    /// <summary>True when this request created the AccountEntity.</summary>
    public bool AccountNewlyCreated { get; init; }

    /// <summary>Stable AccountId.</summary>
    public string? AccountId { get; init; }

    /// <summary>Echoed login name.</summary>
    public string? LoginName { get; init; }

    /// <summary>Opaque admission credential.</summary>
    public string? AdmissionCredential { get; init; }

    /// <summary>Admission expiry epoch seconds.</summary>
    public ulong AdmissionExpiresAt { get; init; }

    /// <summary>Error code when rejected.</summary>
    public string? ErrorCode { get; init; }
}

/// <summary>WebSocket client for <c>lumio-account-v1</c> login-or-register.</summary>
public static class AccountLoginClient
{
    /// <summary>Submits login-or-register. Does not log the password or credential.</summary>
    public static async Task<AccountLoginResult> LoginOrRegisterAsync(
        Uri accountUri,
        string loginName,
        string password,
        string? botToolCredential,
        CancellationToken cancellationToken)
    {
        using var client = new ClientWebSocket();
        client.Options.AddSubProtocol(AccountPortPin.Subprotocol);
        await client.ConnectAsync(accountUri, cancellationToken).ConfigureAwait(false);
        byte[] request = BuildRequest(loginName, password, botToolCredential);
        await client.SendAsync(request, WebSocketMessageType.Text, true, cancellationToken).ConfigureAwait(false);
        var buffer = new byte[AccountPortPin.MaxFrameBytes];
        WebSocketReceiveResult received = await client.ReceiveAsync(buffer, cancellationToken).ConfigureAwait(false);
        AccountLoginResult result = Parse(buffer.AsSpan(0, received.Count));
        try
        {
            if (client.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                await client.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", cancellationToken)
                    .ConfigureAwait(false);
            }
        }
        catch (WebSocketException)
        {
        }

        return result;
    }

    private static byte[] BuildRequest(string loginName, string password, string? botToolCredential)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteString("messageType", AccountPortPin.LoginOrRegister);
            writer.WriteString("loginName", loginName);
            writer.WriteString("password", password);
            if (botToolCredential is not null)
            {
                writer.WriteString("botToolCredential", botToolCredential);
            }

            writer.WriteEndObject();
        }

        return stream.ToArray();
    }

    private static AccountLoginResult Parse(ReadOnlySpan<byte> json)
    {
        using var document = JsonDocument.Parse(json.ToArray());
        JsonElement root = document.RootElement;
        string? type = root.TryGetProperty("messageType", out JsonElement messageType)
            ? messageType.GetString()
            : null;
        if (type == AccountPortPin.LoginOrRegisterAck && root.TryGetProperty("accepted", out JsonElement accepted)
            && accepted.GetBoolean())
        {
            return new AccountLoginResult
            {
                Accepted = true,
                AccountNewlyCreated = root.GetProperty("accountNewlyCreated").GetBoolean(),
                AccountId = root.GetProperty("accountId").GetString(),
                LoginName = root.GetProperty("loginName").GetString(),
                AdmissionCredential = root.GetProperty("admissionCredential").GetString(),
                AdmissionExpiresAt = root.GetProperty("admissionExpiresAt").GetUInt64(),
            };
        }

        return new AccountLoginResult
        {
            Accepted = false,
            ErrorCode = root.TryGetProperty("code", out JsonElement code) ? code.GetString() : "invalid_request",
        };
    }
}
