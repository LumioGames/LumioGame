// Closed display contracts only; no gameplay, session, World or public wire state.
#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using Lumio.GameRuntime.Ecs;
using Lumio.Config.Generated.Client;

namespace Lumio.Bomber.Client.Spectator;

// Trace fields are display-only. Every ulong is formatted as an invariant decimal string.
internal sealed class InputTraceBatchDto
{
    public required int version { get; init; }
    public required bool enabled { get; init; }
    public required string hostLifetime { get; init; }
    public required string clockDomain { get; init; }
    public required string clockFrequency { get; init; }
    public required bool complete { get; init; }
    public required string eventLoss { get; init; }
    public required string pendingLoss { get; init; }
    public required string unmatched { get; init; }
    public required string diagnosticFailures { get; init; }
    public required int pending { get; init; }
    public InputTraceEventDto? traceOverflow { get; init; }
    public required List<InputTraceEventDto> events { get; init; }
    public FacadeTickTimingDto? facadeTiming { get; init; }
    public string facadeTimingLoss { get; init; } = "0";
    public string facadeTimingDiagnosticFailures { get; init; } = "0";
}

internal sealed class FacadeTickTimingDto
{
    public int version { get; init; } = 1;
    public required string ordinal { get; init; }
    public required bool completed { get; init; }
    public required bool sessionInvoked { get; init; }
    public string? failedPhase { get; init; }
    public required FacadePhaseTimingDto preIdentity { get; init; }
    public FacadePhaseTimingDto? sessionTick { get; init; }
    public FacadePhaseTimingDto? postIdentityCleanup { get; init; }
}

internal sealed class FacadePhaseTimingDto
{
    public string? startedStamp { get; init; }
    public string? endedStamp { get; init; }
}

internal sealed class InputTraceEventDto
{
    public required string k { get; init; }
    public required string stamp { get; init; }
    public string? sampleId { get; init; }
    public string? managerId { get; init; }
    public string? sessionGeneration { get; init; }
    public string? bindingGeneration { get; init; }
    public string? self { get; init; }
    public string? matchId { get; init; }
    public string? ordinal { get; init; }
    public int? primary { get; init; }
    public int? secondary { get; init; }
    public bool? turn { get; init; }
    public int? bombPress { get; init; }
    public int? bombRelease { get; init; }
    public bool? skill { get; init; }
    public string? ability { get; init; }
    public string? sender { get; init; }
    public string? wireGeneration { get; init; }
    public string? sequence { get; init; }
    public int? commandCount { get; init; }
    public string? mappingId { get; init; }
    public string[]? commandMappingIds { get; init; }
    public int? encodedLength { get; init; }
    public string? encodedSha256 { get; init; }
    public string? reason { get; init; }
}

internal sealed class OwnerPresentationDto
{
    public required string sessionGeneration { get; init; }
    public required string entity { get; init; }
    public required string connectionGeneration { get; init; }
    public required string publicationSequence { get; init; }
    public required string localStepOrdinal { get; init; }
    public required string executionTick { get; init; }
    public required string inputSequence { get; init; }
    public required string cause { get; init; }
    public required PresentationPoseDto target { get; init; }
    public required PresentationPoseDto model { get; init; }

    public static OwnerPresentationDto From(ulong generation, OwnerPresentationPose pose) => new()
    {
        sessionGeneration = generation.ToString(CultureInfo.InvariantCulture), entity = pose.Entity.ToHex(),
        connectionGeneration = pose.ConnectionGeneration.ToString(CultureInfo.InvariantCulture),
        publicationSequence = pose.PublicationSequence.ToString(CultureInfo.InvariantCulture),
        localStepOrdinal = pose.LocalStepOrdinal.ToString(CultureInfo.InvariantCulture),
        executionTick = pose.ExecutionTick.ToString(CultureInfo.InvariantCulture),
        inputSequence = pose.InputSequence.ToString(CultureInfo.InvariantCulture), cause = pose.Cause.ToString(),
        target = PresentationPoseDto.From(pose.Target), model = PresentationPoseDto.From(pose.Model),
    };
}

internal sealed class PresentationPoseDto
{
    public required PresentationPositionDto position { get; init; }
    public required PresentationRotationDto rotation { get; init; }
    public static PresentationPoseDto From(Pose pose) => new()
    {
        position = new() { x = pose.Position.X, y = pose.Position.Y, z = pose.Position.Z },
        rotation = new() { x = pose.Rotation.X, y = pose.Rotation.Y, z = pose.Rotation.Z, w = pose.Rotation.W },
    };
}

