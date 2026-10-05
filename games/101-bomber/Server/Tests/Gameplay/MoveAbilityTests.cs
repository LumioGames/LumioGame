using System.Collections.Generic;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class MoveAbilityTests
{
    [Fact]
    public void MovementInputRoundTripsBothDirectionsAndTurnIntent()
    {
        var sent = new MoveAbility.Input { PrimaryDirection = BomberDirection.Right, SecondaryDirection = BomberDirection.Up, TurnPressed = true };
        var words = new List<object?>();
        sent.Write(words);
        var received = new MoveAbility.Input();
        Assert.True(received.TryRead(words, 0));
        Assert.Equal(sent.PrimaryDirection, received.PrimaryDirection);
        Assert.Equal(sent.SecondaryDirection, received.SecondaryDirection);
        Assert.True(received.TurnPressed);
    }

    [Theory]
    [InlineData("-1", "0", "true")]
    [InlineData("5", "0", "true")]
    [InlineData("1", "5", "false")]
    [InlineData("1", "0", "unknown")]
    public void UnknownWireDirectionsAndInvalidTurnFlagsFail(string primary, string secondary, string turn)
    {
        var input = new MoveAbility.Input();
        Assert.False(input.TryRead(new object?[] { primary, secondary, turn }, 0));
    }

    [Fact]
    public void PlacementInputIsEmptyAndRejectsClientSuppliedPower()
    {
        var input = new PlaceBombAbility.Input();
        var words = new List<object?>();
        input.Write(words);
        Assert.Empty(words);
        Assert.True(input.TryRead(words, 0));
        Assert.False(input.TryRead(new object?[] { "99" }, 0));
        Assert.False(input.TryRead(words, -1));
    }

    [Fact]
    public void PickupInputRoundTripsBothHalvesOfIdentity()
    {
        var id = new NetEntityId(0x123456789ABCDEF0UL, 0xFEDCBA9876543210UL);
        var sent = new PickupAbility.Input { Target = id };
        var words = new List<object?>();
        sent.Write(words);
        var received = new PickupAbility.Input();
        Assert.True(received.TryRead(words, 0));
        Assert.Equal(id, received.Target);
        Assert.False(received.TryRead(new object?[] { "invalid" }, 0));
    }
}
