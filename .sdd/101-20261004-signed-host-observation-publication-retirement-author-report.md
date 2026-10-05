# Signed Host observation-publication retirement: paired whole14 / whole16

Verdict: **VALID_REAL_SIGNED_HOST_NATIVE_WHOLE14_RED_WHOLE16_GREEN_SINGLE_CASE**. The same five authored test/fixture sources ran with the original Server commit `008861074a2d3c9da1b0407325ede6f851704fd5`, first against the complete official14 provider, then the complete official16 provider. No Server production source changed. This is a real signed socket / CoreCLR / Native regression; it is not browser experience acceptance and does not retroactively capture the original live14 death13560 return code.

The former observed-publication epoch remained charged after a successful transfer and a fresh controlled readmission. Whole14 then returned `successor_reservation_invalid` on the next online lethal death. Whole16, containing the independently reviewed Runtime one-line retirement fix `da24b0d6a401adbcb2c1cbcda8464fcac6287d66`, released that old publication through the existing drain, accepted the new death, destroyed the old body on the next normal commit, and delivered the subsequent observe authorization.

## Exact sources and providers

Owner tree: `C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement`.

| Authored path relative to owner | Final SHA256 |
|---|---|
| `Tests/tests/successor_publication_retirement_real_clr.rs` | `70dd07d10705159c8b0167753b88a9fbad36fcdbb34326eb440b14675fb752d3` |
| `Tests/fixtures/successor_runtime/SuccessorPublicationRetirementScenario.cs` | `c885041f3af8a0b8fa0f528200cc38910f197068d434a3a9bfda939c149208c7` |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `4127d0d7614729c8426386bd9ac2e271b7d8d2a86ee889a5b39a8992fdf83e2f` |
| `Tests/fixtures/successor_runtime/AdmissionCensusEntity.cs` | `818a66dd1c7251261f6d2fb5e09abea0fbd0d896290e1c5fa9a33727a23f8464` |
| `Tests/fixtures/successor_runtime/AdmissionCensusPayload.cs` | `5b330594779b55d7eb41766611da678b9c8438d8ceb057bb675440ce2b318c76` |

The two census declarations are byte copies of the original Runtime fixture declarations. The original `SuccessorScenario.cs` has only the dedicated `publication-retirement` dispatch; inverse removal restores the original `736c824032788fc0291cce9c05af50a74b716b9ae34004719e7125eff150a954` bytes. Other ordinary fixture modes remain unchanged.

The final source fence is `C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement/.run/signed-host-retirement-01/source-proposal-03.json`, SHA256 `61c67d82019d1aecb355bb8c79c857fcc798155f0b5b8e4f6f055d917038a264`. All 11 source/script files and all 16 protected inputs matched at final analysis. The index is empty; nothing was staged or committed.

| Identity | Whole14 | Whole16 |
|---|---|---|
| Original complete manifest SHA256 | `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9` | `da03566c44135860eabdc65b628c8502064e0ee7417f2df17daf50dbb2d17954` |
| SDK archive SHA256 | `d7c97107620696669d8657e590d19d085cc2112243783ce48ac2d912bbdb21d0` | `6f18e4e346330b48ca67e3a50610909be4a0759aebfbb49a41456872fa22151e` |
| Actual Native DLL SHA256 | `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89` | `2cd9cebf1e61ae7c21c719163c8d3dcfa81f07d4d78f5642059f12672cb5ac17` |
| Actual Ecs DLL SHA256 | `ab5da26d1329e2e7671a1ad4c01a85bcf28a4ccee7b58e9e53cc149382b393e9` | `54856d04d0024713de19122c6aa24aa8a74a132b8c520664b79e07acd7d1bd89` |

