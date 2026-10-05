using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.Json;
using Lumio.GameRuntime.Config;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.Components.Identity;
using Lumio.Config.Generated.Client;

namespace Lumio.Bomber.Client.Spectator;

/// <summary>Read-only projection of the current replica. JS never parses the wire.</summary>
public static class SpectatorDump
{
    /// <summary>
    /// Resource prefix of the Bomber LumioConfig export embedded beside these sources.
    /// The Bomber client registry declares a gameplay config contract, so a World
    /// cannot be created without the projected tables, and browser wasm has no host
    /// filesystem for <c>BomberTables.ResolveDirectory</c> to resolve. The export
    /// therefore travels inside the assembly and is read back through the Runtime's
    /// own <see cref="IConfigArtifactBytes"/> seam. Paths match the export layout
    /// (<c>manifest.json</c>, <c>client/&lt;table&gt;.json</c>).
    /// </summary>
    private const string BomberExportPrefix = "BomberConfigExport/";

    private static readonly Lazy<IAttributeSeedProvider> BomberSeeds = new(ProjectBomberSeeds);

    /// <summary>
    /// Loads and activates the Bomber config export, then hands back the binding the
    /// Bomber client registry requires. Attribute seeds ride along: the projected
    /// Bomber config is itself the <see cref="IAttributeSeedProvider"/>, and the Bomber
    /// adapter's <c>BindWorld</c> installs it when the binding is attached.
    /// </summary>
    public static WorldConfigBinding LoadBomberConfig()
    {
        IGameConfigExportBinding entry = CreateBomberConfigEntry();
        var module = ConfigModule.Create();
        if (!module.Stage(LoadBomberExport(entry)).Staged || !module.ActivateAtBarrier(default).Activated)
            throw new InvalidOperationException("Bomber config activation failed.");
        return new WorldConfigBinding(module, GeneratedRegistry.Instance, entry);
    }

    /// <summary>
    /// Binds the Bomber attribute seeds on a World whose registry declares no gameplay
    /// config contract — the producer-side wrapper the tests use — where a
    /// <see cref="WorldConfigBinding"/> cannot attach. The values still come from the
    /// Bomber config export: the projected config is the seed provider. Worlds built on
    /// the real registry take the seeds through <see cref="LoadBomberConfig"/> instead.
    /// </summary>
    public static void BindBomberAttributeSeeds(WorldManager manager)
    {
        if (manager is null) throw new ArgumentNullException(nameof(manager));
        manager.World.SeedProvider ??= BomberSeeds.Value;
    }

    private static IGameConfigExportBinding CreateBomberConfigEntry() =>
        GeneratedRegistry.Instance.CreateGameplayConfigBinding()
        ?? throw new InvalidOperationException("Bomber registry declares no gameplay config binding.");

    private static ConfigSnapshot LoadBomberExport(IGameConfigExportBinding entry)
    {
        ConfigTarget target = GeneratedRegistry.Instance.Side == RegistrySide.Server ? ConfigTarget.Server : ConfigTarget.Client;
        LumioConfigLoadResult result = LumioConfigLoader.Load(new EmbeddedBomberExport(), target,
            requiredTables: entry.RequiredTables, typedTableFactory: entry.CreateTypedTables);
        if (!result.IsSuccess) throw new InvalidOperationException(result.ErrorMessage);
        return result.CreateSnapshot(new ConfigSnapshotId(1));
    }

    public static IBomberConfig LoadDisplayConfig()
    {
        IGameConfigExportBinding entry = CreateBomberConfigEntry();
        return (IBomberConfig)entry.Project(LoadBomberExport(entry));
    }

    internal static BomberClientConfig LoadEmbeddedClientConfig() => BomberClientConfig.Load(new EmbeddedBomberExport());

    private static IAttributeSeedProvider ProjectBomberSeeds()
    {
        IGameConfigExportBinding entry = CreateBomberConfigEntry();
        return entry.Project(LoadBomberExport(entry)) as IAttributeSeedProvider
            ?? throw new InvalidOperationException("Projected Bomber config carries no attribute seeds.");
    }

    private sealed class EmbeddedBomberExport : IConfigArtifactBytes
    {
        public ReadOnlyMemory<byte> ReadFile(string relativePath)
        {
            if (string.IsNullOrEmpty(relativePath)) return ReadOnlyMemory<byte>.Empty;
            using Stream? stream = typeof(SpectatorDump).Assembly
                .GetManifestResourceStream(BomberExportPrefix + relativePath.Replace('\\', '/'));
            if (stream is null) return ReadOnlyMemory<byte>.Empty;
            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            return buffer.ToArray();
        }
    }

