# Per-bomb contact bound: durable traversal candidate

2026-10-03, capacity_schema. Private author proposal, not independent review of our earlier Continuation11 or Resource02263 drafts. No compiled source, table, declaration, generated file, SDK limit, or prior test has been edited. Root owns all execution/generation. **52 remains a mathematical/schema candidate, not a selected physical capacity or acceptance result.**

## Current gap, including the accepted geometry fixes

Current actual source identities:

- `BomberBlastTerrain.Server.cs`: `701769cac2b57d5be3fb10bd39d387b1b13b8a35f0c089ff8c65b08cf6d8c843`.
- `BomberBombState.Server.cs`: `c403ac2ea15fd6651c82bd5b17cfa7fd62edcf84b6c2c4503e68a3c9f1e41bf0`.
- `BomberTerrainTransactions.Server.cs`: `9621ba531ee42a6cc8358b6e212637d9e8dde9bd82981919cfc63ab1aeab29f2`.
- Fixed physical declaration retains `ContactedChests` cap5; no field/generation edit accompanies this proposal.

The Root geometry fixes correctly relate non-Unstarted continuation and actual pending detail to the source's full identity, real directional axis, positive consumed distance, original power and remaining range. They do not retain which arm already consumed an accepted/contact frontier across restoration.

Concrete remaining witness: the existing nonauthor Frontier fixture performs actual A `(6,5)` Original settlement for a Pierce4 bomb at `(3,5)`. Its history contains exact A, and the right continuation is `(6,5,Direction1,Remaining1,Unstartedfalse)` while a different arm's real C Original remains pending. Replace **only that continuation column** by `(3,5,Direction1,Remaining4,Unstartedtrue)`, preserving Family/Occurred, original Power/transform/full source and history. `BombState.Server.cs` Unstarted branch checks precisely current origin and Power, so the reset passes. Its existing non-Unstarted geometry function is bypassed. Current Resume then traces from that origin again. A true new full-ID A' binding at `(6,5)` can be hit because ID dedup only knows A, not its coordinate/direction. The original single geometry fix is necessary, but this is a different causal gap.

Neither `ContactedChests.Count != 0` nor `ReachRight > 0` is a valid replacement guard. Other arms can have real contacts while this arm is legitimately still Unstarted. Visible Reach may include open cells before an arm's first competing mutation; current retry legitimately remains at its original accepted/contact cursor. No six-power, boundary1, probability, or whole-match333 restriction is introduced.

## Smallest concrete persisted candidate supplied here

Private code is in `.run/per-bomb-traversal-monotonic-draft-01/`:

1. `BomberBombState.Traversal.Declarations.cs.draft`: four tail-appended private Server/None Persist identities, no new component/entity/native slot. Three scalars `TraversalOriginX`, `TraversalOriginZ`, `TraversalPower`, default−1; one `TraversalArms : SyncList<int>(max4)`, empty before real explosion.
2. `BomberBombState.Traversal.Server.cs.draft`: uncompiled bounded core/method proposal. Exactly four arm entries after actual Native EnterDanger. Each entry packs `4*distance+state`, with Ready0, PendingOriginal1, Finished2. Directional distance is bounded by both original Power and actual map boundary geometry, using long arithmetic before checked conversion. No hard6/27/333 producer gate appears in the helper.

The origin and Power are frozen at the **actual Native explosion**, after legitimate Fuse movement and before Trace/first mutation. They are not frozen at placement: public Kick may change the eventual explosion cell. Once the Native explosion exists, current `Power` and current bomb cell must match the stored geometry; single-field Power/origin corruption can no longer silently reinterpret old obligations. Exact SourceLife/generation/Participant/family/Occurred checks stay in all existing paths; no new live-life requirement is added for a historical source.

The durable distance tracks an **accepted/contact/owned mutation frontier**, not every open-cell Reach. A retry may reread a formerly open prefix behind the next uncommitted obstacle. It cannot produce a second chest contact at or behind an already acquired frontier. A new successful mutation/nonterminal chest contact must have distance strictly greater than the same arm's prior Ready distance. Different arms keep independent zero-progress/Unstarted eligibility even when some other arm has a contact.

State ownership is necessary, not just a scalar distance: PendingOriginal cannot be replaced by an unstarted/ready row or silently finished on timeout. Finished cannot acquire a synthetic new continuation. Existing known abort/staging rejection ends the owned arm without restoring old progress. Unknown keeps its exact Pending state indefinitely. An actual Original transfers Pending(d)→Ready(d), then appends the existing non-Unstarted continuation once; a duplicate is ignored by the current exact pending consumer and must never recreate Pending/Ready.

The packed terminal state avoids four extra terminal flags. A fixed4 list changes one persisted field identity, rather than four separate progress fields, and does not expand public Native slots. Metadata, generated storage/layout budgets, and actual serialization bytes still need official measurement. The private declaration does **not** actually select/change the physical ContactedChests cap.

## Mandatory integration ordering (not yet implemented)

