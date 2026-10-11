using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lumio.GameServices.Contracts;
using Lumio.GameServices.Sample;
using Lumio.GameServices.Sample.Tests;
using Lumio.Server.RuleService.Application;
using Lumio.Server.RuleService.Engine;
using Lumio.Server.RuleService.Network;

string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH") ?? throw new InvalidOperationException("LUMIO_ENGINE_NATIVE_PATH required; production Native probe cannot skip.");
string sample = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
string scratch = Path.GetFullPath(Path.Combine(sample, "../../.run/game-services-host-probe/" + Guid.NewGuid().ToString("N")));
string artifactRoot = Path.Combine(scratch, "artifact");
Directory.CreateDirectory(artifactRoot);
string assembly = typeof(ExpeditionRules).Assembly.Location;
string entry = Path.GetFileName(assembly);
File.Copy(assembly, Path.Combine(artifactRoot, entry));
byte[] manifest = JsonSerializer.SerializeToUtf8Bytes(new RulePluginArtifact { GameId = Fixtures.GameId, Environment = "test", ReleaseId = "expedition_2", RuleVersion = "expedition_v2",
    ContractId = GameServiceContract.ContractId, ContractSha256 = GameServiceContract.ContractSha256, EntryAssembly = entry, EntryType = typeof(ExpeditionRules).FullName!,
    Files = [new() { Path = entry, Sha256 = RuleWireCodec.Digest(File.ReadAllBytes(assembly)) }] });
await File.WriteAllBytesAsync(Path.Combine(scratch, "artifact.json"), manifest);
byte[] catalog = await File.ReadAllBytesAsync(Path.Combine(sample, "Server/catalog.json"));
await using var runtime = new RuleHostRuntime(native, manifest, new TrustedRuleArtifact(artifactRoot, Fixtures.GameId, "test", "expedition_2", "expedition_v2", RuleWireCodec.Digest(manifest)), catalog, RuleWireCodec.Digest(catalog), "expedition_v2", "expedition_view", 4);
var codec = new RuleWireCodec();
using RSA caKey = RSA.Create(2048), serverKey = RSA.Create(2048), clientKey = RSA.Create(2048);
var caRequest = new CertificateRequest("CN=Sample local probe CA", caKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
caRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
caRequest.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign, true));
// Test-only UTC validity; no keys are written to disk or installed in a certificate store.
DateTimeOffset utc = DateTimeOffset.UtcNow;
using var ca = caRequest.CreateSelfSigned(utc.AddMinutes(-5), utc.AddHours(2));
using var server = Certificate(serverKey, true);
using var client = Certificate(clientKey, false);
var roots = new X509Certificate2Collection(ca);
using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); int port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
var registration = new RuleTransportRegistration("sample_registration", 1, Fixtures.GameId, "test", "platform_1", "expedition_2", "expedition_v2", "expedition_rules",
    new Uri("https://localhost:" + port), new HashSet<string>(StringComparer.Ordinal) { RuleTlsPeer.Pin(client) }, new HashSet<string>(StringComparer.Ordinal) { RuleTlsPeer.Pin(server) },
    1_799_999_900_000, 1_800_000_900_000, false);
var clock = new ProbeTime();
await using var host = RuleHttpHost.Create(port, server, roots, (id, revision, _) => ValueTask.FromResult<RuleTransportRegistration?>(id == registration.Id && revision == registration.Revision ? registration : null), runtime.InvokeAsync, codec, clock);
await host.StartAsync();
var transport = new RuleHttpTransport(codec, clock, roots);
var cases = new List<object>();
var snapshot = Fixtures.Snapshot(3);
var subject = Fixtures.Subject(snapshot);
var empty = Fixtures.Snapshot() with { StateRevision = 0, State = new() { Documents = [] } };
var emptySubject = subject with { StateExists = false, Reference = Fixtures.Json(null), Snapshot = empty, SnapshotDigest = RuleWireCodec.Digest(JsonSerializer.SerializeToUtf8Bytes(empty)) };
await Call("project_empty", "project", new RuleProjectRequest { Entrypoint = "project", Bindings = Fixtures.ServiceBindings, Subject = emptySubject, ViewSchemaId = "expedition_view" });
await Call("prepare_begin", "prepare", new RulePrepareRequest { Entrypoint = "prepare", Bindings = Fixtures.ServiceBindings, Subject = emptySubject,
    ActionBody = "{\"operationId\":\"begin_1\",\"operationEpoch\":\"epoch_1\",\"expectedRevision\":0,\"action\":\"begin\",\"arguments\":{}}", Facts = [] });
await Call("evaluate_begin", "evaluate", Fixtures.Action("begin", empty) with { Bindings = Fixtures.Action("begin", empty).Bindings with { StateRevision = 0 } });
await Call("prepare", "prepare", new RulePrepareRequest { Entrypoint = "prepare", Bindings = Fixtures.ServiceBindings, Subject = subject,
    ActionBody = "{\"operationId\":\"op_1\",\"operationEpoch\":\"epoch_1\",\"expectedRevision\":1,\"action\":\"explore\",\"arguments\":{\"route\":\"ridge\"}}", Facts = [new() { EntitlementKey = Fixtures.OpportunityKey, NextDrawIndex = 0, Eligible = true }] });
