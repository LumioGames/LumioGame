# Favorite Fire private rev04 review fixes

**Status: private repair candidate; no physical publication, build, GEN, Native or runtime tests. All new tests and startup claims remain UNRUN. STOP for the same independent reviewer.**

Input review hash `d7d0404609ce48c1e9353f2f34e3b205cf918caed8db3f0db553fcab1d040a9c` was checked. Rev03 and all its saved artifacts remain byte-identical; all32 prior candidate targets and24 production before fences are retained. The unchanged region Fact remains `e85a764c375124f7acd15e6cf5e37fd45eb2863ec4c58efcf52545c28ce4c3aa`; Root’s genuine first-region RED at line140 remains the only actual producer gate.

F2 is verified against exact07 `FiniteEffectSettlement.cs`: real Terminal/Expired passes ordinal0, while Initial admission and Control issuance use nonzero ordinals. Both outer nonzero guards were removed. Nonzero is now required only by Initial and the Aura Removed/Suppressed Control branches; real Terminal/Expired requires the official0. Full handle, type, source/target, AppliedTick and interval guards remain. Aura outcome0 or2 remains accepted so the existing consumed Initial does not block its later terminal witness.

An associated exact-interval issue was also verified: ProcessorPlan ConsumeAura clears the AuraUntilTick projection at Tick==EndTick before phase9. Aura Terminal therefore compares r.Tick with immutable cooldownFromTick+auraDurationTicks, retaining its exact original interval even after the projection clears. Region UntilTick remains the actual persisted Initial-derived endpoint. Missing Runtime rows still do not infer expiry; controls remain distinct.

The existing whole110 cadence body now observes actual batches and additionally requires exactly110 real region Initials and110 matching Terminal/Expired0 results, plus the real parent10111 Terminal/Expired0 at start+110, full handle/source/target/AppliedTick matching and released owner. The existing first20Tick expiry body adds the real Terminal0/full handle/original interval assertions and drives the following normal business Tick before checking Native7002. All prior assertions and test identities are retained. These additions are UNRUN.

F3 is verified directly:46 Typed+14 Derived+2 Excluded=62. Only the stale total assertion60 was changed to62 in this revision; the complete existing catalog/type uniqueness checks and exact new typed inventory remain.

F1 is verified against formal EffectOperationValidation: Results loops use the entire configured result window, and branch conditions do not reduce structural write bounds. Current ResultRecords360 requires new region MaxWrites2×360=720; its declaration now says720. Existing Fire MaxWrites1816 remains unchanged for current360. This arithmetic is not an official generated work/scratch/field/byte or Native startup certificate, all of which remain UNRUN.

**No configuration-only Favorite enablement candidate exists in rev04.** The current hard LiveRows24 still refuses Favorite. Root’s separate GAS author reports recurrence R≥400 at live192/InitialQ16/C0, already making unchanged settlement work2551R+4=1020404 exceed the fixed public1M program limit; existing controls56 push R≥456. Historical704 storage bounds remain explicitly non-authorizing. No limits were expanded, no future-result Fire declaration was selected, and no public program limit was changed. Game-owned reducer semantics/body costs, full pending coexistence, official GEN and actual startup/Native capacity are separate Root work.

Root’s build42/v14 qualifier and prior actual baselines were provided as context only. They do not validate any rev04 candidate. This handoff does not claim the full matrix, full Fire delivery or independent acceptance.

Artifacts are under `.run/favorite-fire-behavior-implementation-draft-04/`: manifest,24 current-production forward/inverse patches with saved exact before bytes,8 new-target create/delete patches,4 revision03→04 forward/inverse pairs, unchanged inventories, updated capacity/test inventory and rev03 byte-preservation manifest.

| Revised candidate | Rev03 SHA-256 | Rev04 SHA-256 |
|---|---|---|
| `games__101-bomber__Gameplay__BomberFireReducer.Server.cs.draft` | `262bd92477fa2e4e1f359f930e8173f4438f389399c98a6cbf1ca13968a11ace` | `d606559911e2b42cf7a2d1fab05b77230d60f38ca74ad8fd218c02ead1c3063d` |
| `BomberFireZoneLifetimeReducer.Server.cs.draft` | `f8d6fdc200a215c13cefe788b0ffcc1308ef39d3a4d76dbaf77f4dc3e4d05ce2` | `0335076fd9e1a96e0da8af8fbe9706a9928ba0c9852eb66916c9d709d78978f7` |
| `games__101-bomber__Server__Tests__Gameplay__BomberEventContractTests.cs.draft` | `8e997abed74cdf575c8b77687b1499c2ea85c88574286d21b5eaee77a1fc1d92` | `dd644627cca48dc2b027bbf3bc78bd1fc0bb08aa86e1e5029018c1cb94e5ba6d` |
| `BomberFavoriteFireFollowupProductionTests.cs.draft` | `8f8591b6641dee42c2ca1ffcf4b6e7a9ed850dca627e7221f8a620529c9f765a` | `5bdf934c11cead12e3779c034f76b4b16d3e66e9cae9a48e105342e8d15ec4f9` |

All current production fences and32 candidate hashes are listed in manifest.json. Source/byte patch audit is the only local verification; no runtime tests were executed. STOP.