    public static string DumpPositions(World world)
    {
        if (world is null) throw new ArgumentNullException(nameof(world));
        string? selfId = null;
        try
        {
            selfId = world.Self.Id.ToHex();
        }
        catch (InvalidOperationException)
        {
            // Welcome has not bound Self yet; dump still lists replica poses.
        }
        var json = new StringBuilder();
        json.Append('[');
        bool first = true;
        foreach (LogicTransform transform in world.Each<LogicTransform>())
        {
            if (!first) json.Append(',');
            first = false;
            System.Numerics.Vector3 pos = PublishedPosition(world, transform);
            string id = transform.Entity.ToHex();
            json.Append("{\"id\":");
            AppendString(json, id);
            json.Append(",\"x\":").Append(Format(pos.X));
            json.Append(",\"z\":").Append(Format(pos.Z));
            // Declared entity wire name (player / bomberBomb / ...). The page
            // groups dots by it; it never infers a kind from the id or the pose.
            json.Append(",\"type\":");
            string type = TypeNameOf(world, transform.Entity);
            AppendString(json, type);
            if (type == "player") AppendPlayerIdentity(json, world, transform.Entity);
            if (type == "bomberBomb") AppendBombIdentity(json, world.Get<BomberBombState>(transform.Entity));
            if (selfId is not null && string.Equals(id, selfId, StringComparison.Ordinal))
                json.Append(",\"self\":true");
            json.Append('}');
        }

        json.Append(']');
        return json.ToString();
    }

    internal static System.Numerics.Vector3 PublishedPosition(World world, LogicTransform transform)
    {
        if (!world.IsServer && world.TryGetSelf(out Entity? self) && self is not null && self.Id == transform.Entity &&
            world.NamedComponent(transform.Entity, nameof(BomberPlayerState)) is BomberPlayerState &&
            world.Manager.PredictionPublished && world.Manager.PredictedWorld is World completed &&
            completed.IsLive(transform.Entity) &&
            completed.NamedComponent(transform.Entity, nameof(LogicTransform)) is LogicTransform predicted)
            return predicted.WorldPosition;
        return transform.WorldPosition;
    }

    public static string DumpPlayerState(World? world, string connectionState, bool inputEnabled,
        string authorityTick, string appliedInputSequence)
    {
        string? selfId = null;
        string? participantId = null;
        string? lifePhase = null;
        string? matchId = null;
        string? matchPhase = null;
        string? characterName = null;
        long? availableBombs = null;
        ulong? tickRateHz = null;
        bool playerSelf = false;
        var bombs = new List<PlayerBombDto>();
        if (world is not null)
        {
            tickRateHz = BomberConfigBinding.For(world).Game.TickRateHz;
            foreach (BomberMatchState match in world.Each<BomberMatchState>())
            {
                matchId = match.MatchId.Value.ToString(CultureInfo.InvariantCulture);
                matchPhase = ((BomberMatchPhase)match.Phase.Value).ToString();
                break;
            }
            if (world.TryGetSelf(out Entity? self) && self is not null && world.IsLive(self.Id))
            {
                selfId = self.Id.ToHex();
                if (world.TypeOf(self.Id).ClrType == typeof(BomberParticipantEntity))
                {
                    participantId = selfId;
                    lifePhase = ((BomberLifePhase)world.Get<BomberParticipantState>(self.Id).LifePhase.Value).ToString();
                }
                else
                {
                    playerSelf = true;
                    BomberPlayerState player = world.Get<BomberPlayerState>(self.Id);
                    uint character = world.Get<BomberSkillState>(self.Id).CharacterId.Value;
                    if (BomberConfigBinding.For(world).Tables.Characters.TryGet(character, out var row)) characterName = row.Name;
                    if (!player.Participant.Value.IsDefault) participantId = player.Participant.Value.ToHex();
                    lifePhase = ((BomberLifePhase)player.LifePhase.Value).ToString();
                    availableBombs = world.Get<AttributeComponent>(self.Id).GetBaseValue(BomberAttributeNames.AvailableBombs);
                }
            }
            foreach (BomberBombState bomb in world.Each<BomberBombState>())
            {
                System.Numerics.Vector3 position = world.Get<LogicTransform>(bomb.Entity).WorldPosition;
                bombs.Add(new PlayerBombDto
                {
                    id = bomb.Entity.ToHex(),
                    ownerId = bomb.Owner.Value.IsDefault ? null : bomb.Owner.Value.ToHex(),
                    sourceLifeId = bomb.SourceLife.Value.IsDefault ? null : bomb.SourceLife.Value.ToHex(),
                    x = position.X,
                    z = position.Z,
                });
            }
        }
        bool inputOpen = inputEnabled && playerSelf && matchPhase is "Warmup" or "Running" or "FinalCircle"
            && lifePhase is "Protected" or "Vulnerable";
        return JsonSerializer.Serialize(new PlayerStateDto
        {
            connectionState = connectionState, inputEnabled = inputEnabled, inputOpen = inputOpen, selfId = selfId, participantId = participantId, matchId = matchId, phase = matchPhase,
            lifePhase = lifePhase, characterName = characterName, availableBombs = availableBombs, authorityTick = authorityTick, appliedInputSequence = appliedInputSequence, tickRateHz = tickRateHz, bombs = bombs,
        }, SpectatorJsonContext.Default.PlayerStateDto);
    }

