# Complete11 production and actual Game consumption identity audit

Date: 2026-10-04. Reviewer: `schema_pins_review`. **Verdict: ACCEPT_PRODUCTION11_IDENTITY_ONLY.** Official complete11, actual fresh Game output and its separately instrumented measurement copy have consistent source and artifact identities. No outstanding identity blocker remains in this scope. This report does not accept real eight-player behavior, movement/bombs, ten actual close/reopen cycles, performance, or the still-open Platform-signed product release identity. The inspector changed no production source, artifact, service or process and ran no product build or test suite.

## Eight exact sources and protected Game bytes

The actual new builder input is `games/101-bomber/.run/20261004-browser-experience/full-pack-11-input.json`. Eight source roots independently match their declared commits and remain tracked-clean. Five roots and the Config compiler/base-version recipe are unchanged from complete10. The three new clean roots contain exactly the independently accepted source sets:

| Root | Exact commit | Accepted physical source set |
| --- | --- | --- |
| Server11PreparedReentry | `008861074a2d3c9da1b0407325ede6f851704fd5` | five source/test files, matching the nonauthor Server report `491feb26…` |
| Runtime11Composition | `520ffe482e1c48fb6e48187925eecec986cdb9c8` | previous four Transform/terminal files plus exactly three independently accepted scratch files |
| Engine11SdkClosure | `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0` | exactly three independently accepted SDK producer/closure/test files |

All15 physical source hashes match their accepted review bytes. Commit delta file sets match those exact sets. The scratch change remains an allocation-mechanism candidate for real comparison; its earlier8.046% allocation sample is not a measured browser benefit. Private `BrowserTickCostProbe.cs` and Server `hold_diagnostic.rs` are absent. Game scheduler `25765c14…`, SpectatorDump `59960992…`, adapter/test `d89e2257…`/`4f11e7a2…` remain unchanged.

The published schema15 module remains exact `70cc863748a3ba9bf91095208f3ccbba2b1bb80269293bbedb96f79f9dcba44f`. Its actual closed97 membership and byte pins pass `requireV15Review` on a real Buffer Map. All110 previously protected generated/lock files remain byte-identical. These fences were repeated after Game consumption; no new pin or validator changes were made. The earlier independently accepted two-pin publication is not re-inferred from changed hashes.

## Actual complete package and CLR graph

Root's official builder actually completed raw0. Package version is `0.0.5-main.523c3d3`; new manifest SHA256 is **`f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867`**. All305 payload files independently match the manifest: missing0, extra0, drift0. Manifest source commits and Config authoring commit match the new input. Builder result carries that identical manifest. Actual SDK archive SHA512 matches its own producer identity; its neutral-version payload hash is not mistaken for the explicitly versioned final ZIP hash.

Actual new Native SHA256 is **`ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`**, sourced from fixed Native81b2501. No old DLL substitution was used. All13 server SDK managed files are byte-identical to their selected archive entries. Nine Ecs/Gas/Replication SDK/server/Bot/browser domain comparisons have the correct actual TFMs, identity hashes and no private diagnostic marker. SDK/Bot/replica variants are recorded accurately rather than required to be the same PE bytes.

An independent `System.Reflection.Metadata`/PEReader inspection reads actual AssemblyDefinition and Lumio AssemblyReference versions without loading assemblies or using the candidate parser:

| Actual packaged domain | Assemblies | Missing/version mismatches |
| --- | ---: | ---: |
| Server SDK managed closure | 13 | 0 |
| Bot complete managed closure | 28 | 0 |
| Browser replica ns2.1 closure | 20 | 0 |

All28 actual `.deps.json` sidecars found in those domains were independently read; each explicit Lumio runtime asset CLR version matches its actual domain definition. Additional actual Server HostEntry+SDK14, server Gameplay output14, browser Gameplay output11 and browser Host22 groups also have no Lumio reference mismatch. The Game Bots output directory is a registry/plugin fragment containing only its one DLL; its five external references cannot be evaluated as a standalone self-contained executable there. That supplementary non-applicable check is retained, not counted as a product failure or as a successful Bot-plugin boot. The complete packaged Bot closure is the28-file graph above; actual Game plugin behavior remains part of real browser/Bot acceptance.

The initial private package checker emitted a REFUSE because the inspector incorrectly added full byte equality between SDK and all Bot/replica DLLs, and demanded a net10 TFM attribute on the explicitly single-flavor ns2.1 HFSM assembly. The accepted producer code already documents Bot net10 reconciliation/global props, replica Description/compatibility properties and that shared HFSM flavor. This was an **INVALID_AUDITOR_ASSUMPTION**, preserved unchanged in `package-verification.json` (`14b57c6b…`). Separate correction `package-verification-accepted.json` retains those differences, requires exact SDK/server copies, actual domain TFMs, the independent PE graph and sidecars, and leaves every original manifest/source/archive fence intact. No product change or loader relaxation was made to pass inspection.

