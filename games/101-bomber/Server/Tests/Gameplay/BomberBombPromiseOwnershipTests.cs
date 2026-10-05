using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBombPromiseOwnershipTests
{
    [Fact]
    public void ATokenWithoutAnActualPersistedOwnerCannotCreateAZeroChargeBomb()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World,
            "split:" + scene.Lives[0].ToHex() + ":0"));
        Assert.Empty(scene.World.Each<BomberBombState>());
    }

    [Fact]
    public void PublishedAndResolvedChildCannotSpendItsOriginalPromiseAgain()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        BomberBombState mother = BomberSplitBombProductionTests.Mother(scene, 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        BomberBombState child = scene.World.Each<BomberBombState>().First(b => b.HitFamily.Value == mother.Entity);
        Assert.Throws<InvalidOperationException>(() => BomberBombAdmissions.CreateFromPromise(scene.World, child.PromiseToken.Value));
    }

    [Fact]
    public void AnActualPublishedChildCannotChangeTheOriginalChain()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        BomberBombState mother = BomberSplitBombProductionTests.Mother(scene, 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        BomberBombState child = scene.World.Each<BomberBombState>().First(b => b.HitFamily.Value == mother.Entity);
        child.ChainId.Value++;
        Assert.Throws<InvalidOperationException>(() => BomberSplitBombs.ObservePublished(scene.World, child));
    }

    [Fact]
    public void TwoActualChildrenCannotClaimTheSameSubmittedArm()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        BomberBombState mother = BomberSplitBombProductionTests.Mother(scene, 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        BomberBombState[] children = scene.World.Each<BomberBombState>().Where(b => b.HitFamily.Value == mother.Entity).ToArray();
        children[1].ChildDirection.Value = children[0].ChildDirection.Value;
        Assert.Throws<InvalidOperationException>(() => BomberSplitBombs.ObservePublished(scene.World, children[1]));
    }
}
