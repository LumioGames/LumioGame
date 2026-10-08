using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberBombButton
{
    internal static bool CanPress(AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (owner is null || !owner.World.IsLive(owner.Entity))
        { failureCode = "ability_owner_missing"; return false; }
        var world = owner.World;
        if (!BomberInputMemory.IsCurrent(world, world.Get<BomberPlayerState>(owner.Entity)))
        { failureCode = "bomb_source_invalid"; return false; }
        if (BomberFiniteSkills.HasFreeze(world, owner.Entity) || BomberFiniteSkills.HasBubble(world, owner.Entity))
        { failureCode = "player_control_locked"; return false; }
        if (!BomberSpecialBombResolver.TryResolveSlot(BomberConfigBinding.For(world),
                world.Get<BomberSkillState>(owner.Entity), out _))
        { failureCode = "bomb_skill_invalid"; return false; }
        return true;
    }

    internal static void Clear(BomberPlayerState player)
    {
        player.BombButtonMode.Value = 0;
        player.BombButtonStartedTick.Value = 0;
        player.BombButtonLastInputTick.Value = 0;
        player.BombButtonLifeGeneration.Value = 0;
    }

    internal static void Process(AbilityComponent owner, int phase) => ProcessAuthoritative(owner, phase);
    static partial void ProcessAuthoritative(AbilityComponent owner, int phase);
}