## Actual fresh Game, WebCIL, PDB and UI

The actual `candidate11-build-01` records prove server/client/browser Game builds and browser publish raw0 against this new manifest, with log SHA equality. UI typecheck, actual57-file/704-test run and fresh UI build are also raw0; they were read, not rerun. The three Gameplay sides restore the exact new SDK archive and SHA512 in actual `project.assets.json`/private caches. The browser Host uses its declared direct selected replica references, with the complete repeated `$(_SpectatorReplicaDir)` prefix; it does not require a Host SDK PackageReference.

The actual new server Gameplay is **`925d7bac9ca9f3d9df9f0b0f39d0c0945ead2489622c5d7f0f97c28bcd0e7210`**, and `player-startup.json` selects that exact registry path. Server and client Gameplay/Bots are net10; browser Gameplay is ns2.1; the WebAssembly Host itself is net10. The startup file is a registry overlay, not a complete explicit CLR engine-path configuration. Canonical engine/CLR defaults were hash-checked against complete11 layout; this inspection does not claim to have read a newly launched DS process yet.

Every one of22 actual Host Lumio DLLs equals its exact selected complete11 replica file or fresh browser Gameplay/Host DLL. Every corresponding published WebCIL embeds the exact full CLI metadata from that actual DLL. Actual Host PortablePDB and DLL CodeView agree; the compiled SpectatorDump document checksum is the accepted `599609920469e0ba2eec906ba7425c678d6b128556cb6a548f2fefaf18ae25c9`. Official Runtime assemblies use DebugType=none; no Runtime PDB source-checksum claim is made.

The actual fresh published UI equals the fresh dist JS/CSS. JS remains **`2cf3bbd5e48445c48af4228d0e4b1bb94661dc59e2adec2c7a1e12f79eca0f77`** and visibly contains the accepted participant Self/current-match branch plus original currentLife/lastLife fallbacks. Published main remains the accepted scheduler. Official DLLs/WebCIL/main/UI contain no private diagnostic/profiler markers. A publish exit alone was not used as consumption proof.

## Measurement fence and external narrow regression

New official and `measured11-wwwroot` directories each have exactly835 paths. Missing0/extra0; only `main.js` differs. **All834 non-main files are byte-identical**, including every engine binary, new Game WebCIL, UI and voxel file. The measured main is exact accepted v4 `3d16f749d8cebc5c20351b659f0e1b098ab49442941a484e480f3df230d07a25`; official main is `25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c`; generator is `76ea337dd8c4c757621027a6b4d7f68044a356bb55b103f9c231e4455dd4f466`. The attached-property-preserving wrapper is therefore the exact independently reviewed implementation. Instrumentation overhead remains within measured outer work; no zero-cost observer or browser-performance acceptance is claimed.

Reentry separately executed the accepted unchanged Host cases against whole11: offline full-chain and original expiry each1PASS/0ignored/raw0. The inspector hash-verified its25 raw inventory records and retained copies of its new seal/report. Seal SHA is `646cf896ab7ec927b573fb6704d1497500791d55de384b7440eae1f063918e7b`; report SHA is `8e963c4a0d55643486e0e9393f3e45618331e1c25e5afdec3c1fe5bd3a9da6c9`. Inputs point only to complete11 or fresh fixture output, including new Native. This is actual native/CLR/socket consumption evidence, not eight-player evidence. Existing production loading/type-identity guards passed boot; no successful-path ALC enumeration was collected, so the report does not claim one.

## Independent frozen evidence

Evidence directory: `C:/Work/LumioGames/LumioGame/.run/candidate11-production-identity-audit-01`.

- Input/source/protected proof `input-verification.json`: `3fa65ba18ad9ddb97fd18576f6aec30ee461c84a9d79619d7cc90f633d121651`.
- Accepted package/actual CLR/sidecar proof `package-verification-accepted.json`: `fd8e6a0fc411e26390ef85ed6631b7b24828785cdd73b82d617a006cc2dabe95`.
- Independent actual PE graph `actual-pe-closure.json`: `fb12f2b9d173c698ed68899f1051318b1fdeaafa6abb26bdcd9c28787b3c6f81`.
- Actual Game/browser/measurement proof `consumer-verification.json`: `871ec6e57db2d146e3d9bf6493e273592ac8b1db1c17181ea89a9ce7de40c39f`.
- Final end fence `end-fence.json`: `b2f6bfc5e8c3dfefb899fe6658b969ba81f8ed9c9d453eca49bf40ee7d7cdda4`.

The end fence rechecks2273 source, package, SDK, sidecar, Game DLL/WebCIL/PDB/UI, official/measurement-file and protected-byte identities plus the eight clean source roots: issues0. Earlier invalid inspector artifacts are preserved with clear scope. Nothing in this identity-only verdict substitutes for Root's requested real-browser acceptance or closes the Platform old signed gameReleaseId discrepancy.
