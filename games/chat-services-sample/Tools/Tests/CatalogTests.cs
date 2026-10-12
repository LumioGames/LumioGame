using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lumio.Server.RuleService.Application;
using Lumio.Server.RuleService.Network;
using Xunit;

namespace Lumio.GameServices.Chat.Tests;

public sealed class CatalogTests
{
    internal static string SampleRoot => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
    [Theory]
    [InlineData("score")][InlineData("nextState")][InlineData("count")][InlineData("completed")][InlineData("serverTimeMs")][InlineData("random")]
    public void RegisteredArgumentsRejectForgedValuesBeforePlugin(string field)
    {
        var codec = new RuleWireCodec();
        using var catalog = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(SampleRoot, "Server/catalog.json")));
        var policy = new RuleCatalogPolicy(codec, catalog.RootElement, "chat_v1", "chat_view");
        var input = Fixtures.Action("send", arguments: JsonSerializer.Deserialize<JsonElement>("{\"" + field + "\":42}"));
        var failure = Assert.Throws<RuleProtocolException>(() => policy.ValidateRequest("evaluate", JsonSerializer.SerializeToUtf8Bytes(input)));
        Assert.Equal("gs_rule_source_invalid", failure.Code);
    }
    [Fact]
    public async Task RealCodecAndCatalogAcceptBeginAndSendCandidates()
    {
        var codec = new RuleWireCodec();
        using var catalog = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(SampleRoot, "Server/catalog.json")));
        var policy = new RuleCatalogPolicy(codec, catalog.RootElement, "chat_v1", "chat_view");
        foreach (var input in new[]
        {
            JsonSerializer.SerializeToUtf8Bytes(Fixtures.Action("begin", Fixtures.Empty())),
            JsonSerializer.SerializeToUtf8Bytes(Fixtures.Action("send", Fixtures.Snapshot(2), new { text = "你好" })),
        })
        {
            policy.ValidateRequest("evaluate", input);
            var result = await new RulePluginDispatcher(new ChatRules(), codec).InvokeAsync("evaluate", input, CancellationToken.None);
            policy.ValidateResponse("evaluate", input, result);
            Assert.DoesNotContain(new string('a', 64), Encoding.UTF8.GetString(JsonSerializer.SerializeToUtf8Bytes(JsonDocument.Parse(result).RootElement.GetProperty("decision").GetProperty("view"))), StringComparison.Ordinal);
        }
    }
    [Fact]
    public void EveryDeploymentProjectionUsesFrozenFieldSemanticsAndCompleteCoverage()
    {
        using var catalog = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(SampleRoot, "Server/catalog.json")));
        using var disclosure = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(SampleRoot, "Server/disclosure.json")));
        var contract = new RuleWireCodec().Contract;
        foreach (var row in disclosure.RootElement.GetProperty("rows").EnumerateArray())
        {
            var exit = contract.GetProperty("permissions").GetProperty("exits").GetProperty(row.GetProperty("exitId").GetString()!);
            Assert.Contains(exit.GetProperty("dynamicPaths").EnumerateArray(), p => p.GetString() == row.GetProperty("jsonPointer").GetString());
            var view = Assert.Single(catalog.RootElement.GetProperty("views").EnumerateArray(), v => v.GetProperty("id").GetString() == row.GetProperty("viewSchemaId").GetString());
            var bindings = row.GetProperty("bindings");
            Assert.Equal(view.GetProperty("fieldCatalog").GetArrayLength(), bindings.EnumerateObject().Count());
            foreach (var pointer in view.GetProperty("fieldCatalog").EnumerateArray())
            {
                var binding = bindings.GetProperty(pointer.GetString()!);
                var field = contract.GetProperty("permissions").GetProperty("fields").GetProperty(binding.GetProperty("fieldId").GetString()!);
                Assert.Equal(field.GetProperty("semanticRevision").GetInt64(), binding.GetProperty("semanticRevision").GetInt64());
                Assert.Contains(field.GetProperty("subjectSources").EnumerateArray(), s => s.GetString() == binding.GetProperty("subjectBinding").GetString());
                Assert.Equal(1, field.GetProperty("level").GetInt32());
            }
        }
    }
    [Fact]
    public async Task ChatOneMigrateProbePassesPolicyAndDispatcherThroughRegisteredSchemas()
    {
        var codec = new RuleWireCodec();
        using var catalog = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(SampleRoot, "Server/catalog.json")));
        var policy = new RuleCatalogPolicy(codec, catalog.RootElement, "chat_v1", "chat_view");
        byte[] input = JsonSerializer.SerializeToUtf8Bytes(new Lumio.GameServices.Contracts.RuleMigrateRequest
        { Entrypoint = "migrate", Bindings = Fixtures.ServiceBindings, Subject = Fixtures.Subject(Fixtures.Snapshot(1)), FromStateSchemaId = "chat_v1", ToStateSchemaId = "chat_v2" });
        policy.ValidateRequest("migrate", input);
        var result = await new RulePluginDispatcher(new ChatRules(), codec).InvokeAsync("migrate", input, CancellationToken.None);
        policy.ValidateResponse("migrate", input, result);
        Assert.Equal("chat_v2", JsonDocument.Parse(result).RootElement.GetProperty("result").GetProperty("changes").GetProperty("upserts")[0].GetProperty("schemaVersion").GetString());
    }
    [Fact]
    public void DeploymentBoardUsesTheFrozenPublicConfigurationSchema()
    {
        using var deployment = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(SampleRoot, "Server/deployment.json")));
        _ = new RuleWireCodec().Read("BoardConfiguration", Encoding.UTF8.GetBytes(deployment.RootElement.GetProperty("board").GetRawText()), 65536, "gs_invalid_request");
    }
}
