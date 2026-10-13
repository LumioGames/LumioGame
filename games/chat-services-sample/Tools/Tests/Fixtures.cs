using System;
using System.Text.Json;
using Lumio.GameServices.Contracts;
using Lumio.Server.RuleService.Network;

namespace Lumio.GameServices.Chat.Tests;

internal static class Fixtures
{
    internal static string NamespaceKey => new string('a', 64);
    internal const string GameId = "d5f3c2a1-4b6e-4f8a-9c0d-1e2b3a4f5c6d";
    internal static JsonElement Json(object? value) => JsonSerializer.SerializeToElement(value);
    internal static RulePluginInvocationContext Context => new(new string('a', 64));
    internal static RuleStateDocument State(long count = 0, object? recent = null, string schemaVersion = "chat_v3") => new()
    {
        DocumentId = "chat", SchemaVersion = schemaVersion,
        Data = Json(new { messageCount = count, entitlementKey = NamespaceKey, recent = recent ?? Array.Empty<object>() }),
    };
    internal static RuleSnapshot Snapshot(long count = 0, object? recent = null, string schemaVersion = "chat_v3") => new()
    {
        State = new() { Documents = [State(count, recent, schemaVersion)] },
        Ledger = new() { Balances = [], Qualifications = [] },
        StateRevision = 1, LedgerRevision = 1, ConfigRevision = 1, SecurityRevision = 1, SubjectRevision = 1,
    };
    internal static RuleSnapshot Empty() => Snapshot() with { StateRevision = 0, State = new() { Documents = [] } };
    internal static RuleServiceBindings ServiceBindings => new()
    {
        InvocationId = "invoke_1", GameId = GameId, Environment = "test", AuthorityId = "platform_1", ReleaseId = "chat_1",
        RuleVersion = "chat_rules_v1", ServiceId = "chat_rules", ServerTimeMs = 1_800_000_000_000, ExpiresAtMs = 1_800_000_030_000,
    };
    internal static RuleServiceSubject Subject(RuleSnapshot snapshot, string subject = "guest_1", string reference = "save_1", string? schemaVersion = null) => new()
    {
        SubjectId = subject, StateExists = true, Reference = Json(reference), StateSchemaId = schemaVersion ?? (snapshot.State.Documents.Count == 0 ? "chat_v3" : snapshot.State.Documents[0].SchemaVersion),
        SnapshotDigest = RuleWireCodec.Digest(JsonSerializer.SerializeToUtf8Bytes(snapshot)), Snapshot = snapshot,
    };
    internal static RuleInvocation Action(string action, RuleSnapshot? snapshot = null, object? arguments = null, string operationId = "op_1")
    {
        snapshot ??= Snapshot();
        return new()
        {
            Bindings = new() { GameId = GameId, Environment = "test", OriginSubjectId = "guest_1", OperationEpoch = "epoch_1", OperationId = operationId,
                AuthorityId = "platform_1", ReleaseId = "chat_1", RuleVersion = "chat_rules_v1", StateRevision = snapshot.StateRevision, LedgerRevision = snapshot.LedgerRevision,
                ConfigRevision = snapshot.ConfigRevision, SecurityRevision = snapshot.SecurityRevision, SubjectRevision = snapshot.SubjectRevision,
                RequestDigest = new string('b', 64), SnapshotDigest = RuleWireCodec.Digest(JsonSerializer.SerializeToUtf8Bytes(snapshot)),
                ServerTimeMs = 1_800_000_000_000, ExecutionExpiresAtMs = 1_800_000_030_000 },
            Action = action, Arguments = Json(arguments ?? new { }), Snapshot = snapshot,
            Opportunity = Json(null),
        };
    }
}
