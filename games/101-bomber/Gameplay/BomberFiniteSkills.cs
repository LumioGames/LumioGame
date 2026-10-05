using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberFiniteSkills
{
    internal static bool HasFreeze(World world, NetEntityId life) => world.IsServer
        ? world.Get<EffectComponent>(life).HasActiveEffect(10108u, world.Tick) &&
          !world.Get<EffectComponent>(life).HasActiveEffect(10109u, world.Tick)
        : world.Get<BomberSkillState>(life).FrozenUntilTick.Value > world.Tick;

    internal static bool HasBubble(World world, NetEntityId life) => world.IsServer
        ? world.Get<EffectComponent>(life).HasActiveEffect(10107u, world.Tick)
        : world.Get<BomberSkillState>(life).BubbleUntilTick.Value > world.Tick;
}
