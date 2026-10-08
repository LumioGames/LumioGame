using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Skill slots and observable effect projections; GAS owns effect lifetimes and modifiers.</summary>
[EcsComponent]
public sealed partial class BomberSkillState : Component
{
    [Persist] public Sync<uint> CharacterId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> BombSkillId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> BombSkillLevel = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<bool> BombSkillBound = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> ActiveSkillId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ActiveSkillLevel = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<bool> ActiveSkillBound = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> PassiveSkillId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> PassiveSkillLevel = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<bool> PassiveSkillBound = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> ComboSourceA = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> ComboSourceB = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ComboLevelA = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ComboLevelB = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> CooldownFromTick = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<ulong> CooldownUntilTick = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<ulong> BubbleUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> AuraUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> FrozenUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> FreezeImmuneUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> ToxinUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> ShockUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<NetEntityId> ToxinSource = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> LastDamageTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RegenNextTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> TeleportSequence = new(Scope.Aoi, Authority.Server);
    // Exact admitted request correlation and consumption witness; the Runtime finite row owns the lifetime.
    [Persist] public Sync<ulong> BubbleEffectWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BubbleEffectInstance = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> BubbleEffectGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BubbleDurationTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BubbleCooldownTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BubbleOutcome = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BubbleCastX = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BubbleCastZ = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FreezeRequestTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FreezeDurationTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FreezeImmunityDurationTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FreezeEffectWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FreezeEffectInstance = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> FreezeEffectGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FreezeImmunityEffectWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FreezeImmunityEffectInstance = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> FreezeImmunityEffectGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FireExposureFromTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FireExposureLastTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> FireExposureEntity = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> FireExposureParticipant = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> FireExposureLife = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FireExposureGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FireExposureMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FireExposureChainId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> FireExposureFamily = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> FireExposureKind = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FireExposureStartedTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> FireExposureSkill = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> FirePulseSequence = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> AuraChainId = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> AuraEffectWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> AuraEffectInstance = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> AuraEffectGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> AuraDurationTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> AuraCooldownTicks = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> AuraOutcome = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> AuraCastX = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> AuraCastZ = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> AuraFavorite = new(Scope.None, Authority.Server);
}
