using System;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Lumio.Client.Network.Connection;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

/// <summary>Real authenticated transport carrier for Native authority frames, not a DS Host.</summary>
internal sealed class BomberReplicaSocket : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly WebSocket _socket;
    internal IClientConnection Connection { get; }

    internal BomberReplicaSocket()
    {
        var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        int port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        _listener.Start();
        Task<WebSocket> accepted = Accept();
        var options = new WebSocketTransportOptions(65536, 8192, WebSocketTransportOptions.DefaultKeepAliveInterval,
            requireOperationReceipts: false, requireWorldChangeParts: false, requireSuccessorBinding: true);
        var endpoint = new ClientEndpoint($"ws://127.0.0.1:{port}/", Encoding.UTF8.GetBytes("freeze-test-admission"),
            ReadOnlyMemory<byte>.Empty, TimeSpan.FromSeconds(10), "freeze-replica");
        var factory = new WebSocketClientConnectionFactory(BomberWorldNativeFixture.Engine.Hfsm, options);
        Assert.True(factory.Create(new ClientConnectionCreateRequest(1, 64, 32, endpoint), out var connection).Succeeded);
        Connection = connection;
        Assert.True(connection.Start().Succeeded);
        Assert.True(accepted.Wait(TimeSpan.FromSeconds(10)), "Authenticated transport did not connect.");
        _socket = accepted.GetAwaiter().GetResult();
    }

    private async Task<WebSocket> Accept()
    {
        HttpListenerContext context = await _listener.GetContextAsync();
        Assert.Equal("Bearer freeze-test-admission", context.Request.Headers["Authorization"]);
        return (await context.AcceptWebSocketAsync(WebSocketTransportOptions.SuccessorBindingSubProtocol)).WebSocket;
    }

    internal AuthenticatedServerFrame Send(byte[] bytes)
    {
        Assert.InRange(bytes.Length, 1, 65536);
        _socket.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None).GetAwaiter().GetResult();
        long deadline = Environment.TickCount64 + 10000;
        var events = new ConnectionEvent[1];
        while (Environment.TickCount64 < deadline)
        {
            if (Connection.DrainEvents(events) != 0)
            {
                Assert.False(events[0].Terminal, $"Transport closed: {events[0].Kind}/{events[0].CloseDescription}");
                if (events[0].Kind == ConnectionEventKind.FrameReceived)
                {
                    var receipt = Assert.IsType<AuthenticatedServerFrame>(events[0].Frame.ServerReceipt);
                    Assert.Equal(bytes, receipt.Bytes.ToArray());
                    return receipt;
                }
            }
            Thread.Sleep(1);
        }
        throw new TimeoutException("Authenticated authority frame was not received.");
    }

    public void Dispose()
    {
        Connection.Dispose();
        Assert.True(Connection.DisposalCompletion.Wait(TimeSpan.FromSeconds(10)));
        _socket.Dispose();
        _listener.Close();
    }
}
