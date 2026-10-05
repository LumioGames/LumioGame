using System;
using System.Collections.Generic;
using System.Globalization;
using System.Security.Cryptography;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// An actual Native snapshot/provider composition with a bounded test writer. This
// replaces legacy direct controlled Enqueue; it does not stand in for DS acceptance.
internal sealed class BomberAdmissionFixture : IWorldSubsystem
{
    private const long GrantBytes = 8 * 1024 * 1024;
    private const long ProcessBytes = 128 * 1024 * 1024;
    private const int SenderRecords = 4096;
    private WorldManager manager = null!;
    private AdmissionHostBudget snapshots = null!;
    private AdmissionHostPublicationOwner publications = null!;
    private AdmissionDebtService debts = null!;
    private readonly List<Pending> pending = new();
    private long charged;
    private ulong sequence;

    internal AuthoritySectionSubsystem Sections { get; } = new(new SectionProducerOptions(
        new(64, 256, 256, 4_000_000, 1_000_000), new(64, 4_000_000, 2_000_000)))
    {
        AdmissionArenaBudget = new(new string('f', 32), new(64, 4_000_000, 2_000_000), 6_000_000),
        SubscriptionOptions = new(2, 1, 1, 65536),
    };

    public string Name => "bomber.test-admission";
    public IReadOnlyList<string> Dependencies => new[] { "authority.sections" };
    public void Initialize(WorldManager world)
    {
        manager = world;
        snapshots = new(world);
        publications = new(world);
        debts = new(publications, new AdmissionRuntimeCleanupOwner(world), new RejectUnexpectedTransfer());
        world.ConfigureAdmissionPublication(new NativeAdmissionSnapshotSource(Sections, snapshots), publications, debts);
    }
    public void RegisterSystems(WorldSystemRegistration systems) => systems.Add(new(
        typeof(DrainPhysicalPublications).FullName!, TickPhase.ApplyInputs, Array.Empty<string>(),
        Array.Empty<string>(), Array.Empty<string>(), () => new DrainPhysicalPublications(Sections)));
    public void Shutdown(WorldManager world)
    {
        Assert.Empty(pending);
        Assert.Equal(0, charged);
        Assert.False(debts.HasRetainedObligations);
    }

    internal void Enqueue(string connection, string account, string room, string entityType, WireProfile profile)
    {
        var result = TryEnqueue(connection, account, room, entityType, profile);
        Assert.True(result.Status == "Acquired", $"Acquire {connection}: {result.Status}/{result.Code}");
    }

    internal SuccessorAdmissionPlanResult TryEnqueue(string connection, string account, string room, string entityType, WireProfile profile,
        long grantBytes = GrantBytes, Action<WorldManager>? beforeValidate = null)
    {
        ulong id = ++sequence;
        string text = id.ToString(CultureInfo.InvariantCulture);
        string incarnation = manager.WorldIncarnation.ToHex();
        var context = new SuccessorAdmissionContext(incarnation, text, connection,
            new NetEntityId(manager.World.InstanceId, id).ToHex(), "1", account, room, profile.SuccessorProfileId(),
            manager.World.InstanceId, manager.World.Tick.ToString(CultureInfo.InvariantCulture), "admit", entityType);
        var capacity = new SuccessorAdmissionPublication(context.AdmissionId, "4096", "8388608", "256", "8388608", "1", "65536");
        Assert.InRange(charged + grantBytes, 0, ProcessBytes);
        charged += grantBytes; // Debit before the trusted Host grant is opened.
        string grantId = string.Concat(Convert.ToHexStringLower(SHA256.HashData(WireCodec.StrictUtf8.GetBytes(incarnation))).AsSpan(0, 16),
            id.ToString("x16", CultureInfo.InvariantCulture));
        Assert.True(snapshots.TryBeginSnapshotGrant(grantId, context, grantBytes, "1", 65536, out var scope));
        SuccessorAdmissionPlan plan;
        using (scope)
        {
            var result = manager.AdmissionPlans.Acquire(new(context, capacity));
            if (result.Status != "Acquired" && snapshots.ReadReceipt(grantId) is { Disposition: "Released" } failed)
            { Assert.True(snapshots.HandOffReleasedReceipt(failed)); charged -= grantBytes; }
            if (result.Status != "Acquired") return result;
            plan = result.Plan!.Value;
        }
        var snapshotReceipt = snapshots.ReadReceipt(grantId)!.Value;
        Assert.Equal("Retained", snapshotReceipt.Disposition);
        charged -= grantBytes - snapshotReceipt.RetainedBytes;
        ulong records = ulong.Parse(plan.FrameCount, CultureInfo.InvariantCulture);
        ulong bytes = ulong.Parse(plan.FrameBytes, CultureInfo.InvariantCulture);
        Assert.InRange(records, 1UL, (ulong)SenderRecords);
        Assert.InRange(charged + checked((long)bytes), 0, ProcessBytes);
        charged += checked((long)bytes);
        // Allocate the exact bounded sender slots before lending the capability.
        var frames = new byte[checked((int)records)][];
        string reservationId = new NetEntityId(manager.World.InstanceId, id).ToHex();
        Assert.True(publications.TryBeginReservation(reservationId, plan, "1", records, bytes, out scope));
        using (scope) Assert.Equal("Accepted", manager.AdmissionPlans.Process(new("Reserve", plan)).Status);
        beforeValidate?.Invoke(manager);
        var validation = manager.AdmissionPlans.Process(new("Validate", plan));
        if (validation.Status != "Accepted")
        {
            var unused = publications.ReadReceipt(reservationId)!.Value;
            Assert.Equal("Released", unused.Disposition);
            Assert.True(publications.HandOffReleasedReceipt(unused));
            var released = snapshots.ReadReceipt(grantId)!.Value;
            Assert.Equal("Released", released.Disposition);
            Assert.True(snapshots.HandOffReleasedReceipt(released));
            charged -= snapshotReceipt.RetainedBytes + checked((long)bytes);
            return new(validation.Status, null, validation.Code);
        }
        pending.Add(new(plan, grantId, reservationId, frames, snapshotReceipt.RetainedBytes));
        manager.Enqueue(new AdmitConnectionMessage(connection, account, room, entityType)
            { RequestId = id, Profile = profile, Publication = plan.Capacity, AdmissionPlan = plan });
        return new("Acquired", plan, null!);
    }