internal sealed class PresentationPositionDto
{
    public required float x { get; init; }
    public required float y { get; init; }
    public required float z { get; init; }
}

internal sealed class PresentationRotationDto
{
    public required float x { get; init; }
    public required float y { get; init; }
    public required float z { get; init; }
    public required float w { get; init; }
}

internal sealed class SelectionConfigDto
{
    public required int mapSize { get; init; }
    public required int groundLayer { get; init; }
    public required int obstacleLayer { get; init; }
    public required uint tickRateHz { get; init; }
    public required uint fuseMs { get; init; }
    public required uint dangerWindowMs { get; init; }
    public required long initialBombPower { get; init; }
    public required long initialBombCapacity { get; init; }
    public required long maxHealthPoints { get; init; }
    public required int healthPointsPerHeart { get; init; }
    public required uint respawnMs { get; init; }
    public required uint respawnProtectionMs { get; init; }
    public required uint matchDurationMs { get; init; }
    public required uint inputBufferMs { get; init; }
    public required uint drownIntervalMs { get; init; }
    public required long drownPointsPerInterval { get; init; }
    public required int dropRatePermille { get; init; }
    public required int coverReachCells { get; init; }
    public required int[] speedTierToCellsPerSecond { get; init; }
    public required GameRow game { get; init; }
    public required MovementRow movement { get; init; }
    public required LifeRow life { get; init; }
    public required BombRow bomb { get; init; }
    public required DropsRow drops { get; init; }
    public required MapRow map { get; init; }
    public required RegenerationRow regeneration { get; init; }
    public required FinalCircleRow finalCircle { get; init; }
    public required ChestRow chest { get; init; }
    public required SkillRulesRow skillRules { get; init; }
    public required PresentationRow presentation { get; init; }
    public required IReadOnlyList<CharactersRow> characters { get; init; }
    public required IReadOnlyList<SkillsRow> skills { get; init; }
    public required IReadOnlyList<BombKindsRow> bombKinds { get; init; }
    public required IReadOnlyList<SkillLevelsRow> skillLevels { get; init; }
    public required IReadOnlyList<SkillCombosRow> skillCombos { get; init; }
    public required IReadOnlyList<BlocksRow> blocks { get; init; }
    public required IReadOnlyList<AttributesRow> attributes { get; init; }
    public required IReadOnlyList<CircleStagesRow> circleStages { get; init; }
    public required IReadOnlyList<ChestRow> resourceTiers { get; init; }
}

internal sealed class MissingPresentationDto
{
    public required string tick { get; init; }
    public required string? selfId { get; init; }
    public required PresentationMatchDto? match { get; init; }
    public required SelectionConfigDto? config { get; init; }
    public required IReadOnlyList<PresentationPlayerDto> players { get; init; }
    public required IReadOnlyList<PresentationParticipantDto> participants { get; init; }
    public required IReadOnlyList<PresentationBombDto> bombs { get; init; }
    public required IReadOnlyList<PresentationPickupDto> pickups { get; init; }
    public required IReadOnlyList<PresentationChestDto> chests { get; init; }
    public required IReadOnlyList<PresentationFireZoneDto> fireZones { get; init; }
    public required IReadOnlyList<string> events { get; init; }
    public required PresentationResultsDto? results { get; init; }
}

internal sealed class PresentationStateDto
{
    public required string tick { get; init; }
    public required string? selfId { get; init; }
    public required PresentationMatchDto? match { get; init; }
    public required List<PresentationPlayerDto> players { get; init; }
    public required List<PresentationParticipantDto> participants { get; init; }
    public required List<PresentationBombDto> bombs { get; init; }
    public required List<PresentationPickupDto> pickups { get; init; }
    public required List<PresentationChestDto> chests { get; init; }
    public required List<string> unpositionedChests { get; init; }
    public required List<PresentationFireZoneDto> fireZones { get; init; }
    public required List<PresentationStatisticsDto> statistics { get; init; }
    public required List<string> events { get; init; }
    public required PresentationResultsDto? results { get; init; }
    public required SelectionConfigDto config { get; init; }
}

internal sealed class PresentationPlayerDto
{
    public required string id { get; init; }
    public required float x { get; init; }
    public required float y { get; init; }
    public required float z { get; init; }
    public required string name { get; init; }
    public required string? participantId { get; init; }
    public required int participantIndex { get; init; }
    public required int lifePhase { get; init; }
    public required string lifeGeneration { get; init; }
    public required int facing { get; init; }
    public required int hatCount { get; init; }
    public required int maximumHealth { get; init; }
    public required int goldenHeartCount { get; init; }
    public required string respawnAtTick { get; init; }
    public required string protectedUntilTick { get; init; }
    public required string eliminatedTick { get; init; }
    public required AttributesDto attributes { get; init; }
    public required AttributesDto? baseAttributes { get; init; }
    public required PlayerSkillsDto skills { get; init; }
}