    private static void AppendBombIdentity(StringBuilder json, BomberBombState bomb)
    {
        json.Append(",\"ownerId\":");
        if (bomb.Owner.Value.IsDefault) json.Append("null"); else AppendString(json, bomb.Owner.Value.ToHex());
        json.Append(",\"sourceLifeId\":");
        if (bomb.SourceLife.Value.IsDefault) json.Append("null"); else AppendString(json, bomb.SourceLife.Value.ToHex());
    }

    /// <summary>
    /// Declared wire name of a live entity, from the registry that created it.
    /// Entities the registry cannot name (the world entity) dump an empty string
    /// rather than a guess.
    /// </summary>
    private static string TypeNameOf(World world, NetEntityId id)
    {
        try
        {
            string name = world.Registry.WireName(world.TypeOf(id).ClrType) ?? string.Empty;
            // Only registry identifiers belong in the type projection.
            // Display strings are serialized separately by AppendString.
            foreach (char c in name)
            {
                bool plain = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-';
                if (!plain) return string.Empty;
            }

            return name;
        }
        catch (InvalidOperationException)
        {
            return string.Empty;
        }
        catch (ArgumentException)
        {
            return string.Empty;
        }
        catch (KeyNotFoundException)
        {
            return string.Empty;
        }
    }

    private static void AppendPlayerIdentity(StringBuilder json, World world, NetEntityId id)
    {
        string? name = null;
        uint? characterId = null;
        try
        {
            string value = world.Get<IdentityComponent>(id).Name.Value;
            if (!string.IsNullOrEmpty(value)) name = value;
        }
        catch (InvalidOperationException)
        {
            // A missing replicated identity stays absent in the projection.
        }
        try
        {
            uint value = world.Get<BomberSkillState>(id).CharacterId.Value;
            if (value != 0) characterId = value;
        }
        catch (InvalidOperationException)
        {
            // A missing replicated skill state stays absent in the projection.
        }
        json.Append(",\"name\":");
        if (name is null) json.Append("null"); else AppendString(json, name);
        json.Append(",\"characterId\":");
        if (characterId is null) json.Append("null");
        else json.Append(characterId.Value.ToString(CultureInfo.InvariantCulture));
        json.Append(",\"characterName\":");
        string? characterName = characterId is null ? null : CharacterName(world, characterId.Value);
        if (characterName is null) json.Append("null"); else AppendString(json, characterName);
    }

    private static string? CharacterName(World world, uint characterId)
    {
        foreach (CharactersRow row in BomberConfigBinding.For(world).Tables.Characters.Rows)
            if (row.Id == characterId) return row.Name;
        return null;
    }

    public static string MapDimensions(World world)
    {
        if (world is null) throw new ArgumentNullException(nameof(world));
        MapRow map = BomberConfigBinding.For(world).Map;
        return "{\"width\":" + map.Width.ToString(CultureInfo.InvariantCulture)
            + ",\"depth\":" + map.Depth.ToString(CultureInfo.InvariantCulture) + "}";
    }

    public static void ApplyPack(WorldManager manager, ReadOnlySpan<byte> frame)
    {
        if (manager is null) throw new ArgumentNullException(nameof(manager));
        WorldMessage message = WireCodec.DecodePack(frame);
        if (message is WelcomeMessage or WorldChangeMessage)
        {
            manager.Enqueue(message);
            manager.Tick();
        }
    }

    public static byte[] DecodeFrameText(string frame)
    {
        if (string.IsNullOrEmpty(frame)) throw new ArgumentException("frame required", nameof(frame));
        char lead = frame[0];
        if (lead == '{' || lead == '[') return Encoding.UTF8.GetBytes(frame);
        return Convert.FromBase64String(frame);
    }

    private static string Format(float value) => value.ToString("G9", CultureInfo.InvariantCulture);

    private static void AppendString(StringBuilder json, string value)
    {
        json.Append(JsonSerializer.Serialize(value, SpectatorJsonContext.Default.String));
    }
}

