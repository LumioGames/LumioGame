using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// PRIVATE TOOLING DRAFT, UNRUN. Requires the full accepted Favorite implementation,
// legitimate official GEN, and Root's independently selected startup-valid quotas.
// No test-local GAS limits or generated image edits are made. The authored bomb
// cohort is explicitly a production-path fixture, not a public-history certificate.
[Collection("BomberWorld")]
public sealed class BomberGasAcceptedLeaseNativeTests
{
    private static readonly JsonSerializerOptions EvidenceJsonOptions = new() { WriteIndented = true };

    [Fact]
    public void AlreadyAcceptedWholeCastMustKeepItsThirdOwedBirthWhenBombContactsSaturateTheSameTick()
    {
        string? configDirectory = Environment.GetEnvironmentVariable("LUMIO_BOMBER_GAS_CONFIG_DIRECTORY");
        string? outputDirectory = Environment.GetEnvironmentVariable("LUMIO_BOMBER_GAS_DIAGNOSTIC_DIR");
        Assert.False(string.IsNullOrWhiteSpace(configDirectory), "Root must provide the exact official compiled Fire-enabled profile.");
        Assert.False(string.IsNullOrWhiteSpace(outputDirectory), "Root must provide a private diagnostic output directory.");
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: configDirectory, controlled: true);
        World world = scene.World;
        var loaded = BomberConfigBinding.For(world);
        Assert.True(loaded.Game.SkillsEnabled, "This diagnostic requires loaded SkillsEnabled=true.");
        Assert.True(loaded.SkillRules.FreezeBombDamages, "This diagnostic requires loaded FreezeBombDamages=true.");
        Assert.Equal(8, scene.Lives.Length);
        Assert.Equal(8, scene.Lives.Distinct().Count());
        Assert.Equal(8, world.Each<BomberPlayerState>().Count());
        Assert.All(scene.Lives, id => Assert.True(world.IsLive(id)));
        Assert.Equal(8, scene.Lives.Select(id => world.Get<BomberPlayerState>(id).Participant.Value).Distinct().Count());
        const int sourceCellX = 1, sourceCellZ = 1, targetCellX = 9, targetCellZ = 9, power = 6;
        var sourcePosition = new Vector3(sourceCellX + .5f, 1.5f, sourceCellZ + .5f);
        NetEntityId life = scene.Lives[0];
        var player = world.Get<BomberPlayerState>(life);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var skill = world.Get<BomberSkillState>(life);
        var match = world.Single<BomberMatchState>();
        for (int z = 1; z <= 17; z++) for (int x = 1; x <= 17; x++)
        {
            uint block = scene.Native.ReadCell(new VoxelWorldCoordinate(x, 1, z)).BlockId >> 8;
            if (block is 1025u or 1026u) scene.Write(x, 1, z, 0);
        }
        for (int n = 3; n <= 15; n++) { scene.Write(9, 1, n, 0); scene.Write(n, 1, 9, 0); }
        scene.Write(sourceCellX, 1, sourceCellZ, 0);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(sourceCellX, 1, sourceCellZ)).BlockId);
        foreach (NetEntityId other in scene.Lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(other), new Vector3(15.5f, 1.5f, 15.5f));
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), sourcePosition);
        match.Phase.Value = (int)BomberMatchPhase.Warmup; match.PhaseEndTick.Value = world.Tick + 100;
        participant.SelectedForMatchCharacterId.Value = 0; skill.CharacterId.Value = 0;
        var selection = new SelectCharacterAbility.Input { CharacterId = 118004 };
        var selected = world.Get<AbilityComponent>(life).Activate<SelectCharacterAbility, SelectCharacterAbility.Input>(in selection, 9601);
        Assert.True(selected.Succeeded, selected.FailureCode);
        match.Phase.Value = (int)BomberMatchPhase.Running;
        match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(240000, BomberConfigBinding.For(world).Game.TickRateHz));
        uint fireSkill = BomberConfigBinding.For(world).Tables.Skills.Rows.Single(row => row.Slot == "Bomb" && row.BombKindCode == 2 && !row.IsCombo).Id;
        EntityOrder item = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Skill);
        BomberEffectIntegrationTests.Position(item.Get<LogicTransform>(), sourcePosition);
        Vector3 authoredPickupPosition = item.Get<LogicTransform>().LocalPosition;
        item.Get<BomberPickupItem>().SkillId.Value = fireSkill; item.Get<BomberPickupItem>().SkillLevel.Value = 1;
        scene.TickControlled();
        var pickup = new PickupAbility.Input { Target = item.AssignedId };
        var picked = world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(in pickup, 9602);
        Assert.True(picked.Succeeded, picked.FailureCode); scene.TickControlled(); scene.TickControlled();
        Assert.True(BomberConfigBinding.For(world).Game.SkillsEnabled);
        Assert.True(BomberConfigBinding.For(world).SkillRules.FreezeBombDamages);
        Assert.Equal(8, scene.Lives.Length);
        Assert.All(scene.Lives, id => Assert.True(world.IsLive(id)));
        Assert.Equal(sourceCellX, BomberMatchRules.CellX(world.Get<LogicTransform>(life).LocalPosition));
        Assert.Equal(sourceCellZ, BomberMatchRules.CellZ(world.Get<LogicTransform>(life).LocalPosition));
        Assert.Equal(sourcePosition, authoredPickupPosition);
        long sourceHealthBeforeBurst = world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints);
        Assert.True(sourceHealthBeforeBurst > 0);
        ulong start = world.Tick;
        var cast = world.Get<AbilityComponent>(life).Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9603);
        Assert.True(cast.Succeeded, cast.FailureCode);
        Assert.True(skill.AuraFavorite.Value);
        scene.TickControlled();
        Assert.Contains(world.Each<BomberFireZoneState>(), zone => zone.SourceLife.Value == life && zone.RegionOrdinal.Value == 0 && zone.LifetimeOutcome.Value == 3);
        ulong acceptedChain = skill.AuraChainId.Value;
        ulong acceptedCooldown = skill.CooldownUntilTick.Value;
        ulong acceptedLifeGeneration = player.LifeGeneration.Value, acceptedMatchId = match.MatchId.Value;
        int acceptedCastCount = world.Get<BomberStatistics>(participant.Entity).SkillCasts.Value;

        // The accepted Aura source stays at (1,1), outside every Power-6 cross.
        // These positions are authored fixtures, not a Movement/Replay claim. Its other seven current
        // participants are legitimate distinct victims. Health rejects later rows
        // only at F, after their admission slots have already been demanded.
        foreach (NetEntityId victim in scene.Lives.Skip(1))
        {
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(victim), new Vector3(targetCellX + .5f, 1.5f, targetCellZ + .5f));
            world.Get<BomberPlayerState>(victim).LifePhase.Value = (int)BomberLifePhase.Vulnerable;
            world.Get<BomberPlayerState>(victim).ProtectedUntilTick.Value = 0;
        }
        var origins = new List<(int X, int Z)> { (9, 9) };
        for (int d = 1; d <= 6; d++) { origins.Add((9 - d, 9)); origins.Add((9 + d, 9)); origins.Add((9, 9 - d)); origins.Add((9, 9 + d)); }
        Assert.Equal(25, origins.Count);
        Assert.Equal(25, origins.Distinct().Count());
        Assert.All(origins, origin => Assert.True(AxisReach(origin.X, origin.Z, targetCellX, targetCellZ, power)));
        Assert.All(origins, origin => Assert.False(AxisReach(origin.X, origin.Z, sourceCellX, sourceCellZ, power)));
        var source = world.Get<BomberPlayerState>(scene.Lives[1]);
        var authoredBombSource = new { Participant = source.Participant.Value.ToHex(), Life = source.Entity.ToHex(),
            Generation = source.LifeGeneration.Value, Family = (int)BomberBombKind.Freeze };
        var orders = new List<EntityOrder>();
        foreach (var entry in origins.Select((origin, index) => (origin, index)))
        {
            EntityOrder order = BomberBombAdmissions.CreatePrimary(world);
            orders.Add(order);
            var bomb = order.Get<BomberBombState>();
            bomb.Owner.Value = source.Participant.Value; bomb.SourceLife.Value = source.Entity;
            bomb.SourceLifeGeneration.Value = source.LifeGeneration.Value;
            bomb.ChainId.Value = checked(100200UL + (ulong)entry.index);
            bomb.BombKind.Value = (int)BomberBombKind.Freeze; bomb.Phase.Value = (int)BomberBombPhase.Fuse;
            bomb.Power.Value = power; bomb.FuseEndTick.Value = checked(world.Tick + 1);
            bomb.PlacedAtTick.Value = world.Tick; bomb.CapacityReturned.Value = true;
            BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(entry.origin.X + .5f, 1.5f, entry.origin.Z + .5f));
        }
        Assert.Equal(25, orders.Count);
        scene.TickControlled(); // second ordinary birth + actual bomb publication
        Assert.Equal(25, orders.Select(order => order.AssignedId).Distinct().Count());
        Assert.All(orders, order => Assert.True(world.IsLive(order.AssignedId)));
        Assert.True(BomberConfigBinding.For(world).Game.SkillsEnabled);
        Assert.True(BomberConfigBinding.For(world).SkillRules.FreezeBombDamages);
        Assert.Equal(8, scene.Lives.Length);
        Assert.All(scene.Lives, id => Assert.True(world.IsLive(id)));
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        Assert.Equal(sourceCellX, BomberMatchRules.CellX(world.Get<LogicTransform>(life).LocalPosition));
        Assert.Equal(sourceCellZ, BomberMatchRules.CellZ(world.Get<LogicTransform>(life).LocalPosition));
        var qualifiedVictims = scene.Lives.Skip(1).Select(id => QualifyVictim(world, id, match.MatchId.Value, targetCellX, targetCellZ)).ToArray();
        Assert.Equal(7, qualifiedVictims.Length);
        Assert.Equal(7, qualifiedVictims.Select(victim => victim.Identity.Participant).Distinct().Count());
        Assert.Equal(7, qualifiedVictims.Select(victim => victim.Identity.Life).Distinct().Count());
        Assert.DoesNotContain(qualifiedVictims, victim => victim.Identity.Life == life.ToHex());
        ulong tickBeforeBurst = world.Tick;
        Exception? failure = Record.Exception(() => scene.TickControlled()); // third owed birth + real competing admissions

        // Recovery is diagnostic read-only. Never rerun Tick, Effects.Apply, or any
        // producer/consumer to manufacture evidence after the original exception.
        var recoveryErrors = new List<string>();
        var contacts = new List<ContactSnapshot>();
        var bombs = new List<BombSnapshot>();
        foreach (EntityOrder order in orders)
        {
            try
            {
                var bomb = world.Get<BomberBombState>(order.AssignedId);
                var facts = world.Get<BomberDamageFacts>(order.AssignedId);
                int rowCount = facts.Target.Count;
                bombs.Add(new BombSnapshot(bomb.Entity.ToHex(), new SourceSnapshot(bomb.Owner.Value.ToHex(), bomb.SourceLife.Value.ToHex(),
                    bomb.SourceLifeGeneration.Value, bomb.BombKind.Value, bomb.ChainId.Value), bomb.Power.Value, bomb.Phase.Value,
                    bomb.ExplodedAtTick.Value, rowCount));
                for (int row = 0; row < rowCount; row++)
                {
                    try
                    {
                        contacts.Add(new ContactSnapshot(bomb.Entity.ToHex(), row, facts.TypeId[row], facts.Target[row].ToHex(),
                            facts.Source[row].ToHex(), facts.MatchId[row], new TargetSnapshot(facts.Participant[row].ToHex(), facts.Life[row].ToHex(), facts.Generation[row]),
                            new SourceSnapshot(facts.SourceParticipant[row].ToHex(), facts.SourceLife[row].ToHex(), facts.SourceGeneration[row], facts.Family[row], facts.ChainId[row]),
                            facts.X[row], facts.Z[row], facts.Cause[row], facts.Tick[row], facts.Status[row], facts.Ready[row], facts.Before[row], facts.After[row], facts.Actual[row],
                            new HandleSnapshot(facts.HandleWorld[row], facts.HandleInstance[row], facts.HandleGeneration[row]),
                            new HandleSnapshot(bomb.HitHandleWorlds[row], bomb.HitHandleInstances[row], bomb.HitHandleGenerations[row]),
                            bomb.HitDependentsAdmitted[row], bomb.HitStates[row],
                            new TargetSnapshot(bomb.HitParticipants[row].ToHex(), bomb.HitLives[row].ToHex(), bomb.HitLifeGenerations[row])));
                    }
                    catch (Exception captureFailure) { recoveryErrors.Add($"bomb={order.AssignedId.ToHex()} row={row}: {captureFailure}"); }
                }
            }
            catch (Exception captureFailure) { recoveryErrors.Add($"bomb={order.AssignedId.ToHex()}: {captureFailure}"); }
        }
        BomberFireZoneState[] third = Array.Empty<BomberFireZoneState>();
        try { third = world.Each<BomberFireZoneState>().Where(zone => zone.SourceLife.Value == life && zone.RegionOrdinal.Value == 2).ToArray(); }
        catch (Exception captureFailure) { recoveryErrors.Add($"thirdRegion: {captureFailure}"); }
        bool regionPublicationAfterBombSubmission = false;
        try
        {
            // ProcessorPlan completes SubmitDamage before EcsCommandBufferCommit
            // invokes this region's Awake. BirthSubmitted is set inside that Awake.
            // This exact retained witness permits refusal counts even when its
            // owed admission then throws; an earlier failure remains unknown.
            regionPublicationAfterBombSubmission = third.Any(zone => zone.SourceLifeGeneration.Value == acceptedLifeGeneration &&
                zone.SourceMatchId.Value == acceptedMatchId && zone.SourceChainId.Value == acceptedChain && zone.FromTick.Value == world.Tick &&
                zone.BirthSubmitted.Value && zone.LifetimeOutcome.Value is 2 or 3 or 5);
        }
        catch (Exception captureFailure) { recoveryErrors.Add($"postSubmissionPublicationWitness: {captureFailure}"); }
        int primaryAdmitted = contacts.Count(contact => contact.FactHandle.Generation != 0);
        int primaryRefusedWitnesses = contacts.Count(contact => contact.FactHandle.Generation == 0 && contact.Status == 2);
        int primaryUnconfirmed = contacts.Count(contact => contact.FactHandle.Generation == 0 && contact.Status != 2);
        int dependentAdmitted = contacts.Count(contact => contact.FactHandle.Generation != 0 && contact.DependentAdmitted);
        int dependentNotAdmitted = contacts.Count(contact => contact.FactHandle.Generation != 0 && !contact.DependentAdmitted);
        object? retainedLease = RecoveryRead("retainedLease", () => BomberFavoriteFireZones.HasSource(world, life), recoveryErrors);
        object? sourceAlive = RecoveryRead("sourceAlive", () => world.IsLive(life), recoveryErrors);
        object? sourceHealth = RecoveryRead("sourceHealth", () => world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints), recoveryErrors);
        object? thirdFields = RecoveryRead("thirdRegionFields", () => third.Select(zone => new { id = zone.Entity.ToHex(), ordinal = zone.RegionOrdinal.Value, outcome = zone.LifetimeOutcome.Value,
            handleWorld = zone.LifetimeEffectWorld.Value, handleInstance = zone.LifetimeEffectInstance.Value, handleGeneration = zone.LifetimeEffectGeneration.Value,
            chain = zone.SourceChainId.Value }).ToArray(), recoveryErrors);
        bool completeCapture = recoveryErrors.Count == 0 && bombs.Count == orders.Count;
        bool completedQualifiedProducer = (failure is null || regionPublicationAfterBombSubmission) && completeCapture && primaryUnconfirmed == 0;
        var observations = new
        {
            status = "ACTUAL_NATIVE_OBSERVATION", qualification = "SkillsEnabled=true; FreezeBombDamages=true; 8 current lives; 7 qualified victims; safe source (1,1)",
            loadedSkillsEnabled = loaded.Game.SkillsEnabled, loadedFreezeBombDamages = loaded.SkillRules.FreezeBombDamages,
            start, tickBeforeBurst, tick = world.Tick, acceptedChain, acceptedCooldown, acceptedCastCount, acceptedLifeGeneration, acceptedMatchId,
            sourceCellX, sourceCellZ, targetCellX, targetCellZ, power, authoredPickupPosition = new { authoredPickupPosition.X, authoredPickupPosition.Y, authoredPickupPosition.Z },
            origins = origins.Select(origin => new { origin.X, origin.Z, targetInConservativeCross = AxisReach(origin.X, origin.Z, targetCellX, targetCellZ, power),
                sourceInConservativeCross = AxisReach(origin.X, origin.Z, sourceCellX, sourceCellZ, power) }).ToArray(),
            authoredBombSource, qualifiedVictims, savedBombIds = orders.Select(order => order.AssignedId.ToHex()).ToArray(),
            actualCapturedBombs = bombs.Count, actualCapturedContacts = contacts.Count, primaryAdmitted, primaryRefusedWitnesses, primaryUnconfirmed,
            dependentAdmitted, dependentNotAdmitted,
            dependentRefusedIfCompletedQualifiedProducer = completedQualifiedProducer ? (int?)dependentNotAdmitted : null,
            dependentUnconfirmedAfterFailure = failure is not null && !completedQualifiedProducer ? dependentNotAdmitted : 0,
            actualAdmissionRequestWitnessLowerBound = primaryAdmitted + primaryRefusedWitnesses + dependentAdmitted,
            actualAdmissionAttemptsIfCompletedQualifiedProducer = completedQualifiedProducer ? (int?)(primaryAdmitted + primaryRefusedWitnesses + primaryAdmitted) : null,
            countMeaning = "Rows are recovered observations. Nonzero full primary handle witnesses admission; zero handle plus status 2 witnesses primary refusal. A true dependency flag witnesses a real successful Apply only under the asserted loaded profile. A matching third-region BirthSubmitted witness proves earlier ProcessorPlan completed, even if its subsequent admission throws. Without completed Tick or that witness, false dependency flags remain unconfirmed. No constant is an actual request count.",
            completeCapture, regionPublicationAfterBombSubmission, completedQualifiedProducer, failure = failure?.ToString(), recoveryErrors, bombs, contacts,
            retainedLease, sourceAlive, sourceHealthBeforeBurst, sourceHealth, third = thirdFields
        };
        Directory.CreateDirectory(outputDirectory!);
        File.WriteAllText(Path.Combine(outputDirectory!, "native-accepted-lease-birth2-cohort.json"), JsonSerializer.Serialize(observations, EvidenceJsonOptions));
        Assert.Null(failure);
        Assert.Empty(recoveryErrors);
        Assert.Equal(25, bombs.Count);
        Assert.Equal(175, contacts.Count); // Expected geometry; evidence above records the actual count independently.
        Assert.DoesNotContain(contacts, contact => contact.Target == life.ToHex());
        Assert.Equal(25, contacts.Select(contact => contact.Bomb).Distinct().Count());
        var expectedTargets = qualifiedVictims.Select(victim => victim.Identity).OrderBy(target => target.Participant).ToArray();
        foreach (EntityOrder order in orders)
        {
            ContactSnapshot[] actual = contacts.Where(contact => contact.Bomb == order.AssignedId.ToHex()).ToArray();
            Assert.Equal(7, actual.Length);
            Assert.Equal(expectedTargets, actual.Select(contact => contact.TargetIdentity).OrderBy(target => target.Participant).ToArray());
            BombSnapshot capturedBomb = Assert.Single(bombs, bomb => bomb.Bomb == order.AssignedId.ToHex());
            Assert.Equal(power, capturedBomb.Power);
            Assert.All(actual, contact =>
            {
                Assert.Equal(10101u, contact.TypeId);
                Assert.Equal(contact.TargetIdentity.Life, contact.Target);
                Assert.Equal(contact.TargetIdentity, contact.Reservation);
                Assert.Equal(contact.Bomb, contact.Source);
                Assert.Equal(match.MatchId.Value, contact.MatchId);
                Assert.Equal(authoredBombSource.Participant, contact.CapturedSource.Participant);
                Assert.Equal(authoredBombSource.Life, contact.CapturedSource.Life);
                Assert.Equal(authoredBombSource.Generation, contact.CapturedSource.Generation);
                Assert.Equal((int)BomberBombKind.Freeze, contact.CapturedSource.Family);
                Assert.Equal(capturedBomb.Source.Chain, contact.CapturedSource.Chain); // Native chain propagation may change the authored chain.
                Assert.Equal(targetCellX, contact.X); Assert.Equal(targetCellZ, contact.Z);
                Assert.Equal((int)BomberDamageCause.Explosion, contact.Cause);
                Assert.NotEqual(0u, contact.FactHandle.Generation);
                Assert.NotEqual(0UL, contact.FactHandle.World); Assert.NotEqual(0UL, contact.FactHandle.Instance);
                Assert.Equal(contact.FactHandle, contact.BombHandle);
                Assert.True(contact.DependentAdmitted);
            });
        }
        Assert.Equal(0, primaryRefusedWitnesses);
        Assert.Equal(0, primaryUnconfirmed);
        Assert.Equal(0, dependentNotAdmitted);
        Assert.Equal(sourceHealthBeforeBurst, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
        BomberFireZoneState applied = Assert.Single(third);
        Assert.Equal(3, applied.LifetimeOutcome.Value);
        Assert.NotEqual(0u, applied.LifetimeEffectGeneration.Value);
        Assert.Equal(acceptedChain, applied.SourceChainId.Value);
        Assert.True(BomberFavoriteFireZones.HasSource(world, life));
    }

    // Every real Freeze blast is a subset of this inclusive Manhattan-axis cross.
    // Source (1,1) shares neither axis with any origin (9,d)/(d,9), d in 3..15.
    private static bool AxisReach(int x, int z, int targetX, int targetZ, int power) =>
        (x == targetX && Math.Abs(z - targetZ) <= power) || (z == targetZ && Math.Abs(x - targetX) <= power);

    private static VictimQualification QualifyVictim(World world, NetEntityId id, ulong matchId, int x, int z)
    {
        Assert.True(world.IsLive(id));
        var player = world.Get<BomberPlayerState>(id);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        long health = world.Get<AttributeComponent>(id).GetBaseValue(BomberAttributeNames.HealthPoints);
        bool bubble = BomberFiniteSkills.HasBubble(world, id);
        Assert.False(player.Participant.Value.IsDefault);
        Assert.NotEqual(0UL, player.LifeGeneration.Value);
        Assert.Equal(id, participant.CurrentLife.Value);
        Assert.Equal(player.LifeGeneration.Value, participant.LifeGeneration.Value);
        Assert.Equal(matchId, participant.MatchId.Value);
        Assert.Equal((int)BomberLifePhase.Vulnerable, player.LifePhase.Value);
        Assert.True(player.ProtectedUntilTick.Value <= world.Tick);
        Assert.False(player.RestorePending.Value);
        Assert.True(health > 0);
        Assert.False(bubble);
        Assert.Equal(x, BomberMatchRules.CellX(world.Get<LogicTransform>(id).LocalPosition));
        Assert.Equal(z, BomberMatchRules.CellZ(world.Get<LogicTransform>(id).LocalPosition));
        return new VictimQualification(new TargetSnapshot(player.Participant.Value.ToHex(), id.ToHex(), player.LifeGeneration.Value),
            matchId, world.Tick, player.LifePhase.Value, player.ProtectedUntilTick.Value, player.RestorePending.Value, health, bubble, x, z);
    }

    private static object? RecoveryRead(string name, Func<object?> read, List<string> errors)
    {
        try { return read(); }
        catch (Exception failure) { errors.Add($"{name}: {failure}"); return null; }
    }

    private sealed record TargetSnapshot(string Participant, string Life, ulong Generation);
    private sealed record SourceSnapshot(string Participant, string Life, ulong Generation, int Family, ulong Chain);
    private sealed record HandleSnapshot(ulong World, ulong Instance, uint Generation);
    private sealed record VictimQualification(TargetSnapshot Identity, ulong MatchId, ulong QualificationTick, int Phase, ulong ProtectedUntil,
        bool RestorePending, long Health, bool Bubble, int X, int Z);
    private sealed record BombSnapshot(string Bomb, SourceSnapshot Source, int Power, int Phase, ulong ExplodedAtTick, int ObservedRows);
    private sealed record ContactSnapshot(string Bomb, int Row, uint TypeId, string Target, string Source, ulong MatchId, TargetSnapshot TargetIdentity,
        SourceSnapshot CapturedSource, int X, int Z, int Cause, ulong FactTick, int Status, bool Ready, long Before, long After, long Actual,
        HandleSnapshot FactHandle, HandleSnapshot BombHandle, bool DependentAdmitted, int HitState, TargetSnapshot Reservation);
}