HostEntry bytes are the same `dc498450d6f48058c0d136d6b9eef2c54b7ac576e27366b8a465394a6be830fb`; Replication bytes are the same `d1747079aebb82cbade1407c125b89782d080045c2f316080c9e474876687f43`. The actual hostfxr is `C:/Users/g923/.dotnet/host/fxr/10.0.11/hostfxr.dll`, SHA256 `44f97e946b36415176dbc56a4426565a5e9b3e722c0ad579e20a749e3c0c7bcd`.

Each provider was copied as all 305 manifest payloads to a separate qualification input. Each used a new strict lock, a new short NuGet cache, a new complete normal fixture build with its own bin/Content, and a new Cargo target. There was no single-DLL overlay. The actual fixture DLLs differ normally by their SDK build input: whole14 `12850f20edda59fa354938ca7fae8b3ddda4a8fe8079cea2cba0309798b400cd`; whole16 `a3110e4a5c2b055e96c980de4d955554803504803ea95e8d9dfcbceaa1209fed`.

## Actual single-case result

The exact case is `signed_observation_paging_transfer_and_next_controlled_death_retires_previous_publication`. Only this ignored integration case was selected; four included original cases were filtered, not run.

| Actual outcome | Whole14 | Whole16 |
|---|---|---|
| Normal fixture build | exit0, 0 warnings / 0 errors, 12.75s | exit0, 0 warnings / 0 errors, 7.98s |
| Rust build | successful, 1m35s | successful, 1m34s |
| Actual case | Cargo101; 0 pass / 1 fail / 0 ignored; 5.58s | Cargo0; 1 pass / 0 fail / 0 ignored; 5.27s |
| Initial / observe / reattach / transfer / new initial epochs | 1 / 2 / 3 / 4 / 5 | 1 / 2 / 3 / 4 / 5 |
| Old epoch3 delivered room creates | 79 of the same 256 full IDs | 79 of the same 256 full IDs |
| New epoch4 census | all 256 full IDs | all 256 full IDs |
| C3 fresh controlled epoch5 frozen census | all 256 full IDs; actual completed Parts group1 | all 256 full IDs; actual completed Parts group1 |
| First sample immediately after second Prepare call | tick57, `successor_reservation_invalid`, life04 still live | tick55, null error; old body still live while normal Destroy is queued |
| Following commit | old body remains live, exact old epoch3 credit retained | tick56, old body really non-live |
| New observe authorization | absent; final assertion failed | delivered at epoch6 |

The whole14 final assertion at Rust line136 was the **only semantic RED**: its exact old `reattach` credit had 446580 bytes, generation3, request3, `ResultDrained/GameConsumed/WelcomeDrained=true`, and `PublicationComplete/PublicationDrained/BaselineDrained/PublicationAbandoned=false`, `BaselineClosedTick=null`. The current epoch4 transfer credit had already disappeared; C3 had completed its own actual initial identity and full census. The new life was really lethal with Health0. Thus the failure was not an unfinished new initial publication.

Whole16 ran the same source and natural paging conditions. The old epoch3 credit disappeared through the ordinary flow; the second Prepare succeeded and its new observe result was consumed normally. Twelve later explicit Host tick requests committed at ticks `[60,62,64,65,67,68,70,71,73,74,76,77]`. The final sample had no successor credits, zero result credits and zero publication bytes. The original successful-shutdown assertion also observed the shared Host `PublicationBudget.used_bytes()==0`.

## Guard and observation limits

The real BoundAdmissionVerifier validated three independently signed fresh credentials for the same account/room with the real system clock. Socket closes were actual peer1001. Gameplay changes were ordinary native effect / structural / restoration operations. Every step retained normal Host ticking, Runtime drain, snapshot cursor SHA/digest acknowledgment, writer fence and original reconciliation behavior. The fixture did not send a substitute ACK or construct an acknowledgment DTO.

Limits stayed at default creates-per-pack0, frame65536, Host deferred64 frames / 8MiB, successor publication16MiB and reservation4096. The 256 Room1024 declaration payloads produced natural incomplete old pages; no artificial cap or withheld drain created the failure. No offline seven-source draft, new contract, extra map, quota change or guard bypass was consumed.

