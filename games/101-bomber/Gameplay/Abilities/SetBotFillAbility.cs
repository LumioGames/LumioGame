using System.Collections.Generic;
using System.Globalization;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

[AbilityType(8u, Prediction = PredictionKind.AuthorityOnly)]
public sealed class SetBotFillAbility : AbilityType<SetBotFillAbility.Input>
{
    public const uint TypeId = 8u;
    public struct Input : IAbilityInput
    {
        public bool Enabled;
        public void Write(IList<object?> args) => args.Add(Enabled.ToString(CultureInfo.InvariantCulture));
        public bool TryRead(IReadOnlyList<object?> args, int start) =>
            args is not null && start >= 0 && args.Count - start == 1 &&
            bool.TryParse(args[start]?.ToString(), out Enabled);
    }

    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (owner is null) { failureCode = "ability_owner_missing"; return false; }
        World world = owner.World;
        if (!world.IsLive(owner.Entity) || !world.TypeOf(owner.Entity).Is<PlayerEntity>())
        { failureCode = "room_player_missing"; return false; }
        BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
        BomberMatchState match = world.Single<BomberMatchState>();
        if (match.Phase.Value != (int)BomberMatchPhase.WaitingForWorldReady || match.MatchId.Value != 0)
        { failureCode = "room_fill_closed"; return false; }
        if (player.IsBot.Value || player.Participant.Value.IsDefault || !world.IsLive(player.Participant.Value))
        { failureCode = "room_human_required"; return false; }
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        if (participant.IsBot.Value || participant.CurrentLife.Value != owner.Entity ||
            participant.LifeGeneration.Value != player.LifeGeneration.Value || participant.MatchId.Value != match.MatchId.Value)
        { failureCode = "room_human_required"; return false; }
#if LUMIO_SERVER
        if (world.Get<ObserverComponent>(owner.Entity).ConnectionGeneration == 0)
        { failureCode = "room_human_required"; return false; }
#endif
        return true;
    }

    public override void Execute(in Input input, AbilityComponent owner)
    {
        if (!CanActivate(input, owner, out _)) return;
        BomberWorldRuntime runtime = owner.World.Single<BomberWorldRuntime>();
        if (runtime.BotFillEnabled.Value == input.Enabled) return;
        runtime.BotFillEnabled.Value = input.Enabled;
        runtime.BotNextJoinTick.Value = input.Enabled
            ? checked(owner.World.Tick + Ticks.FromMilliseconds(3000, BomberConfigBinding.For(owner.World).Game.TickRateHz)) : 0;
    }
}
