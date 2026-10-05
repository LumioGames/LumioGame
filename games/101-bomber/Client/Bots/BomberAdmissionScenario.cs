using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Ecs;

[assembly: InternalsVisibleTo("Lumio.Bomber.Client.Application.Tests")]

namespace Lumio.Bomber.Bots;

/// <summary>First-round admission evidence only. It never issues gameplay commands or claims a completed match.</summary>
public sealed class BomberAdmissionScenario : BotScenario
{
    /// <summary>Existing Bot.Host config setting shared by the host and this parameterless scenario.</summary>
    public const string ConfigDirectoryVariable = "LumioBotConfigDirectory";

    private readonly int expectedPlayers;
    private BomberAdmissionEvidence observed;
    private object? lastReadDiagnostic;

    /// <summary>Bot.Host creates scenarios without arguments; load the same explicitly selected config as the host.</summary>
    public BomberAdmissionScenario() : this(ReadPlayerCount()) { }

    internal BomberAdmissionScenario(int expectedPlayers)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(expectedPlayers);
        this.expectedPlayers = expectedPlayers;
    }

    /// <summary>The player census threshold from the selected game configuration.</summary>
    public int ExpectedPlayers => expectedPlayers;

    /// <inheritdoc />
    public override BotStepResult Step(in BotDriverContext context)
    {
        var world = context.World;
        var self = world.Self;
        var identities = new List<BomberAdmissionIdentity>();
        foreach (var entity in world.VisibleEntities.All)
            identities.Add(new BomberAdmissionIdentity(entity.NetEntityId, entity.EntityType));
        var nameField = default(BomberAdmissionField);
        var nextCharacterField = default(BomberAdmissionField);
        var name = default(ReplicaFieldObservation);
        var nextCharacter = default(ReplicaFieldObservation);
        if (world.HasSelf && !string.IsNullOrWhiteSpace(self.NetEntityId) && !string.IsNullOrWhiteSpace(self.RoomId))
        {
            name = world.Fields[self.NetEntityId, "IdentityComponent.name"];
            nextCharacter = world.Fields[self.NetEntityId, "BomberPlayerState.nextCharacterId"];
            nameField = new BomberAdmissionField(name.Found, name.RoomId, name.NetEntityId,
                name.Value.Kind, name.Value.Text, name.Value.WholeNumber);
            nextCharacterField = new BomberAdmissionField(nextCharacter.Found, nextCharacter.RoomId, nextCharacter.NetEntityId,
                nextCharacter.Value.Kind, nextCharacter.Value.Text, nextCharacter.Value.WholeNumber);
        }
        var worldIdentity = world.WorldEntity;
        var position = world.WorldPositions[self.NetEntityId];
        var identityField = world.Fields[self.NetEntityId, "EntityIdentity.entityType"];
        lastReadDiagnostic = new
        {
            OwnerFrame = context.Tick,
            world.InputEnabled,
            world.HasSelf,
            Self = new { self.RoomId, self.NetEntityId, self.EntityType, self.ConnectionGeneration },
            WorldIdentityFound = worldIdentity.Found,
            Position = new { position.Found, position.ObservedTick, position.ObservedRevision },
            Identity = DescribeField("EntityIdentity.entityType", identityField),
            Name = DescribeField("IdentityComponent.name", name),
            NextCharacter = DescribeField("BomberPlayerState.nextCharacterId", nextCharacter),
        };
        observed = BomberAdmissionEvidence.Evaluate(world.HasSelf, self.RoomId, self.NetEntityId, self.EntityType,
            identities, nameField, nextCharacterField, expectedPlayers);
        return observed.Complete ? BotStepResult.Complete : BotStepResult.Continue;
    }

    /// <inheritdoc />
    public override void Assert(in BotDriverContext context, BotAssertionSink sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        Console.WriteLine("BOMBER_ADMISSION_READ " + JsonSerializer.Serialize(lastReadDiagnostic));
        // Bot.Host calls Assert after closing connections. Retain the actual last Step observation,
        // rather than asking a disposed replica for a new census or treating an uplink as evidence.
        sink.That(context.Uplinks == 0, "bomber_admission_zero_uplinks");
        sink.That(observed.HasSelf, "bomber_admission_self_bound");
        sink.That(observed.ValidSelfId, "bomber_admission_full_self_id");
        sink.That(observed.SelfIsPlayer, "bomber_admission_self_type_player");
        sink.That(observed.SelfVisible, "bomber_admission_self_visible");
        sink.That(observed.PlayerCount >= expectedPlayers, $"bomber_admission_players_at_least_{expectedPlayers}_observed_{observed.PlayerCount}");
        sink.That(observed.ValidRoomId, "bomber_admission_self_room");
        sink.That(observed.NameReadable, "bomber_admission_self_name_readable");
        sink.That(observed.NextCharacterReadable, "bomber_admission_self_next_character_readable");
    }

    private static object DescribeField(string requestedAttributeId, ReplicaFieldObservation field) => new
    {
        RequestedAttributeId = requestedAttributeId,
        field.Found,
        field.Status,
        field.Code,
        field.NetEntityId,
        field.RoomId,
        field.AttributeId,
        field.ObservedTick,
        field.ObservedRevision,
        Kind = field.Value.Kind,
    };

    private static int ReadPlayerCount()
    {
        var directory = Environment.GetEnvironmentVariable(ConfigDirectoryVariable);
        if (string.IsNullOrWhiteSpace(directory))
            throw new InvalidOperationException("BOMBER_ADMISSION_CONFIG_REQUIRED: set LumioBotConfigDirectory to the client config root used by Bot.Host.");
        return BomberConfigBinding.Read(directory).Game.PlayerCount;
    }
}

