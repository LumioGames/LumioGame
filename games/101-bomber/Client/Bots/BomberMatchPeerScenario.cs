using Lumio.Client.Bot;

namespace Lumio.Bomber.Bots;

/// <summary>Runs Game inputs until the launcher finishes the primary match scenario.</summary>
public sealed class BomberMatchPeerScenario : BotScenario
{
    private readonly BomberMatchScenario match = new();

    /// <inheritdoc />
    public override void Setup(in BotDriverContext context) => match.Setup(in context);

    /// <inheritdoc />
    public override BotStepResult Step(in BotDriverContext context)
    {
        _ = match.Step(in context);
        return BotStepResult.Continue;
    }

    /// <inheritdoc />
    public override void Assert(in BotDriverContext context, BotAssertionSink sink) =>
        match.Assert(in context, sink);
}
