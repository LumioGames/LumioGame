using System;
using System.Text.Json;
using Lumio.GameServices.Contracts;
using Lumio.Server.RuleService.Network;

namespace Lumio.GameServices.Sample.Tests;

internal static class Fixtures
{
    internal static string OpportunityKey => new string('a', 64);
    internal const string GameId = "91d25d0c-9b87-4c34-9c47-19b779b10001";
    internal static JsonElement Json(object? value) => JsonSerializer.SerializeToElement(value);
    internal static RulePluginInvocationContext Context => new(new string('a', 64));
    internal static RuleStateDocument State(long draws = 0, long best = 0, bool eligible = false, string version = "expedition_v2") => new()
    {
        DocumentId = "expedition", SchemaVersion = version,
        Data = version == "expedition_v1" ? Json(new { drawIndex = draws, bestScore = best, eligible, entitlementKey = OpportunityKey, hiddenCode = "forest_only" }) : Json(new { drawIndex = draws, bestScore = best, eligible, entitlementKey = OpportunityKey, hiddenCode = "forest_only", trail = "camp" }),
    };
    internal static RuleSnapshot Snapshot(long grants = 0, long spent = 0, long best = 0) => new()
    {
        State = new() { Documents = [State(spent, best, grants > spent)] },
        Ledger = new() { Balances = [new() { DefinitionId = "supplies", Quantity = Math.Max(0, grants - spent) }],
            Qualifications = grants == 0 ? [] : [new() { DefinitionId = "supplies", QualificationKey = "starter_v1", GrantedQuantity = grants, SpentQuantity = spent, AchievementGranted = false }] },
        StateRevision = 1, LedgerRevision = 1, ConfigRevision = 1, SecurityRevision = 1, SubjectRevision = 1,
    };
    internal static RuleServiceBindings ServiceBindings => new()
    {
        InvocationId = "invoke_1", GameId = GameId, Environment = "test", AuthorityId = "platform_1", ReleaseId = "expedition_2",
        RuleVersion = "expedition_v2", ServiceId = "expedition_rules", ServerTimeMs = 1_800_000_000_000, ExpiresAtMs = 1_800_000_030_000,
    };
    internal static RuleServiceSubject Subject(RuleSnapshot snapshot, string subject = "guest_1", string reference = "save_1") => new()
    {
        SubjectId = subject, StateExists = true, Reference = Json(reference), StateSchemaId = snapshot.State.Documents[0].SchemaVersion,
        SnapshotDigest = RuleWireCodec.Digest(JsonSerializer.SerializeToUtf8Bytes(snapshot)), Snapshot = snapshot,
    };
    internal static RuleInvocation Action(string action, RuleSnapshot? snapshot = null, object? arguments = null, string operationId = "op_1")
    {
        snapshot ??= Snapshot();
        return new()
        {
            Bindings = new() { GameId = GameId, Environment = "test", OriginSubjectId = "guest_1", OperationEpoch = "epoch_1", OperationId = operationId,
                AuthorityId = "platform_1", ReleaseId = "expedition_2", RuleVersion = "expedition_v2", StateRevision = 1, LedgerRevision = 1, ConfigRevision = 1,
                SecurityRevision = 1, SubjectRevision = 1, RequestDigest = new string('b', 64), SnapshotDigest = RuleWireCodec.Digest(JsonSerializer.SerializeToUtf8Bytes(snapshot)),
                ServerTimeMs = 1_800_000_000_000, ExecutionExpiresAtMs = 1_800_000_030_000 },
            Action = action, Arguments = Json(arguments ?? new { }), Snapshot = snapshot,
            Opportunity = action == "explore" ? Json(new RuleRandomOpportunity { Key = new() { GameId = GameId, Environment = "test", EntitlementKey = OpportunityKey, DrawIndex = snapshot.Ledger.Qualifications[0].SpentQuantity },
                MaterialRef = "chance_0", MaterialHex = new string('0', 64), MaterialDigest = RuleWireCodec.Digest(new byte[32]) }) : Json(null),
        };
    }
}
