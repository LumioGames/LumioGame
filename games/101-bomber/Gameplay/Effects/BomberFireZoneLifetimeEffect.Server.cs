using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberFireZoneLifetimeEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters parameters) =>
        BomberFavoriteFireZones.CanSettle(context.World, context, in parameters);

    internal static Parameters ReadActualRow(FiniteEffectView row) =>
        new BomberFireZoneLifetimeEffect().CreateGeneratedCodec()!.Decode(row.Payload.ToArray());
}
