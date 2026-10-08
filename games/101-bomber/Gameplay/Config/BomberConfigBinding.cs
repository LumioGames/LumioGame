using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.GameRuntime.Config;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Config;

/// <summary>Stable attribute identities. Seeds and bounds live exclusively in configuration.</summary>
public static class BomberAttributeNames
{
    public const string HealthPoints = nameof(HealthPoints);
    public const string BombPower = nameof(BombPower);
    public const string BombCapacity = nameof(BombCapacity);
    public const string AvailableBombs = nameof(AvailableBombs);
    public const string SpeedTier = nameof(SpeedTier);
    public const string MovementSpeedMilli = nameof(MovementSpeedMilli);

    public static IReadOnlyList<string> All { get; } = Array.AsReadOnly(new[]
    {
        HealthPoints, BombPower, BombCapacity, AvailableBombs, SpeedTier, MovementSpeedMilli,
    });
}

/// <summary>Immutable world configuration. Rows and tables are the actual compiler-generated Readers.</summary>
public interface IBomberConfig : IWorldGameplayConfig
{
    BomberTypedTables Tables { get; }
    GameRow Game { get; }
    MovementRow Movement { get; }
    MapRow Map { get; }
    BombRow Bomb { get; }
    LifeRow Life { get; }
    DropsRow Drops { get; }
    RegenerationRow Regeneration { get; }
    FinalCircleRow FinalCircle { get; }
    ChestRow Chest { get; }
    ObjectBudgetsRow ObjectBudgetRules { get; }
    BomberObjectBudgets ObjectBudgets { get; }
    SkillRulesRow SkillRules { get; }
    BotTacticsRow BotTactics { get; }
    PresentationRow Presentation { get; }
    AttributesRow Attribute(string name);
    SpeedTiersRow SpeedTier(long tier);
    SkillLevelsRow SkillLevel(uint skillId, int level);
    long HatCount(long basePower, long baseCapacity, long baseSpeedTier);
}

public sealed class BomberConfigBinding : IGameConfigExportBinding
{
    private sealed class Settings : IBomberConfig, IAttributeSeedProvider
    {
        private readonly IReadOnlyDictionary<string, AttributesRow> attributes;
        public Settings(BomberTypedTables tables)
        {
            Tables = tables;
            Game = tables.Game.Rows.Single();
            Movement = tables.Movement.Rows.Single();
            Map = tables.Map.Rows.Single();
            Bomb = tables.Bomb.Rows.Single();
            Life = tables.Life.Rows.Single();
            Drops = tables.Drops.Rows.Single();
            Regeneration = tables.Regeneration.Rows.Single();
            FinalCircle = tables.FinalCircle.Rows.Single();
            Chest = tables.Chest.Rows.Single(row => row.Name == "default");
            ObjectBudgetRules = tables.ObjectBudgets.Rows.Single();
            SkillRules = tables.SkillRules.Rows.Single();
            BotTactics = tables.BotTactics.Rows.Single();
            Presentation = tables.Presentation.Rows.Single();
            attributes = tables.Attributes.Rows.ToDictionary(row => row.Name, StringComparer.Ordinal);
            if (attributes.Count != BomberAttributeNames.All.Count || BomberAttributeNames.All.Any(name => !attributes.ContainsKey(name)))
                throw new InvalidOperationException("Bomber requires exactly the declared six gameplay attributes.");
            if (attributes.Values.Any(row => row.Minimum > row.Initial || row.Initial > row.Maximum))
                throw new InvalidOperationException("Attribute seed is outside its configured bounds.");
            if (Game.MapSize != Map.Width || Map.Width != Map.Depth)
                throw new InvalidOperationException($"game.map_size={Game.MapSize}, map.width={Map.Width}, map.depth={Map.Depth} must agree.");
            if (SpeedTier(Attribute(BomberAttributeNames.SpeedTier).Initial).SpeedMilli != Attribute(BomberAttributeNames.MovementSpeedMilli).Initial)
                throw new InvalidOperationException("Initial movement speed must equal the initial speed tier.");
            if (tables.CircleStages.Rows.Any(row => row.AtMs >= FinalCircle.DurationMs))
                throw new InvalidOperationException("Circle stages must occur before the final-circle deadline.");
            ObjectBudgets = BomberObjectBudgetCalculator.Calculate(tables);
            _ = BomberTerrainBudget.Calculate(this, M2InitialLayout.Plan(Map.Width));
        }

        public BomberTypedTables Tables { get; }
        public GameRow Game { get; }
        public MovementRow Movement { get; }
        public MapRow Map { get; }
        public BombRow Bomb { get; }
        public LifeRow Life { get; }
        public DropsRow Drops { get; }
        public RegenerationRow Regeneration { get; }
        public FinalCircleRow FinalCircle { get; }
        public ChestRow Chest { get; }
        public ObjectBudgetsRow ObjectBudgetRules { get; }
        public BomberObjectBudgets ObjectBudgets { get; }
        public SkillRulesRow SkillRules { get; }
        public BotTacticsRow BotTactics { get; }
        public PresentationRow Presentation { get; }

        public AttributesRow Attribute(string name) => attributes.TryGetValue(name, out var row)
            ? row : throw new ArgumentException("Unknown Bomber attribute: " + name, nameof(name));
        public SpeedTiersRow SpeedTier(long tier) => Tables.SpeedTiers.Rows.Single(row => row.Tier == tier);
        public SkillLevelsRow SkillLevel(uint skillId, int level) => Tables.SkillLevels.Rows.Single(row => row.SkillId == skillId && row.Level == level);

