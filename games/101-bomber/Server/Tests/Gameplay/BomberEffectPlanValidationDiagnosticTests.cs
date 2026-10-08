using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberEffectPlanValidationDiagnosticTests
{
    private const BindingFlags All = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
    private static readonly JsonSerializerOptions ReportOptions = new() { WriteIndented = true };

    [Fact]
    public void ActualOfficialProgramsExposeValidationAndStructuralCostsWithoutChangingTheirImages()
    {
        // This is the official unstarted World shell, not a replacement registry
        // or a substitute validator. No Tick, Native startup or gameplay outcome
        // is claimed by this static registration diagnostic.
        var factory = typeof(WorldManager).GetMethod("CreateShell", All)!;
        using var manager = (WorldManager)factory.Invoke(null, new object?[]
        {
            GeneratedRegistry.Instance, 101UL, NullLoggerFactory.Instance, null, BomberConfigBinding.Load(), null,
        })!;
        new BomberConfigBinding().BindWorld(manager.World);
        Assembly gasAssembly = typeof(GasWorldContext).Assembly;
        Type programType = gasAssembly.GetType("Lumio.GameRuntime.Gas.EffectOperationProgram", true)!;
        Type bindingsType = gasAssembly.GetType("Lumio.GameRuntime.Gas.EffectOperationBindings", true)!;
        Type validatorType = gasAssembly.GetType("Lumio.GameRuntime.Gas.EffectOperationValidation", true)!;
        int resultLimit = GasWorldContext.Require(manager.World).EffectLimits.ResultRecords;
        var reports = new List<object>();
        int failures = 0;
        foreach (FieldInfo encodedField in typeof(GeneratedEffectReducers).GetFields(All)
            .Where(field => field.IsLiteral && field.Name.StartsWith("Plan", StringComparison.Ordinal)).OrderBy(field => field.Name))
        {
            byte[] encoded = Convert.FromBase64String((string)encodedField.GetRawConstantValue()!);
            using var document = JsonDocument.Parse(encoded.AsMemory(4));
            object[] data = document.RootElement.EnumerateArray().Select(element => (object)element.Clone()).ToArray();
            object Program() => programType.GetMethod("FromData", All)!.Invoke(null, new object[] { data })!;
            object Bindings(object program) => Activator.CreateInstance(bindingsType, All, null,
                new[] { (object)manager.World, program, null! }, null)!;
            object Validator(object program, object bindings) => Activator.CreateInstance(validatorType, All, null,
                new object?[] { program, bindings, resultLimit, null, null }, null)!;
            object original = Program(), originalBindings = Bindings(original);
            string? validationError = null;
            try { _ = validatorType.GetMethod("Validate", All)!.Invoke(Validator(original, originalBindings), null); }
            catch (TargetInvocationException error)
            {
                validationError = error.InnerException?.ToString() ?? error.ToString();
                failures++;
            }

            // Invoke the very same official Block calculation separately. This
            // records its real cost before the final declared-quota comparison.
            // Original program, bindings and limits are never patched.
            object probe = Program(), probeBindings = Bindings(probe), validator = Validator(probe, probeBindings);
            object state = Activator.CreateInstance(validatorType.GetNestedType("State", All)!, nonPublic: true)!;
            object? cost = null;
            string? structuralError = null;
            try { cost = validatorType.GetMethod("Block", All)!.Invoke(validator,
                new[] { programType.GetField("Body", All)!.GetValue(probe)!, state, (object)1 }); }
            catch (TargetInvocationException error) { structuralError = error.InnerException?.ToString() ?? error.ToString(); }
            var costs = new Dictionary<string, object?>();
            var fieldCharges = new List<object>();
            if (cost is not null)
            {
                foreach (string name in new[] { "Work", "Writes", "Indexed", "Bytes", "Returns" })
                    costs[name] = cost.GetType().GetProperty(name, All)!.GetValue(cost);
                int[] indices = (int[])bindingsType.GetField("RegistryFieldIndices", All)!.GetValue(probeBindings)!;
                int[] maxima = (int[])bindingsType.GetField("MaxFieldWrites", All)!.GetValue(probeBindings)!;
                Array fields = (Array)bindingsType.GetField("Fields", All)!.GetValue(probeBindings)!;
                foreach (var entry in (Dictionary<int, ulong>)cost.GetType().GetProperty("Fields", All)!.GetValue(cost)!)
                {
                    int index = Array.IndexOf(indices, entry.Key);
                    object field = fields.GetValue(index)!;
                    fieldCharges.Add(new { registryField = entry.Key, name = field.GetType().GetProperty("Field", All)!.GetValue(field),
                        writes = entry.Value, declared = maxima[index] });
                }
            }
            reports.Add(new
            {
                constant = encodedField.Name, name = document.RootElement[2].GetString(), resultLimit,
                imageSha256 = Convert.ToHexString(SHA256.HashData(encoded)).ToLowerInvariant(),
                limits = document.RootElement[8].Clone(), validationError, structuralError, costs, fieldCharges,
                depth = validatorType.GetField("_depth", All)!.GetValue(validator),
            });
            Assert.Equal(encoded, Convert.FromBase64String((string)encodedField.GetRawConstantValue()!));
        }
        string report = JsonSerializer.Serialize(reports, ReportOptions);
        string directory = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".run", "v14-native-production-20261003");
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, $"official-plan-validation-{Guid.NewGuid():N}.json");
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write))
        using (var writer = new StreamWriter(stream)) writer.Write(report);
        Assert.Equal(5, reports.Count);
        Assert.True(failures == 0, $"Official validation diagnostic: {path}\n{report}");
    }

    [Theory]
    [InlineData(400)]
    [InlineData(704)]
    public void ActualOfficialProgramsFitPublicWorkLimitAtProposedRegistrationResultContexts(int proposedContextResultLimit)
    {
        // These are structural registration contexts only. Neither value proves
        // a production live/pending/control cohort or starts Native gameplay.
        // The generated image, world configuration and public quota are immutable.
        var factory = typeof(WorldManager).GetMethod("CreateShell", All)!;
        using var manager = (WorldManager)factory.Invoke(null, new object?[]
        {
            GeneratedRegistry.Instance, 101UL, NullLoggerFactory.Instance, null, BomberConfigBinding.Load(), null,
        })!;
        new BomberConfigBinding().BindWorld(manager.World);
        Assembly gasAssembly = typeof(GasWorldContext).Assembly;
        Type programType = gasAssembly.GetType("Lumio.GameRuntime.Gas.EffectOperationProgram", true)!;
        Type bindingsType = gasAssembly.GetType("Lumio.GameRuntime.Gas.EffectOperationBindings", true)!;
        Type validatorType = gasAssembly.GetType("Lumio.GameRuntime.Gas.EffectOperationValidation", true)!;
        var encodedFields = typeof(GeneratedEffectReducers).GetFields(All)
            .Where(field => field.IsLiteral && field.Name.StartsWith("Plan", StringComparison.Ordinal))
            .OrderBy(field => field.Name).ToArray();
        var reports = new List<object>();
        var errors = new List<string>();
        var programNames = new List<string>();
        foreach (FieldInfo encodedField in encodedFields)
        {
            string originalBase64 = (string)encodedField.GetRawConstantValue()!;
            byte[] encoded = Convert.FromBase64String(originalBase64);
            using var document = JsonDocument.Parse(encoded.AsMemory(4));
            JsonElement root = document.RootElement;
            string programName = root[2].GetString()!;
            programNames.Add(programName);
            object[] data = root.EnumerateArray().Select(element => (object)element.Clone()).ToArray();
            object Program() => programType.GetMethod("FromData", All)!.Invoke(null, new object[] { data })!;
            object Bindings(object program) => Activator.CreateInstance(bindingsType, All, null,
                new[] { (object)manager.World, program, null! }, null)!;
            object Validator(object program, object bindings) => Activator.CreateInstance(validatorType, All, null,
                new object?[] { program, bindings, proposedContextResultLimit, null, null }, null)!;

            object original = Program(), originalBindings = Bindings(original);
            object fullValidator = Validator(original, originalBindings);
            object? fullMetrics = null;
            string? validationError = null;
            try { fullMetrics = validatorType.GetMethod("Validate", All)!.Invoke(fullValidator, null); }
            catch (TargetInvocationException error)
            {
                validationError = error.InnerException?.ToString() ?? error.ToString();
                errors.Add($"{programName}: Validate failed");
            }

            // A fresh official parser/bindings/validator computes the actual body
            // before declared quota comparison. Block work excludes invocation and
            // field-counter initialization; fullMetrics is only official Validate.
            object probe = Program(), probeBindings = Bindings(probe), blockValidator = Validator(probe, probeBindings);
            object state = Activator.CreateInstance(validatorType.GetNestedType("State", All)!, nonPublic: true)!;
            object? bodyCost = null;
            string? structuralError = null;
            try { bodyCost = validatorType.GetMethod("Block", All)!.Invoke(blockValidator,
                new[] { programType.GetField("Body", All)!.GetValue(probe)!, state, (object)1 }); }
            catch (TargetInvocationException error)
            {
                structuralError = error.InnerException?.ToString() ?? error.ToString();
                errors.Add($"{programName}: Block failed");
            }
            var fieldCharges = new List<object>();
            if (bodyCost is not null)
            {
                int[] indices = (int[])bindingsType.GetField("RegistryFieldIndices", All)!.GetValue(probeBindings)!;
                int[] maxima = (int[])bindingsType.GetField("MaxFieldWrites", All)!.GetValue(probeBindings)!;
                Array fields = (Array)bindingsType.GetField("Fields", All)!.GetValue(probeBindings)!;
                foreach (var entry in (Dictionary<int, ulong>)bodyCost.GetType().GetProperty("Fields", All)!.GetValue(bodyCost)!)
                {
                    int index = Array.IndexOf(indices, entry.Key);
                    object field = fields.GetValue(index)!;
                    fieldCharges.Add(new
                    {
                        registryField = entry.Key, declared = maxima[index], writes = entry.Value,
                        name = field.GetType().GetProperty("Field", All)!.GetValue(field),
                        valueType = ((Type)field.GetType().GetProperty("ValueType", All)!.GetValue(field)!).FullName,
                        indexed = field.GetType().GetProperty("Indexed", All)!.GetValue(field),
                        capacity = field.GetType().GetProperty("Capacity", All)!.GetValue(field),
                    });
                }
            }
            if (root[8][3].GetUInt64() != 1_000_000UL)
                errors.Add($"{programName}: generated MaxWork changed from public 1000000");
            if (originalBase64 != (string)encodedField.GetRawConstantValue()!)
                errors.Add($"{programName}: generated image changed during diagnostic");
            reports.Add(new
            {
                constant = encodedField.Name, name = programName,
                diagnosticKind = "official_structural_registration_context_no_native_startup",
                proposedContextResultLimit,
                configuredWorldResultLimit = GasWorldContext.Require(manager.World).EffectLimits.ResultRecords,
                imageSha256 = Convert.ToHexString(SHA256.HashData(encoded)).ToLowerInvariant(),
                imageBase64 = originalBase64, encodedBytes = encoded.Length,
                schema = root[1].GetString(), revisions = root[0].Clone(),
                declaredLimits = root[8].Clone(), boundFieldCount = root[5].GetArrayLength(),
                factRowBindings = root[7].Clone(), validationError, structuralError,
                fullMetrics = DiagnosticMetrics(fullMetrics, "Work", "Writes", "Indexed", "Bytes", "Scratch", "Fields", "Attributes"),
                bodyCost = DiagnosticMetrics(bodyCost, "Work", "Writes", "Indexed", "Bytes", "Returns", "Fields"),
                fieldCharges,
                validationDepth = validatorType.GetField("_depth", All)!.GetValue(fullValidator),
                bodyDepth = validatorType.GetField("_depth", All)!.GetValue(blockValidator),
            });
        }
        string report = JsonSerializer.Serialize(reports, ReportOptions);
        string directory = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".run", "v14-native-production-20261003");
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, $"official-proposed-context-{proposedContextResultLimit}-{Guid.NewGuid():N}.json");
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write))
        using (var writer = new StreamWriter(stream)) writer.Write(report);
        Assert.NotEmpty(encodedFields);
        Assert.Equal(encodedFields.Length, reports.Count);
        Assert.Equal(programNames.Count, programNames.Distinct(StringComparer.Ordinal).Count());
        foreach (string required in new[] { "bomber.settlement", "bomber.health", "bomber.outcome", "bomber.fire", "bomber.fire-region" })
            Assert.Contains(required, programNames);
        Assert.True(errors.Count == 0, $"Official proposed-context diagnostic: {path}\n{string.Join("; ", errors)}\n{report}");
    }

    private static Dictionary<string, object?>? DiagnosticMetrics(object? metrics, params string[] names)
    {
        if (metrics is null) return null;
        return names.ToDictionary(name => name, name => metrics.GetType().GetProperty(name, All)!.GetValue(metrics));
    }

}
