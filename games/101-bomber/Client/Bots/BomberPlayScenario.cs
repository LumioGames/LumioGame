using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;

namespace Lumio.Bomber.Bots;

/// <summary>Long-lived product opponent. Reads confirmed replicas and submits the same GAS inputs as players.</summary>
public sealed class BomberPlayScenario : BotScenario
{
    private readonly IBomberConfig config;
    private readonly HashSet<string> humans;
    private readonly string? difficulty;
    private readonly int configuredIndex;
    private readonly int configuredCount;
    private BomberBotBrain? brain;
    private string life = string.Empty;
    private ulong match;
    private ulong sequence;
    private long lastSelectionAttempt = -2;
    private long lastObservedTick = -1;
    private BotMove previousMove;

    /// <summary>Loads the official client table export selected by the product launcher.</summary>
    public BomberPlayScenario()
    {
        config = BomberConfigBinding.Read(Environment.GetEnvironmentVariable(BomberAdmissionScenario.ConfigDirectoryVariable)
            ?? throw new InvalidOperationException("The product Bot requires its client configuration export."));
        humans = new(Environment.GetEnvironmentVariable("LUMIO_BOMBER_HUMAN_PARTICIPANTS")?.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            ?? Array.Empty<string>(), StringComparer.Ordinal);
        difficulty = Environment.GetEnvironmentVariable("LUMIO_BOMBER_BOT_DIFFICULTY");
        configuredIndex = ReadOption("LUMIO_BOMBER_BOT_INDEX", -1);
        configuredCount = ReadOption("LUMIO_BOMBER_BOT_COUNT", -1);
        if (string.IsNullOrWhiteSpace(difficulty) && (configuredIndex < 0 || configuredCount <= 0 || configuredIndex >= configuredCount))
            throw new InvalidOperationException("Mixed product Bots require explicit BOT_INDEX and BOT_COUNT from the launcher.");
    }

    /// <inheritdoc />
    public override BotStepResult Step(in BotDriverContext context)
    {
        BotWorldView view = context.World;
        if (!view.Bound || !view.HasSelf || !view.InputEnabled || !view.WorldEntity.Found) return BotStepResult.Continue;
        string world = view.WorldEntity.NetEntityId, self = view.Self.NetEntityId;
        ulong currentMatch = BomberPlayObservation.Unsigned(view, world, "BomberMatchState.matchId");
        int phase = BomberPlayObservation.Int(view, world, "BomberMatchState.phase");
        int slot = BomberPlayObservation.Int(view, self, "BomberPlayerState.participantIndex");
        int index = configuredIndex >= 0 ? configuredIndex : slot;
        if (life != self || match != currentMatch)
        {
            life = self; match = currentMatch; lastObservedTick = -1; previousMove = BotMove.None;
            ulong seed = BomberPlayObservation.Unsigned(view, world, "BomberMatchState.seed");
            brain = new BomberBotBrain(Policy(index), seed ^ checked((ulong)(index + 1) * 0x9e3779b9UL));
        }
        if (phase is (int)BomberMatchPhase.WaitingForWorldReady or (int)BomberMatchPhase.Warmup or (int)BomberMatchPhase.Results)
        {
            uint character = config.Tables.Characters.Rows[index % config.Tables.Characters.Rows.Count].Id;
            if (BomberPlayObservation.Long(view, self, "BomberSkillState.characterId") != character
                && BomberPlayObservation.Long(view, self, "BomberPlayerState.nextCharacterId") != character
                && context.Tick > lastSelectionAttempt + 1
                && Issue(in context, "SelectCharacterAbility", [character.ToString(CultureInfo.InvariantCulture)]))
                lastSelectionAttempt = context.Tick;
            return BotStepResult.Continue;
        }
        if (phase is not ((int)BomberMatchPhase.Running) and not ((int)BomberMatchPhase.FinalCircle)
            || !BomberPlayObservation.TryRead(view, config, humans, out var observation)
            || observation.Tick <= lastObservedTick) return BotStepResult.Continue;
        lastObservedTick = observation.Tick;
        BotDecision decision = brain!.Decide(observation);
        if (decision.Skill && Issue(in context, "UseActiveSkillAbility", Array.Empty<string>())
            && observation.ActiveSkill is not (2 or 9)) return BotStepResult.Continue;
        if (decision.Bomb) _ = Issue(in context, "PlaceBombAbility", Array.Empty<string>());
        BotMove movement = Steer(view.WorldPositions[self], decision.Move, observation.Width);
        if (movement != BotMove.None)
        {
            bool turn = movement != previousMove;
            _ = Issue(in context, "MoveAbility", [((int)movement).ToString(CultureInfo.InvariantCulture), "0", turn ? "true" : "false"]);
            previousMove = movement;
        }
        foreach (BotVisibleEntity entity in view.VisibleEntities.All)
        {
            if (entity.EntityType != "bomberPickupItem") continue;
            ReplicaWorldPosition pickup = view.WorldPositions[entity.NetEntityId], position = view.WorldPositions[self];
            float radius = config.Drops.PickupDistanceMilli / 1000f;
            if (pickup.Found && position.Found && MathF.Pow(pickup.X - position.X, 2) + MathF.Pow(pickup.Z - position.Z, 2) <= radius * radius)
            {
                _ = Issue(in context, "PickupAbility", [entity.NetEntityId]);
                break;
            }
        }
        return BotStepResult.Continue;
    }