The initial publication observation uses the existing nullable `_lastRetired` identity and requires exact three-field equality with the actual new initial authorization (`WorldIncarnation`, `RequestId/correlationId`, `Connection`), a new actual Welcome, empty admission entries and no retained admission obligations. C3 additionally requires the full 256-ID initial census and real Parts completion. `_lastRetired` alone is not proof of every ACK: original `AdmissionPlanService.cs:68` can also remember an unregistered released plan; `AdmissionPlanService.Debt.cs:130–153` records it after the complete normal structural/publication/projection/terminal release conjunction. This qualification relies on the entire stated conjunction and original lifecycle, not merely the last-retired field.

The byte-only socket decoder validates the real received parts/base64/SHA and full IDs. It is not a Client replica or Client applied ACK. The public socket stream does not expose Runtime drain batch identity; exact same-drain grouping remains unknown. The sampled retained `context.Connected=false` refers to the old consumed reservation context, not a assertion that C3's actual authenticated controlled transport is offline. No new application query, fake binding or private credit mutation was introduced by the observation correction.

## Preserved earlier attempts and generated output

First attempt: normal fixture build0 succeeded, but Rust compilation returned101 for missing returned-borrow lifetime and unsupported SHA `LowerHex`; **no case ran**. The two mechanical Rust corrections added the sample lifetime and used the existing public Host `hex_lower` helper. This is administrative evidence, not RED.

Retry02: Rust compiled; the case failed its first-initial `saw_real_plan` observation precondition because all 79 ProcessorPlan samples already had empty/unretained entries although the actual initial AUTH/Welcome and continuous world changes arrived. It never reached the target second Prepare. It is not retirement RED. Root reviewed the original last-retired paths and authorized the narrowly bounded observation-only correction, after which both official providers were rebuilt as new complete fixture graphs.

All old attempt data, source versions, producer outputs, the helper-generation parsing failure and the corrected inherited proposal metadata flag remain preserved. Nothing was relabeled as a successful behavior test.

The original pre-generation manifest froze 19 generated files. All 19 now have physical output changes: 14 compare equal after line-ending normalization, while five have normal generator content changes and two new Census outputs exist. These arise in the ordinary fixture generator from registering the two new declared types; they were not hand edited, staged, restored or cleaned. This report does not replace an independent semantic review of those generated diffs or request their commit.

## Frozen evidence

- Pair analysis: `C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement/.run/signed-host-retirement-01/paired-result-03.json`, SHA256 `76c960a890786b839f0a8fc9605aca381c6f9418dd183323bcfa30c58a8a94c2`.
- Whole14 42-file frozen source/raw/complete21-file fixture bin+Content: `C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement/.run/signed-host-retirement-01/qualification-14-03-frozen/manifest.json`, SHA256 `89afb5f9ed31ee7383944215f8668784f19b544215d0c327be25a2cb80b916c3`.
- Whole16 equivalent 42-file frozen evidence: `C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement/.run/signed-host-retirement-01/qualification-16-03-frozen/manifest.json`, SHA256 `a5d7ec3bd38bd8e043b34939188a991949efb7e17c12241291e04b674ec14324`.
- Original compile-only failure: `C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement/.run/signed-host-retirement-01/compile-failure-01-frozen/manifest.json`, SHA256 `112d0e9f2ff39b8a1bf4c1a440a23fdf3e1dd89964fddc9c45495b760d7d446e`.
- Original initial observation precondition failure: `C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement/.run/signed-host-retirement-01/initial-precondition-02-frozen/manifest.json`, SHA256 `f9a368ee25d918ed8717e84d76b28f277aab558aed75041651343c4b45d8dcf1`.

All heavy work finished by **2026-10-04T09:57:20Z**. No further build/test, production source write, service start, browser action or snapshot collection is pending from this author task.
