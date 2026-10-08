# Bomber resource-chest budgets implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Root's exclusive heavy window, explicit file ownership and no-delegation instruction take precedence. No production or declaration changes are authorized by this test-source handoff.

**Goal:** Establish real calculator/storage RED for resource-chest issuance, reward and full-bomb contact bounds, then admit only a proved bounded Gameplay envelope without changing Engine reservation semantics.

**Architecture:** Use the real generated effective tables, Engine Tick conversion and checked finite issuance arithmetic. Resource-box obligations, live entities and unpublished structural orders consume the same owner credit before Native submission; whole cohorts do not receive probability discounts. The actual terrain owner and complete chest/bomb identities remain authoritative.

**Tech Stack:** 101 C# Gameplay, xUnit v3, official06 generated SDK/Reader, existing real LumioConfig AuthoredFixture. Root owns every build/test/GEN/Native run.

## Global constraints

- Read root and 101 core/navigation, architecture/testing, design §§5/7.6, ADR0046/0047/0048. Current M2/Layout producer guards stay closed. Legacy does not acquire an M2 initial box layout simply by reading its candidate table rows.
- This delivery writes only this plan, new `games/101-bomber/Server/Tests/Gameplay/BomberResourceChestBudgetTests.cs`, and private author evidence/report. All existing tests/assertions/source/generated files remain untouched. No commits, index operations, heavy commands or generated edits.
- Every8s at most2/3/4 complete four-cell groups, first8000ms; exclusive stop105s for the240s/115s/20s candidate. Ordinary default420s/115s/60s stops245s. Every possible chest roll may succeed: no division by6, no probability discount for Gold heart/special/drop.
- Gold resource rewards are at most4 with skills and3 without; strong default chest at most6/5. Barrels produce no pickup rewards themselves and share each wave's group cap. Skill-disabled random special rewards are absent; unresolved GoldenHeart/Kick/unsupported special rewards remain obligations and do not disappear from bounds because materialization is currently closed.
- `max_mirror_orbits=0` is the existing declared shutdown of the regeneration source. No new flag, public Reserved8→16 change, contract widening or soft-only substitution is authorized. New enabled resource sources change old arithmetic openly; old closed-source fixtures can retain their own numbers.

## Current gaps and primary evidence

`Gameplay/Config/BomberObjectBudgets.cs` calculates ChestLimit only as five strong stage issuances; regeneration pickups are `events*4*groups`, with `events=remaining/interval+1` ignoring FirstTriggerMs/exclusive stop. `BomberBombState.ContactedChests` declares physical cap5; InspectChest uses the effective ChestLimit, while SyncList.Add separately enforces its own cap. Changing the calculated number alone can therefore throw after admission. ADR0046 requires complete distinct Chest identities retained across the whole bomb lifetime, including pending contacts.

`BomberResourceRewardRules.Maximum` and the actual ResourceRewards.Select agree on Gold's2 random slots + possible special + possible GoldenHeart; neither probability is a capacity discount. Strong default's four fixed rewards + skill + possible heart is a different shape. TerrainBudget already sums the actual proposed M2 initial layout through this helper, but that sum is an initial-only envelope, not initial+regen+strong+central total admission. Settings currently calls it using M2InitialLayout.Plan even on Legacy; this conservative validation call does not imply actual initial M2 resources were produced on Legacy.

InitialResources configures/births M2 resources only for non-Legacy and valid M2 phase1/2, then pins actual cell/full binding/generation. Actual Legacy terminal phase0 has zero issued initial resource chest identities. Future M2 initial resource boxes are16/24/32 (Wood/Iron/Gold8/4/4,12/8/4,16/12/4), not5.

`BomberBlastTerrain` has four rays and power maximum6 (attributes); a single ordinary trace covers at most24 arm coordinates plus origin. This alone is **not** a proved24/25 distinct ChestId lifetime bound: rejected admission retains an Unstarted continuation restarting from the origin, pending Native can prolong source lifetime, and a replacement is a distinct identity. No current invariant pins a globally bounded one-identity-per-coordinate observation ledger. Keep the safe whole-match issuance bound until a separate proof/test rules out multiple generations observed by one retained source. Remote fuse8s/ordinary Danger time cannot discard unresolved terrain obligations. Split family provenance does not authorize deleting a mother's or child's retained contacts.

## Arithmetic and reviewed candidate numbers

Use effective ticks for all operands. Let `M=Tick(match)`, `C=Tick(final)`, `L=Tick(lead)`, `F=Tick(first)`, `R=Tick(interval)>0`, `O=maxMirrorOrbits`. Compute checked stop `S=M>C+L ? M-C-L : 0` and opportunity count:

