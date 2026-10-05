using System;
using System.Linq;

namespace Lumio.Bomber.Gameplay.Config;

/// <summary>The effective reward row and its worst case are shared by admission and issuance.</summary>
internal static class BomberResourceRewardRules
{
    internal static ChestRow Named(IBomberConfig config, string name) => config.Tables.Chest.Rows.Single(r => r.Name == name);

    internal static ChestRow Soft(IBomberConfig config, int size, int x, int z)
    {
        if (size is not (19 or 23 or 27) || x < 0 || z < 0 || x >= size || z >= size)
            throw new InvalidOperationException("Unsupported resource map/cell.");
        int center = (size - 1) / 2;
        int distance = Math.Max(Math.Abs(x - center), Math.Abs(z - center));
        int core = size == 19 ? 2 : size == 23 ? 3 : 4;
        int middle = size == 19 ? 5 : size == 23 ? 7 : 8;
        return Named(config, distance <= core ? "SoftCore" : distance <= middle ? "SoftMiddle" : "SoftOuter");
    }

    internal static ChestRow? ForBlock(IBomberConfig config, BlocksRow block, int x, int z) =>
        block.DropPool == "soft" ? Soft(config, config.Map.Width, x, z)
        : block.Name == "crate" ? Named(config, "Wood")
        : block.DropPool == "none" ? null
        : throw new InvalidOperationException("Unsupported unbound terrain reward producer.");

    internal static int Maximum(IBomberConfig config, ChestRow row) => Maximum(config.Game.SkillsEnabled, row);

    internal static int Maximum(bool skillsEnabled, ChestRow row)
    {
        if (row.Name == "default")
        {
            if (row.IndependentBombHits != 3 || row.FireCount != 1 || row.BombCount != 1 || row.SpeedCount != 1 ||
                row.HealthCount != 1 || row.SkillCount != 1 || row.RandomSlots != 0 || row.KickPermille != 0 ||
                row.GoldHeartPermille is < 0 or > 1000)
                throw new InvalidOperationException("Strong chest exceeds its designated reward shape.");
            return 4 + (skillsEnabled ? 1 : 0) + (row.GoldHeartPermille > 0 ? 1 : 0);
        }
        if (row.Name is not ("SoftOuter" or "SoftMiddle" or "SoftCore" or "Wood" or "Iron" or "Gold") ||
            row.RandomSlots is < 0 or > 2 || row.SpecialPermille is < 0 or > 1000 ||
            row.GoldHeartPermille is < 0 or > 1000 || row.DropPermille is < 0 or > 1000 ||
            row.KickPermille is < 0 or > 1000 || row.IndependentBombHits != (row.Name == "Gold" ? 2 : 1) ||
            row.FireCount != 0 || row.BombCount != 0 || row.SpeedCount != 0 || row.HealthCount != 0 || row.SkillCount != 0)
            throw new InvalidOperationException("Resource tier exceeds its supported bounded reward shape.");
        return row.DropPermille == 0 ? 0 : checked(row.RandomSlots +
            (skillsEnabled && row.SpecialPermille > 0 ? 1 : 0) + (row.GoldHeartPermille > 0 ? 1 : 0));
    }

    internal static void Validate(IBomberConfig config) => Validate(config.Tables, config.Game.SkillsEnabled);

    internal static void Validate(BomberTypedTables tables, bool skillsEnabled)
    {
        _ = Maximum(skillsEnabled, tables.Chest.Rows.Single(r => r.Name == "default"));
        foreach (string name in new[] { "SoftOuter", "SoftMiddle", "SoftCore", "Wood", "Iron", "Gold" })
        {
            var row = tables.Chest.Rows.Single(r => r.Name == name);
            _ = Maximum(skillsEnabled, row);
            if (row.RandomSlots > 0)
            {
                var pool = tables.PickupKinds.Rows.Where(r => r.SoftWeight > 0 && (row.IncludeHealth || r.Name != "Health"));
                int total = 0;
                foreach (var item in pool) total = checked(total + item.SoftWeight);
                if (total == 0) throw new InvalidOperationException("Resource random slot has no configured content.");
            }
        }
        if (tables.Chest.Rows.Any(r => r.Name is not ("default" or "SoftOuter" or "SoftMiddle" or "SoftCore" or "Wood" or "Iron" or "Gold")))
            throw new InvalidOperationException("Unsupported resource reward row.");
    }
}
