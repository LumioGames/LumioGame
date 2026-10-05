# Reducer result-window qualification — independent review

Date: 2026-10-03. Reviewer: `/root/favorite_behavior_review`, nonauthor.

Decision: **STATIC ACCEPT for the frozen private R1025 / span256 qualification candidate and its additive diagnostics.** No blocking source defect was found in the bounded transformation. This permits private official-generation and validation experiments. It does not approve a production result quota, capacity certificate, Config publication, final generated plan or Favorite enablement.

The review performs lightweight source, hash, dependency and byte-inverse checks only. No reviewer .NET build, official GEN, Native call, Runtime edit or production edit occurred. Author scripts were read, not executed.

## Frozen inputs and byte fences

The complete [frozen manifest](C:/Work/LumioGames/LumioGame/.run/reducer-result-window-proof-draft-01/manifest.frozen.json) is SHA256 `f8fc89365b28eb316e4034f588bfec9bb9305f8c9b43aad7b20bbbcb7298ecf1`. Its complete [author report](C:/Work/LumioGames/LumioGame/.sdd/101-20261003-reducer-result-window-proof-report.md) is SHA256 `4f67fe321aa6ead0b2b71d005ed6f413ec8215b6c15cb40983f4da01c7efbdab`. The selected [qualification1025-span256-v2 manifest](C:/Work/LumioGames/LumioGame/.run/reducer-result-window-proof-draft-01/qualification1025-span256-v2/manifest.json) is SHA256 `3e662ed6bea1e382856ce84b054c6908d2d9c5430e0a49d6974c1969cca0e8d1`.

All eight artifacts listed by the frozen manifest match their hashes. All four complete source before files match the current physical files at initial inspection:

| Target under `games/101-bomber/Gameplay` | Before SHA256 | Private draft SHA256 |
|---|---|---|
| BomberHealthReducer.Server.cs | `3c89297d3b257b7993748525998342e6a4d84aedfe4d5c8146bdcf0a7ec22921` | `4fd6443c39ee9a1c3e504960853c095bc23442bd73560172f7035e49006b3b19` |
| BomberSettlementReducer.Server.cs | `d0448130e45695a2099935a9bf0abf70dc9586f9b4c2edbcbb75b63339a8824a` | `3241ec0f2a60de642c9447a0fa16f1c139e9e246beb570dd6025649a8a080ed7` |
| BomberFireZoneLifetimeReducer.Server.cs | `ec97a9bdaf648638dd4b57ad4c82dea44543acfbc21f6eb662c4dcfb20bef58c` | `af3344e49fdbf1db151f4e2a2ad5617c121c8047ca6415c899f091cfce7228d3` |
| BomberOutcomeReducer.Server.cs | `4aa133f174000e306fc86edcf0d83644b9108cf2d544d4bb83e8eed580dd3be2` | `600a2aab210e3c3a09e608e0253c10a131f09140654970e99399e5445a5d595a` |

The independently applied four source and two diagnostic forward patches produce the entire corresponding drafts; all six inverse patches restore the entire before files, including mixed LF/CRLF byte sequences. Full byte pairs, patch hashes and current fences are retained in [independent evidence](C:/Work/LumioGames/LumioGame/.run/reducer-window-qualification-independent-review-01/evidence.json). This is an audit of supplied private files, not publication into their targets.

## Complete processing and result coverage

Each of Health, Settlement and FireRegion is transformed into five top-level partial reducer classes with unique IDs. Their `(offset, span)` pairs are `(0,256)`, `(256,256)`, `(512,256)`, `(768,256)`, `(1024,1)`. Each local loop remains `int i = 0`, increments by one, and computes `int windowResultIndex = i + offset`. The `windowResultIndex < c.ResultCount` guard encloses the result lookup and every subsequent operation; empty or short windows do not read absent results.

The loop counter in each original body was used only by `c.Result(i)`. For each of the fifteen new loops, removal of the added guard indentation and reversal of that one lookup substitution recovers the complete original per-result body exactly. Original method prefixes and every field-mapping attribute are also exact. The source retains each family's full type/kind/outcome predicates, association reads, full-handle and source checks, immutable timing guards, pending status checks and row claims; it changes no condition within those bodies. In particular, genuine Terminal ordinal zero remains accepted by the FireRegion predicates already reviewed in the existing implementation.

An independent integer enumeration verified every actual ResultCount from 0 through 1025: each valid global result index is visited once, in increasing order, by every family. The qualification contains no coverage for indices 1025 and above. A validation experiment with a larger structural result context does not extend this source coverage.

The recovered body SHA256 values are Health `0dd529be93dd11f2d28dda65022e87ea3d850e6c8695f4c7cf40c669aa5f218e`, Settlement `1787072d204606b4dcd007e818bcb975b1a6c6cd36d7c3098958720765b5e573`, and FireRegion `fa534fe107a12e04453a3dd158c26a23e551d90b861595683fe7981917101981`. The bodies retain respectively 1/1, 2/2, and 0/0 Claim/SetAt call sites. Each claim and its writes remain within the same root invocation; no claim capability is retained between windows.

## Actual generator and Runtime semantics

