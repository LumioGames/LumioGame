using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Lumio.Game.EntityChat.Protocol;

/// <summary>Launches the sibling lumio-account-server process. Never commits or logs private keys.</summary>
public sealed class AccountServerProcess : IAsyncDisposable
{
    private readonly Process _process;
    private bool _disposed;

    private AccountServerProcess(Process process, int port, int pid)
    {
        _process = process;
        Port = port;
        Pid = pid;
    }

    /// <summary>Loopback port from the ready line.</summary>
    public int Port { get; }

    /// <summary>Child pid.</summary>
    public int Pid { get; }

    /// <summary>Account Server WebSocket URI.</summary>
    public Uri Uri => new("ws://127.0.0.1:" + Port.ToString(System.Globalization.CultureInfo.InvariantCulture) + "/");

    /// <summary>Starts account-server and waits for ACCOUNT_SERVER_READY.</summary>
    public static async Task<AccountServerProcess> StartAsync(
        string dllPath,
        string storePath,
        byte[] admissionSeed,
        byte[] botToolPublicKey,
        string dotnet,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(dllPath))
        {
            throw new FileNotFoundException("account-server dll not found", dllPath);
        }

        Directory.CreateDirectory(storePath);
        string directory = Path.GetDirectoryName(dllPath) ?? throw new InvalidOperationException(dllPath);
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = dotnet,
                WorkingDirectory = directory,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            },
        };
        process.StartInfo.Environment["DOTNET_NOLOGO"] = "1";
        string? dotnetRoot = Environment.GetEnvironmentVariable("DOTNET_ROOT");
        if (!string.IsNullOrEmpty(dotnetRoot))
        {
            process.StartInfo.Environment["DOTNET_ROOT"] = dotnetRoot;
        }

        process.StartInfo.Environment[AccountPortPin.AdmissionPrivateKeyEnv] = Hex.EncodeLower(admissionSeed);
        process.StartInfo.Environment[AccountPortPin.BotToolPublicKeyEnv] = Hex.EncodeLower(botToolPublicKey);
        process.StartInfo.ArgumentList.Add(dllPath);
        process.StartInfo.ArgumentList.Add("--store-path");
        process.StartInfo.ArgumentList.Add(storePath);
        process.StartInfo.ArgumentList.Add("--listen");
        process.StartInfo.ArgumentList.Add("127.0.0.1:0");

        if (!process.Start())
        {
            process.Dispose();
            throw new InvalidOperationException("could not start account-server");
        }

        try
        {
            var deadline = DateTime.UtcNow.AddSeconds(30);
            while (DateTime.UtcNow < deadline)
            {
                cancellationToken.ThrowIfCancellationRequested();
                string? line = await process.StandardOutput.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                if (line is null)
                {
                    string stderr = await process.StandardError.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
                    throw new InvalidOperationException(
                        "account-server exited before ready; exit=" + process.ExitCode + "; stderr=" + Tail(stderr));
                }

                if (TryParseReady(line, out int port, out int pid))
                {
                    return new AccountServerProcess(process, port, pid);
                }
            }

            throw new TimeoutException("account-server ready line not observed");
        }
        catch
        {
            TryKill(process);
            process.Dispose();
            throw;
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        TryKill(_process);
        try
        {
            await _process.WaitForExitAsync().ConfigureAwait(false);
        }
        catch (InvalidOperationException)
        {
        }

        _process.Dispose();
    }

    private static bool TryParseReady(string line, out int port, out int pid)
    {
        port = 0;
        pid = 0;
        const string prefix = "ACCOUNT_SERVER_READY ";
        if (!line.StartsWith(prefix, StringComparison.Ordinal))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(line[prefix.Length..]);
            JsonElement root = document.RootElement;
            port = root.GetProperty("port").GetInt32();
            pid = root.GetProperty("pid").GetInt32();
            return port > 0 && pid > 0;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (InvalidOperationException)
        {
        }
        catch (NotSupportedException)
        {
        }
    }

    private static string Tail(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return string.Empty;
        }

        string[] lines = text.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        int start = Math.Max(0, lines.Length - 20);
        return string.Join("\n", lines, start, lines.Length - start);
    }
}