| Existing production point | Required exact operation |
|---|---|
| `BomberBombLifecycle` actual Native EnterDanger action | Pure source/geometry preflight, publish frozen geometry and four Ready0 entries exactly once, then normal Phase/Occurred/Trace. Never stamp from a restored service cache, an event invented by a test, or current successor position. |
| `Trace` | Validate frozen source; keep four initial ray semantics. Do not clear/reinitialize durable arm memory when visible Reach is reset. Complete blockers/end-of-range using Finished, retain true unavailable-read arms as Ready0/Unstarted. |
| `TryDestroy` preflight | Validate strict new directional distance before any hit-count/contact/loot/producer side effect. A failed `retryArm` acquisition keeps its prior Ready distance; no progress advance or unknown release. |
| Terminal mutation frame acquisition | Transfer to Pending(d) once the complete fixed Game transaction obligation can be encoded. Stage/Unknown retains it. Staging Rejected must finish the exact acquired arms, leaving no phantom Pending owner. The ordinary durable WorldRuntime header/tuple remains the Native promise owner. |
| Gold/strong first/nonterminal count | Preflight complete real full-ID contact and progress together. Nonterminal contact ends that arm. Strong terminal pre-observation owns Pending(d); its later Original is a transfer for the **same full chest ID**, not a second Observe or a second step. |
| Whole Original settlement | First validate entire actual receipt/cell/source/power/geometry/progress cohort without writes. Then terminal ordinary `TryObserveChest` and Pending(d)→Ready(d) transfer exactly once. Only after all preflight succeeds append the existing accepted continuations and clear the exact header. |
| Aborted/known refusal | Validate exact NotApplied owner, then Pending(d)→Finished(d); retain any already counted strong contact history. Do not rewind to earlier Ready or Unstarted. |
| `Resume` | Require its row's direction/distance/remaining and Ready state to match durable memory before clearing rows. Positive accepted cursor with replacement obstacle seals the arm, never contacts that replacement. A retry retains the same accepted cursor. End-of-range/water/cover-stop ends the arm. |
| Hydrate and normal validation | Local source/row/pending state guards run without mutation. Complete owner completeness is checked at the **quiescent restored cut/next normal frame**, not during a transient half-constructed processor frame, where other arms are legitimately not yet materialized. For each Pending state require the exact durable header's unique source+direction+cell; Ready unfinished arms require the matching continuation; Finished arms allow neither. Existing OnHydrate ordering must be verified before choosing the final hook. |

The helper core alone is not a complete production fix. In particular current `TryObserveChest(id)` and `TryDestroy` do not yet call it, End rejection has no arm-state cleanup, and existing Trace/Resume do not mark finished rays. Publishing just the declarations/helper would provide no proof. Call-site transaction preflight must prevent a new exception after hit counts or Native mutation has already been committed.

The old public storage probe `TryObserveChest(id)` is used by Resource10 and storage/snapshot tests on never-exploded published entities. Preserve those old assertions and public ContactedChests.Count history; do not create a second hidden store and call the old test green. Production Danger contacts need the new exact geometry-aware admission; the old geometry-free path must not mutate actual exploded sources. Whether that is a retained Fuse/storage-only overload or a unified explicit source-mode API needs Root review before publication. Existing ordinary old5 negative witnesses and same-field new-release boundary remain valid.

## Conditional mathematical bound, and what this does not establish

Under the candidate writer/state invariants, every distinct admitted chest ID consumes a strictly new positive distance on one of four frozen rays. Therefore, for frozen origin `(x,z)`, effective P≥0 and B≥0:

```text
N <= min(P,x−B) + min(P,W−B−1−x)
   + min(P,z−B) + min(P,D−B−1−z)
max N <= min(2P,W−2B−1) + min(2P,D−2B−1)
```

Use long/BigInt for `2P` and differences. The origin itself never calls TryDestroy. For approved product map dimensions at most27 and B0, saturation is52; B1 gives48, but B1 is not an arbitrary UGC premise. Current live admission remains Legacy19, so this argument does not open23/27 or any dimension wider than the existing product domain. Power may exceed6: the spatial bound clips it; pending data still must use the actual frozen power.

This is a writer/restore-consistency proof proposal, not a cryptographic authentication of arbitrary coherently rewritten Game state. Resetting only the actual continuation with its independent durable arm unchanged must be refused. If the threat model also permits coherently replacing the arm witness **and** prior contact history/provenance, a larger redundant per-contact coordinate/direction/full-ID ledger, or external authoritative snapshot authenticity, must be considered explicitly; current Canonical JSON/checksum does not authenticate those business facts. Do not claim that the four proposed fields alone detect every coordinated forgery. Even redundant local columns cannot reconstruct Native history that the public API legitimately evicted. This limitation must remain visible when Root selects a formal restore policy/capacity.

Existing publisher paths make origin/Power immutable after actual explosion in the trusted producer closure: Power writes occur only in new Place/Frenzy/Barrel/Split EntityOrder inputs; player growth does not rewrite existing bombs. Kick's selection/movement only accepts Fuse, future fuse and initialized Kick state; `BomberBombKick.Server.cs:64–68` excludes Danger/Burn, and Native ReturnCapacity clears Kick before EnterDanger. BomberBombEntity has no player movement Ability/dynamic-body writer. The new frozen geometry fields make this invariant explicit at restoration; these are Game guards, not a new public Runtime immutability contract.

