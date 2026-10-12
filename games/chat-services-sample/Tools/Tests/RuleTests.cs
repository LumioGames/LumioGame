using System;
using System.Linq;
using System.Text.Json;
using Lumio.GameServices.Contracts;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Lumio.GameServices.Chat.Tests;

public sealed class RuleTests
{
    private static readonly string[] ViewFields = ["canSend", "messageCount", "recent", "started"];
    [Fact]
    public async Task BeginCreatesRoomStateWithoutLedgerOrRankOnlyAsCandidate()
    {
        var request = Fixtures.Action("begin", Fixtures.Empty());
        string before = JsonSerializer.Serialize(request);
        var result = await new ChatRules().EvaluateAsync(request, Fixtures.Context, CancellationToken.None);
        Assert.True(result.IsApplied);
        Assert.Empty(result.AppliedValue!.Decision.Ledger);
        Assert.Empty(result.AppliedValue.Decision.Rank);
        var state = Assert.Single(result.AppliedValue.Decision.State.Upserts);
        Assert.Equal("chat", state.DocumentId);
        Assert.Equal(0, state.Data.GetProperty("messageCount").GetInt64());
        Assert.True(result.AppliedValue.Decision.View.GetProperty("canSend").GetBoolean());
        Assert.Equal(before, JsonSerializer.Serialize(request));
    }
    [Fact]
    public async Task SecondBeginIsDeniedAsAlreadyStarted()
    {
        var result = await new ChatRules().EvaluateAsync(Fixtures.Action("begin"), Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("already_started", result.DeniedValue!.Denial.GameReason);
    }
    [Fact]
    public async Task SendRequiresEnteringTheRoomFirst()
    {
        var result = await new ChatRules().EvaluateAsync(Fixtures.Action("send", Fixtures.Empty(), new { text = "你好" }), Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("not_started", result.DeniedValue!.Denial.GameReason);
    }
    [Fact]
    public async Task SendAppendsOneCumulativeContributionPerMessage()
    {
        var result = await new ChatRules().EvaluateAsync(Fixtures.Action("send", Fixtures.Snapshot(2), new { text = "你好" }), Fixtures.Context, CancellationToken.None);
        Assert.True(result.IsApplied);
        var rank = Assert.Single(result.AppliedValue!.Decision.Rank);
        Assert.Equal("chat_messages", rank.BoardId);
        Assert.Equal("all_time", rank.SeasonId);
        Assert.Equal(1, rank.Value);
        Assert.Empty(result.AppliedValue.Decision.Ledger);
        var data = Assert.Single(result.AppliedValue.Decision.State.Upserts).Data;
        Assert.Equal(3, data.GetProperty("messageCount").GetInt64());
        var recent = data.GetProperty("recent");
        Assert.Equal(1, recent.GetArrayLength());
        Assert.Equal(3, recent[0].GetProperty("seq").GetInt64());
        Assert.Equal("你好", recent[0].GetProperty("text").GetString());
        Assert.True(result.AppliedValue.Decision.View.GetProperty("canSend").GetBoolean());
    }
    [Fact]
    public async Task SameSnapshotDifferentOperationIdYieldsTheSameCandidate()
    {
        var rules = new ChatRules();
        var request = Fixtures.Action("send", Fixtures.Snapshot(1), new { text = "一致" });
        var first = await rules.EvaluateAsync(request, Fixtures.Context, CancellationToken.None);
        var second = await rules.EvaluateAsync(request with { Bindings = request.Bindings with { OperationId = "another_operation" } }, Fixtures.Context, CancellationToken.None);
        Assert.Equal(JsonSerializer.Serialize(first.AppliedValue!.Decision), JsonSerializer.Serialize(second.AppliedValue!.Decision));
    }
    [Theory]
    [InlineData("score")][InlineData("nextState")][InlineData("count")][InlineData("complete")][InlineData("time")][InlineData("random")]
    public async Task FinalClientValuesAreRejected(string field)
    {
        var args = JsonSerializer.Deserialize<JsonElement>("{\"" + field + "\":1,\"text\":\"你好\"}");
        var result = await new ChatRules().EvaluateAsync(Fixtures.Action("send", arguments: args), Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("invalid_action", result.DeniedValue!.Denial.GameReason);
    }
    [Theory]
    [InlineData("")][InlineData("a201")]
    public async Task TextBoundsAreEnforced(string kind)
    {
        var text = kind == "a201" ? new string('好', 201) : "";
        var result = await new ChatRules().EvaluateAsync(Fixtures.Action("send", arguments: new { text }), Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("invalid_action", result.DeniedValue!.Denial.GameReason);
    }
    [Fact]
    public async Task NonStringTextIsRejected()
    {
        var args = JsonSerializer.Deserialize<JsonElement>("{\"text\":42}");
        var result = await new ChatRules().EvaluateAsync(Fixtures.Action("send", arguments: args), Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("invalid_action", result.DeniedValue!.Denial.GameReason);
    }
    [Fact]
    public async Task RecentListKeepsOnlyTheLastTwentyMessages()
    {
        var history = Enumerable.Range(1, 20).Select(seq => (object)new { seq, text = "消息" + seq }).ToArray();
        var result = await new ChatRules().EvaluateAsync(Fixtures.Action("send", Fixtures.Snapshot(20, history), new { text = "最新" }), Fixtures.Context, CancellationToken.None);
        var data = Assert.Single(result.AppliedValue!.Decision.State.Upserts).Data;
        Assert.Equal(21, data.GetProperty("messageCount").GetInt64());
        var recent = data.GetProperty("recent");
        Assert.Equal(20, recent.GetArrayLength());
        Assert.Equal(2, recent[0].GetProperty("seq").GetInt64());
        Assert.Equal(21, recent[19].GetProperty("seq").GetInt64());
        Assert.Equal("最新", recent[19].GetProperty("text").GetString());
    }
    [Fact]
    public async Task DifferentServerSubjectsCannotShareTheSameRoomNamespace()
    {
        var firstRequest = Fixtures.Action("begin", Fixtures.Empty());
        var secondRequest = firstRequest with { Bindings = firstRequest.Bindings with { OriginSubjectId = "different_guest" } };
        var rules = new ChatRules();
        var first = await rules.EvaluateAsync(firstRequest, Fixtures.Context, CancellationToken.None);
        var second = await rules.EvaluateAsync(secondRequest, Fixtures.Context, CancellationToken.None);
        Assert.NotEqual(first.AppliedValue!.Decision.State.Upserts[0].Data.GetProperty("entitlementKey").GetString(),
            second.AppliedValue!.Decision.State.Upserts[0].Data.GetProperty("entitlementKey").GetString());
    }
    [Fact]
    public async Task ProjectionContainsOnlyChatFieldsAndNoNamespace()
    {
        var result = await new ChatRules().ProjectAsync(new() { Entrypoint = "project", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(Fixtures.Snapshot(3)), ViewSchemaId = "chat_view" }, Fixtures.Context, CancellationToken.None);
        var view = result.AppliedValue!.Result.View;
        Assert.Equal(3, view.GetProperty("messageCount").GetInt64());
        Assert.Equal(ViewFields, view.EnumerateObject().Select(x => x.Name).Order(StringComparer.Ordinal));
        Assert.DoesNotContain(new string('a', 64), JsonSerializer.Serialize(view), StringComparison.Ordinal);
    }
    [Fact]
    public async Task EmptyStateStartsOnlyThroughServerBeginDecision()
    {
        var empty = Fixtures.Empty();
        var projected = await new ChatRules().ProjectAsync(new() { Entrypoint = "project", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(empty) with { StateExists = false, Reference = Fixtures.Json(null) }, ViewSchemaId = "chat_view" }, Fixtures.Context, CancellationToken.None);
        Assert.False(projected.AppliedValue!.Result.View.GetProperty("started").GetBoolean());
        var initialized = await new ChatRules().EvaluateAsync(Fixtures.Action("begin", empty), Fixtures.Context, CancellationToken.None);
        Assert.True(initialized.IsApplied);
        Assert.Single(initialized.AppliedValue!.Decision.State.Upserts);
    }
    [Fact]
    public async Task FirstSchemaHasNoMigration()
    {
        var result = await new ChatRules().MigrateAsync(new() { Entrypoint = "migrate", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(Fixtures.Snapshot(1)), FromStateSchemaId = "chat_v1", ToStateSchemaId = "chat_v1" }, Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("migration_unavailable", result.DeniedValue!.Denial.GameReason);
    }
    [Fact]
    public async Task BindingPreservesRankHistoryAndRebuildsTheCombinedTotal()
    {
        var rankEvents = new[] { Rank("msg_1", "old_guest", "key_a", 2), Rank("msg_2", "guest_2", "key_b", 3) };
        var request = new RuleBindRequest { Entrypoint = "bind", Bindings = Fixtures.ServiceBindings,
            Source = Fixtures.Subject(Fixtures.Snapshot(3, new[] { new { seq = 3, text = "第三条" } }), "guest_2", "source_ref"),
            Target = Fixtures.Subject(Fixtures.Snapshot(2, new[] { new { seq = 2, text = "第二条" } }), "account_1", "target_ref"),
            Selection = new() { BindingId = "bind_1", SourceReference = Fixtures.Json("source_ref"), TargetReference = Fixtures.Json("target_ref"), SelectedReference = "source_ref" },
            History = new() { LedgerEvents = [], RankEvents = rankEvents }, ToStateSchemaId = "chat_v1" };
        var result = await new ChatRules().BindAsync(request, Fixtures.Context, CancellationToken.None);
        Assert.True(result.IsApplied);
        Assert.Equal(rankEvents.Select(x => x.EventId), result.AppliedValue!.Result.Rebuild.RetainedRankEventIds);
        Assert.Equal("account_1", result.AppliedValue.Result.Rebuild.CanonicalSubjectId);
        Assert.Equal(["key_a", "key_b"], result.AppliedValue.Result.Rebuild.QualificationGroups.Select(g => g.CanonicalQualificationKey));
        var data = Assert.Single(result.AppliedValue.Result.Changes.Upserts).Data;
        Assert.Equal(5, data.GetProperty("messageCount").GetInt64());
        var recent = data.GetProperty("recent");
        Assert.Equal(3, Assert.Single(recent.EnumerateArray()).GetProperty("seq").GetInt64());
        Assert.Equal("old_guest", rankEvents[0].SubjectId);
    }
    private static RuleBindingRankEvent Rank(string id, string owner, string key, long value) => new()
    {
        EventId = id, SubjectId = owner, BoardId = "chat_messages", SeasonId = "all_time", QualificationKey = key, CanonicalQualificationKey = key,
        Value = value, CommittedAtMs = 1_800_000_000_000,
    };
}
