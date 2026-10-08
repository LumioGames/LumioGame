using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Components.Identity;

public sealed partial class IdentityComponent
{
    /// <summary>The platform account binding is server private.</summary>
    [Persist]
    public Sync<string> AccountId = new(Scope.None);

    protected override void Awake() => _ = Config.BomberConfigBinding.For(World);
    protected override void Start() => BomberGameplay.BindPlayer(World, Entity);
    protected override void OnHydrate()
    {
        _ = Config.BomberConfigBinding.For(World);
        BomberGameplay.BindPlayer(World, Entity);
    }
}