```csharp
ulong waves = first < stop ? checked(1UL + (stop - 1UL - first) / interval) : 0UL;
ulong regenerationCells = checked(waves * 4UL * checked((ulong)regeneration.MaxMirrorOrbits));
```

Use `0` regenerationCells when O0; interval remains validated and unknown inputs still reject. DefaultF160 ticks/S4900/R160 gives30 waves, not31. The105s candidate gives13 (8..104s). F==S gives0. First-trigger zero is a legitimate schema value and must follow the same formula when considered in a future test; do not subtract unsigned values before checking.

For Legacy initial pickup upper bound preserve the existing conservative area361×initialMintGenerations1 and one maximum soft/crate reward per initial cell. Initial resourceChestIssuances0. Enabled regeneration must use max reward among actual selectable soft/Wood/Iron/Gold products (4/3 for current rows); do not classify forced soft to retain the one-reward formula. StrongIssuances remains stageCount×issuancesPerStage5. Thus:

```text
LifetimeChestIssuances = initialResourceChestIssuances + regenerationCells + strongIssuances
RequiredPickups = initialPickupUpper + regenerationCells * maxRegenerationReward
                  + strongIssuances * strongRewardMaximum + actualCentralSupplyCredits
```

| Legacy source scenario, central disabled | Waves/cells | ChestLimit candidate | RequiredPickups skills on/off |
|---|---:|---:|---:|
| Ordinary420s/115s/60s, first8s,2 groups |30/240|245|1351 /1106|
|240s/115s/20s, first8s,2 groups|13/104|109|807 /698|
|O0, or first at245s stop in default window|0/0|5|391 /386|

One below each required pickup provision must reject at the effective calculator, not a schema/parser or fixture error. Privately provide exact1351/1106/807/698 for the positive witnesses; shipped source maxima703 are not changed here. Current calculator accepts those private inputs but returns old639/634/503/498 and5, so these witnesses reach the intended arithmetic gap. O0 already reaches the expected391/386 and5.

Future M2 horizon105s has13 waves, so total chest issuance candidates are125/185/245. Initial output must be the exact layout-cell sum, not map area duplicated on top of already reserved boxes/barrels. Conservative65% residual envelopes, not claimed actual produced soft counts, yield initial output upper150/218/315 with skills and142/206/299 without. Add regeneration reward416/624/832 (skills) or312/468/624 (off), strong30/25, then enabled central11/9 for23/27. These are pickup-only safe planning envelopes (19:596/479;23:883/708;27:1208/957), not complete simultaneous M2 admission. Actual layout cells may lower the initial component; initial, source lifetime, bulk retirement, bridge/barrel/Frenzy and other producers still need joint proof.

Ordinary bombs'2624 includes prior2496+terrain128; keep that and walls336 unchanged for this resource-only addition. Central/Frenzy contributions stay independent: +24 bomb credits per actual candy source and +11 pickups with skills/+9 without for the current enabled source. New default enabled-resource+central minima would be2648 bombs and1362/1115 pickups, not prior650/643. Existing provision2784/703/336 and old matrices remain historical valid arithmetic for their old one-reward source model; they cannot certify the new source. Obtain Root's explicit narrow authoring/old-test update approval after the RED instead of silently changing all expected numbers or raising source maxima.

## Task1 — Actual calculator/storage RED (test-only now)

**Create:** `games/101-bomber/Server/Tests/Gameplay/BomberResourceChestBudgetTests.cs`.

**Consumes:** existing `AuthoredFixture(params (string Table,string Row,string Column,string Value)[])`, `Compile()`, `BomberConfigBinding.Read(string?)`, `BomberTestWorld.Start(configDirectory:...)`, actual ECS Command create, `BomberChestState.InitializeTier(uint,ulong)`, `BomberBombState.TryObserveChest(NetEntityId)`. No new production interface is assumed.

- [ ] Add10 cases: default enabled source2,105s window2, exact one-below default2, closed O0 two, first==stop one, actual six-distinct resource chest storage one. See delivered test for full executable contents. Calculator-only cases use real export/Reader; the contact case is a labelled storage witness with genuine ECS identities, not actual Native birth/whole-ray proof.
- [ ] Root builds using the existing official06 selection/artifact runner and executes `--filter-class *BomberResourceChestBudgetTests --minimum-expected-tests 10`, retaining source/export/physical DLL/log/JSON/raw child identity. Expect8 assertion failures/2 closed-source successes on unchanged production; actual classification, not prediction, is authoritative. A config/fixture/compiler failure is not arithmetic RED.
- [ ] Keep all pre-existing tests and asserts intact. First inspect all failures, then authorize the production phase separately.

