namespace Lumio.Game.EntityChat.Protocol;

/// <summary>Frozen field names from <c>lumio.account-port.v1</c>. Consumer pin, not a second protocol.</summary>
public static class AccountPortPin
{
    /// <summary>Contract id.</summary>
    public const string ContractId = "lumio.account-port.v1";

    /// <summary>WebSocket subprotocol.</summary>
    public const string Subprotocol = "lumio-account-v1";

    /// <summary>Login request message type.</summary>
    public const string LoginOrRegister = "LoginOrRegister";

    /// <summary>Login ack message type.</summary>
    public const string LoginOrRegisterAck = "LoginOrRegisterAck";

    /// <summary>Error message type.</summary>
    public const string Error = "Error";

    /// <summary>Admission LumioBin version.</summary>
    public const ushort AdmissionPayloadVersion = 1;

    /// <summary>Bot-tool LumioBin version.</summary>
    public const ushort BotToolPayloadVersion = 1;

    /// <summary>Admission signature trust domain.</summary>
    public const string AdmissionTrustDomain = "account-admission";

    /// <summary>Admission payload type.</summary>
    public const string AdmissionPayloadType = "admission-credential-v1";

    /// <summary>Bot-tool signature trust domain.</summary>
    public const string BotToolTrustDomain = "bot-tool";

    /// <summary>Bot-tool payload type.</summary>
    public const string BotToolPayloadType = "bot-tool-credential-v1";

    /// <summary>Required Bot-tool scope.</summary>
    public const string BotToolScope = "bot-namespace";

    /// <summary>Documented Hello World test password. Never log this value.</summary>
    public const string TestPassword = "123456";

    /// <summary>Admission credential TTL seconds.</summary>
    public const int AdmissionTtlSeconds = 300;

    /// <summary>Maximum WebSocket frame size.</summary>
    public const int MaxFrameBytes = 65536;

    /// <summary>Admission private key environment variable.</summary>
    public const string AdmissionPrivateKeyEnv = "LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX";

    /// <summary>Bot-tool public key environment variable.</summary>
    public const string BotToolPublicKeyEnv = "LUMIO_ACCOUNT_BOT_TOOL_PUBLIC_KEY_HEX";
}