        /// <summary>Read base ledgers only: placing a bomb and current-speed modifiers never change hats.</summary>
        public long HatCount(long basePower, long baseCapacity, long baseSpeedTier) => checked(
            basePower - Attribute(BomberAttributeNames.BombPower).Initial
            + baseCapacity - Attribute(BomberAttributeNames.BombCapacity).Initial
            + baseSpeedTier - Attribute(BomberAttributeNames.SpeedTier).Initial);

        public bool TryGetSeedValue(Type entityType, string attributeName, out long seedValue)
        {
            _ = entityType; // All character declarations share these same six attribute seeds.
            if (attributes.TryGetValue(attributeName, out var row)) { seedValue = row.Initial; return true; }
            seedValue = default;
            return false;
        }
    }

    public RegistrySide Side => GeneratedRegistry.Instance.Side;
    public Type RequiredGameplayContract => typeof(IBomberConfig);
    public IReadOnlyList<string> RequiredTables => BomberTypedTables.TableNames;
    public ITypedTableSet CreateTypedTables(ConfigTarget target, IReadOnlyList<ConfigSnapshotTable> tables) => BomberTypedTables.Create(target, tables);
    public IWorldGameplayConfig Project(IConfigSnapshotView snapshot) => new Settings(new BomberTypedTables(snapshot));
    public void BindWorld(World world)
    {
        var config = For(world);
        if (config.Game.TickRateHz != GeneratedRegistry.Instance.DeclaredTickRateHz)
            throw new InvalidOperationException("Configured tick rate differs from the engine world declaration.");
        world.SeedProvider = (IAttributeSeedProvider)config;
        var gas = Lumio.GameRuntime.Gas.GasWorldContext.Require(world);
        gas.Types.RegisterEffectAttribute(1, BomberAttributeNames.HealthPoints);
        gas.Types.RegisterEffectAttribute(2, BomberAttributeNames.BombPower);
        gas.Types.RegisterEffectAttribute(3, BomberAttributeNames.BombCapacity);
        gas.Types.RegisterEffectAttribute(4, BomberAttributeNames.AvailableBombs);
        gas.Types.RegisterEffectAttribute(5, BomberAttributeNames.SpeedTier);
        gas.Types.RegisterEffectAttribute(6, BomberAttributeNames.MovementSpeedMilli);
        gas.ConfigureEffects(Lumio.GameRuntime.Gas.EffectLimits.Default with
        {
            // Freeze can overlap immunity until its removal, then a Bubble cast.
            // One cleanup control plus two match-advance passes over three rows.
            LiveRows = checked(3 * config.ObjectBudgets.ParticipantLimit), PerTargetRows = 3,
            PendingControls = checked(7 * config.ObjectBudgets.ParticipantLimit),
            ResultRecords = checked(256 + 13 * config.ObjectBudgets.ParticipantLimit),
            ResultBytes = checked((256 + 13 * config.ObjectBudgets.ParticipantLimit) * Lumio.Wire.EffectLifecycleContract.ResultFixedBytes),
            Identities = checked(256 + 3 * config.ObjectBudgets.ParticipantLimit),
            DueRecords = checked(3 * config.ObjectBudgets.ParticipantLimit),
            // Exact maximum of the official generated codecs remains NewMatch.
            MaxPayloadBytes = 192,
            ReducerWrites = 8719, ReducerIndexedWrites = 7576, ReducerFields = 128,
            MaxReducerValueBytes = 16, ReducerWriteBytes = 413940,
            ReducerWorkUnits = 5000000, ReducerScratchBytes = 65536,
            SettlementFactWrites = 256 * 32, SettlementFactIndexedWrites = 256 * 32,
            SettlementFactFields = 72, MaxSettlementFactValueBytes = 16,
            SettlementFactWriteBytes = 256 * 32 * 48, SettlementFactScratchBytes = 256 * 4096,
        });
    }

    public static IBomberConfig For(World world) => world.GameplayConfig as IBomberConfig
        ?? throw new InvalidOperationException("Bomber world requires its gameplay config binding.");

    /// <summary>Load and validate a detached immutable config, useful for authoring/probes without starting simulation.</summary>
    public static IBomberConfig Read(string? directory = null)
    {
        var entry = new BomberConfigBinding();
        return (IBomberConfig)entry.Project(ReadSnapshot(entry, directory));
    }

    public static WorldConfigBinding Load(string? directory = null)
    {
        var entry = new BomberConfigBinding();
        var snapshot = ReadSnapshot(entry, directory);
        _ = entry.Project(snapshot); // Fail before attaching invalid gameplay data to a world.
        var module = ConfigModule.Create();
        if (!module.Stage(snapshot).Staged || !module.ActivateAtBarrier(default).Activated)
            throw new InvalidOperationException("Bomber config activation failed.");
        return new WorldConfigBinding(module, GeneratedRegistry.Instance, entry);
    }

    private static ConfigSnapshot ReadSnapshot(BomberConfigBinding entry, string? directory)
    {
        var result = LumioConfigLoader.Load(BomberTables.ResolveDirectory(directory), BomberConfigProjection.Target,
            requiredTables: entry.RequiredTables, typedTableFactory: entry.CreateTypedTables);
        if (!result.IsSuccess) throw new InvalidOperationException(result.ErrorCode + ": " + result.ErrorMessage);
        // This is snapshot identity, not a tuning number.
        return result.CreateSnapshot(new ConfigSnapshotId(1));
    }
}
