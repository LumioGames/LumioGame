using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static class BomberBombLifecycle
{
    internal static void Ensure(World world, BomberBombState bomb, NativeHfsmDefinition definition)
    {
        bomb.ValidateStorage();
        BomberHfsmState machine = world.Get<BomberHfsmState>(bomb.Entity);
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        if (!machine.SnapshotPresent.Value)
        {
            if (bomb.Phase.Value != (int)BomberBombPhase.Fuse || bomb.KickDirection.Value != 0)
                throw new InvalidOperationException("Only a new stationary bomb may initialize its HFSM.");
            ulong key = runtime.AllocateHfsmMachineKey();
            HfsmPlan start = definition.Start(key, 1);
            if (start.Outcome != HfsmOutcome.Started || start.Actions.Count != 0 ||
                !machine.StorePlan(start, definition, BomberHfsmKind.Bomb, key))
                throw new InvalidOperationException("Native rejected bomb initialization.");
        }
        HfsmSnapshot snapshot = machine.ReadSnapshot(definition, BomberHfsmKind.Bomb, machine.MachineKey.Value);
        if (snapshot.MachineKey > runtime.NextHfsmMachineKey.Value || snapshot.ActivePath.Count == 0)
            throw new InvalidOperationException("Invalid persisted bomb machine.");
        int expectedPhase = snapshot.ActivePath[^1].State switch
        {
            BomberHfsmDefinitions.State.BombStationary or BomberHfsmDefinitions.State.BombKicked => (int)BomberBombPhase.Fuse,
            BomberHfsmDefinitions.State.BombDanger => (int)BomberBombPhase.Danger,
            BomberHfsmDefinitions.State.BombBurn => (int)BomberBombPhase.Burn,
            BomberHfsmDefinitions.State.BombExtinguished => (int)BomberBombPhase.Extinguished,
            BomberHfsmDefinitions.State.BombExpired => (int)BomberBombPhase.Expired,
            _ => throw new InvalidOperationException("Invalid bomb machine leaf."),
        };
        bool kicked = snapshot.ActivePath[^1].State == BomberHfsmDefinitions.State.BombKicked;
        if (bomb.Phase.Value != expectedPhase || kicked != (bomb.KickDirection.Value != 0))
            throw new InvalidOperationException("Bomb projection disagrees with its Native HFSM.");
    }

    internal static void Send(World world, BomberBombState bomb, NativeHfsmDefinition definition, uint eventId)
    {
        Ensure(world, bomb, definition);
        BomberHfsmState machine = world.Get<BomberHfsmState>(bomb.Entity);
        HfsmSnapshot before = machine.ReadSnapshot(definition, BomberHfsmKind.Bomb, machine.MachineKey.Value);
        HfsmPlan plan = definition.Send(before, eventId,
            new Dictionary<uint, bool> { [BomberHfsmDefinitions.Guard.CanBurn] = bomb.BombKind.Value == (int)BomberBombKind.ReservedFire });
        bool enteringDanger = plan.Actions.Any(action => action.Action == BomberHfsmDefinitions.Action.EnterDanger);
        var geometry = enteringDanger ? bomb.PreflightNativeExplosion() : default;
        if (plan.Outcome != HfsmOutcome.Transitioned ||
            !machine.StorePlan(plan, definition, BomberHfsmKind.Bomb, machine.MachineKey.Value))
            throw new InvalidOperationException($"Native rejected bomb event {eventId}.");
        foreach (HfsmActionEntry action in plan.Actions)
        {
            switch (action.Action)
            {
                case BomberHfsmDefinitions.Action.ReturnCapacity:
                    BombSystem.ReturnBombCapacity(world, bomb);
                    bomb.KickDirection.Value = 0;
                    bomb.KickRange.Value = 0;
                    break;
                case BomberHfsmDefinitions.Action.EnterDanger:
                    bomb.PublishNativeExplosionTraversal(geometry);
                    bomb.Phase.Value = (int)BomberBombPhase.Danger;
                    bomb.ExplodedAtTick.Value = world.Tick;
                    IBomberConfig config = BomberConfigBinding.For(world);
                    bomb.DangerUntilTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Bomb.DangerMs, config.Game.TickRateHz));
                    break;
                case BomberHfsmDefinitions.Action.ExpireBomb:
                    bomb.Phase.Value = (int)BomberBombPhase.Expired;
                    if (!BomberSplitBombs.HoldsFamily(world, bomb)) world.Commands.Destroy(bomb.Entity);
                    break;
                case BomberHfsmDefinitions.Action.EnterBurn:
                    IBomberConfig fireConfig = BomberConfigBinding.For(world);
                    var fireSkill = fireConfig.Tables.Skills.Rows.Single(skill => skill.Name == "fireBomb");
                    uint residual = fireConfig.SkillLevel(fireSkill.Id, 1).DurationMs;
                    bomb.Phase.Value = (int)BomberBombPhase.Burn;
                    bomb.BurnUntilTick.Value = checked(world.Tick + Ticks.FromMilliseconds(residual, fireConfig.Game.TickRateHz));
                    break;
                case BomberHfsmDefinitions.Action.ExtinguishBomb:
                    BomberSplitBombs.CancelUnsubmitted(bomb);
                    bomb.Phase.Value = (int)BomberBombPhase.Extinguished;
                    var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
                    world.Single<BomberPresentationJournal>().Append(world, "bomb_extinguished",
                        world.Single<BomberMatchState>().MatchId.Value, world.Single<BomberWorldRuntime>().AllocateEventSequence(),
                        bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value, entity: bomb.Entity,
                        x: BomberMatchRules.CellX(position), z: BomberMatchRules.CellZ(position));
                    world.Commands.Destroy(bomb.Entity);
                    break;
                default:
                    throw new InvalidOperationException($"Unsupported bomb action {action.Action}.");
            }
        }
    }
}
