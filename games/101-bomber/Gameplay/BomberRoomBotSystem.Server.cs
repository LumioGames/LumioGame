using System.Globalization;
using System.Linq;
using Lumio.Bomber.Gameplay.Components.Identity;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

[System(TickPhase.ProcessorPlan)]
[After(typeof(BomberFoundationSystem))]
public sealed class BomberRoomBotSystem : EcsSystem
{
    public override void Execute(World world)
    {
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        BomberMatchState match = world.Single<BomberMatchState>();
        IBomberConfig config = BomberConfigBinding.For(world);
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            if (!participant.IsBot.Value || participant.LifeGeneration.Value != 0) continue;
            BomberPlayerState? player = world.Each<BomberPlayerState>().SingleOrDefault(p =>
                p.IsBot.Value && p.Participant.Value.IsDefault && p.ParticipantIndex.Value == participant.Slot.Value);
            if (player is null) continue;
            participant.CurrentLife.Value = participant.LastLife.Value = player.Entity;
            participant.LifeGeneration.Value = player.LifeGeneration.Value = 1;
            participant.LifePhase.Value = player.LifePhase.Value = (int)(config.Life.FirstSpawnProtected ? BomberLifePhase.Protected : BomberLifePhase.Vulnerable);
            player.Participant.Value = participant.Entity;
            MoveAbility.WritePosition(world, player.Entity, BombSystem.SpawnPosition(config.Map, participant.Slot.Value), nameof(MoveAbility));
            player.ProtectedUntilTick.Value = config.Life.FirstSpawnProtected
                ? checked(world.Tick + Ticks.FromMilliseconds(config.Life.ProtectionMs, config.Game.TickRateHz)) : 0;
        }
        int occupied = world.Each<BomberParticipantState>().Count();
        if (match.Phase.Value != (int)BomberMatchPhase.WaitingForWorldReady || occupied >= config.Game.PlayerCount)
        {
            runtime.BotFillEnabled.Value = false;
            runtime.BotNextJoinTick.Value = 0;
            return;
        }
        if (!runtime.BotFillEnabled.Value || runtime.BotNextJoinTick.Value == 0 || world.Tick < runtime.BotNextJoinTick.Value) return;
        // The fresh-admission declaration closes this due cut before pending pairs
        // can compete with the bot's ordinary participant capacity footprint.
        EntityOrder life = world.Commands.Create<PlayerEntity>();
        BomberPlayerState body = life.Get<BomberPlayerState>();
        body.IsBot.Value = true;
        body.ParticipantIndex.Value = occupied;
        body.Facing.Value = (int)BomberDirection.Down;
        body.NextCharacterId.Value = checked((int)config.Tables.Characters.Rows[0].Id);
        ulong sequence = checked(runtime.BotSequence.Value + 1);
        string name = "bot" + sequence.ToString("000", CultureInfo.InvariantCulture);
        life.Get<IdentityComponent>().Name.Value = name;
        EntityOrder seat = world.Commands.Create<BomberParticipantEntity>();
        BomberParticipantState participantState = seat.Get<BomberParticipantState>();
        participantState.IsBot.Value = true;
        participantState.BotName.Value = name;
        participantState.Slot.Value = occupied;
        participantState.NextCharacterId.Value = body.NextCharacterId.Value;
        runtime.BotSequence.Value = sequence;
        runtime.BotNextJoinTick.Value = occupied + 1 == config.Game.PlayerCount ? 0
            : checked(world.Tick + Ticks.FromMilliseconds(3000, config.Game.TickRateHz));
        if (occupied + 1 == config.Game.PlayerCount) runtime.BotFillEnabled.Value = false;
    }
}
