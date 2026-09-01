using System;
using System.Threading;
using System.Threading.Tasks;

namespace Lumio.Game.EntityChat.Suite;

/// <summary>C# MVP 101-entity acceptance process. Does not log secrets.</summary>
public static class Program
{
    /// <summary>Entry point.</summary>
    public static async Task<int> Main(string[] args)
    {
        string? outDir = null;
        string? accountDll = null;
        string dotnet = Environment.GetEnvironmentVariable("LUMIO_DOTNET") ?? "dotnet";
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--out":
                    outDir = Next(args, ref i);
                    break;
                case "--account-server-dll":
                    accountDll = Next(args, ref i);
                    break;
                case "--dotnet":
                    dotnet = Next(args, ref i) ?? dotnet;
                    break;
            }
        }

        if (string.IsNullOrWhiteSpace(outDir))
        {
            Console.Error.WriteLine("missing --out <evidenceDir>");
            return 3;
        }

        using var cancel = new CancellationTokenSource(TimeSpan.FromMinutes(10));
        return await EntityChatSuite.RunAsync(
            new EntityChatSuiteOptions(outDir, accountDll, dotnet),
            cancel.Token).ConfigureAwait(false);
    }

    private static string? Next(string[] args, ref int i)
    {
        if (i + 1 >= args.Length)
        {
            return null;
        }

        i++;
        return args[i];
    }
}