## Task2 — Checked source accounting, capacity proof and structural owner (requires Root authorization)

**Future files:** `Gameplay/Config/BomberObjectBudgets.cs`, `Gameplay/Config/BomberResourceRewardRules.cs` only if a table/flag overload avoids circular Settings construction; `Gameplay/Config/BomberTerrainBudget.cs`; actual regeneration producer owner and only necessary lifecycle/terrain validation boundaries. No simultaneous new M2 guard opening.

- [ ] Replace event arithmetic with the checked absolute first/stop formula above. Derive reward maxima through the shared validated rule, not a duplicated count3/4 constant. Preserve strong default validation and probability-free worst-case reward debt. Return whole-match ChestLimit and check every sum/product/conversion.
- [ ] Initial Legacy resourceChest count0, M2 candidate count from exact validated layout. Keep candidate arithmetic separate from admission; supported Legacy source closures remain legal. Reject any effective ChestLimit above the independently authorized physical container limit before a world/entity is published. Overflow raises the existing named effective-producer diagnostic, never wraps to a small int.
- [ ] Add a durable Game chest issuance/structural credit owner or extend the actual existing regeneration owner. Count live rows + unpublished orders + submitted/Unknown promised identities exactly once before all-four births; transfer held credit only at proven publication. Strong producer and initial producer must respect the same sum when concurrently enabled. Known failed unbound births retire only their complete identities; Unknown and accepted-not-consumed obligations retain credit. No use of binding-list enumeration alone as a credit census.
- [ ] Candidate minimal physical contact capacity245 covers the default Legacy and105s witnesses only. It does **not** cover existing named profiles: `match-480000` requires309 identities, and its valid `final-circle-90000` composition requires333. The checked-in `regen-5000` changes `skill_levels.regen_lv1.interval_ms` (healing), **not** terrain regeneration. A separately authored UGC terrain `regeneration.interval_ms=5000` would produce48 waves/389 identities in the default horizon. Do not silently use245/333 as a universal maximum, introduce a new restriction on currently legal UGC axes without a reviewed support-boundary proof, or shorten retained histories to fit a literal.
- [ ] Check actual SyncList declaration/GEN and serialization limits before proposing the literal. Official06 SyncList accepts a positive int and Add/Insert/decode enforce it; SourceModel requires a positive int literal and emitted attribute/storage metadata carries the exact value. Count bounds do not certify full snapshot/UTF8 bytes. For245 full NetEntityIds, scalar binary payload alone is3920 bytes; with2784 bomb credits this payload component alone is10913280 bytes, excluding lists/object/snapshot framing. Measure actual official serializer bytes with the full declared list, all other Bomb columns and overlapping TerrainContinuations, accepted cohorts and source reservations. Contact entries are NetEntityId, not opaque string promises; preserve full identity and complete bytes. Do not invent a global UTF8/schema ceiling or treat constructor acceptance as a memory proof.

## Task3 — Authorized declaration/GEN and recovery gate (not authorized now)

**Future files:** only `Gameplay/Components/Bomber/BomberBombState.cs` ContactedChests literal; official generated two-side output/metadata and prescribed schema migration evidence; its existing Server validation only if necessary. Root must authorize this exact change after source envelope review. No public Native/ECS Reserved8→16 change is part of it.

- [ ] Preserve old snapshots, source bytes and old schema identity; use official GEN from the same selected provider, never hand-edit generated data. Record changed field maxCapacity35, declaration metadata and resulting schema identity. Scope.None does not erase persistence/schema obligations. Respect current paired-restore/public contract gates and reject incompatible old snapshots unless supported migration is proved.
- [ ] Keep full old chest contacts on entity retirement/replacement, duplicate complete id no additional charge, no same-cell merge, no tombstone reset. Run the new six-contact storage witness plus exact-at-limit/one-over rejection, retained old id duplicate after real retirement and restore, malformed duplicate/cross-world/full-id hydrate negatives, actual bytes, and genuine six-or-more Native ray/rejection/continuation cases. Current first10 cases do not replace this matrix.
- [ ] Require actual Native resource-box birth/bind/Original accepted result, two independent Gold families, failures/duplicates/no extra rewards, exact all-four cohort cap, current generation and pending structural credit checks. Keep ordinary first-wave RED/GREEN and all relevant old tests; regenerate retained author exports only in Root's chosen fresh private root.
- [ ] Root independently reviews production/metadata and narrow legacy expected-value migration, then closes source arithmetic, declaration and executed pipeline separately. No commits or package completion are authorized by this plan.