internal sealed class AttributesDto
{
    public required long health { get; init; }
    public required long power { get; init; }
    public required long speed { get; init; }
    public required long availableBombs { get; init; }
}

internal sealed class PlayerSkillsDto
{
    public required uint characterId { get; init; }
    public required uint bombSkillId { get; init; }
    public required int bombSkillLevel { get; init; }
    public required bool bombSkillBound { get; init; }
    public required uint activeSkillId { get; init; }
    public required int activeSkillLevel { get; init; }
    public required bool activeSkillBound { get; init; }
    public required uint passiveSkillId { get; init; }
    public required int passiveSkillLevel { get; init; }
    public required bool passiveSkillBound { get; init; }
    public required string? cooldownFromTick { get; init; }
    public required string? cooldownUntilTick { get; init; }
    public required string bubbleUntilTick { get; init; }
    public required string auraUntilTick { get; init; }
    public required string frozenUntilTick { get; init; }
    public required string toxinUntilTick { get; init; }
    public required string shockUntilTick { get; init; }
    public required string teleportSequence { get; init; }
}

internal sealed class PresentationParticipantDto
{
    public required string id { get; init; }
    public required int slot { get; init; }
    public required string matchId { get; init; }
    public required string? currentLife { get; init; }
    public required string? lastLife { get; init; }
    public required int lifePhase { get; init; }
    public required string deathTick { get; init; }
    public required string respawnAtTick { get; init; }
    public required string eliminatedTick { get; init; }
}

internal sealed class PresentationBombDto
{
    public required string id { get; init; }
    public required float x { get; init; }
    public required float y { get; init; }
    public required float z { get; init; }
    public required string? owner { get; init; }
    public required string fuseEndTick { get; init; }
    public required int power { get; init; }
    public required string chainId { get; init; }
    public required int bombKind { get; init; }
    public required int pierceLayers { get; init; }
    public required int phase { get; init; }
    public required string explodedAtTick { get; init; }
    public required string dangerUntilTick { get; init; }
    public required string burnUntilTick { get; init; }
    public required int reachUp { get; init; }
    public required int reachDown { get; init; }
    public required int reachLeft { get; init; }
    public required int reachRight { get; init; }
    public required int kickDirection { get; init; }
    public required int kickRange { get; init; }
    public required string kickStartTick { get; init; }
}

internal sealed class PresentationPickupDto
{
    public required string id { get; init; }
    public required float x { get; init; }
    public required float y { get; init; }
    public required float z { get; init; }
    public required int kind { get; init; }
    public required uint skillId { get; init; }
    public required int skillLevel { get; init; }
    public required string? droppedBy { get; init; }
    public required string protectedUntilTick { get; init; }
    public required string spawnTick { get; init; }
    public required int phase { get; init; }
}

internal sealed class PresentationChestDto
{
    public required string id { get; init; }
    public required float x { get; init; }
    public required float y { get; init; }
    public required float z { get; init; }
    public required int requiredHits { get; init; }
    public required int remainingHits { get; init; }
    public required uint resourceTier { get; init; }
    public required int phase { get; init; }
}

internal sealed class PresentationFireZoneDto
{
    public required string id { get; init; }
    public required float x { get; init; }
    public required float y { get; init; }
    public required float z { get; init; }
    public required string? owner { get; init; }
    public required uint sourceSkill { get; init; }
    public required string fromTick { get; init; }
    public required string untilTick { get; init; }
    public required int direction { get; init; }
    public required int length { get; init; }
    public required int phase { get; init; }
    public required bool regionCoverage { get; init; }
    public required int coverageMask { get; init; }
    public required string? sourceLife { get; init; }
    public required string sourceGeneration { get; init; }
    public required string sourceMatchId { get; init; }
    public required string sourceChainId { get; init; }
}

internal sealed class PresentationFinalCircleDto
{
    public required string triggerTick { get; init; }
    public required int triggerReason { get; init; }
    public required int initialResourceCount { get; init; }
    public required int remainingResourceCount { get; init; }
    public required int currentStageId { get; init; }
    public required int nextStageId { get; init; }
    public required int currentSide { get; init; }
    public required int nextSide { get; init; }
    public required string nextAnnounceTick { get; init; }
    public required string nextEffectiveTick { get; init; }
}

