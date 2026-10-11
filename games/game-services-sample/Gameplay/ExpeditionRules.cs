using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lumio.GameServices.Contracts;

namespace Lumio.GameServices.Sample;

/// <summary>Pure expedition rules; returned costs, achievements and scores are one candidate for the authority transaction.</summary>
public sealed class ExpeditionRules : IGameRulePlugin
{
    private const string Schema = "expedition_v2";
    private const string Starter = "starter_v1";

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RulePrepareAppliedResponse, RulePrepareDeniedResponse>> PrepareAsync(RulePrepareRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var action = JsonSerializer.Deserialize<ActionRequest>(request.ActionBody) ?? throw new InvalidOperationException("Invalid action envelope.");
        string? reason = Precondition(action.Action, action.Arguments, request.Subject.Snapshot);
        if (reason is not null) return ValueTask.FromResult(RulePluginResult<RulePrepareAppliedResponse, RulePrepareDeniedResponse>.Denied(new()
            { Entrypoint = "prepare", Bindings = request.Bindings, RequestDigest = context.RequestDigest, Denial = new() { GameReason = reason } }));
        JsonElement opportunity = Json(null);
        if (action.Action == "explore")
        {
            long draw = Qualification(request.Subject.Snapshot).Spent;
            if (!request.Facts.Any(f => f.Eligible && f.EntitlementKey == Entitlement(request.Subject.Snapshot) && f.NextDrawIndex == draw))
                throw new InvalidOperationException("Missing server opportunity fact.");
            opportunity = Json(new RulePreparationReference { SelectorId = "expedition_draw", EntitlementKey = Entitlement(request.Subject.Snapshot), DrawIndex = draw });
        }
        return ValueTask.FromResult(RulePluginResult<RulePrepareAppliedResponse, RulePrepareDeniedResponse>.Applied(new()
        { Entrypoint = "prepare", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new() { Preparation = new() { Opportunity = opportunity } } }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleAppliedResponse, RuleDeniedResponse>> EvaluateAsync(RuleInvocation request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        string? reason = Precondition(request.Action, request.Arguments, request.Snapshot);
        if (reason is not null)
        {
            // An issued opportunity must never be turned into a selectively retryable business denial.
            if (request.Opportunity.ValueKind != JsonValueKind.Null) throw new InvalidOperationException("Invalid prepared opportunity.");
            return ValueTask.FromResult(RulePluginResult<RuleAppliedResponse, RuleDeniedResponse>.Denied(new()
                { Bindings = request.Bindings, RequestDigest = context.RequestDigest, Denial = new() { GameReason = reason } }));
        }
        var (granted, spent) = Qualification(request.Snapshot);
        long best = Best(request.Snapshot);
        string trail = Trail(request.Snapshot);
        var ledger = new List<RuleLedgerEffect>();
        var rank = new List<RuleRankEffect>();
        if (request.Action == "claim_supplies")
        {
            granted = 3;
            ledger.Add(new() { EffectId = "starter_grant", Kind = "grant", DefinitionId = "supplies", QualificationKey = Starter, Quantity = 3 });
        }
        if (request.Action == "explore")
        {
            var opportunity = request.Opportunity.Deserialize<RuleRandomOpportunity>() ?? throw new InvalidOperationException("Missing opportunity.");
            if (opportunity.Key.GameId != request.Bindings.GameId || opportunity.Key.Environment != request.Bindings.Environment
                || opportunity.Key.EntitlementKey != Entitlement(request.Snapshot) || opportunity.Key.DrawIndex != spent)
                throw new InvalidOperationException("Opportunity does not belong to this challenge.");
            byte[] material = Convert.FromHexString(opportunity.MaterialHex);
            if (material.Length != 32) throw new InvalidOperationException("Invalid opportunity material.");
            trail = request.Arguments.GetProperty("route").GetString()!;
            long score = trail == "ridge" ? 10 + material[0] % 20 : 15 + material[0] % 10;
            best = Math.Max(best, score);
            string completed = "expedition_" + Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[]
            {
                opportunity.Key.GameId, opportunity.Key.Environment, opportunity.Key.EntitlementKey,
                opportunity.Key.DrawIndex.ToString(CultureInfo.InvariantCulture),
            })));
            ledger.Add(new() { EffectId = "expedition_cost", Kind = "spend", DefinitionId = "supplies", QualificationKey = Starter, Quantity = 1 });
            ledger.Add(new() { EffectId = "expedition_complete", Kind = "achievement", DefinitionId = "challenge", QualificationKey = completed, Quantity = 1 });
            rank.Add(new() { EffectId = "expedition_score", BoardId = "expedition_best", SeasonId = "all_time", QualificationKey = completed, Value = score });
            spent++;
        }
        string entitlement = request.Snapshot.State.Documents.Count == 0 ? Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(request.Bindings.GameId + "/" + request.Bindings.Environment + "/" + request.Bindings.OriginSubjectId + "/" + Starter))) : Entitlement(request.Snapshot);
        RuleStateDocument state = State(granted, spent, best, trail, entitlement);
        return ValueTask.FromResult(RulePluginResult<RuleAppliedResponse, RuleDeniedResponse>.Applied(new()
        {
            Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Decision = new() { State = new() { Upserts = [state], Deletes = [] }, Ledger = ledger, Rank = rank,
                View = View(true, granted, spent, best, trail) },
        }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleProjectAppliedResponse, RuleProjectDeniedResponse>> ProjectAsync(RuleProjectRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var (granted, spent) = Qualification(request.Subject.Snapshot);
        return ValueTask.FromResult(RulePluginResult<RuleProjectAppliedResponse, RuleProjectDeniedResponse>.Applied(new()
        { Entrypoint = "project", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new() { View = View(request.Subject.StateExists, granted, spent, Best(request.Subject.Snapshot), Trail(request.Subject.Snapshot)) } }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleMigrateAppliedResponse, RuleMigrateDeniedResponse>> MigrateAsync(RuleMigrateRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (request.FromStateSchemaId != "expedition_v1" || request.ToStateSchemaId != Schema || !request.Subject.StateExists)
            return ValueTask.FromResult(RulePluginResult<RuleMigrateAppliedResponse, RuleMigrateDeniedResponse>.Denied(new()
            { Entrypoint = "migrate", Bindings = request.Bindings, RequestDigest = context.RequestDigest, Denial = new() { GameReason = "migration_unavailable" } }));
        var (granted, spent) = Qualification(request.Subject.Snapshot);
        return ValueTask.FromResult(RulePluginResult<RuleMigrateAppliedResponse, RuleMigrateDeniedResponse>.Applied(new()
        { Entrypoint = "migrate", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new() { Changes = new() { Upserts = [State(granted, spent, Best(request.Subject.Snapshot), Trail(request.Subject.Snapshot), Entitlement(request.Subject.Snapshot))], Deletes = [] } } }));
    }

    /// <inheritdoc />
    public ValueTask<RulePluginResult<RuleBindAppliedResponse, RuleBindDeniedResponse>> BindAsync(RuleBindRequest request, RulePluginInvocationContext context, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        // Membership and complete-history proofs come from A/B's locked snapshot; original subject IDs are not rewritten here.
        RuleServiceSubject selected = new[] { request.Source, request.Target }.Single(s => s.StateExists && s.Reference.GetString() == request.Selection.SelectedReference);
        RuleBindingLedgerEvent[] supplyEvents = request.History.LedgerEvents.Where(e => e.DefinitionId == "supplies" && e.CanonicalQualificationKey == Starter).ToArray();
        long granted = supplyEvents.Where(e => e.Kind == "grant").Select(e => e.Quantity).DefaultIfEmpty(0).Max();
        long spent = supplyEvents.Where(e => e.Kind == "spend").Sum(e => e.Quantity);
        long best = request.History.RankEvents.Where(e => e.BoardId == "expedition_best" && e.SeasonId == "all_time").Select(e => e.Value).DefaultIfEmpty(0).Max();
        string[] keys = request.History.LedgerEvents.Select(e => e.CanonicalQualificationKey)
            .Concat(request.History.RankEvents.Select(e => e.CanonicalQualificationKey)).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        return ValueTask.FromResult(RulePluginResult<RuleBindAppliedResponse, RuleBindDeniedResponse>.Applied(new()
        {
            Entrypoint = "bind", Bindings = request.Bindings, RequestDigest = context.RequestDigest,
            Result = new()
            {
                Changes = new() { Upserts = [State(granted, spent, best, Trail(selected.Snapshot), Entitlement(request.Target.StateExists ? request.Target.Snapshot : request.Source.Snapshot))], Deletes = [] },
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
        if (action == "explore" ? fields.Length != 1 || fields[0].Name != "route" || fields[0].Value.ValueKind != JsonValueKind.String
            || fields[0].Value.GetString() is not ("ridge" or "river") : fields.Length != 0) return "invalid_action";
        bool started = snapshot.State.Documents.Count != 0;
        var (granted, spent) = Qualification(snapshot);
        return action switch
        {
            "begin" => started ? "already_started" : null,
            "claim_supplies" => !started ? "not_started" : granted > 0 ? "already_claimed" : null,
            "explore" => !started ? "not_started" : granted <= spent ? "no_supplies" : null,
            _ => "invalid_action",
        };
    }
    private static (long Granted, long Spent) Qualification(RuleSnapshot snapshot)
    {
        var facts = snapshot.Ledger.Qualifications.Where(q => q.DefinitionId == "supplies" && q.QualificationKey == Starter).ToArray();
        if (facts.Length > 1) throw new InvalidOperationException("Ambiguous qualification snapshot.");
        return facts.Length == 0 ? (0, 0) : (facts[0].GrantedQuantity, facts[0].SpentQuantity);
    }
    private static long Best(RuleSnapshot snapshot) => snapshot.State.Documents.Count == 0 ? 0 : snapshot.State.Documents.Single().Data.GetProperty("bestScore").GetInt64();
    private static string Trail(RuleSnapshot snapshot) => snapshot.State.Documents.Count == 0 ? "camp" : snapshot.State.Documents.Single().Data.TryGetProperty("trail", out JsonElement trail) ? trail.GetString()! : "camp";
    private static string Entitlement(RuleSnapshot snapshot) => snapshot.State.Documents.Single().Data.GetProperty("entitlementKey").GetString()!;
    private static RuleStateDocument State(long grant, long spent, long best, string trail, string entitlement) => new()
    { DocumentId = "expedition", SchemaVersion = Schema, Data = Json(new { drawIndex = spent, bestScore = best, eligible = grant > spent, entitlementKey = entitlement, hiddenCode = "forest_only", trail }) };
    private static JsonElement View(bool started, long grant, long spent, long best, string trail) => Json(new
    { started, supplies = Math.Max(0, grant - spent), draws = spent, bestScore = best, canClaim = started && grant == 0, canExplore = started && grant > spent, trail });
    private static JsonElement Json(object? value) => JsonSerializer.SerializeToElement(value);
}
