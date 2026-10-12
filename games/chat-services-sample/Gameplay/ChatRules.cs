using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Lumio.GameServices.Contracts;

namespace Lumio.GameServices.Chat;

/// <summary>Pure chat room rules; each accepted send returns one cumulative leaderboard contribution and one authoritative state candidate.</summary>
public sealed class ChatRules : IGameRulePlugin
{
    private const string Schema = "chat_v1";
    private const string SchemaV2 = "chat_v2";
    private const string RoomNamespace = "chat_room_v1";
    private const string Board = "chat_messages";
    private const string Season = "all_time";
    private const int MaxTextLength = 200;
    private const int RecentCapacity = 20;

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RulePrepareAppliedResponse, RulePrepareDeniedResponse>> PrepareAsync(RulePrepareRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var action = JsonSerializer.Deserialize<ActionRequest>(request.ActionBody) ?? throw new InvalidOperationException("Invalid action envelope.");
        string? reason = Precondition(action.Action, action.Arguments, request.Subject.Snapshot);
        if (reason is not null) return ValueTask.FromResult(RulePluginResult<RulePrepareAppliedResponse, RulePrepareDeniedResponse>.Denied(new()
        { Entrypoint = "prepare", Bindings = request.Bindings, RequestDigest = context.RequestDigest, Denial = new() { GameReason = reason } }));
        return ValueTask.FromResult(RulePluginResult<RulePrepareAppliedResponse, RulePrepareDeniedResponse>.Applied(new()
        { Entrypoint = "prepare", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new() { Preparation = new() { Opportunity = Json(null) } } }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleAppliedResponse, RuleDeniedResponse>> EvaluateAsync(RuleInvocation request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        string? reason = Precondition(request.Action, request.Arguments, request.Snapshot);
        if (reason is not null) return ValueTask.FromResult(RulePluginResult<RuleAppliedResponse, RuleDeniedResponse>.Denied(new()
        { Bindings = request.Bindings, RequestDigest = context.RequestDigest, Denial = new() { GameReason = reason } }));
        bool started = Started(request.Snapshot);
        long count = Count(request.Snapshot);
        string entitlement = started ? Entitlement(request.Snapshot) : NewNamespace(request.Bindings);
        var recent = new List<RecentEntry>(RecentCapacity + 1);
        if (started) recent.AddRange(Recent(request.Snapshot));
        var rank = new List<RuleRankEffect>();
        if (request.Action == "send")
        {
            string text = request.Arguments.GetProperty("text").GetString()!;
            count++;
            recent.Add(new RecentEntry(count, text));
            if (recent.Count > RecentCapacity) recent.RemoveAt(0);
            rank.Add(new() { EffectId = "chat_message", BoardId = Board, SeasonId = Season, QualificationKey = MessageKey(entitlement, count), Value = 1 });
        }
        RuleStateDocument state = State(count, entitlement, recent);
        return ValueTask.FromResult(RulePluginResult<RuleAppliedResponse, RuleDeniedResponse>.Applied(new()
        {
            Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Decision = new() { State = new() { Upserts = [state], Deletes = [] }, Ledger = [], Rank = rank,
                View = View(started || request.Action == "begin", count, recent.Select(entry => entry.Text)) },
        }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleProjectAppliedResponse, RuleProjectDeniedResponse>> ProjectAsync(RuleProjectRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        bool started = Started(request.Subject.Snapshot);
        return ValueTask.FromResult(RulePluginResult<RuleProjectAppliedResponse, RuleProjectDeniedResponse>.Applied(new()
        { Entrypoint = "project", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new() { View = View(started, Count(request.Subject.Snapshot), Recent(request.Subject.Snapshot).Select(entry => entry.Text)) } }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleMigrateAppliedResponse, RuleMigrateDeniedResponse>> MigrateAsync(RuleMigrateRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (request.FromStateSchemaId != Schema || request.ToStateSchemaId != SchemaV2 || !request.Subject.StateExists)
            return ValueTask.FromResult(RulePluginResult<RuleMigrateAppliedResponse, RuleMigrateDeniedResponse>.Denied(new()
            { Entrypoint = "migrate", Bindings = request.Bindings, RequestDigest = context.RequestDigest, Denial = new() { GameReason = "migration_unavailable" } }));
        // chat_v2 is a forward-compatible reshape: the state document keeps its exact data.
        var source = request.Subject.Snapshot.State.Documents.Single();
        return ValueTask.FromResult(RulePluginResult<RuleMigrateAppliedResponse, RuleMigrateDeniedResponse>.Applied(new()
        { Entrypoint = "migrate", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new() { Changes = new() { Upserts = [new RuleStateDocument { DocumentId = source.DocumentId, SchemaVersion = SchemaV2, Data = source.Data }], Deletes = [] } } }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleBindAppliedResponse, RuleBindDeniedResponse>> BindAsync(RuleBindRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        // Membership and complete-history proofs come from A/B's locked snapshot; original subject IDs are not rewritten here.
        RuleServiceSubject selected = new[] { request.Source, request.Target }.Single(s => s.StateExists && s.Reference.GetString() == request.Selection.SelectedReference);
        RuleBindingRankEvent[] boardEvents = request.History.RankEvents.Where(e => e.BoardId == Board && e.SeasonId == Season).ToArray();
        long count = boardEvents.Sum(e => e.Value);
        string[] keys = request.History.LedgerEvents.Select(e => e.CanonicalQualificationKey)
            .Concat(request.History.RankEvents.Select(e => e.CanonicalQualificationKey)).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        return ValueTask.FromResult(RulePluginResult<RuleBindAppliedResponse, RuleBindDeniedResponse>.Applied(new()
        {
            Entrypoint = "bind", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new()
            {
                Changes = new() { Upserts = [State(count, Entitlement(request.Target.StateExists ? request.Target.Snapshot : request.Source.Snapshot), Recent(selected.Snapshot))], Deletes = [] },
                Rebuild = new()
                {
                    CanonicalSubjectId = request.Target.SubjectId,
                    RetainedLedgerEventIds = request.History.LedgerEvents.Select(e => e.EventId).ToArray(),
                    RetainedRankEventIds = request.History.RankEvents.Select(e => e.EventId).ToArray(),
                    QualificationGroups = keys.Select(key => new RuleBindingQualificationGroup { CanonicalQualificationKey = key,
                        LedgerEventIds = request.History.LedgerEvents.Where(e => e.CanonicalQualificationKey == key).Select(e => e.EventId).ToArray(),
                        RankEventIds = request.History.RankEvents.Where(e => e.CanonicalQualificationKey == key).Select(e => e.EventId).ToArray() }).ToArray(),
                },
            },
        }));
    }

    private static string? Precondition(string action, JsonElement arguments, RuleSnapshot snapshot)
    {
        if (arguments.ValueKind != JsonValueKind.Object) return "invalid_action";
        var fields = arguments.EnumerateObject().ToArray();
        if (action == "begin") return fields.Length != 0 ? "invalid_action" : Started(snapshot) ? "already_started" : null;
        if (action == "send")
        {
            if (fields.Length != 1 || fields[0].Name != "text" || fields[0].Value.ValueKind != JsonValueKind.String) return "invalid_action";
            string text = fields[0].Value.GetString()!;
            if (text.Length is < 1 or > MaxTextLength) return "invalid_action";
            return !Started(snapshot) ? "not_started" : null;
        }
        return "invalid_action";
    }
    private static bool Started(RuleSnapshot snapshot) => snapshot.State.Documents.Count != 0;
    private static long Count(RuleSnapshot snapshot) => Started(snapshot) ? snapshot.State.Documents.Single().Data.GetProperty("messageCount").GetInt64() : 0;
    private static string Entitlement(RuleSnapshot snapshot) => snapshot.State.Documents.Single().Data.GetProperty("entitlementKey").GetString()!;
    private static List<RecentEntry> Recent(RuleSnapshot snapshot)
    {
        if (!Started(snapshot)) return [];
        return [.. snapshot.State.Documents.Single().Data.GetProperty("recent").EnumerateArray()
            .Select(item => new RecentEntry(item.GetProperty("seq").GetInt64(), item.GetProperty("text").GetString()!))];
    }
    private static string NewNamespace(RuleBindings bindings) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(bindings.GameId + "/" + bindings.Environment + "/" + bindings.OriginSubjectId + "/" + RoomNamespace)));
    private static string MessageKey(string entitlement, long count) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(entitlement + "/" + count.ToString(CultureInfo.InvariantCulture))));
    private static RuleStateDocument State(long count, string entitlement, List<RecentEntry> recent) => new()
    { DocumentId = "chat", SchemaVersion = Schema, Data = Json(new { messageCount = count, entitlementKey = entitlement, recent }) };
    private static JsonElement View(bool started, long count, IEnumerable<string> recent) => Json(new { started, messageCount = count, canSend = started, recent });
    private static JsonElement Json(object? value) => JsonSerializer.SerializeToElement(value);
    private sealed record RecentEntry([property: JsonPropertyName("seq")] long Seq, [property: JsonPropertyName("text")] string Text);
}