    private BotPolicy Policy(int index)
    {
        var tactics = config.BotTactics;
        string selected = string.IsNullOrWhiteSpace(difficulty) ? BotLineup.Select(index, configuredCount,
            tactics.RookieWeight, tactics.NormalWeight, tactics.HardWeight) : difficulty.Trim().ToLowerInvariant();
        var profile = config.Tables.BotProfiles.Rows.SingleOrDefault(row => row.Name == selected);
        if (profile.Id == 0) throw new InvalidOperationException("Unknown configured Bot difficulty: " + selected);
        (int farm, int hunt, int collect, int roam) = (index % 4) switch
        {
            0 => (tactics.FarmerFarmWeight, tactics.FarmerHuntWeight, tactics.FarmerCollectWeight, tactics.FarmerRoamWeight),
            1 => (tactics.HunterFarmWeight, tactics.HunterHuntWeight, tactics.HunterCollectWeight, tactics.HunterRoamWeight),
            2 => (tactics.CollectorFarmWeight, tactics.CollectorHuntWeight, tactics.CollectorCollectWeight, tactics.CollectorRoamWeight),
            _ => (tactics.RoamerFarmWeight, tactics.RoamerHuntWeight, tactics.RoamerCollectWeight, tactics.RoamerRoamWeight),
        };
        return new(checked((int)profile.ReactMinTicks), checked((int)profile.ReactMaxTicks), checked((int)profile.ThinkEveryTicks),
            profile.NoisePermille, profile.AttackSkipPermille, profile.SkillUsePermille, profile.EscapeMarginTicks,
            profile.UnderestimatePermille, profile.RiskyPickupPermille,
            profile.AttackBombLimitMode == "Capacity" ? checked((int)config.Attribute(BomberAttributeNames.BombCapacity).Maximum) : profile.AttackBombLimit,
            checked((int)tactics.SkillLeadTicks), checked((int)tactics.SkillRetryTicks), tactics.HumanChasers,
            tactics.HumanNearCells, tactics.HumanTargetPenalty, tactics.BehaviorMinTicks, tactics.BehaviorMaxTicks,
            farm, hunt, collect, roam, profile.ReactionMode == "OwnCell", profile.BlastScalePermille,
            profile.EngageScalePermille, profile.TrapPermille, profile.FrenzyBypass, profile.TradePermille,
            tactics.ShowdownSideCells, checked((int)tactics.TradeMinHpLeft),
            tactics.EngageSteps, tactics.EngageCheckTicks, (index % 4) switch
            {
                0 => tactics.FarmerEngagePermille, 1 => tactics.HunterEngagePermille,
                2 => tactics.CollectorEngagePermille, _ => tactics.RoamerEngagePermille,
            }, tactics.EngageMinTicks, tactics.EngageMaxTicks,
            tactics.FarmBlastPermille, tactics.HuntBlastPermille, tactics.CollectBlastPermille, tactics.RoamBlastPermille);
    }

    private bool Issue(in BotDriverContext context, string member, IReadOnlyList<string> arguments)
    {
        foreach (BotInputTerm term in context.Vocabulary.AvailableTerms)
            if (term.Kind == BotInputKind.Activate && term.Member == member)
            {
                BotIssuedCommand command = BotIssuedCommand.Activate(member, arguments, ++sequence);
                return context.Issue(in command).Accepted;
            }
        return false;
    }

    private static int ReadOption(string name, int fallback)
    {
        string? value = Environment.GetEnvironmentVariable(name);
        return value is null ? fallback : int.Parse(value, NumberStyles.None, CultureInfo.InvariantCulture);
    }

    private static BotMove Steer(ReplicaWorldPosition position, BotMove requested, int width)
    {
        _ = width;
        float lateral = requested is BotMove.Up or BotMove.Down ? position.X - MathF.Floor(position.X) - 0.5f
            : position.Z - MathF.Floor(position.Z) - 0.5f;
        if (MathF.Abs(lateral) <= 0.1f || requested == BotMove.None) return requested;
        return requested is BotMove.Up or BotMove.Down ? lateral > 0 ? BotMove.Left : BotMove.Right
            : lateral > 0 ? BotMove.Up : BotMove.Down;
    }
}
