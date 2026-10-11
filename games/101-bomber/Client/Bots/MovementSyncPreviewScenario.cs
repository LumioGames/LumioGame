using System;
using System.Collections.Generic;
using System.Globalization;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Bots;

/// <summary>Private movement exercise: submits only ordinary character and cardinal movement inputs.</summary>
public sealed class MovementSyncPreviewScenario : BotScenario
{
    private readonly MovementSyncPreviewInputPolicy policy;
    private readonly uint character;
    private ulong sequence;

    /// <summary>Loads the selected client export and the launcher-owned six-Bot index.</summary>
    public MovementSyncPreviewScenario()
    {
        string directory = Environment.GetEnvironmentVariable(BomberAdmissionScenario.ConfigDirectoryVariable)
            ?? throw new InvalidOperationException("Movement preview requires the selected client configuration export.");
        IBomberConfig config = BomberConfigBinding.Read(directory);
        int index = ReadOption("LUMIO_BOMBER_BOT_INDEX");
        int count = ReadOption("LUMIO_BOMBER_BOT_COUNT");
        if (count != 6 || (uint)index >= 6 || config.Game.TickRateHz != 20 || config.Tables.Characters.Rows.Count == 0)
            throw new InvalidOperationException("Movement preview requires six indexed Bots and the selected 20 Hz character export.");
        policy = new(index);
        character = config.Tables.Characters.Rows[index % config.Tables.Characters.Rows.Count].Id;
        if (character == 0) throw new InvalidOperationException("Movement preview requires a real configured character row.");
    }

    /// <inheritdoc />
    public override BotStepResult Step(in BotDriverContext context)
    {
        BotWorldView view = context.World;
        if (!view.Bound || !view.HasSelf || !view.InputEnabled || !view.WorldEntity.Found
            || string.IsNullOrWhiteSpace(view.Self.RoomId) || string.IsNullOrWhiteSpace(view.Self.NetEntityId)
            || string.IsNullOrWhiteSpace(view.WorldEntity.NetEntityId))
        {
            policy.Retire();
            return BotStepResult.Continue;
        }
        string world = view.WorldEntity.NetEntityId, self = view.Self.NetEntityId;
        ulong generation = view.Self.ConnectionGeneration;
        if (!ReadUInt(view, world, "BomberMatchState.matchId", generation, out ulong match)
            || !ReadInt(view, world, "BomberMatchState.phase", generation, out int phase)
            || !ReadId(view, self, "BomberPlayerState.participant", generation, out string participant)
            || !ReadUInt(view, self, "BomberPlayerState.lifeGeneration", generation, out ulong lifeGeneration)
            || !ReadUInt(view, participant, "BomberParticipantState.matchId", generation, out ulong participantMatch)
            || !ReadId(view, participant, "BomberParticipantState.currentLife", generation, out string currentLife)
            || !ReadUInt(view, participant, "BomberParticipantState.lifeGeneration", generation, out ulong participantGeneration))
        {
            policy.Retire();
            return BotStepResult.Continue;
        }
        if (match != participantMatch || self != currentLife || lifeGeneration != participantGeneration)
            throw new InvalidOperationException("Movement preview received contradictory confirmed life identity.");
        ReplicaFieldObservation progress = Field(view, world, "BomberMatchState.phase", generation);
        if (!progress.Found) { policy.Retire(); return BotStepResult.Continue; }
        var identity = new MovementSyncPreviewIdentity(view.Self.RoomId, world, generation, match,
            participant, self, lifeGeneration);
        if (phase is (int)BomberMatchPhase.WaitingForWorldReady or (int)BomberMatchPhase.Warmup or (int)BomberMatchPhase.Results)
        {
            policy.EnterSelectionPhase(identity);
            if (!ReadUInt(view, self, "BomberSkillState.characterId", generation, out ulong selected)
                || !ReadUInt(view, self, "BomberPlayerState.nextCharacterId", generation, out ulong next))
            {
                policy.Retire();
                return BotStepResult.Continue;
            }
            if (selected != character && next != character && policy.ShouldSelect(identity, progress.ObservedTick))
                _ = Issue(in context, "SelectCharacterAbility", [character.ToString(CultureInfo.InvariantCulture)]);
            return BotStepResult.Continue;
        }
        if (phase is not ((int)BomberMatchPhase.Running) and not ((int)BomberMatchPhase.FinalCircle)
            || match == 0
            || !ReadInt(view, self, "BomberPlayerState.lifePhase", generation, out int lifePhase)
            || lifePhase is not ((int)BomberLifePhase.Protected) and not ((int)BomberLifePhase.Vulnerable)
            || !ReadUInt(view, self, "BomberSkillState.frozenUntilTick", generation, out ulong frozenUntil))
        {
            policy.Retire();
            return BotStepResult.Continue;
        }
        if (frozenUntil > progress.ObservedTick) return BotStepResult.Continue;
        MovementSyncPreviewMove? move = policy.NextMove(identity, progress.ObservedTick);
        if (move is { } choice)
            policy.RecordMove(Issue(in context, "MoveAbility", [choice.Direction.ToString(CultureInfo.InvariantCulture),
                "0", choice.Turn ? "true" : "false"]), choice.Direction);
        return BotStepResult.Continue;
    }

    private bool Issue(in BotDriverContext context, string member, IReadOnlyList<string> arguments)
    {
        foreach (BotInputTerm term in context.Vocabulary.AvailableTerms)
            if (term.Kind == BotInputKind.Activate && term.Member == member)
            {
                BotIssuedCommand command = BotIssuedCommand.Activate(member, arguments, checked(++sequence));
                return context.Issue(in command).Accepted;
            }
        return false;
    }

    private static ReplicaFieldObservation Field(BotWorldView view, string entity, string attribute, ulong generation)
    {
        ReplicaFieldObservation field = view.Fields[entity, attribute, generation];
        return field.Found && field.RoomId == view.Self.RoomId && field.NetEntityId == entity
            && field.AttributeId == attribute ? field : default;
    }

    private static bool ReadUInt(BotWorldView view, string entity, string attribute, ulong generation, out ulong value)
    {
        ReplicaFieldObservation field = Field(view, entity, attribute, generation);
        if (field.Value.Magnitude is { } magnitude) { value = magnitude; return true; }
        if (field.Value.WholeNumber is >= 0 and { } signed) { value = (ulong)signed; return true; }
        value = 0; return false;
    }

    private static bool ReadInt(BotWorldView view, string entity, string attribute, ulong generation, out int value)
    {
        ReplicaFieldObservation field = Field(view, entity, attribute, generation);
        if (field.Value.WholeNumber is >= int.MinValue and <= int.MaxValue and { } signed)
        { value = (int)signed; return true; }
        value = 0; return false;
    }

    private static bool ReadId(BotWorldView view, string entity, string attribute, ulong generation, out string id)
    {
        ReplicaFieldObservation field = Field(view, entity, attribute, generation);
        if (field.Value.Kind == "netEntityId" && NetEntityId.TryParse(field.Value.Text ?? string.Empty, out var parsed)
            && !parsed.IsDefault) { id = field.Value.Text!; return true; }
        id = string.Empty; return false;
    }

    private static int ReadOption(string name)
    {
        string? value = Environment.GetEnvironmentVariable(name);
        return value is null ? -1 : int.Parse(value, NumberStyles.None, CultureInfo.InvariantCulture);
    }
}
