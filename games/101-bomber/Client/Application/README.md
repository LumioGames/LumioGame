# Bomber client composition

This library composes the engine's existing `ClientHost`. It owns no transport, replica, voxel world, prediction driver or extra instance lifecycle. Engine assemblies resolve only from the pinned `Engine/bot/<rid>` release, and the Gameplay project reference explicitly selects its client projection.

```csharp
var options = new ClientInstanceOptions
{
    Registry = BomberClientApplication.Registry,
    ConfigDirectory = clientConfigDirectory,
    Endpoint = endpoint,
    InputMapper = inputMapper,
    Voxel = voxelOptions,
    // Supply any other ClientInstanceOptions required by the application.
};
ClientInstance instance = BomberClientApplication.CreateInstance(host, options, cancellationToken);
```

`Configure(options)` validates the Bomber registry and returns the same object. `CreateInstance` passes that object and cancellation token to `ClientHost.CreateInstance`. All options survive intact, including Voxel.Prediction, NotServingRetry and caller-owned RPC hooks. Connect, Tick and Close stay on the engine host/instance API. The old chat wrapper and BomberClientInstance have been removed.

Build independently from the game root:

```text
dotnet build Client/Application/Lumio.Bomber.Client.Application.csproj
dotnet run --project Client/Tests/Application/Lumio.Bomber.Client.Application.Tests.csproj -- --minimum-expected-tests 11
node --test Client/Tests/Application/build-layout.test.mjs
```
