using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Components.Identity;

namespace Lumio.Bomber.Client.Spectator;

/// <summary>Immutable display data from the replica and its published owner pose. No gameplay runs here.</summary>
public static class PresentationDump
{
    private static string Tick(ulong value) => value.ToString(CultureInfo.InvariantCulture);
    private static string? Id(NetEntityId value) => value.IsDefault ? null : value.ToHex();

    public static string SelectionConfig() => JsonSerializer.Serialize(Config(SpectatorDump.LoadDisplayConfig()), SpectatorJsonContext.Default.SelectionConfigDto);
    public static string SelectionConfig(IBomberConfig config) => JsonSerializer.Serialize(Config(config), SpectatorJsonContext.Default.SelectionConfigDto);

    public static string Dump(World? world, string authorityTick)
    {
        if (world is null) return JsonSerializer.Serialize(new MissingPresentationDto { tick = authorityTick, selfId = null,
            match = null, config = null, players = Array.Empty<PresentationPlayerDto>(),
            participants = Array.Empty<PresentationParticipantDto>(), bombs = Array.Empty<PresentationBombDto>(), pickups = Array.Empty<PresentationPickupDto>(),
            chests = Array.Empty<PresentationChestDto>(), fireZones = Array.Empty<PresentationFireZoneDto>(), events = Array.Empty<string>(), results = null }, SpectatorJsonContext.Default.MissingPresentationDto);
        string? selfId = world.TryGetSelf(out Entity? self) && self is not null ? self.Id.ToHex() : null;
        var poses = new Dictionary<NetEntityId, System.Numerics.Vector3>();
        foreach (LogicTransform transform in world.Each<LogicTransform>()) poses[transform.Entity] = SpectatorDump.PublishedPosition(world, transform);
        var players = new List<PresentationPlayerDto>();
        foreach (BomberPlayerState p in world.Each<BomberPlayerState>())
        {
            if (!poses.TryGetValue(p.Entity, out var pos)) continue;
            var attributes = world.Get<AttributeComponent>(p.Entity);
            var skills = world.Get<BomberSkillState>(p.Entity);
            bool own = p.Entity.ToHex() == selfId;
            players.Add(new PresentationPlayerDto { id = p.Entity.ToHex(), x = pos.X, y = pos.Y, z = pos.Z,
                name = world.Get<IdentityComponent>(p.Entity).Name.Value, participantId = Id(p.Participant.Value),
                participantIndex = p.ParticipantIndex.Value, lifePhase = p.LifePhase.Value,
                lifeGeneration = Tick(p.LifeGeneration.Value), facing = p.Facing.Value, hatCount = p.HatCount.Value,
                maximumHealth = p.MaximumHealth.Value, goldenHeartCount = p.GoldenHeartCount.Value,
                respawnAtTick = Tick(p.RespawnAtTick.Value), protectedUntilTick = Tick(p.ProtectedUntilTick.Value),
                eliminatedTick = Tick(p.EliminatedTick.Value), attributes = Attributes(attributes, false),
                baseAttributes = own ? Attributes(attributes, true) : null,
                skills = new PlayerSkillsDto { characterId = skills.CharacterId.Value,
                    bombSkillId = skills.BombSkillId.Value, bombSkillLevel = skills.BombSkillLevel.Value, bombSkillBound = skills.BombSkillBound.Value,
                    activeSkillId = skills.ActiveSkillId.Value, activeSkillLevel = skills.ActiveSkillLevel.Value, activeSkillBound = skills.ActiveSkillBound.Value,
                    passiveSkillId = skills.PassiveSkillId.Value, passiveSkillLevel = skills.PassiveSkillLevel.Value, passiveSkillBound = skills.PassiveSkillBound.Value,
                    cooldownFromTick = own ? Tick(skills.CooldownFromTick.Value) : null,
                    cooldownUntilTick = own ? Tick(skills.CooldownUntilTick.Value) : null,
                    bubbleUntilTick = Tick(skills.BubbleUntilTick.Value), auraUntilTick = Tick(skills.AuraUntilTick.Value),
                    frozenUntilTick = Tick(skills.FrozenUntilTick.Value), toxinUntilTick = Tick(skills.ToxinUntilTick.Value),
                    shockUntilTick = Tick(skills.ShockUntilTick.Value), teleportSequence = Tick(skills.TeleportSequence.Value) } });
        }
        var participants = new List<PresentationParticipantDto>();
        foreach (BomberParticipantState p in world.Each<BomberParticipantState>())
            participants.Add(new PresentationParticipantDto { id = p.Entity.ToHex(), slot = p.Slot.Value, matchId = Tick(p.MatchId.Value),
                currentLife = Id(p.CurrentLife.Value), lastLife = Id(p.LastLife.Value), lifePhase = p.LifePhase.Value,
                deathTick = Tick(p.DeathTick.Value), respawnAtTick = Tick(p.RespawnAtTick.Value), eliminatedTick = Tick(p.EliminatedTick.Value) });
        var bombs = new List<PresentationBombDto>();
        foreach (BomberBombState b in world.Each<BomberBombState>())
        {
            if (!poses.TryGetValue(b.Entity, out var pos)) continue;
            bombs.Add(new PresentationBombDto { id = b.Entity.ToHex(), x = pos.X, y = pos.Y, z = pos.Z, owner = Id(b.Owner.Value),
                fuseEndTick = Tick(b.FuseEndTick.Value), power = b.Power.Value, chainId = Tick(b.ChainId.Value),
                bombKind = b.BombKind.Value, pierceLayers = b.PierceLayers.Value, phase = b.Phase.Value,
                explodedAtTick = Tick(b.ExplodedAtTick.Value), dangerUntilTick = Tick(b.DangerUntilTick.Value),
                burnUntilTick = Tick(b.BurnUntilTick.Value), reachUp = b.ReachUp.Value, reachDown = b.ReachDown.Value,
                reachLeft = b.ReachLeft.Value, reachRight = b.ReachRight.Value,
                kickDirection = b.KickDirection.Value, kickRange = b.KickRange.Value, kickStartTick = Tick(b.KickStartTick.Value) });
        }
        var pickups = new List<PresentationPickupDto>();
        foreach (BomberPickupItem p in world.Each<BomberPickupItem>())
        {
            if (!poses.TryGetValue(p.Entity, out var pos)) continue;
            pickups.Add(new PresentationPickupDto { id = p.Entity.ToHex(), x = pos.X, y = pos.Y, z = pos.Z, kind = p.Kind.Value,
                skillId = p.SkillId.Value, skillLevel = p.SkillLevel.Value, droppedBy = Id(p.DroppedBy.Value),
                protectedUntilTick = Tick(p.ProtectedUntilTick.Value), spawnTick = Tick(p.SpawnTick.Value), phase = p.Phase.Value });
        }
        var chests = new List<PresentationChestDto>();
        var unpositionedChests = new List<string>();
        var chestPoses = ChestPositions(world);
        foreach (BomberChestState c in world.Each<BomberChestState>())
        {
            if (!chestPoses.TryGetValue(c.Entity, out var pos)) { unpositionedChests.Add(c.Entity.ToHex()); continue; }
            chests.Add(new PresentationChestDto { id = c.Entity.ToHex(), x = pos.X, y = pos.Y, z = pos.Z,
                requiredHits = c.RequiredHits.Value, remainingHits = c.RemainingHits.Value,
                resourceTier = c.ResourceTier.Value, phase = c.Phase.Value });
        }
        var fireZones = new List<PresentationFireZoneDto>();
        foreach (BomberFireZoneState f in world.Each<BomberFireZoneState>())
        {
            if (!poses.TryGetValue(f.Entity, out var pos)) continue;
            fireZones.Add(new PresentationFireZoneDto { id = f.Entity.ToHex(), x = pos.X, y = pos.Y, z = pos.Z, owner = Id(f.Owner.Value),
                sourceSkill = f.SourceSkill.Value, fromTick = Tick(f.FromTick.Value), untilTick = Tick(f.UntilTick.Value),
                direction = f.Direction.Value, length = f.Length.Value, phase = f.Phase.Value,
                regionCoverage = f.RegionCoverage.Value, coverageMask = f.CoverageMask.Value,
                sourceLife = Id(f.SourceLife.Value), sourceGeneration = Tick(f.SourceLifeGeneration.Value),
                sourceMatchId = Tick(f.SourceMatchId.Value), sourceChainId = Tick(f.SourceChainId.Value) });
        }
        PresentationFinalCircleDto? circle = null;
        foreach (BomberFinalCircleState c in world.Each<BomberFinalCircleState>())
        {
            circle = new PresentationFinalCircleDto { triggerTick = Tick(c.TriggerTick.Value), triggerReason = c.TriggerReason.Value,
                initialResourceCount = c.InitialResourceCount.Value, remainingResourceCount = c.RemainingResourceCount.Value,
                currentStageId = c.CurrentStageId.Value, nextStageId = c.NextStageId.Value,
                currentSide = c.CurrentSide.Value, nextSide = c.NextSide.Value,
                nextAnnounceTick = Tick(c.NextAnnounceTick.Value), nextEffectiveTick = Tick(c.NextEffectiveTick.Value) };
            break;
        }
        PresentationMatchDto? match = null;
        ulong matchId = 0;
        foreach (BomberMatchState m in world.Each<BomberMatchState>())
        {
            matchId = m.MatchId.Value;
            match = new PresentationMatchDto { id = m.Entity.ToHex(), matchId = Tick(matchId), matchIndex = Tick(m.MatchIndex.Value),
                phase = m.Phase.Value, startTick = Tick(m.StartTick.Value), endTick = Tick(m.EndTick.Value),
                phaseEndTick = Tick(m.PhaseEndTick.Value), hatKing = Id(m.HatKing.Value), winner = Id(m.Winner.Value),
                endReason = m.EndReason.Value, survivorCount = m.SurvivorCount.Value, finalCircle = circle };
            break;
        }
        var statistics = new List<PresentationStatisticsDto>();
        foreach (BomberStatistics s in world.Each<BomberStatistics>())
            statistics.Add(new PresentationStatisticsDto { participant = s.Entity.ToHex(), kills = s.Kills.Value, bombs = s.Bombs.Value,
                destroyedBlocks = s.DestroyedBlocks.Value, pickups = s.Pickups.Value, bestChain = s.BestChain.Value,
                peakHats = s.PeakHats.Value, skillCasts = s.SkillCasts.Value, evolutions = s.Evolutions.Value,
                hatKingTicks = Tick(s.HatKingTicks.Value), character = s.CharacterId.Value,
                deaths = s.Deaths.Value, peakHealthPoints = s.PeakHealthPoints.Value, bossKills = s.BossKills.Value,
                clutchEscapes = s.ClutchEscapes.Value, goldenHeartPickups = s.GoldenHeartPickups.Value,
                specialBombHistory = s.SpecialBombHistory.Values.ToArray() });
        var events = new List<string>();
        foreach (BomberPresentationJournal journal in world.Each<BomberPresentationJournal>())
            for (int i = 0; i < journal.Entries.Count; i++) events.Add(journal.Entries[i]);
        return JsonSerializer.Serialize(new PresentationStateDto { tick = authorityTick, selfId = selfId, match = match, players = players, participants = participants, bombs = bombs,
            pickups = pickups, chests = chests, unpositionedChests = unpositionedChests, fireZones = fireZones, statistics = statistics, events = events, results = Results(world, matchId),
            config = Config(BomberConfigBinding.For(world)) }, SpectatorJsonContext.Default.PresentationStateDto);
    }