internal sealed class PresentationMatchDto
{
    public required string id { get; init; }
    public required string matchId { get; init; }
    public required string matchIndex { get; init; }
    public required int phase { get; init; }
    public required string startTick { get; init; }
    public required string endTick { get; init; }
    public required string phaseEndTick { get; init; }
    public required string? hatKing { get; init; }
    public required string? winner { get; init; }
    public required int endReason { get; init; }
    public required int survivorCount { get; init; }
    public required PresentationFinalCircleDto? finalCircle { get; init; }
}

internal sealed class PresentationStatisticsDto
{
    public required string participant { get; init; }
    public required int kills { get; init; }
    public required int bombs { get; init; }
    public required int destroyedBlocks { get; init; }
    public required int pickups { get; init; }
    public required int bestChain { get; init; }
    public required int peakHats { get; init; }
    public required int skillCasts { get; init; }
    public required int evolutions { get; init; }
    public required string hatKingTicks { get; init; }
    public required int character { get; init; }
    public required int deaths { get; init; }
    public required int peakHealthPoints { get; init; }
    public required int bossKills { get; init; }
    public required int clutchEscapes { get; init; }
    public required int goldenHeartPickups { get; init; }
    public required uint[] specialBombHistory { get; init; }
}

internal sealed class PresentationResultsDto
{
    public required string matchId { get; init; }
    public required string endTick { get; init; }
    public required int endReason { get; init; }
    public required string? winner { get; init; }
    public required List<PresentationResultRowDto> rows { get; init; }
}

internal sealed class PresentationResultRowDto
{
    public required string? participant { get; init; }
    public required string? life { get; init; }
    public required int slot { get; init; }
    public required int rank { get; init; }
    public required bool survived { get; init; }
    public required int finalHats { get; init; }
    public required string eliminatedTick { get; init; }
    public required int character { get; init; }
    public required int kills { get; init; }
    public required int bombs { get; init; }
    public required int destroyedBlocks { get; init; }
    public required int pickups { get; init; }
    public required int bestChain { get; init; }
    public required int peakHats { get; init; }
    public required int skillCasts { get; init; }
    public required int evolutions { get; init; }
    public required string hatKingTicks { get; init; }
    public required int deaths { get; init; }
    public required int peakHealthPoints { get; init; }
    public required int bossKills { get; init; }
    public required int clutchEscapes { get; init; }
    public required int goldenHeartPickups { get; init; }
    public required uint[] specialBombHistory { get; init; }
}

internal sealed class PlayerStateDto
{
    public required string connectionState { get; init; }
    public required bool inputEnabled { get; init; }
    public required bool inputOpen { get; init; }
    public required string? selfId { get; init; }
    public required string? participantId { get; init; }
    public required string? matchId { get; init; }
    public required string? phase { get; init; }
    public required string? lifePhase { get; init; }
    public required string? characterName { get; init; }
    public required long? availableBombs { get; init; }
    public required string authorityTick { get; init; }
    public required string appliedInputSequence { get; init; }
    public required ulong? tickRateHz { get; init; }
    public required List<PlayerBombDto> bombs { get; init; }
}

internal sealed class PlayerBombDto
{
    public required string id { get; init; }
    public required string? ownerId { get; init; }
    public required string? sourceLifeId { get; init; }
    public required float x { get; init; }
    public required float z { get; init; }
}

internal sealed class SessionStateDto
{
    public required string state { get; init; }
    public required bool inputEnabled { get; init; }
    public required bool closed { get; init; }
    public required string generation { get; init; }
    public required int notServingCloses { get; init; }
    public required ulong sentInputs { get; init; }
    public required string lastError { get; init; }
}

internal sealed class ReadBoxDto
{
    public required IEnumerable<ReadBoxCellDto> cells { get; init; }
    public required IEnumerable<ReadBoxSectionDto> sections { get; init; }
}

internal sealed class ReadBoxCellDto
{
    public required bool hasBlockId { get; init; }
    public required uint blockId { get; init; }
    public required string presence { get; init; }
}

internal sealed class ReadBoxSectionDto
{
    public required int x { get; init; }
    public required int y { get; init; }
    public required int z { get; init; }
    public required string revision { get; init; }
    public required string presence { get; init; }
}

internal sealed class LoadedModuleDto
{
    public required string? name { get; init; }
    public required Guid mvid { get; init; }
    public required string path { get; init; }
}
