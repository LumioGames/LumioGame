using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.GameRuntime.Ecs;
using Lumio.Wire;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class BomberInputTraceTests
{
    [Fact]
    public void ActualObserverAcceptanceJoinsAllocatedRequestAndSurvivesCloseWithExactBytes()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            host.SetInputIntentEnabled(true);
            host.SetMoveIntent((int)BomberDirection.Right, 0, true);
            int before = owner.ReceivedFrames.Length;
            owner.PumpUntil(() => owner.ReceivedFrames.Length > before);
            byte[] bytes = owner.ReceivedFrames[before];
            var message = WireCodec.DecodeAuthenticatedInput(bytes, owner.WireProfile, self, 9,
                "game-test-socket", BrowserSessionOwner.Incarnation);
            owner.Dispose();
            using var document = JsonDocument.Parse(host.DrainInputTrace());
            var rows = document.RootElement.GetProperty("events").EnumerateArray().ToArray();
            var accepted = Assert.Single(rows, row => row.GetProperty("k").GetString() == "accepted" &&
                row.GetProperty("sequence").GetString() == message.Sequence.ToString());
            var request = Assert.Single(rows, row => row.GetProperty("k").GetString() == "request" &&
                row.GetProperty("sequence").GetString() == message.Sequence.ToString());
            Assert.Equal("9", accepted.GetProperty("wireGeneration").GetString());
            Assert.Equal(request.GetProperty("sampleId").GetString(), accepted.GetProperty("sampleId").GetString());
            Assert.Equal(bytes.Length, accepted.GetProperty("encodedLength").GetInt32());
            Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
                accepted.GetProperty("encodedSha256").GetString());
            Assert.Equal(1, accepted.GetProperty("commandCount").GetInt32());
        }, stepOptions: new BomberPlayerStepOptions(true), wireGeneration: 9);
    }

    [Fact]
    public void RingRetainsExactly1024RecordsAndMarksLossAfter1025th()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        for (ulong i = 0; i < 1025; i++)
            Assert.NotNull(trace.Sample(manager, 1, 9, "self", 55, i, 2, 0, false, 0, 0, false));
        using var document = JsonDocument.Parse(trace.Drain());
        var fullRing = document.RootElement.GetProperty("events").EnumerateArray().ToList();
        Assert.Equal(1024, fullRing.Count);
        Assert.Equal("1", document.RootElement.GetProperty("eventLoss").GetString());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("trace-overflow", document.RootElement.GetProperty("traceOverflow").GetProperty("k").GetString());
        Assert.Equal("2", fullRing[0].GetProperty("sampleId").GetString());
    }

    [Fact]
    public void NewSampleIdsStayUniqueAcrossResetOrdinalOnSameManager()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        string? first = trace.Sample(manager, 1, 9, "self", 55, 1, 2, 0, false, 0, 0, false);
        string? second = trace.Sample(manager, 1, 9, "self", 55, 1, 2, 0, false, 0, 0, false);
        Assert.NotEqual(first, second);
        using var document = JsonDocument.Parse(trace.Drain());
        Assert.Equal(new[] { "1", "2" }, document.RootElement.GetProperty("events").EnumerateArray()
            .Select(e => e.GetProperty("sampleId").GetString()).ToArray());
    }

    [Fact]
    public void MatcherRequiresSenderGenerationSequenceAndCurrentSession()
    {
        var trace = new BomberInputTrace();
        var sender = new NetEntityId(7, 1);
        var other = new NetEntityId(7, 2);
        var manager = new object();
        string sample = trace.Sample(manager, 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(sample, "MoveAbility", sender.ToHex(), 9, 42, 1);
        trace.Accepted(new InputCommandMessage(42, "rpc", other, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(42, "rpc", sender, new byte[] { 1 }), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(42, "rpc", sender, new byte[] { 1 }, connectionGeneration: 10), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(43, "rpc", sender, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(42, "rpc", sender, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        using var first = JsonDocument.Parse(trace.Drain());
        var accepted = first.RootElement.GetProperty("events").EnumerateArray()
            .Where(e => e.GetProperty("k").GetString() == "accepted").ToArray();
        Assert.Equal(5, accepted.Length);
        Assert.Equal(new string?[] { null, null, null, null, sample },
            accepted.Select(e => e.GetProperty("sampleId").GetString()).ToArray());
        Assert.False(first.RootElement.GetProperty("complete").GetBoolean());

        string old = trace.Sample(manager, 1, 9, sender.ToHex(), 55, 2, 2, 0, false, 0, 0, false)!;
        trace.Request(old, "MoveAbility", sender.ToHex(), 9, 44, 1);
        string current = trace.Sample(new object(), 2, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(current, "MoveAbility", sender.ToHex(), 9, 44, 2);
        trace.Accepted(new InputCommandMessage(44, "rpc", sender, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        using var second = JsonDocument.Parse(trace.Drain());
        Assert.Contains(second.RootElement.GetProperty("events").EnumerateArray(), e =>
            e.GetProperty("k").GetString() == "accepted" && e.GetProperty("sampleId").ValueKind == JsonValueKind.Null);
    }

    [Fact]
    public void PendingTableCapsAt256AndMarksEvictionIncomplete()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        string sample = trace.Sample(manager, 1, 9, "self", 55, 1, 2, 0, false, 0, 0, false)!;
        for (ulong sequence = 1; sequence <= 257; sequence++)
            trace.Request(sample, "MoveAbility", "self", 9, sequence, 1);
        using var document = JsonDocument.Parse(trace.Drain());
        Assert.Equal(256, document.RootElement.GetProperty("pending").GetInt32());
        Assert.Equal("1", document.RootElement.GetProperty("pendingLoss").GetString());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
    }

    [Fact]
    public void DiagnosticObserverFailureIsContainedAndMarksRecordingIncomplete()
    {
        var trace = new BomberInputTrace();
        var sender = new NetEntityId(7, 1);
        string sample = trace.Sample(new object(), 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(sample, "MoveAbility", sender.ToHex(), 9, 1, 1);
        var message = new InputCommandMessage(1, sender, new ThrowingCommands(), connectionGeneration: 9);
        trace.Accepted(message, new byte[] { 1, 2, 3 });
        using var document = JsonDocument.Parse(trace.Drain());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("1", document.RootElement.GetProperty("diagnosticFailures").GetString());
    }

    [Fact]
    public void AdmissionBeforeFirstStepRequestIsVisibleOutsideStepScopeWithoutPoisoningCorrelation()
    {
        var trace = new BomberInputTrace();
        var sender = new NetEntityId(7, 1);
        trace.Accepted(new InputCommandMessage(1, "rpc", sender, new byte[] { 4 }, connectionGeneration: 9),
            new byte[] { 4 });
        using var first = JsonDocument.Parse(trace.Drain());
        Assert.True(first.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("outside-step-accepted", first.RootElement.GetProperty("events")[0].GetProperty("k").GetString());
        string sample = trace.Sample(new object(), 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(sample, "MoveAbility", sender.ToHex(), 9, 2, 1);
        trace.Accepted(new InputCommandMessage(2, "rpc", sender, new byte[] { 5 }, connectionGeneration: 9),
            new byte[] { 5 });
        using var second = JsonDocument.Parse(trace.Drain());
        Assert.True(second.RootElement.GetProperty("complete").GetBoolean());
        Assert.Contains(second.RootElement.GetProperty("events").EnumerateArray(), row =>
            row.GetProperty("k").GetString() == "accepted" && row.GetProperty("sampleId").GetString() == sample);
    }

    [Fact]
    public void DelayedGenerationNineAcceptanceJoinsPriorSampleAfterCurrentGenerationChanges()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        var sender = new NetEntityId(7, 1);
        string prior = trace.Sample(manager, 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(prior, "MoveAbility", sender.ToHex(), 9, 7, 1);
        string current = trace.Sample(manager, 1, 10, sender.ToHex(), 55, 2, 2, 0, false, 0, 0, false)!;
        trace.Request(current, "MoveAbility", sender.ToHex(), 10, 8, 1);
        trace.Accepted(new InputCommandMessage(7, "rpc", sender, new byte[] { 7 }, connectionGeneration: 9),
            new byte[] { 7 });
        using var document = JsonDocument.Parse(trace.Drain());
        var accepted = Assert.Single(document.RootElement.GetProperty("events").EnumerateArray(), row =>
            row.GetProperty("k").GetString() == "accepted");
        Assert.Equal(prior, accepted.GetProperty("sampleId").GetString());
        Assert.NotEqual(current, accepted.GetProperty("sampleId").GetString());
        Assert.Equal("9", accepted.GetProperty("wireGeneration").GetString());
    }

    private sealed class ThrowingCommands : IReadOnlyList<InputCommandPart>
    {
        public int Count => 1;
        public InputCommandPart this[int index] => new("rpc", ReadOnlyMemory<byte>.Empty);
        public IEnumerator<InputCommandPart> GetEnumerator() => throw new InvalidOperationException("diagnostic-enumeration");
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }

    [Fact]
    public void DisabledTraceIsEmptyWithoutDisablingRealInputOrStatus()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            host.SetInputIntentEnabled(true);
            int before = owner.ReceivedFrames.Length;
            owner.PumpUntil(() => owner.ReceivedFrames.Length > before);
            Assert.True(owner.ReceivedFrames.Length > before);
            using var document = JsonDocument.Parse(host.DrainInputTrace());
            Assert.False(document.RootElement.GetProperty("enabled").GetBoolean());
            Assert.Empty(document.RootElement.GetProperty("events").EnumerateArray());
            Assert.Equal("accepted", host.GetBombIntentStatusCode());
        }, stepOptions: new BomberPlayerStepOptions());
    }
}
