using System;
using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFavoriteFireRegionProductionTests
{
    [Fact]
    public void PublicFavoriteAuraBirthsOneNineCellRegionWithActualNativeAndFiniteInitial()
    {
        // Exercise the official authoring export and real admission. Do not bypass
        // Fire's dormant producer guard or manufacture a disabled held slot.
        using var authored = new BomberObjectBudgetTests.AuthoredFixture(
            ("bomb_kinds", "Fire", "enabled", "true"),
            ("object_budgets", "default", "max_bomb_entities", "4064"),
            ("object_budgets", "default", "max_pickup_entities", "1351"),
            ("object_budgets", "default", "max_firezone_entities", "880"));
        using var scene = new BomberTerrainProductionTests.Scene(0,
            configDirectory: authored.Compile(), controlled: true);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        Assert.Equal(4064, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(1351, config.ObjectBudgets.RequiredPickups);
        Assert.Equal("LegacyPillars", config.Map.LayoutKind);
        Assert.True(config.Game.SkillsEnabled);
        var fire = Assert.Single(config.Tables.BombKinds.Rows, row => row.Name == "Fire");
        Assert.True(fire.Enabled);
        Assert.Equal(2u, fire.KindCode);
        var fireSkill = Assert.Single(config.Tables.Skills.Rows,
            row => row.Slot == "Bomb" && row.BombKindCode == fire.KindCode && !row.IsCombo);

        for (int z = 3; z <= 11; z++)
            for (int x = 3; x <= 11; x++) scene.Write(x, 1, z, 0);
        foreach (NetEntityId other in scene.Lives) Position(world, other, 15, 15);
        NetEntityId life = scene.Lives[0];
        Position(world, life, 5, 5);
        var player = world.Get<BomberPlayerState>(life);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var skill = world.Get<BomberSkillState>(life);
        var match = world.Single<BomberMatchState>();
        var owner = world.Get<AbilityComponent>(life);
        // Same explicit initial-selection preparation as the existing public
        // Aura suite; selection itself performs the authoritative binding.
        match.Phase.Value = (int)BomberMatchPhase.Warmup;
        match.PhaseEndTick.Value = world.Tick + 100;
        participant.SelectedForMatchCharacterId.Value = 0;
        skill.CharacterId.Value = 0;
        var select = new SelectCharacterAbility.Input { CharacterId = 118004 };
        Assert.True(new SelectCharacterAbility().CanActivate(select, owner, out string? selectReason), selectReason);
        var selected = owner.Activate<SelectCharacterAbility, SelectCharacterAbility.Input>(in select, 9401);
        Assert.True(selected.Succeeded, selected.FailureCode);
        Assert.Equal(118004u, skill.CharacterId.Value);
        Assert.Equal(118004, participant.SelectedForMatchCharacterId.Value);
        Assert.True(skill.ActiveSkillBound.Value);
        Assert.Equal(4u, skill.ActiveSkillId.Value);
        Assert.Equal(1, skill.ActiveSkillLevel.Value);
        Assert.Equal(0u, skill.BombSkillId.Value);
        match.Phase.Value = (int)BomberMatchPhase.Running;
        match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(
            config.Game.MatchDurationMs, config.Game.TickRateHz));

        // Only the physical pickup input is fixture-created. The held slot,
        // claim, retirement and public cast are produced by normal abilities.
        EntityOrder item = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Skill);
        item.Get<BomberPickupItem>().SkillId.Value = fireSkill.Id;
        item.Get<BomberPickupItem>().SkillLevel.Value = 1;
        scene.TickControlled();
        var pickup = new PickupAbility.Input { Target = item.AssignedId };
        Assert.True(new PickupAbility().CanActivate(pickup, owner, out string? pickupReason), pickupReason);
        var picked = owner.Activate<PickupAbility, PickupAbility.Input>(in pickup, 9402);
        Assert.True(picked.Succeeded, picked.FailureCode);
        scene.TickControlled();
        scene.TickControlled();
        Assert.False(world.IsLive(item.AssignedId));
        Assert.Equal(fireSkill.Id, skill.BombSkillId.Value);
        Assert.True(BomberSpecialBombResolver.TryResolveSlot(config, skill, out int held));
        Assert.Equal((int)fire.KindCode, held);

        using var receipts = new ReceiptProbe(world);
        var level = config.SkillLevel(4, 1);
        ulong start = world.Tick;
        Assert.True(new UseActiveSkillAbility().CanActivate(default, owner, out string? castReason), castReason);
        var admitted = owner.Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9403);
        Assert.True(admitted.Succeeded, admitted.FailureCode);
        Assert.Equal(1, skill.AuraOutcome.Value);
        Assert.True(skill.AuraFavorite.Value);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
        scene.TickControlled();

        FiniteEffectView actual = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.Equal(10111u, actual.TypeId);
        Assert.Equal(life, actual.Source);
        Assert.Equal(life, actual.Target);
        Assert.Equal(start, actual.AppliedTick);
        Assert.False(actual.Suppressed);
        Assert.Equal(Ticks.FromMilliseconds(level.DurationMs, config.Game.TickRateHz), actual.Duration);
        Assert.Equal(checked(start + actual.Duration), actual.EndTick);
        Assert.Equal(skill.AuraEffectWorld.Value, actual.Handle.WorldId.Value);
        Assert.Equal(skill.AuraEffectInstance.Value, actual.Handle.InstanceId.Value);
        Assert.Equal(skill.AuraEffectGeneration.Value, actual.Handle.Generation);
        var parameters = BomberFireAuraEffect.ReadActualRow(actual);
        Assert.Equal(player.Participant.Value, parameters.Participant);
        Assert.Equal(life, parameters.Life);
        Assert.Equal(player.LifeGeneration.Value, parameters.Generation);
        Assert.Equal(match.MatchId.Value, parameters.MatchId);
        Assert.Equal(skill.AuraChainId.Value, parameters.ChainId);
        Assert.Equal(actual.Duration, parameters.Duration);
        Assert.True(parameters.Favorite);
        EffectResult receipt = Assert.Single(receipts.Results,
            row => row.Handle == actual.Handle && row.Kind == EffectResultKind.Initial);
        Assert.Equal(10111u, receipt.TypeId);
        Assert.Equal(EffectResultOutcome.Applied, receipt.Outcome);
        Assert.Equal(life, receipt.Source);
        Assert.Equal(life, receipt.Target);
        Assert.Equal(start, receipt.AppliedTick);
        Assert.Equal(start, receipt.Tick);
        Assert.NotEqual(0u, receipt.Ordinal);
        Assert.Null(receipt.GeneratedErrorId);
        Assert.Equal(actual.EndTick, skill.AuraUntilTick.Value);
        Assert.Equal(start, skill.CooldownFromTick.Value);
        Assert.Equal(checked(start + Ticks.FromMilliseconds(level.CooldownMs, config.Game.TickRateHz)),
            skill.CooldownUntilTick.Value);
        scene.TickControlled();
        Assert.Single(BomberEffectIntegrationTests.Events(world, "skill_cast"));
        Assert.Equal(1, world.Get<BomberStatistics>(player.Participant.Value).SkillCasts.Value);
        Assert.True(skill.AuraFavorite.Value);

        // The whole cast is qualified by the effective authored object budget.
        // One real region spans the nine open cells; it is not nine entities.
        var first = Assert.Single(world.Each<BomberFireZoneState>(),
            zone => zone.FromTick.Value == start);
        Assert.Equal(player.Participant.Value, first.Owner.Value);
        Assert.Equal(life, first.SourceLife.Value);
        Assert.Equal(player.LifeGeneration.Value, first.SourceLifeGeneration.Value);
        Assert.Equal(match.MatchId.Value, first.SourceMatchId.Value);
        Assert.Equal(skill.AuraChainId.Value, first.SourceChainId.Value);
        Assert.Equal(4u, first.SourceSkill.Value);
        Assert.Equal(0, first.Direction.Value);
        Assert.Equal(3, first.Length.Value);
        Assert.Equal(511, first.CoverageMask.Value);
        Assert.False(string.IsNullOrWhiteSpace(first.PromiseToken.Value));
        Vector3 regionOrigin = world.Get<LogicTransform>(first.Entity).LocalPosition;
        Assert.Equal(5, BomberMatchRules.CellX(regionOrigin));
        Assert.Equal(5, BomberMatchRules.CellZ(regionOrigin));
        ulong regionDuration = Ticks.FromMilliseconds(1000, config.Game.TickRateHz);
        Assert.Equal(20UL, regionDuration);
        Assert.Equal(checked(start + regionDuration), first.UntilTick.Value);
        var regionRow = Assert.Single(world.Get<EffectComponent>(first.Entity).ActiveEffects);
        Assert.Equal(10112u, regionRow.TypeId);
        Assert.Equal(first.Entity, regionRow.Target);
        Assert.Equal(life, regionRow.Source);
        Assert.Equal(start, regionRow.AppliedTick);
        Assert.Equal(regionDuration, regionRow.Duration);
        Assert.Equal(first.UntilTick.Value, regionRow.EndTick);
        Assert.False(regionRow.Suppressed);
        Assert.False(regionRow.Handle.IsDefault);
        EffectResult regionReceipt = Assert.Single(receipts.Results,
            result => result.Handle == regionRow.Handle && result.Kind == EffectResultKind.Initial);
        Assert.Equal(10112u, regionReceipt.TypeId);
        Assert.Equal(EffectResultOutcome.Applied, regionReceipt.Outcome);
        Assert.Equal(first.Entity, regionReceipt.Target);
        Assert.Equal(life, regionReceipt.Source);
        Assert.Equal(start, regionReceipt.AppliedTick);
        Assert.Equal(start, regionReceipt.Tick);
        Assert.NotEqual(0u, regionReceipt.Ordinal);
        Assert.Null(regionReceipt.GeneratedErrorId);
        var regionMachine = world.Get<BomberHfsmState>(first.Entity);
        Assert.True(regionMachine.SnapshotPresent.Value);
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FireZone);
        var native = regionMachine.ReadSnapshot(definition, BomberHfsmKind.FireZone,
            regionMachine.MachineKey.Value);
        Assert.Equal(BomberHfsmDefinitions.State.FireActive, native.ActivePath[^1].State);
        Assert.InRange(System.Linq.Enumerable.Count(world.Each<BomberFireZoneState>()), 1, 110);
        Assert.Equal(880, config.ObjectBudgets.RequiredFireZones);
    }

    private static void Position(World world, NetEntityId life, int x, int z) =>
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(x + .5f, 1.5f, z + .5f));

    // Read-only copies of the actual borrowed phase9 result window.
    private sealed class ReceiptProbe : IDisposable
    {
        private readonly World world;
        private readonly GasWorldContext gas;
        private readonly PropertyInfo observer;
        private readonly Action<EffectResultBatch>? previous;
        internal List<EffectResult> Results { get; } = new();
        internal ReceiptProbe(World world)
        {
            this.world = world;
            gas = GasWorldContext.Require(world);
            observer = typeof(GasWorldContext).GetProperty("ObserveEffectResults", BindingFlags.Instance | BindingFlags.NonPublic)!;
            Assert.NotNull(observer);
            previous = (Action<EffectResultBatch>?)observer.GetValue(gas);
            Assert.Null(previous);
            observer.SetValue(gas, (Action<EffectResultBatch>)Observe);
        }
        private void Observe(EffectResultBatch batch)
        {
            for (int index = 0; index < batch.Count(world); index++) Results.Add(batch.At(world, index));
        }
        public void Dispose() => observer.SetValue(gas, previous);
    }
}