await Call("evaluate_claim", "evaluate", Fixtures.Action("claim_supplies"));
await Call("evaluate", "evaluate", Fixtures.Action("explore", snapshot, new { route = "ridge" }));
await Call("project", "project", new RuleProjectRequest { Entrypoint = "project", Bindings = Fixtures.ServiceBindings, Subject = subject, ViewSchemaId = "expedition_view" });
var prior = snapshot with { State = new() { Documents = [Fixtures.State(0, 0, true, "expedition_v1")] } };
await Call("migrate", "migrate", new RuleMigrateRequest { Entrypoint = "migrate", Bindings = Fixtures.ServiceBindings, Subject = Fixtures.Subject(prior), FromStateSchemaId = "expedition_v1", ToStateSchemaId = "expedition_v2" });
await Call("bind", "bind", new RuleBindRequest { Entrypoint = "bind", Bindings = Fixtures.ServiceBindings, Source = subject, Target = Fixtures.Subject(Fixtures.Snapshot(), "account_1", "save_2"),
    Selection = new() { BindingId = "bind_1", SourceReference = Fixtures.Json("save_1"), TargetReference = Fixtures.Json("save_2"), SelectedReference = "save_2" }, ToStateSchemaId = "expedition_v2",
    History = new() { LedgerEvents = [new() { EventId = "grant_1", SubjectId = "guest_1", DefinitionId = "supplies", QualificationKey = "starter_v1", CanonicalQualificationKey = "starter_v1", Kind = "grant", Quantity = 3, CommittedAtMs = 1_800_000_000_000 }], RankEvents = [] } });
try
{
    await transport.InvokeAsync(registration, "evaluate", JsonSerializer.SerializeToUtf8Bytes(Fixtures.Action("claim_supplies", arguments: new { score = 999 })), client, 1_800_000_030_000, CancellationToken.None);
    throw new InvalidOperationException("Forged value was accepted.");
}
catch (RuleProtocolException failure) when (failure.Code == "gs_rule_transport_invalid") { cases.Add(new { id = "forged_final_value", rejected = failure.Code }); }
var cross = Fixtures.Action("claim_supplies") with { Bindings = Fixtures.Action("claim_supplies").Bindings with { Environment = "production" } };
try { await transport.InvokeAsync(registration, "evaluate", JsonSerializer.SerializeToUtf8Bytes(cross), client, 1_800_000_030_000, CancellationToken.None); throw new InvalidOperationException("Cross environment accepted."); }
catch (RuleProtocolException failure) when (failure.Code == "gs_rule_binding_mismatch") { cases.Add(new { id = "cross_environment", rejected = failure.Code }); }
await host.StopAsync();
var evidence = new { runtime.Evidence, tls = "TLS1.3 mTLS pinned client/server", cases, scope = "Real rule host and Native only; no Platform DB transaction or session proof claim" };
await File.WriteAllTextAsync(Path.Combine(scratch, "evidence.json"), JsonSerializer.Serialize(evidence, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine(JsonSerializer.Serialize(new { passed = cases.Count, evidence = Path.Combine(scratch, "evidence.json"), runtime.Evidence }));

async Task Call(string id, string entrypoint, object request)
{
    var result = await transport.InvokeAsync(registration, entrypoint, JsonSerializer.SerializeToUtf8Bytes(request), client, 1_800_000_030_000, CancellationToken.None);
    using var response = JsonDocument.Parse(result.Bytes);
    if (response.RootElement.TryGetProperty("denial", out _)) throw new InvalidOperationException("Unexpected denial: " + id);
    cases.Add(new { id, entrypoint, requestDigest = result.RequestDigest, responseDigest = result.ResponseDigest, response = response.RootElement.Clone() });
}
X509Certificate2 Certificate(RSA key, bool isServer)
{
    var request = new CertificateRequest(isServer ? "CN=localhost" : "CN=sample-platform", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
    request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
    request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new(isServer ? "1.3.6.1.5.5.7.3.1" : "1.3.6.1.5.5.7.3.2") }, true));
    if (isServer) { var san = new SubjectAlternativeNameBuilder(); san.AddDnsName("localhost"); request.CertificateExtensions.Add(san.Build()); }
    using var issued = request.Create(ca, utc.AddMinutes(-2), utc.AddHours(1), RandomNumberGenerator.GetBytes(16));
    using var keyed = issued.CopyWithPrivateKey(key);
    byte[] encoded = keyed.Export(X509ContentType.Pfx);
    try { return X509CertificateLoader.LoadPkcs12(encoded, null, X509KeyStorageFlags.DefaultKeySet); }
    finally { CryptographicOperations.ZeroMemory(encoded); }
}
internal sealed class ProbeTime : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => DateTimeOffset.FromUnixTimeMilliseconds(1_800_000_000_000);
}