## Four new Native-caused tests: PRIVATE and unrun

`BomberTerrainTraversalResetTests.cs.draft` is a separate four-row Theory. It copies the other author's existing actual Frontier setup/helpers from physical `4d25deea747123af962db28fac8e8e9b219cf1afbd9455ff4c3688b710014a2e`, preserving the original source. This is authored TDD, not self-review of Continuation11. Its actual A Original, C pending Original, full source/generation/chain/family/Occurred, live replacement A' candidate, actual Runtime-derived binding context, SDK section revision and original receipt checks are retained.

Each row first captures and officially restores an unmodified actual paired positive cut. It then corrupts **only** the accepted continuation:

- `storage`: desired `ValidateStorage` rejection. Current predicates statically accept the origin/fullPower/Unstarted reset, so true RED is expected only after Root runs it.
- `runtime`: desired official Runtime hydration refusal, preserving the original raw snapshot. This is deliberately not labeled complete paired resume.
- `paired`: desired public Engine paired restoration refusal, with saved actual Runtime-envelope and Native bytes. No packet/checksum/canonical payload is patched.
- `native`: bind a genuine new-generation A' at the already accepted A cell while leaving C's raw Original untouched. A precise traversal refusal before any Native commit is safe; otherwise all original live/binding/ContactedChests/DestroyedBlocks/no-extra-pending assertions must hold. Current corrupted arm can replay and retire A', giving the business RED after genuine prerequisites.

No fake outcome/receipt/revision/phase, no invented public helper, no extended lifetime, no test skip. The private emitter first failed a line-ending assumption; it wrote no C# output then, preserved its own failed emitter, corrected line extraction and emitted the four-case draft. This is tool precondition history, not a business RED. No draft has been compiled or executed.

## Required next witnesses before formal capacity selection

1. Root publishes only the new reset tests after nonauthor review, actual current-code RED for direct/runtime/paired/native, preserving every old13/Continuation11/Frontier2 test unchanged.
2. Review the exact new field list and hook ordering, especially transient-frame versus restored-owner completeness. Official Game-owned new-release schema history/generation only after approval; retain immutable oldcap5 .lwm and expected rejection. No canonical patch or public limit increase.
3. Native positive four-arm progression, legitimate Unstarted on another arm **after** real contact elsewhere; Gold/strong terminal transfer and nonterminal stop; known stage/actual revision abort; actual receipt history Unknown across deadline and dead source; duplicate Original and real paired capture before/after transfer, with strict state/read-only source equality.
4. Real public Kick during Fuse followed by Native explosion at its true moved origin; Danger movement refusal/absence; direct single-column origin/Power corruption restore negatives, no same-life substitution. Existing exact historical SourceLife allowed after death.
5. Larger effective power (7/8 and saturation geometry) through actual authoring/Reader/public placement, all accepted pending and directional bounds; legal B0 geometry. No relaxed producer admission just to reach these tests.
6. Candidate52 actual public ContactedChests6/52/one-over storage, immutable oldcap5 rejection, true full-world capture/official typed reader/restore and exact actual snapshot sizes under unchanged public1MiB blob/64MiB record/8MiB relevant section limits. Full coexistence debt/effect/Fire/Frenzy/Native budget witnesses remain separate; private numbers are not measured bytes.

No formal cap, GEN, declaration or configuration is released by this plan. Further integrity-policy choice and actual GREEN remain Root dependencies.

## Handoff identities and shared-window change

Private new four-case source SHA256: `901761a3afb9e56fcf45b73969e1221fc390e20275c8e5233cc013ec05beb5a6`.
Private four-field declaration snippet: `50efb872995d3f951701bebbca46cc3068b7db4d2984d96a690e7e1a1021b24e`.
Private bounded core: `d46c16a8d53fe8f215e863ea609902250e44b4f486d2e276a49f0ec5fda20c28`.
The local manifest records all exact inputs/files; the audit runs only lightweight Node count/predicate/360-map-geometry checks. Those are author static preflight, not independent review, C# compilation or Native proof.

During this private work Root's shared `BomberObjectBudgets.cs` changed from initial `2b228507…` to `1e334fa9909037648af90a4a24969b56ba142fbc48a4671c022fa632dc6258a8`. The original input fence and the detected cross-domain change are preserved in `initial-inputs.json` / `input-fence-cross-domain-drift.json`; no old source was restored or overwritten by this author. The actual Blast701769/BombStatec403/Terrain9621/declarationfd871/source Frontier4d25 inputs remain unchanged in the final fence. Do not claim all shared inputs had zero drift. Root must pin the actual authoring/Reader/config budget identity when it later publishes/runs the four draft tests; any incompatible fixture/config startup remains a prerequisite failure, not the intended traversal RED.

Status: PRIVATE READY and STOP. Only private draft/evidence and this plan were written. Current compiled source/DECL/generated/table files were not edited by this author; no test/build/GEN/Native/format/commit was executed.