internal readonly record struct BomberAdmissionIdentity(string NetEntityId, string EntityType);

internal readonly record struct BomberAdmissionField(bool Found, string RoomId, string NetEntityId, string Kind, string? Text, long? WholeNumber);

internal readonly record struct BomberAdmissionEvidence(
    bool HasSelf, bool ValidSelfId, bool SelfIsPlayer, bool SelfVisible, int PlayerCount, int ExpectedPlayers,
    bool ValidRoomId, bool NameReadable, bool NextCharacterReadable)
{
    internal bool Complete => HasSelf && ValidSelfId && SelfIsPlayer && SelfVisible && PlayerCount >= ExpectedPlayers
        && ValidRoomId && NameReadable && NextCharacterReadable;

    internal static BomberAdmissionEvidence Evaluate(bool hasSelf, string? roomId, string? selfHex, string? selfType,
        IReadOnlyList<BomberAdmissionIdentity> census, BomberAdmissionField name, BomberAdmissionField nextCharacter, int expectedPlayers)
    {
        ArgumentNullException.ThrowIfNull(census);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(expectedPlayers);
        var playerType = GeneratedRegistry.Instance.WireName(typeof(PlayerEntity));
        var validSelf = NetEntityId.TryParse(selfHex ?? string.Empty, out var self) && !self.IsDefault;
        var selfIsPlayer = string.Equals(selfType, playerType, StringComparison.Ordinal);
        var players = new HashSet<NetEntityId>();
        foreach (var row in census)
        {
            if (string.Equals(row.EntityType, playerType, StringComparison.Ordinal)
                && NetEntityId.TryParse(row.NetEntityId, out var id) && !id.IsDefault)
                players.Add(id);
        }
        var validRoom = !string.IsNullOrWhiteSpace(roomId);
        var nameReadable = FieldMatches(name, roomId, selfHex) && name.Kind == "string" && name.Text is not null;
        var nextCharacterReadable = FieldMatches(nextCharacter, roomId, selfHex)
            && nextCharacter.Kind == "int32" && nextCharacter.WholeNumber is >= int.MinValue and <= int.MaxValue;
        return new BomberAdmissionEvidence(hasSelf, validSelf, selfIsPlayer, validSelf && players.Contains(self),
            players.Count, expectedPlayers, validRoom, nameReadable, nextCharacterReadable);
    }

    private static bool FieldMatches(BomberAdmissionField field, string? roomId, string? selfHex) =>
        field.Found && !string.IsNullOrWhiteSpace(roomId)
        && string.Equals(field.RoomId, roomId, StringComparison.Ordinal)
        && string.Equals(field.NetEntityId, selfHex, StringComparison.Ordinal);
}
