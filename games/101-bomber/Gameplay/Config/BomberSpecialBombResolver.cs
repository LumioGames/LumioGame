using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.Config;

internal static class BomberSpecialBombResolver
{
    internal static bool TryResolve(IBomberConfig config, uint skillId, out int kind)
    {
        kind = 0;
        foreach (var skill in config.Tables.Skills.Rows)
        {
            if (skill.Id != skillId || skill.Slot != "Bomb" || skill.Trigger != "PlaceBomb" ||
                skill.IsCombo || !IsM2Kind(skill.BombKindCode)) continue;
            foreach (var bomb in config.Tables.BombKinds.Rows)
            {
                if (bomb.KindCode != skill.BombKindCode || !bomb.Enabled) continue;
                kind = checked((int)bomb.KindCode);
                return true;
            }
        }
        return false;
    }

    internal static bool TryResolveSlot(IBomberConfig config, BomberSkillState slot, out int kind)
    {
        kind = 0;
        return !config.Game.SkillsEnabled || slot.BombSkillId.Value == 0 ||
            TryResolve(config, slot.BombSkillId.Value, out kind);
    }

    private static bool IsM2Kind(uint kind) => kind is 1u or 2u or 3u or 4u or 5u or 7u;
}