    private static Dictionary<NetEntityId, System.Numerics.Vector3> ChestPositions(World world)
    {
        var positions = new Dictionary<NetEntityId, System.Numerics.Vector3>();
        var identities = new HashSet<NetEntityId>(world.Each<BomberChestState>().Select(chest => chest.Entity));
        if (identities.Count == 0) return positions;
        var adapter = VoxelGameplayBinding.Resolve(world.Manager);
        if (adapter is null) return positions;
        var map = BomberConfigBinding.For(world).Map;
        byte sectionY = checked((byte)(map.ObstacleLayer >> 4));
        // Block entities have no LogicTransform: only the committed binding table owns their cell.
        for (int sectionZ = 0; sectionZ <= ((map.Depth - 1) >> 4); sectionZ++)
        for (int sectionX = 0; sectionX <= ((map.Width - 1) >> 4); sectionX++)
        {
            if (!adapter.TryReadSectionBindings(VoxelPackedSection.Encode(sectionX, sectionY, sectionZ),
                out var bindings, out _)) continue;
            foreach (var binding in bindings)
            {
                if (!identities.Contains(binding.Entity)) continue;
                int x = (sectionX << 4) + (binding.CellOffset & 15);
                int z = (sectionZ << 4) + ((binding.CellOffset >> 4) & 15);
                int y = (sectionY << 4) + (binding.CellOffset >> 8);
                if (x >= map.Width || z >= map.Depth || y != map.ObstacleLayer) continue;
                positions.Add(binding.Entity, new(x + 0.5f, y, z + 0.5f));
            }
        }
        return positions;
    }

