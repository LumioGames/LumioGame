using System;
using System.Linq;
using System.Text.Json;
using Lumio.GameServices.Contracts;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Lumio.GameServices.Sample.Tests;

public sealed class RuleTests
{
    private static readonly string[] ViewFields = ["bestScore", "canClaim", "canExplore", "draws", "started", "supplies", "trail"];
    [Fact]
    public async Task FirstClaimReturnsThreeSuppliesOnlyAsCandidate()
    {
        var request = Fixtures.Action("claim_supplies");
        string before = JsonSerializer.Serialize(request);
        var result = await new ExpeditionRules().EvaluateAsync(request, Fixtures.Context, CancellationToken.None);
        Assert.True(result.IsApplied);
        var effect = Assert.Single(result.AppliedValue!.Decision.Ledger);
        Assert.Equal("grant", effect.Kind);
        Assert.Equal(3, effect.Quantity);
        Assert.Empty(result.AppliedValue.Decision.Rank);
        Assert.Equal(before, JsonSerializer.Serialize(request));
    }

    [Fact]
    public async Task OldSaveCannotClaimAgainWhenLedgerRemembersGrant()
    {
        var oldSave = Fixtures.Snapshot(3, 2) with { State = Fixtures.Snapshot().State };
        var result = await new ExpeditionRules().EvaluateAsync(Fixtures.Action("claim_supplies", oldSave), Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("already_claimed", result.DeniedValue!.Denial.GameReason);
    }

    [Theory]
    [InlineData("score")][InlineData("nextState")][InlineData("count")][InlineData("complete")][InlineData("time")][InlineData("random")]
    public async Task FinalClientValuesAreRejected(string field)
    {
        var args = JsonSerializer.Deserialize<JsonElement>("{\"" + field + "\":1}");
        var result = await new ExpeditionRules().EvaluateAsync(Fixtures.Action("claim_supplies", arguments: args), Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied);
        Assert.Equal("invalid_action", result.DeniedValue!.Denial.GameReason);
    }

    [Fact]
    public async Task FixedBusinessOpportunityIgnoresOperationIdAndProducesCostWithScore()
    {
        var rules = new ExpeditionRules();
        var request = Fixtures.Action("explore", Fixtures.Snapshot(3), new { route = "ridge" });
        var first = await rules.EvaluateAsync(request, Fixtures.Context, CancellationToken.None);
        var second = await rules.EvaluateAsync(request with { Bindings = request.Bindings with { OperationId = "another_operation" } }, Fixtures.Context, CancellationToken.None);
        Assert.Equal(JsonSerializer.Serialize(first.AppliedValue!.Decision), JsonSerializer.Serialize(second.AppliedValue!.Decision));
        Assert.Equal("spend", Assert.Single(first.AppliedValue.Decision.Ledger, x => x.Kind == "spend").Kind);
        Assert.InRange(Assert.Single(first.AppliedValue.Decision.Rank).Value, 10, 29);
        Assert.Equal(2, first.AppliedValue.Decision.View.GetProperty("supplies").GetInt32());
        Assert.Equal("starter_v1", Assert.Single(first.AppliedValue.Decision.Ledger, x => x.Kind == "spend").QualificationKey);
        Assert.Equal(Assert.Single(first.AppliedValue.Decision.Ledger, x => x.Kind == "achievement").QualificationKey,
            Assert.Single(first.AppliedValue.Decision.Rank).QualificationKey);
    }

    [Theory]
    [InlineData("game")][InlineData("environment")][InlineData("entitlement")][InlineData("draw")]
    public async Task IndependentServerOpportunitiesHaveIndependentCompletedQualifications(string dimension)
    {
        var firstRequest = Fixtures.Action("explore", Fixtures.Snapshot(3), new { route = "ridge" });
        var secondRequest = dimension == "draw" ? Fixtures.Action("explore", Fixtures.Snapshot(3, 1), new { route = "ridge" }) : firstRequest;
        var secondOpportunity = secondRequest.Opportunity.Deserialize<RuleRandomOpportunity>()!;
        if (dimension == "game") secondRequest = secondRequest with { Bindings = secondRequest.Bindings with { GameId = "91d25d0c-9b87-4c34-9c47-19b779b10002" } };
        if (dimension == "environment") secondRequest = secondRequest with { Bindings = secondRequest.Bindings with { Environment = "production" } };
        if (dimension == "entitlement") secondRequest = secondRequest with { Snapshot = secondRequest.Snapshot with { State = new() { Documents =
            [Fixtures.State() with { Data = Fixtures.Json(new { drawIndex = 0, bestScore = 0, eligible = true, entitlementKey = new string('b', 64), hiddenCode = "forest_only", trail = "camp" }) }] } } };
        secondOpportunity = secondOpportunity with { Key = secondOpportunity.Key with
        {
            GameId = secondRequest.Bindings.GameId, Environment = secondRequest.Bindings.Environment,
            EntitlementKey = secondRequest.Snapshot.State.Documents[0].Data.GetProperty("entitlementKey").GetString()!,
        } };
        secondRequest = secondRequest with { Opportunity = Fixtures.Json(secondOpportunity) };
        var rules = new ExpeditionRules();
        var first = await rules.EvaluateAsync(firstRequest, Fixtures.Context, CancellationToken.None);
        var second = await rules.EvaluateAsync(secondRequest, Fixtures.Context, CancellationToken.None);
        var firstCompleted = Assert.Single(first.AppliedValue!.Decision.Ledger, x => x.Kind == "achievement").QualificationKey;
        var secondCompleted = Assert.Single(second.AppliedValue!.Decision.Ledger, x => x.Kind == "achievement").QualificationKey;
        Assert.NotEqual(firstCompleted, secondCompleted);
        Assert.NotEqual(Assert.Single(first.AppliedValue.Decision.Rank).QualificationKey, Assert.Single(second.AppliedValue.Decision.Rank).QualificationKey);
    }

    [Fact]
    public async Task PrepareDeniesExhaustionBeforeRandomIsIssued()
    {
        var result = await new ExpeditionRules().PrepareAsync(new() { Entrypoint = "prepare", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(Fixtures.Snapshot(3, 3)), ActionBody = "{\"operationId\":\"op_1\",\"operationEpoch\":\"epoch_1\",\"expectedRevision\":1,\"action\":\"explore\",\"arguments\":{\"route\":\"ridge\"}}", Facts = [] }, Fixtures.Context, CancellationToken.None);
        Assert.False(result.IsApplied); Assert.Equal("no_supplies", result.DeniedValue!.Denial.GameReason);
    }

    [Fact]
    public async Task PreparedOpportunityComesFromServerQualificationOrdinal()
    {
        var result = await new ExpeditionRules().PrepareAsync(new() { Entrypoint = "prepare", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(Fixtures.Snapshot(3, 1)), ActionBody = "{\"operationId\":\"op_1\",\"operationEpoch\":\"epoch_1\",\"expectedRevision\":1,\"action\":\"explore\",\"arguments\":{\"route\":\"river\"}}",
            Facts = [new() { EntitlementKey = Fixtures.OpportunityKey, Eligible = true, NextDrawIndex = 1 }] }, Fixtures.Context, CancellationToken.None);
        Assert.True(result.IsApplied); Assert.Equal(1, result.AppliedValue!.Result.Preparation.Opportunity.GetProperty("drawIndex").GetInt32());
    }

    [Fact]
    public async Task ProjectionContainsOnlyOwnGameplayFieldsAndNoSecrets()
    {
        var result = await new ExpeditionRules().ProjectAsync(new() { Entrypoint = "project", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(Fixtures.Snapshot(3, 2, 20)), ViewSchemaId = "expedition_view" }, Fixtures.Context, CancellationToken.None);
        var view = result.AppliedValue!.Result.View;
        Assert.Equal(1, view.GetProperty("supplies").GetInt32());
        Assert.Equal(ViewFields, view.EnumerateObject().Select(x => x.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task EmptyStateStartsOnlyThroughServerBeginDecision()
    {
        var empty = Fixtures.Snapshot() with { StateRevision = 0, State = new() { Documents = [] } };
        var projected = await new ExpeditionRules().ProjectAsync(new() { Entrypoint = "project", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(Fixtures.Snapshot()) with { StateExists = false, Reference = Fixtures.Json(null), Snapshot = empty }, ViewSchemaId = "expedition_view" }, Fixtures.Context, CancellationToken.None);
        Assert.False(projected.AppliedValue!.Result.View.GetProperty("started").GetBoolean());
        var initialized = await new ExpeditionRules().EvaluateAsync(Fixtures.Action("begin", empty), Fixtures.Context, CancellationToken.None);
        Assert.True(initialized.IsApplied); Assert.Single(initialized.AppliedValue!.Decision.State.Upserts);
        var again = await new ExpeditionRules().EvaluateAsync(Fixtures.Action("begin"), Fixtures.Context, CancellationToken.None);
        Assert.False(again.IsApplied);
    }

    [Fact]
    public async Task DifferentServerSubjectsCannotShareTheSameRandomOpportunityNamespace()
    {
        var empty = Fixtures.Snapshot() with { StateRevision = 0, State = new() { Documents = [] } };
        var firstRequest = Fixtures.Action("begin", empty);
        var secondRequest = firstRequest with { Bindings = firstRequest.Bindings with { OriginSubjectId = "different_guest" } };
        var rules = new ExpeditionRules();
        var first = await rules.EvaluateAsync(firstRequest, Fixtures.Context, CancellationToken.None);
        var second = await rules.EvaluateAsync(secondRequest, Fixtures.Context, CancellationToken.None);
        Assert.NotEqual(first.AppliedValue!.Decision.State.Upserts[0].Data.GetProperty("entitlementKey").GetString(), second.AppliedValue!.Decision.State.Upserts[0].Data.GetProperty("entitlementKey").GetString());
    }

    [Fact]
    public async Task NewVersionMigrationDoesNotRestoreSpentSupplies()
    {
        var snapshot = Fixtures.Snapshot(3, 2) with { State = new() { Documents = [Fixtures.State(0, 10, true, "expedition_v1")] } };
        var result = await new ExpeditionRules().MigrateAsync(new() { Entrypoint = "migrate", Bindings = Fixtures.ServiceBindings,
            Subject = Fixtures.Subject(snapshot), FromStateSchemaId = "expedition_v1", ToStateSchemaId = "expedition_v2" }, Fixtures.Context, CancellationToken.None);
        var state = Assert.Single(result.AppliedValue!.Result.Changes.Upserts);
        Assert.Equal("expedition_v2", state.SchemaVersion); Assert.Equal(2, state.Data.GetProperty("drawIndex").GetInt32());
        Assert.Equal(snapshot.State.Documents[0].Data.GetProperty("entitlementKey").GetString(), state.Data.GetProperty("entitlementKey").GetString());
    }

    [Fact]
    public async Task BindingTwoGuestsPreservesAllOriginsAndCannotRestoreConsumption()
    {
        var events = new[] { Ledger("grant_1", "old_guest", "grant", 3), Ledger("spend_1", "old_guest", "spend", 2), Ledger("grant_2", "guest_2", "grant", 3), Ledger("spend_2", "guest_2", "spend", 2) };
        var request = new RuleBindRequest { Entrypoint = "bind", Bindings = Fixtures.ServiceBindings,
            Source = Fixtures.Subject(Fixtures.Snapshot(3, 2), "guest_2", "source_ref"), Target = Fixtures.Subject(Fixtures.Snapshot(3, 2), "account_1", "target_ref"),
            Selection = new() { BindingId = "bind_1", SourceReference = Fixtures.Json("source_ref"), TargetReference = Fixtures.Json("target_ref"), SelectedReference = "source_ref" },
            History = new() { LedgerEvents = events, RankEvents = [] }, ToStateSchemaId = "expedition_v2" };
        request = request with { Source = request.Source with { Snapshot = request.Source.Snapshot with { State = new() { Documents =
            [Fixtures.State(2) with { Data = Fixtures.Json(new { drawIndex = 2, bestScore = 0, eligible = true, entitlementKey = new string('b', 64), hiddenCode = "forest_only", trail = "river" }) }] } } } };
        var result = await new ExpeditionRules().BindAsync(request, Fixtures.Context, CancellationToken.None);
        Assert.True(result.IsApplied);
        Assert.Equal(events.Select(x => x.EventId), result.AppliedValue!.Result.Rebuild.RetainedLedgerEventIds);
        Assert.Equal("account_1", result.AppliedValue.Result.Rebuild.CanonicalSubjectId);
        var state = Assert.Single(result.AppliedValue.Result.Changes.Upserts).Data;
        Assert.False(state.GetProperty("eligible").GetBoolean()); Assert.Equal(4, state.GetProperty("drawIndex").GetInt32());
        Assert.Equal(Fixtures.OpportunityKey, state.GetProperty("entitlementKey").GetString());
        Assert.Equal("old_guest", events[0].SubjectId);
    }

    private static RuleBindingLedgerEvent Ledger(string id, string owner, string kind, long quantity) => new()
    {
        EventId = id, SubjectId = owner, DefinitionId = "supplies", QualificationKey = "starter_v1", CanonicalQualificationKey = "starter_v1",
        Kind = kind, Quantity = quantity, CommittedAtMs = 1_800_000_000_000,
    };
}
