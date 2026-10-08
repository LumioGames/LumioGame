using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// PRIVATE UNRUN. Root selects the actual declaration; no52 selection here.
// This retains the two original authored profile cohorts. These are real ECS
// structural-storage worlds, not proofs of Native ray reach or inventory-valid
// simultaneous placements. No EffectResult, phase, binding or receipt is forged.
[Collection("BomberWorld")]
public sealed class BomberContactV15StorageCohortTests
{
    [Theory]
    [InlineData(2784, 1703, false)]
    [InlineData(3032, 1714, true)]
    public void ActualPublishedStorageCohortCapturesAndRestoresBelowUnchangedRecordLimit(int bombCapacity, int pickupCapacity, bool supply)
    {
        using var authoring = LongestAuthoring(bombCapacity, pickupCapacity, supply);
        string export = authoring.Compile();
        using WorldManager manager = BomberTestWorld.Start(configDirectory: export);
        var config = BomberConfigBinding.For(manager.World);
        int contactCapacity = new BomberBombState().ContactedChests.MaxCapacity;
        Assert.True(contactCapacity > 5, "Requires the separately selected expanded release.");
        Assert.Equal(contactCapacity, config.ObjectBudgets.PerBombContactLimit);
        Assert.Equal(333, config.ObjectBudgets.ChestLimit);
        Assert.Equal(bombCapacity, config.ObjectBudgets.BombCapacity);
        Assert.Equal(pickupCapacity, config.ObjectBudgets.RequiredPickups);
        EntityOrder[] lives = Enumerable.Range(0, 8).Select(i => BomberTestWorld.QueuePlayer(manager.World, "contact-bytes-" + i)).ToArray();
        manager.Tick();
        manager.Tick();
        BomberPlayerState[] players = lives.Select(order => manager.World.Get<BomberPlayerState>(order.AssignedId)).ToArray();
        Assert.All(players, player =>
        {
            Assert.True(manager.World.IsLive(player.Participant.Value));
            Assert.True(player.LifeGeneration.Value > 0);
            var participant = manager.World.Get<BomberParticipantState>(player.Participant.Value);
            Assert.Equal(player.Entity, participant.CurrentLife.Value);
            Assert.Equal(player.LifeGeneration.Value, participant.LifeGeneration.Value);
        });
        EntityOrder[] bombs = Enumerable.Range(0, bombCapacity).Select(_ => manager.World.Commands.Create<BomberBombEntity>()).ToArray();
        EntityOrder[] chests = Enumerable.Range(0, contactCapacity).Select(_ => manager.World.Commands.Create<BomberChestEntity>()).ToArray();
        EntityOrder[] pickups = Enumerable.Range(0, pickupCapacity).Select(_ => manager.World.Commands.Create<BomberPickupItemEntity>()).ToArray();
        EntityOrder[] walls = Enumerable.Range(0, config.ObjectBudgets.FireZoneCapacity).Select(_ => manager.World.Commands.Create<BomberFireZoneEntity>()).ToArray();
        manager.Tick();
        // Pending hit columns are reserved through the real component API. Their
        // DamageFacts remain unready; no Native effect receipt/status is invented.
        // Source/target participant-life-generation tuples are actual first lives.
        foreach (EntityOrder chest in chests) manager.World.Get<BomberChestState>(chest.AssignedId).InitializeHitBudget();
        foreach (EntityOrder bombOrder in bombs)
        {
            var bomb = manager.World.Get<BomberBombState>(bombOrder.AssignedId);
            bomb.SetSource(new(players[0].Participant.Value, players[0].Entity, players[0].LifeGeneration.Value));
            for (int slot = 0; slot < players.Length; slot++)
                Assert.Equal(BomberStorageAdmission.Added, bomb.TryReserveHit(new(players[slot].Participant.Value, players[slot].Entity, players[slot].LifeGeneration.Value)));
            // Direct physical filling avoids repeated cubic duplicate-validation
            // work. This is labelled storage, not producer/admission evidence.
            foreach (EntityOrder chest in chests) bomb.ContactedChests.Add(chest.AssignedId);
            bomb.ValidateStorage();
        }
        Assert.All(bombs, order => Assert.True(manager.World.IsLive(order.AssignedId)));
        Assert.All(pickups, order => Assert.True(manager.World.IsLive(order.AssignedId)));
        Assert.All(walls, order => Assert.True(manager.World.IsLive(order.AssignedId)));
        byte[] actual = manager.CaptureSnapshot();
        var fields = ContactSnapshotEvidence.ReadFields(actual);
        Assert.Equal(bombCapacity, fields.Count);
        Assert.All(fields, row =>
        {
            Assert.Equal((contactCapacity, contactCapacity), (row.Capacity, row.Count));
            Assert.InRange(row.BlobBytes, 1, PersistenceLimits.Default.MaxBlobBytes);
        });
        ContactSnapshotEvidence.Save("v15-selected-contact-storage-cohort", actual, export, new
        {
            SelectedContactCapacity = contactCapacity, Bombs = bombCapacity, Pickups = pickupCapacity, Walls = walls.Length, Chests = chests.Length,
            PendingHitsPerBomb = 8, ContactBlobBytes = fields.Sum(row => (long)row.BlobBytes),
            Warning = "Storage only; naked legacy line entities have RegionCoverage=false. No traversal, finite10112 region cohort, TerrainContinuations/Native pending transaction or live GAS-result cohort is claimed; actual concurrent obligations need separate producer-driven proof.",
        });
        Assert.InRange(actual.Length, 1, PersistenceLimits.Default.MaxRecordBytes);
        using WorldManager restored = BomberTestWorld.Restore(actual, GeneratedRegistry.Instance, BomberConfigBinding.Load(export));
        Assert.Equal(actual, restored.CaptureSnapshot());
        foreach (EntityOrder order in bombs)
        {
            var bomb = restored.World.Get<BomberBombState>(order.AssignedId);
            Assert.Equal(contactCapacity, bomb.ContactedChests.Count);
            Assert.Equal(BomberStorageAdmission.Duplicate, bomb.InspectChest(chests[0].AssignedId));
            bomb.ValidateStorage();
        }
    }

    private static BomberObjectBudgetTests.AuthoredFixture LongestAuthoring(int bombs, int pickups, bool supply)
    {
        var fixture = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "match_duration_ms", "480000"),
            ("final_circle", "default", "duration_ms", "90000"),
            ("game", "default", "central_supply_enabled", supply ? "true" : "false"),
            ("game", "default", "central_supply_strengthening_count", "5"),
            ("game", "default", "central_supply_health_count", "2"),
            ("game", "default", "central_supply_frenzy_count", "1"),
            ("game", "default", "central_supply_special_count", "1"),
            ("game", "default", "central_supply_golden_heart_count", "2"),
            ("object_budgets", "default", "max_bomb_entities", bombs.ToString(CultureInfo.InvariantCulture)),
            ("object_budgets", "default", "max_pickup_entities", pickups.ToString(CultureInfo.InvariantCulture)));
        if (supply)
        {
            fixture.Change("bomb", "default", "fuse_ms", "2400");
            fixture.Change("bomb", "default", "danger_ms", "500");
        }
        foreach (var (stage, at) in new[] { ("stage2", "29000"), ("stage3", "44250"), ("stage4", "59500"), ("stage5", "74750"), ("stage6", "86150") })
            fixture.Change("circle_stages", stage, "at_ms", at);
        return fixture;
    }
}