    private static AttributesDto Attributes(AttributeComponent a, bool basis) => new AttributesDto {
        health = basis ? a.GetBaseValue(BomberAttributeNames.HealthPoints) : a.GetCurrentValue(BomberAttributeNames.HealthPoints),
        power = basis ? a.GetBaseValue(BomberAttributeNames.BombPower) : a.GetCurrentValue(BomberAttributeNames.BombPower),
        speed = basis ? a.GetBaseValue(BomberAttributeNames.MovementSpeedMilli) : a.GetCurrentValue(BomberAttributeNames.MovementSpeedMilli),
        availableBombs = basis ? a.GetBaseValue(BomberAttributeNames.AvailableBombs) : a.GetCurrentValue(BomberAttributeNames.AvailableBombs) };

    private static PresentationResultsDto? Results(World world, ulong matchId)
    {
        foreach (BomberResults r in world.Each<BomberResults>())
        {
            int header = -1;
            for (int i = 0; i < r.RetainedMatchIds.Count; i++) if (r.RetainedMatchIds[i] == matchId) header = i;
            if (header < 0) continue;
            var rows = new List<PresentationResultRowDto>();
            for (int i = 0; i < r.MatchIds.Count; i++)
            {
                if (r.MatchIds[i] != matchId) continue;
                rows.Add(new PresentationResultRowDto { participant = Id(r.Participants[i]), life = Id(r.Lives[i]), slot = r.Slots[i],
                    rank = r.Ranks[i], survived = r.Survived[i], finalHats = r.FinalHats[i],
                    eliminatedTick = Tick(r.EliminatedTicks[i]), character = r.Characters[i], kills = r.Kills[i],
                    bombs = r.Bombs[i], destroyedBlocks = r.DestroyedBlocks[i], pickups = r.Pickups[i],
                    bestChain = r.BestChains[i], peakHats = r.PeakHats[i], skillCasts = r.SkillCasts[i],
                    evolutions = r.Evolutions[i], hatKingTicks = Tick(r.HatKingTicks[i]),
                    deaths = r.Deaths[i], peakHealthPoints = r.PeakHealthPoints[i], bossKills = r.BossKills[i],
                    clutchEscapes = r.ClutchEscapes[i], goldenHeartPickups = r.GoldenHeartPickups[i],
                    specialBombHistory = BomberSpecialBombHistory.Decode(r.SpecialBombHistories[i]) });
            }
            return new PresentationResultsDto { matchId = Tick(matchId), endTick = Tick(r.EndTicks[header]),
                endReason = r.EndReasons[header], winner = Id(r.WinnerParticipants[header]), rows = rows };
        }
        return null;
    }