The authoritative generator inspected is under `C:/Work/LumioGames/.101-pack07/LumioGameRuntime/tools/gen-declarations`, including [EffectReducerDeclarations.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/tools/gen-declarations/EffectReducerDeclarations.cs:75) and [EffectReducerLowering.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/tools/gen-declarations/EffectReducerLowering.cs). Its supported declaration shape is a unique ASCII ID on a top-level nongeneric partial EffectReducer with one static Reduce method. Identical field-mapping declarations across roots are accepted; conflicting identities are rejected. Its verifier accepts bounded constant int loops up to 1024 and its lowering supports the primitive int addition/comparison and conditional guard used here. Spans 256 and 1 satisfy these source rules. These are source-confirmed eligibility checks, not a claim that the new candidate has compiled or that its generated image has validated.

The generator orders available roots by ordinal ID subject to declared dependencies. Independently applying that rule to the seventeen exact root declarations yields:

1. `bomber.fire`.
2. `bomber.fire-region`, then its `.window000001` through `.window000004` tails.
3. `bomber.health`, then its four tails.
4. `bomber.settlement`, then its four tails.
5. `bomber.outcome`.

This preserves the original collapsed family order. Each family's tails depend on its predecessor; dependent family heads and Outcome wait for the required final family tails. The complete Outcome change is limited to its After identifiers. Its complete body is unchanged; the Fire source is unchanged and remains one root. Neither result-selection policy is partitioned or rewritten.

[EffectReducerPlan.Run](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/gas/src/Lumio.GameRuntime.Gas/Effect/EffectReducerPlan.cs:143) prepares storage and a shared operation budget once, then executes separate root leases. [EffectResultsWindow.Borrow](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/gas/src/Lumio.GameRuntime.Gas/Effect/EffectResults.cs:29) supplies the same frame's ordered result collection and association facts to each root. Each `c.Result(windowResultIndex)` therefore refers to its original global result and fact, not a local copied subset. [Reducer storage](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/World/ReducerStorage.cs:130) reads current scalar values and current indexed items; writes update those stores immediately, so later windows see earlier writes. Restoration capture still runs after the complete plan.

The existing [claim contract](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/gas/src/Lumio.GameRuntime.Gas/Effect/EffectOperationClaim.cs:30) captures exact storage expectations against the owning result/fact and lease, then revalidates them before writes. The transformations keep the same original Claim and SetAt expressions. Separate leases do not create a new authority path or bypass the shared world budget. Full Runtime and generator input hashes are fenced in the private evidence.

## Additive diagnostic quality

The complete original diagnostic before file is SHA256 `a1bda9ffb983b21dfdef6d846ad8c8df09a28daea8a2b8327bca5804d7a82d1a`, 15030 bytes, and matched its current target. The theory-only candidate is `e9e1fad1a94ba2372ecc953b03a08c41000c27d56f8caa05a6e62306b70eabca`, 23830 bytes. The inventory17 candidate is `cd1da9d21eb5f2d54cfe640267f539455d7d0163979b535bd82c04b955a0ed22`, 23831 bytes.

The theory-only file preserves all original source and assertions while adding six family/context cases: Health, Settlement and FireRegion at structural contexts 1025 and 65536. The inventory17 variant makes only the first original inventory assertion's authorized 5→17 count replacement; the new per-family expected count remains five. Full original 400/704 cases and the old unpartitioned Fire/Outcome checks remain intact.

The added cases obtain the actual generated plan constants, require the exact five unique IDs for the selected family, construct official operation data/bindings, and invoke the public validation path with a fresh block. They retain the public per-program MaxWork assertion of one million and record the actual image bytes/hash, revisions, schema, bounds and field types. They do not synthesize an executable image, estimate work as a replacement for validation, edit a Runtime limit, or fake Native/Ready success. A shell world supplies generated binding context; this experiment does not invoke full startup or gameplay. Family filtering is explicit and the existing full-plan diagnostic remains separate.

## Capacity and publication boundary

The source declaration count is seventeen, comprising the original Fire and Outcome plus fifteen windows. Each window retains its original family's conservative MaxWrites declaration: Health 2160, Settlement 3600, FireRegion 720. The total declared writes are therefore 34639. Under the inspected generator's fixed one-million MaxWork declaration per root, total declared work is 17 million. These are consequences of this private candidate, not approved Config values, and the current aggregate five-million budget would reject this seventeen-root plan.

Official generated images must independently establish each root's actual validation costs, field expansions, hooks, scratch, write bytes and indexed bounds. The existing full-vector Fire and Outcome may still prevent a proposed larger context from passing. The source alone does not certify these outcomes. The 65536 structural cases especially establish neither production coverage nor an admissible result quota.

Any production selection must include a fail-closed startup check that the configured result limit fits the selected source windows, a complete current producer/cohort bound, actual generated-plan validation and appropriate native/gameplay evidence. Those are intentionally outside this private qualification and remain unresolved. No new quota, public per-program limit or Game aggregate budget is approved by this review.

## Specification and quality outcome

Within the reviewed scope, the transformation retains phase-nine authority, exact typed associations, lease ownership, indexed row coherence, deterministic execution and existing assertion strength. No new gameplay, placement, Power, UGC, schema or public limit contract is introduced. The static qualification is reviewable and byte-reversible; it remains an unexecuted candidate from this reviewer's perspective. Generated/startup acceptance, broad capacity adequacy and Favorite production acceptance remain pending independently.
