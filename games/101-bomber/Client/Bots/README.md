# Bomber admission scenario

`Lumio.Bomber.Bots.BomberAdmissionScenario` is limited to the first-round admission gate. It reads the engine's `BotWorldView` and completes only when the last real observation contains all of these facts:

- Self is bound and has a valid, non-default full `NetEntityId`.
- Self has the generated registry's player wire type and is visible in the player census.
- The visible census has at least the configured player count, counting distinct full identities and ignoring non-player or malformed rows.

It issues no gameplay commands. Uplinks, chat, mining, drop disappearance and match results are not admission evidence. A missing or insufficient view continues running and leaves red scenario assertions at the deadline. Assertions retain the last Step observation because Bot.Host closes connections before writing scenario assertions.

Build from the game root:

```text
dotnet build Client/Bots/Lumio.Bomber.Bots.csproj
```

The plugin output contains only its own DLL; Bot.Host owns the Engine and Gameplay assembly graph. Always select `Gameplay/bin/Debug/net10.0-client/Lumio.Bomber.Gameplay.dll`, not the server assembly.

Bot.Host constructs a parameterless scenario. Set its existing `LumioBotConfigDirectory` environment setting to the selected **client** config root; both host and scenario consume it. Do not supply a conflicting `--config-dir` override. The scenario reads `game.player_count` once at construction and fails loudly if this setting is absent. With the shipped config the threshold is eight, with no numeric fallback in the scenario.

Append this exact selection to the existing resident Bot.Host command that supplies server, accounts/admission, native kernel budget, voxel/prediction budget and run limits:

```text
--gameplay Gameplay/bin/Debug/net10.0-client/Lumio.Bomber.Gameplay.dll
--scenario Client/Bots/bin/Debug/net10.0/Lumio.Bomber.Bots.dll
--scenario-name Lumio.Bomber.Bots.BomberAdmissionScenario
```

The first-round fleet must use eight accounts in the same real DS room and retain each bot's `bomber_admission_*` assertions. The pure unit tests cover rejection boundaries and full-ID counting; they are not a live eight-bot acceptance run. Gameplay AI, deterministic match replay and restore acceptance belong to their later implementation tasks.
