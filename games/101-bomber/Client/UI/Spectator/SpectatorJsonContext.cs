#nullable enable
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Lumio.Bomber.Client.Spectator;

[JsonSourceGenerationOptions(GenerationMode = JsonSourceGenerationMode.Metadata,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.Never)]
[JsonSerializable(typeof(SelectionConfigDto))]
[JsonSerializable(typeof(MissingPresentationDto))]
[JsonSerializable(typeof(PresentationStateDto))]
[JsonSerializable(typeof(PlayerStateDto))]
[JsonSerializable(typeof(SessionStateDto))]
[JsonSerializable(typeof(OwnerPresentationDto))]
[JsonSerializable(typeof(InputTraceBatchDto))]
[JsonSerializable(typeof(ReadBoxDto))]
[JsonSerializable(typeof(IEnumerable<LoadedModuleDto>), TypeInfoPropertyName = "LoadedModules")]
[JsonSerializable(typeof(string))]
internal partial class SpectatorJsonContext : JsonSerializerContext { }