    private static SelectionConfigDto Config(IBomberConfig c) => new SelectionConfigDto {
        mapSize = c.Map.Width, groundLayer = c.Map.GroundLayer, obstacleLayer = c.Map.ObstacleLayer,
        tickRateHz = c.Game.TickRateHz, fuseMs = c.Bomb.FuseMs, dangerWindowMs = c.Bomb.DangerMs,
        initialBombPower = c.Attribute(BomberAttributeNames.BombPower).Initial,
        initialBombCapacity = c.Attribute(BomberAttributeNames.BombCapacity).Initial,
        maxHealthPoints = c.Attribute(BomberAttributeNames.HealthPoints).Maximum,
        healthPointsPerHeart = c.Life.PointsPerHeart, respawnMs = c.Life.RespawnMs,
        respawnProtectionMs = c.Life.ProtectionMs, matchDurationMs = c.Game.MatchDurationMs,
        inputBufferMs = c.Movement.PlaceBufferMs, drownIntervalMs = c.Life.DrownIntervalMs,
        drownPointsPerInterval = c.Life.DrownPoints, dropRatePermille = c.Drops.SoftDropPermille,
        coverReachCells = c.Map.CoverReachCells,
        speedTierToCellsPerSecond = c.Tables.SpeedTiers.Rows.Select(t => t.SpeedMilli).ToArray(),
        game = c.Game, movement = c.Movement, life = c.Life, bomb = c.Bomb, drops = c.Drops,
        map = c.Map, regeneration = c.Regeneration, finalCircle = c.FinalCircle, chest = c.Chest,
        skillRules = c.SkillRules, presentation = c.Presentation,
        characters = c.Tables.Characters.Rows, skills = c.Tables.Skills.Rows,
        bombKinds = c.Tables.BombKinds.Rows,
        skillLevels = c.Tables.SkillLevels.Rows, skillCombos = c.Tables.SkillCombos.Rows,
        blocks = c.Tables.Blocks.Rows, attributes = c.Tables.Attributes.Rows,
        circleStages = c.Tables.CircleStages.Rows, resourceTiers = c.Tables.Chest.Rows };
}
