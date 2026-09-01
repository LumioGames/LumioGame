using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lumio.Game.EntityChat.Protocol;
using Lumio.Game.ServerGameplay;

namespace Lumio.Game.EntityChat.Suite;

/// <summary>Runs the 11-scenario C# MVP acceptance against a real Account Server process.</summary>
public static class EntityChatSuite
{
    private const string MainRoom = "room-main";
    private const string IsoRoom = "room-iso";
    private const string BrowserName = "Browser01";
    private const byte AdmissionKeyId = 1;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    /// <summary>Executes one full run and writes evidence under <paramref name="outDir"/>.</summary>
    public static async Task<int> RunAsync(EntityChatSuiteOptions options, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(options.OutDir);
        string? accountDll = options.AccountServerDll ?? DiscoverAccountServerDll();
        if (string.IsNullOrEmpty(accountDll) || !File.Exists(accountDll))
        {
            await WriteBlockedAsync(options.OutDir, "account-server dll not found; host cannot start").ConfigureAwait(false);
            return 2;
        }

        (byte[] admissionSeed, byte[] admissionPublic) = Ed25519Keys.Generate();
        (byte[] botSeed, byte[] botPublic) = Ed25519Keys.Generate();
        string store = Path.Combine(options.OutDir, "account-store");
        var scenarios = new Dictionary<string, object>(StringComparer.Ordinal);
        string? blocked = null;

        try
        {
            await using AccountServerProcess account = await AccountServerProcess.StartAsync(
                accountDll,
                store,
                admissionSeed,
                botPublic,
                options.Dotnet,
                cancellationToken).ConfigureAwait(false);

            ulong now = (ulong)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            string botClaim = BotToolCredentialIssuer.Issue(botSeed, now, now + 3600);
            var host = new GameRoomHost(TimeSpan.FromMinutes(5), new SystemMonotonicClock());

            AccountLoginResult first = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, "Bot01", AccountPortPin.TestPassword, botClaim, cancellationToken).ConfigureAwait(false);
            AccountLoginResult repeat = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, "Bot01", AccountPortPin.TestPassword, botClaim, cancellationToken).ConfigureAwait(false);
            AccountLoginResult wrong = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, "Bot01", "654321", botClaim, cancellationToken).ConfigureAwait(false);

            bool scenario1 = first.Accepted && repeat.Accepted
                && string.Equals(first.AccountId, repeat.AccountId, StringComparison.Ordinal)
                && !wrong.Accepted && wrong.ErrorCode == "wrong_password";
            scenarios["1"] = new Dictionary<string, object?>
            {
                ["ok"] = scenario1,
                ["accountId"] = first.AccountId,
                ["repeatAccountId"] = repeat.AccountId,
                ["wrongPasswordCode"] = wrong.ErrorCode,
            };
            if (!scenario1)
            {
                blocked = "scenario 1 login-or-register failed";
            }

            var connections = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int i = 1; i <= BotLaunchNames.Count; i++)
            {
                string name = BotLaunchNames.Format(i);
                AccountLoginResult login = await AccountLoginClient.LoginOrRegisterAsync(
                    account.Uri, name, AccountPortPin.TestPassword, botClaim, cancellationToken).ConfigureAwait(false);
                if (!login.Accepted || string.IsNullOrEmpty(login.AdmissionCredential))
                {
                    blocked = "bot login failed: " + name;
                    break;
                }

                if (!AdmissionCredentialVerifier.TryVerify(
                        login.AdmissionCredential,
                        AdmissionKeyId,
                        admissionPublic,
                        now,
                        out AdmissionPayload payload,
                        out string verifyCode))
                {
                    blocked = "admission verify failed: " + name + " " + verifyCode;
                    break;
                }

                string connection = "c-" + name.ToLowerInvariant();
                RoomAdmitResult admit = host.Admit(
                    MainRoom,
                    connection,
                    new VerifiedAdmission(payload.AccountId, payload.LoginName, payload.BotToolContext));
                if (!admit.Accepted)
                {
                    blocked = "bot admit failed: " + name;
                    break;
                }

                connections[connection] = name;
            }

            RoomCensus botsOnly = host.Census(MainRoom);
            scenarios["2"] = new Dictionary<string, object?>
            {
                ["ok"] = botsOnly.BotCount == 100 && botsOnly.PlayerCount == 0,
                ["botCount"] = botsOnly.BotCount,
            };

            AccountLoginResult browserLogin = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, BrowserName, AccountPortPin.TestPassword, botToolCredential: null, cancellationToken)
                .ConfigureAwait(false);
            bool browserOk = false;
            string? browserVerify = null;
            string? browserAdmitCode = null;
            if (!browserLogin.Accepted)
            {
                browserAdmitCode = browserLogin.ErrorCode ?? "login_rejected";
            }
            else if (string.IsNullOrEmpty(browserLogin.AdmissionCredential))
            {
                browserAdmitCode = "missing_admission_credential";
            }
            else if (!AdmissionCredentialVerifier.TryVerify(
                    browserLogin.AdmissionCredential,
                    AdmissionKeyId,
                    admissionPublic,
                    now,
                    out AdmissionPayload browserPayload,
                    out string browserVerifyCode))
            {
                browserVerify = browserVerifyCode;
            }
            else
            {
                RoomAdmitResult browserAdmit = host.Admit(
                    MainRoom,
                    "c-browser",
                    new VerifiedAdmission(browserPayload.AccountId, browserPayload.LoginName, browserPayload.BotToolContext));
                browserOk = browserAdmit.Accepted && browserAdmit.Binding.HasValue
                    && browserAdmit.Binding.Value.EntityType == GameEntityKind.Player;
                browserAdmitCode = browserAdmit.ErrorCode;
            }

            RoomCensus full = host.Census(MainRoom);
            Dictionary<string, object?> censusPayload = CensusPayload(host, full, MainRoom);
            string hostAudit = HostAudit(host, full, MainRoom);
            scenarios["3"] = new Dictionary<string, object?>
            {
                ["ok"] = browserOk && full.Total == 101 && full.BotCount == 100 && full.PlayerCount == 1,
                ["total"] = full.Total,
                ["botCount"] = full.BotCount,
                ["playerCount"] = full.PlayerCount,
                ["loginAccepted"] = browserLogin.Accepted,
                ["loginError"] = browserLogin.ErrorCode,
                ["verifyError"] = browserVerify,
                ["admitError"] = browserAdmitCode,
            };

            int resolved = 0;
            foreach (string connection in connections.Keys)
            {
                if (host.TrySelfLookup(connection, out ConnectionBinding self)
                    && host.TryResolveByNetEntityId(MainRoom, self.NetEntityId, out _))
                {
                    resolved++;
                }
            }

            bool browserBound = host.TrySelfLookup("c-browser", out _);
            scenarios["4"] = new Dictionary<string, object?>
            {
                ["ok"] = resolved == 100 && browserBound,
                ["resolvedBots"] = resolved,
            };

            if (!host.TrySelfLookup("c-browser", out ConnectionBinding browserBinding))
            {
                blocked ??= "browser connection was not bound";
                var partial = new Dictionary<string, object?>
                {
                    ["ok"] = false,
                    ["blocked"] = blocked,
                    ["accountServer"] = new Dictionary<string, object?>
                    {
                        ["dll"] = accountDll,
                        ["port"] = account.Port,
                        ["pid"] = account.Pid,
                        ["contractId"] = AccountPortPin.ContractId,
                    },
                    ["census"] = censusPayload,
                    ["scenarios"] = scenarios,
                };
                await File.WriteAllTextAsync(
                    Path.Combine(options.OutDir, "evidence.json"),
                    JsonSerializer.Serialize(partial, JsonOptions),
                    cancellationToken).ConfigureAwait(false);
                return 1;
            }
            AttributeQueryResult okQuery = host.QueryAttribute(new AttributeQueryRequest(
                AttributeQueryScope.ServerAuthoritative, MainRoom, browserBinding.NetEntityId, "EntityIdentity.entityType"));
            AttributeQueryResult invisible = host.QueryAttribute(new AttributeQueryRequest(
                AttributeQueryScope.ClientReplica, MainRoom, browserBinding.NetEntityId, "ChatComponent.lastMessageText"));
            AttributeQueryResult unauthorized = host.QueryAttribute(new AttributeQueryRequest(
                AttributeQueryScope.ClientReplica, MainRoom, browserBinding.NetEntityId, "EntityIdentity.restrictedFlag"));
            AttributeQueryResult missing = host.QueryAttribute(new AttributeQueryRequest(
                AttributeQueryScope.ServerAuthoritative, MainRoom, 999999UL, "EntityIdentity.entityType"));
            AttributeQueryResult stale = host.QueryAttribute(new AttributeQueryRequest(
                AttributeQueryScope.ServerAuthoritative,
                MainRoom,
                browserBinding.NetEntityId,
                "EntityIdentity.entityType",
                ConnectionGeneration: 0));
            scenarios["5"] = new Dictionary<string, object?>
            {
                ["ok"] = okQuery.Outcome == AttributeQueryOutcome.Ok
                    && invisible.Outcome == AttributeQueryOutcome.Invisible
                    && unauthorized.Outcome == AttributeQueryOutcome.Unauthorized
                    && missing.Outcome == AttributeQueryOutcome.NonExistent
                    && stale.Outcome == AttributeQueryOutcome.StaleGeneration,
                ["okValue"] = okQuery.Value,
                ["invisible"] = invisible.Outcome.ToString(),
                ["unauthorized"] = unauthorized.Outcome.ToString(),
                ["stale"] = stale.Outcome.ToString(),
            };

            foreach (string connection in connections.Keys)
            {
                host.AdmitChatInput(connection, "hello-" + connections[connection]);
            }

            host.AdmitChatInput("c-browser", "hello-browser");
            RoomTickResult tick = host.RunTick(MainRoom);
            IReadOnlyList<ChatMessageEvent> window = host.ClientChatWindow("c-browser");
            bool chatOk = window.Count == 101 && tick.AppliedTick == 1UL;
            var eventOrder = new List<string>(window.Count);
            var appliedTicks = new List<ulong>(window.Count);
            foreach (ChatMessageEvent ev in window)
            {
                eventOrder.Add(
                    ev.SenderNetEntityId.ToString(CultureInfo.InvariantCulture) + ":" + ev.Text + ":" + ev.RoomSequence);
                appliedTicks.Add(ev.AppliedTick);
            }

            scenarios["6"] = new Dictionary<string, object?>
            {
                ["ok"] = chatOk,
                ["eventCount"] = window.Count,
                ["appliedTick"] = tick.AppliedTick,
            };

            ChatPersistSnapshot snapshot = host.CapturePersistSnapshot(MainRoom);
            var restored = new GameRoomHost(TimeSpan.FromMinutes(5), new SystemMonotonicClock());
            restored.RestorePersistSnapshot(MainRoom, snapshot);
            bool persistOk = restored.Census(MainRoom).Total == 101
                && restored.ClientChatWindow("c-browser").Count == 0;
            scenarios["7"] = new Dictionary<string, object?>
            {
                ["ok"] = persistOk && Array.TrueForAll(snapshot.Entities, e => e.HistoryCount == 0),
                ["snapshotEntities"] = snapshot.Entities.Length,
                ["historyCountMax"] = snapshot.Entities.Length == 0 ? 0 : MaxHistory(snapshot.Entities),
                ["restoredWindow"] = restored.ClientChatWindow("c-browser").Count,
            };

            ulong entityA = host.MustSelf("c-bot100").NetEntityId;
            host.Disconnect("c-bot100");
            ChatOperationResult rejected = host.AdmitChatInput("c-bot100", "while-down");
            host.AdmitChatInput("c-browser", "room-continues");
            host.RunTick(MainRoom);
            AccountLoginResult reLogin = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, "Bot100", AccountPortPin.TestPassword, botClaim, cancellationToken).ConfigureAwait(false);
            bool reOk = false;
            if (reLogin.Accepted
                && !string.IsNullOrEmpty(reLogin.AdmissionCredential)
                && AdmissionCredentialVerifier.TryVerify(
                    reLogin.AdmissionCredential, AdmissionKeyId, admissionPublic, now, out AdmissionPayload rePayload, out _))
            {
                RoomAdmitResult rebind = host.Admit(
                    MainRoom,
                    "c-bot100-re",
                    new VerifiedAdmission(rePayload.AccountId, rePayload.LoginName, rePayload.BotToolContext));
                reOk = rebind.Reconnected && rebind.Binding.HasValue && rebind.Binding.Value.NetEntityId == entityA
                    && host.ClientChatWindow("c-bot100-re").Count == 0
                    && rejected.Kind == ChatOperationKind.Rejected;
            }

            scenarios["8"] = new Dictionary<string, object?> { ["ok"] = reOk, ["entityA"] = entityA.ToString(CultureInfo.InvariantCulture) };

            ulong entity99 = host.MustSelf("c-bot99").NetEntityId;
            string account99 = host.MustSelf("c-bot99").AccountId;
            host.Disconnect("c-bot99");
            host.AdvanceMonotonic(TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1));
            int expired = host.ExpireDue();
            AccountLoginResult afterExpiry = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, "Bot99", AccountPortPin.TestPassword, botClaim, cancellationToken).ConfigureAwait(false);
            bool expiryOk = false;
            if (afterExpiry.Accepted
                && !string.IsNullOrEmpty(afterExpiry.AdmissionCredential)
                && AdmissionCredentialVerifier.TryVerify(
                    afterExpiry.AdmissionCredential, AdmissionKeyId, admissionPublic, now, out AdmissionPayload bPayload, out _))
            {
                RoomAdmitResult createdB = host.Admit(
                    MainRoom,
                    "c-bot99-b",
                    new VerifiedAdmission(bPayload.AccountId, bPayload.LoginName, bPayload.BotToolContext));
                AttributeQueryResult tombstoned = host.QueryAttribute(new AttributeQueryRequest(
                    AttributeQueryScope.ServerAuthoritative, MainRoom, entity99, "EntityIdentity.entityType"));
                expiryOk = expired == 1 && createdB.Accepted && createdB.Binding.HasValue
                    && createdB.Binding.Value.NetEntityId != entity99
                    && createdB.Binding.Value.AccountId == account99
                    && tombstoned.Outcome == AttributeQueryOutcome.Tombstoned;
            }

            scenarios["9"] = new Dictionary<string, object?>
            {
                ["ok"] = expiryOk,
                ["expired"] = expired,
                ["entityA"] = entity99.ToString(CultureInfo.InvariantCulture),
                ["tombstoned"] = expiryOk,
                ["staleARejected"] = expiryOk,
            };

            AccountLoginResult isoA = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, "IsoPlayerA", AccountPortPin.TestPassword, null, cancellationToken).ConfigureAwait(false);
            AccountLoginResult isoB = await AccountLoginClient.LoginOrRegisterAsync(
                account.Uri, "IsoPlayerB", AccountPortPin.TestPassword, null, cancellationToken).ConfigureAwait(false);
            bool isoOk = false;
            if (isoA.Accepted && isoB.Accepted
                && !string.IsNullOrEmpty(isoA.AdmissionCredential)
                && !string.IsNullOrEmpty(isoB.AdmissionCredential)
                && AdmissionCredentialVerifier.TryVerify(isoA.AdmissionCredential, AdmissionKeyId, admissionPublic, now, out AdmissionPayload isoAp, out _)
                && AdmissionCredentialVerifier.TryVerify(isoB.AdmissionCredential, AdmissionKeyId, admissionPublic, now, out AdmissionPayload isoBp, out _))
            {
                host.Admit(IsoRoom, "iso-a", new VerifiedAdmission(isoAp.AccountId, isoAp.LoginName, isoAp.BotToolContext));
                host.Admit(IsoRoom, "iso-b", new VerifiedAdmission(isoBp.AccountId, isoBp.LoginName, isoBp.BotToolContext));
                host.AdmitChatInput("iso-a", "iso-only");
                host.RunTick(IsoRoom);
                AttributeQueryResult cross = host.QueryAttribute(new AttributeQueryRequest(
                    AttributeQueryScope.ServerAuthoritative, IsoRoom, browserBinding.NetEntityId, "EntityIdentity.entityType"));
                bool leaked = false;
                foreach (ChatMessageEvent ev in host.ClientChatWindow("c-browser"))
                {
                    if (ev.Text == "iso-only")
                    {
                        leaked = true;
                        break;
                    }
                }

                isoOk = host.Census(IsoRoom).Total == 2
                    && host.ClientChatWindow("iso-b").Count == 1
                    && !leaked
                    && cross.ErrorCode == "cross_room_reference";
            }

            scenarios["10"] = new Dictionary<string, object?>
            {
                ["ok"] = isoOk,
                ["isoTotal"] = host.Census(IsoRoom).Total,
            };

            bool scaleOk = full.Total == 101 && chatOk && eventOrder.Count == 101;
            scenarios["11"] = new Dictionary<string, object?>
            {
                ["ok"] = scaleOk,
                ["totalEntities"] = full.Total,
                ["botCount"] = full.BotCount,
                ["playerCount"] = full.PlayerCount,
                ["eventOrder"] = eventOrder,
                ["appliedTicks"] = appliedTicks,
                ["appliedTick"] = tick.AppliedTick,
            };

            bool allOk = blocked is null;
            foreach (object value in scenarios.Values)
            {
                if (value is Dictionary<string, object?> row && row.TryGetValue("ok", out object? flag) && flag is false)
                {
                    allOk = false;
                }
            }

            var evidence = new Dictionary<string, object?>
            {
                ["ok"] = allOk,
                ["blocked"] = blocked,
                ["accountServer"] = new Dictionary<string, object?>
                {
                    ["dll"] = accountDll,
                    ["port"] = account.Port,
                    ["pid"] = account.Pid,
                    ["contractId"] = AccountPortPin.ContractId,
                },
                ["census"] = censusPayload,
                ["scenarios"] = scenarios,
                ["browserWindow"] = BrowserWindow(window),
            };
            await File.WriteAllTextAsync(
                Path.Combine(options.OutDir, "evidence.json"),
                JsonSerializer.Serialize(evidence, JsonOptions),
                cancellationToken).ConfigureAwait(false);
            await File.WriteAllTextAsync(
                Path.Combine(options.OutDir, "host-audit.ndjson"),
                hostAudit,
                cancellationToken).ConfigureAwait(false);
            return allOk ? 0 : 1;
        }
        catch (Exception ex)
        {
            await WriteBlockedAsync(options.OutDir, ex.GetType().Name + ": " + ex.Message).ConfigureAwait(false);
            return 2;
        }
    }

    /// <summary>Locates a built lumio-account-server.dll on sibling origin/main checkouts.</summary>
    public static string? DiscoverAccountServerDll()
    {
        string? env = Environment.GetEnvironmentVariable("LUMIO_ACCOUNT_SERVER_DLL");
        if (!string.IsNullOrEmpty(env) && File.Exists(env))
        {
            return env;
        }

        string[] candidates =
        {
            @"C:\Work\LumioGames\wt-server\r-00344\account-server\src\Lumio.Server.Account.App\bin\Debug\net10.0\lumio-account-server.dll",
            @"C:\Work\LumioGames\wt-server\r-00350-review\account-server\src\Lumio.Server.Account.App\bin\Debug\net10.0\lumio-account-server.dll",
            @"C:\Work\LumioGames\wt-server\r-00350\account-server\src\Lumio.Server.Account.App\bin\Debug\net10.0\lumio-account-server.dll",
            @"C:\Work\LumioGames\LumioServer\account-server\src\Lumio.Server.Account.App\bin\Debug\net10.0\lumio-account-server.dll",
        };
        foreach (string candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static int MaxHistory(ChatPersistEntity[] entities)
    {
        int max = 0;
        foreach (ChatPersistEntity entity in entities)
        {
            if (entity.HistoryCount > max)
            {
                max = entity.HistoryCount;
            }
        }

        return max;
    }

    private static Dictionary<string, object?> CensusPayload(GameRoomHost host, RoomCensus census, string roomId)
    {
        _ = host;
        _ = roomId;
        var ids = new List<string>(census.NetEntityIds.Length);
        var kinds = new List<string>(census.NetEntityIds.Length);
        for (int i = 0; i < census.NetEntityIds.Length; i++)
        {
            ids.Add(census.NetEntityIds[i].ToString(CultureInfo.InvariantCulture));
            kinds.Add(census.EntityTypes[i] == GameEntityKind.Bot ? "bot" : "player");
        }

        return new Dictionary<string, object?>
        {
            ["botCount"] = census.BotCount,
            ["playerCount"] = census.PlayerCount,
            ["total"] = census.Total,
            ["netEntityIds"] = ids,
            ["entityTypes"] = kinds,
        };
    }

    private static string HostAudit(GameRoomHost host, RoomCensus census, string roomId)
    {
        var lines = new List<string>(census.NetEntityIds.Length);
        for (int i = 0; i < census.NetEntityIds.Length; i++)
        {
            ulong id = census.NetEntityIds[i];
            string entityType = census.EntityTypes[i] == GameEntityKind.Bot ? "bot" : "player";
            string accountId = string.Empty;
            if (host.TryResolveByNetEntityId(roomId, id, out EntityResolution resolved))
            {
                accountId = resolved.AccountId;
            }

            lines.Add(JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["kind"] = "entity_admitted",
                ["roomId"] = roomId,
                ["netEntityId"] = id.ToString(CultureInfo.InvariantCulture),
                ["entityType"] = entityType,
                ["accountId"] = accountId,
            }));
        }

        return string.Join("\n", lines) + "\n";
    }

    private static List<Dictionary<string, object?>> BrowserWindow(IReadOnlyList<ChatMessageEvent> window)
    {
        var rows = new List<Dictionary<string, object?>>(window.Count);
        foreach (ChatMessageEvent ev in window)
        {
            rows.Add(new Dictionary<string, object?>
            {
                ["messageId"] = ev.MessageId,
                ["roomSequence"] = ev.RoomSequence,
                ["senderNetEntityId"] = ev.SenderNetEntityId.ToString(CultureInfo.InvariantCulture),
                ["text"] = ev.Text,
                ["appliedTick"] = ev.AppliedTick,
            });
        }

        return rows;
    }

    private static async Task WriteBlockedAsync(string outDir, string reason)
    {
        Directory.CreateDirectory(outDir);
        var evidence = new Dictionary<string, object?>
        {
            ["ok"] = false,
            ["blocked"] = reason,
        };
        await File.WriteAllTextAsync(
            Path.Combine(outDir, "evidence.json"),
            JsonSerializer.Serialize(evidence, JsonOptions)).ConfigureAwait(false);
        await File.WriteAllTextAsync(Path.Combine(outDir, "blocked.txt"), reason + Environment.NewLine).ConfigureAwait(false);
    }
}

/// <summary>CLI options for one suite run.</summary>
/// <param name="OutDir">Evidence directory.</param>
/// <param name="AccountServerDll">Optional path to lumio-account-server.dll.</param>
/// <param name="Dotnet">dotnet host used to exec the account-server dll.</param>
public sealed record EntityChatSuiteOptions(string OutDir, string? AccountServerDll, string Dotnet);
