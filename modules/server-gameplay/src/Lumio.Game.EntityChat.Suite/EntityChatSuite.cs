using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lumio.Game.EntityChat.Protocol;

namespace Lumio.Game.EntityChat.Suite;

/// <summary>
/// Account-server login evidence. Game no longer owns a room world or private queue (R-00373 / N-09);
/// N-10 hosts Runtime ECS directly.
/// </summary>
public static class EntityChatSuite
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private const string HostedByN10 = "N-10 hosts Runtime world; Game no longer owns a room world or private queue (R-00373/N-09)";

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
        _ = admissionSeed;
        _ = admissionPublic;
        (byte[] botSeed, byte[] botPublic) = Ed25519Keys.Generate();
        string store = Path.Combine(options.OutDir, "account-store");
        var scenarios = new Dictionary<string, object>(StringComparer.Ordinal);

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

            for (int i = 2; i <= 11; i++)
            {
                scenarios[i.ToString(System.Globalization.CultureInfo.InvariantCulture)] = new Dictionary<string, object?>
                {
                    ["ok"] = false,
                    ["blocked"] = HostedByN10,
                };
            }

            var evidence = new Dictionary<string, object?>
            {
                ["ok"] = false,
                ["blocked"] = HostedByN10,
                ["accountServer"] = new Dictionary<string, object?>
                {
                    ["dll"] = accountDll,
                    ["port"] = account.Port,
                    ["pid"] = account.Pid,
                    ["contractId"] = AccountPortPin.ContractId,
                },
                ["scenarios"] = scenarios,
            };
            await File.WriteAllTextAsync(
                Path.Combine(options.OutDir, "evidence.json"),
                JsonSerializer.Serialize(evidence, JsonOptions),
                cancellationToken).ConfigureAwait(false);
            return scenario1 ? 2 : 1;
        }
        catch (Exception ex)
        {
            await WriteBlockedAsync(options.OutDir, ex.GetType().Name + ": " + ex.Message).ConfigureAwait(false);
            return 2;
        }
    }

    /// <summary>Locates origin/main sibling lumio-account-server.dll only (no worktree fallback).</summary>
    public static string? DiscoverAccountServerDll()
    {
        string? env = Environment.GetEnvironmentVariable("LUMIO_ACCOUNT_SERVER_DLL");
        if (!string.IsNullOrEmpty(env) && File.Exists(env))
        {
            return env;
        }

        string? root = DiscoverRepoRoot();
        if (string.IsNullOrEmpty(root))
        {
            return null;
        }

        string[] candidates =
        {
            Path.GetFullPath(Path.Combine(root, "..", "..", "LumioServer", "account-server", "src", "Lumio.Server.Account.App", "bin", "Release", "net10.0", "lumio-account-server.dll")),
            Path.GetFullPath(Path.Combine(root, "..", "..", "LumioServer", "account-server", "src", "Lumio.Server.Account.App", "bin", "Debug", "net10.0", "lumio-account-server.dll")),
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

    private static string? DiscoverRepoRoot()
    {
        string? dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            if (File.Exists(Path.Combine(dir, "global.json")) && Directory.Exists(Path.Combine(dir, ".spec")))
            {
                return dir;
            }

            dir = Path.GetDirectoryName(dir);
        }

        return null;
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