    // Call after real DrainOutbox has transferred the original initial projection.
    internal void PublishAndSettle(Action<string, string, byte[]>? receive = null)
    {
        foreach (Pending owner in pending)
        {
            var plan = owner.Plan;
            var identity = new SuccessorAdmissionIdentity(plan.Context.WorldIncarnation, plan.Context.RequestId, plan.Context.Connection);
            ulong bytes = 0;
            for (int index = 0; index < owner.Frames.Length; index++)
            {
                var cursor = new SuccessorAdmissionCursor(identity, plan.PlanId, plan.PublicationDigest, index.ToString(CultureInfo.InvariantCulture));
                var result = manager.AdmissionPlans.Read(cursor);
                Assert.Equal("Frame", result.Status);
                var frame = result.Frame!.Value;
                byte[] payload = Convert.FromBase64String(frame.Bytes);
                Assert.Equal(frame.Sha256, Convert.ToHexStringLower(SHA256.HashData(payload)));
                owner.Frames[index] = payload;
                bytes += checked((ulong)payload.Length);
                Assert.True(bytes <= ulong.Parse(plan.FrameBytes, CultureInfo.InvariantCulture));
                try { receive?.Invoke(plan.Context.Connection, frame.Kind, payload); }
                catch (Exception error) { Console.Error.WriteLine($"ADMISSION WRITER {frame.Kind}: {error}"); throw; }
                // The real bounded writer now owns these bytes, not merely an enqueue intent.
                Assert.Equal("Accepted", manager.AdmissionPlans.Acknowledge(new(cursor, frame.Sha256)).Status);
            }
            Assert.Equal(ulong.Parse(plan.FrameBytes, CultureInfo.InvariantCulture), bytes);
            Array.Clear(owner.Frames); // Actual writer delivery/release precedes the settlement receipt.
            Assert.True(publications.TryBeginSettlement(owner.ReservationId, identity, plan.PublicationDigest,
                checked((ulong)owner.Frames.Length), bytes, out var settlement));
            using (settlement)
                Assert.Equal("Accepted", debts.Process(new SuccessorAdmissionReconciliation(identity, "PublicationReconciled", plan.FrameCount, plan.FrameBytes)).Status);
            var publicationReceipt = publications.ReadReceipt(owner.ReservationId)!.Value;
            Assert.Equal("Released", publicationReceipt.Disposition);
            Assert.True(publications.HandOffReleasedReceipt(publicationReceipt));
            var receipt = snapshots.ReadReceipt(owner.GrantId)!.Value;
            Assert.Equal("Released", receipt.Disposition);
            Assert.True(snapshots.HandOffReleasedReceipt(receipt));
            charged -= owner.SnapshotBytes + checked((long)bytes);
        }
        pending.Clear();
        Assert.Equal(0, charged);
        Assert.False(debts.HasRetainedObligations);
    }

    private sealed record Pending(SuccessorAdmissionPlan Plan, string GrantId, string ReservationId, byte[][] Frames, long SnapshotBytes);
    private sealed class RejectUnexpectedTransfer : IAdmissionDebtTransferOwner
    {
        public SuccessorAdmissionDebtResult TryAccept(SuccessorAdmissionDebtExport debtExport, IAdmissionSnapshotLease? snapshot) => new("Rejected", null);
    }
    private sealed class DrainPhysicalPublications(AuthoritySectionSubsystem sections) : EcsSystem
    {
        public override void Execute(World world)
        {
            _ = sections.Manager.TakeSectionSubscriptionDeltas();
            using var delivered = sections.SectionProducer!.DrainPhysicalPublications();
        }
    }
}
