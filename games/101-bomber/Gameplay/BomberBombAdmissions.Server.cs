using System;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

// Only unpublished structural orders are retained here. Published bomb state is
// always read from this World; there is no second entity census or lifetime clock.
internal sealed class BomberBombAdmissions
{
    private struct Reservation
    {
        internal bool Held;
        internal EntityOrder? Order;
        internal int NewCredits;
        internal string? Promise;
    }

    private readonly Reservation[] reservations;

    private BomberBombAdmissions(int capacity) => reservations = new Reservation[capacity];

    private static BomberBombAdmissions For(World world)
    {
        if (!world.TryGetService<BomberBombAdmissions>(out var owner) || owner is null)
        {
            owner = new BomberBombAdmissions(BomberConfigBinding.For(world).ObjectBudgets.BombCapacity);
            world.AttachService(owner);
        }
        return owner;
    }

    internal static bool CanReserve(World world, int newCredits) => newCredits > 0 &&
        checked(For(world).Occupied(world) + newCredits) <= BomberConfigBinding.For(world).ObjectBudgets.BombCapacity;

    internal static bool CanCreatePrimary(World world, int futureChildren = 0) =>
        futureChildren is >= 0 and <= 4 && CanReserve(world, checked(1 + futureChildren));

    internal static EntityOrder CreatePrimary(World world, int futureChildren = 0)
    {
        if (!CanCreatePrimary(world, futureChildren))
            throw new InvalidOperationException("Bomb creation has no reserved entity capacity.");
        EntityOrder order = For(world).Create(world, checked(1 + futureChildren), null);
        order.Get<BomberBombState>().FutureChildren.Value = futureChildren;
        return order;
    }

    internal static EntityOrder CreateFromPromise(World world, string durableToken)
    {
        if (string.IsNullOrEmpty(durableToken)) throw new ArgumentException("A durable bomb promise requires its exact token.", nameof(durableToken));
        // A persisted Submitted witness records an outcome which may be unknown.
        // A new service instance can never turn that witness into a fresh create.
        throw new InvalidOperationException("Bomb promise creation requires a fresh atomic owner submission.");
    }

    // The durable owner is the authority. The callback may only persist its one
    // false-to-true submission transition; the complete credit witness is pinned.
    internal static EntityOrder CreateFromPromise(World world, string durableToken, Action persistSubmitted)
    {
        if (string.IsNullOrEmpty(durableToken)) throw new ArgumentException("A durable bomb promise requires its exact token.", nameof(durableToken));
        ArgumentNullException.ThrowIfNull(persistSubmitted);
        string before = SubmissionWitness(world, durableToken, submitted: false)
            ?? throw new InvalidOperationException("Bomb creation has no exact unsubmitted persisted promise.");
        BomberBombAdmissions owner = For(world);
        for (int index = 0; index < owner.reservations.Length; index++)
            if (owner.reservations[index].Held && owner.reservations[index].Promise == durableToken)
                throw new InvalidOperationException("The exact bomb promise has already entered structural submission.");
        if (owner.Occupied(world) > owner.reservations.Length)
            throw new InvalidOperationException("Persisted bomb obligations exceed entity capacity.");
        int reservation = owner.Hold(0, durableToken);
        bool enteredStructural = false;
        try
        {
            persistSubmitted();
            string? after = SubmissionWitness(world, durableToken, submitted: true);
            if (!StringComparer.Ordinal.Equals(before, after))
                throw new InvalidOperationException("Bomb submission changed or failed to persist its exact owner witness.");
            if (owner.Occupied(world) > owner.reservations.Length)
                throw new InvalidOperationException("Persisted bomb obligations exceed entity capacity.");
            enteredStructural = true;
            EntityOrder order = owner.Submit(world, reservation);
            order.Get<BomberBombState>().PromiseToken.Value = durableToken;
            return order;
        }
        catch
        {
            // Before Commands.Create there is no unknown structural outcome.
            // Any persisted Submitted owner flag still remains and forbids retry.
            if (!enteredStructural) owner.reservations[reservation] = default;
            throw;
        }
    }

    private static string? SubmissionWitness(World world, string token, bool submitted) =>
        token.StartsWith("split:", StringComparison.Ordinal) ? BomberSplitBombs.SubmissionWitness(world, token, submitted) :
        token.StartsWith("barrel:", StringComparison.Ordinal) ? BomberBarrelBombPromises.SubmissionWitness(world, token, submitted) :
        token.StartsWith("frenzy:", StringComparison.Ordinal) ? BomberFrenzy.SubmissionWitness(world, token, submitted) : null;

    private EntityOrder Create(World world, int newCredits, string? promise) => Submit(world, Hold(newCredits, promise));

    private int Hold(int newCredits, string? promise)
    {
        for (int index = 0; index < reservations.Length; index++)
        {
            if (reservations[index].Held) continue;
            // Charge before the structural call. An exception with an unknown
            // submission outcome keeps this slot; it cannot authorize a replay.
            reservations[index] = new Reservation { Held = true, NewCredits = newCredits, Promise = promise };
            return index;
        }
        throw new InvalidOperationException("Bomb order reservations exceed the configured entity capacity.");
    }

    private EntityOrder Submit(World world, int reservation)
    {
        EntityOrder order = world.Commands.Create<BomberBombEntity>();
        reservations[reservation].Order = order;
        return order;
    }

    internal static void ObservePublished(World world, NetEntityId entity)
    {
        if (!world.IsLive(entity) || !world.TryGetService<BomberBombAdmissions>(out var owner) || owner is null) return;
        for (int index = 0; index < owner.reservations.Length; index++)
            if (owner.reservations[index].Order is { } order && order.AssignedId == entity)
                owner.reservations[index] = default;
    }

    private int Occupied(World world)
    {
        int count = 0;
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (!world.IsLive(bomb.Entity)) continue;
            if (bomb.FutureChildren.Value is < 0 or > 4)
                throw new InvalidOperationException("Invalid persisted Split credit count.");
            count = checked(count + 1 + bomb.FutureChildren.Value);
        }
        count = checked(count + BomberBarrelBombPromises.ReservedCount(world));
        count = checked(count + BomberFrenzy.ReservedCount(world));
        for (int index = 0; index < reservations.Length; index++)
        {
            if (!reservations[index].Held) continue;
            EntityOrder? order = reservations[index].Order;
            if (order is not null && !order.AssignedId.IsDefault && world.IsLive(order.AssignedId))
            {
                // Require the actual live row, not just an allocated identity.
                // Awake also transfers the charge, including entities that are
                // created and retired before the next placement inspection.
                reservations[index] = default;
            }
            else count = checked(count + reservations[index].NewCredits);
        }
        return count;
    }
}