## Handoff boundary

The following paragraph records the original pre-publication handoff; it does not describe the later Root publication/run status.

Author delivers10 unrun test cases as **private draft only**, at Root `.run/resource-chest-budget-test-draft-01/BomberResourceChestBudgetTests.cs.draft`, and this plan. Root paused compiled Game test publication for the Aura build/GEN window; no new budget `.cs` exists in Server/Tests. Task1 source publication requires Root's release of that window; retain the private before-publication hash and then capture exact deployed bytes. No real RED/GREEN is claimed. Whole-bomb245 is a safe issuance-based candidate, not a tight trajectory theorem. Full entity-credit, bytes, official GEN/schema compatibility and Native resource semantics remain explicit implementation gates. M2, all Supply/Native producers and full-game acceptance stay open.

## 2026-10-03 private bounded-candidate follow-up (no physical publication)

Root has since published the exact10 source and run the genuine complete07 matrix:10 total/2pass/8fail/0skip/rawchild2. The independent review and raw hashes remain in `.sdd/101-20261003-resource-chest-budget-independent-review.md`; this revision does not rewrite that report or the old plan preimage.

Private draft, source/export audit and snapshot-witness inputs are under `.run/resource-chest-budget-bounded-candidate-01/`. The detailed author candidate is `.sdd/101-20261003-resource-chest-bounded-candidate-report.md`. No compiled source, declaration, table, generated file, Runtime contract, public ReservedSlot bound or history is changed by this follow-up.

The read-only audit covers all48 authored profiles:42 Legacy eligible profiles plus6 existing gated M2 profiles, with the default separately included. It merges every actual layer, authenticates483 files and compares all relevant effective source columns to their current server exports:0differences. Largest named ChestLimit is309; valid named-axis composition maximum333. Proposed pickup source1607 is the largest named requirement; the original composite-budget rejection remains meaningful because1703 needs an explicit fixture provision. This is a source migration candidate, not a new constant replacing issuance arithmetic.

**333 is an experiment, not an approved universal physical limit.** Current regeneration schema permits `first_trigger_ms=0` and a positive effective interval below8000ms; ADR0048 fixes default design values without closing that authoring surface. UGC terrain5000 requires389 identities;480s/90s/first0/5000 requires533. Even the schema-valid20Hz first0/50ms case, with a sufficiently provisioned pickup rule, gives39205 under the whole-match contact model; the actual canonical container format would exceed the unchanged1MiB per-blob limit. Neither a333 refusal nor a larger unmeasured literal resolves this support problem. Prove a tighter actual retained-history bound, or obtain a separately justified Game support-boundary decision. Do not change public persistence limits or claim parser acceptance alone is full gameplay support.

The private calculator draft preserves checked first/exclusive-stop/floor/zero/overflow arithmetic and shares existing reward validation without circular Settings construction. Its333+physical admission check is explicitly a named-envelope experiment; it would refuse the UGC counterexamples and must not be copied into production as the final implementation.

The private codec tests construct the actual official SnapshotWriter/Reader (test-only reflection) and save their original payloads. Desired old5→333 compatibility is expected to hit the existing canonical `bad_delta_envelope` rule; old5→5 and333→333 are separate positives. The old-World class must capture/restore and save an actual immutable cap5 image before any declaration change. The future candidate class measures public WorldManager capture length and performs the actual official reader restore for2784/3032 structural-storage cohorts,333 contacts,8 pending hit rows per bomb and pickup/wall cohorts. It does not forge Native/GAS receipts or pretend to have actual terrain continuations/results. Complete concurrent terrain/GAS obligation proof remains necessary. All these new drafts are uncompiled/unrun; no actual full-record size or successful migration is asserted.

If Root later authorizes a physical revision, follow the v14 identity procedure: preserve an immutable before ledger/declarations/raw generated output and all36 current retirement pages; official same-provider two-end GEN+independent drift; complete retirement authentication and exact identity comparison with existing8MiB input/index limits unchanged. Schema retirement evidence is not a WorldSnapshot migration. An explicitly incompatible v15 and a Game-owned old-release migration have different recovery claims and must be recorded accordingly.

Subsequent Root First0 Native slice is separately closed: same53b1 test source, six actual cases5pass/1fail/0skip before the sole zero-first guard removal, then6pass/0skip with source87fe98. Its independent review is `.sdd/101-20261003-regeneration-zero-first-independent-review.md`. This authenticates first0 with8s interval/19-map/105s stop only, and does not approve50ms or general UGC issuance/container limits. Physical contact literal remains undecided; the private333 experiment cannot be published as a universal bound.
