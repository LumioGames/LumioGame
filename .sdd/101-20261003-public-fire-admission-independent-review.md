# Public Fire admission revision02 independent review

2026-10-03. Non-author read-only review of three revised test classes (four cases) and two alternative four-delta admission drafts. **Test source quality PASS. Four-delta source scope/budget arithmetic PASS, but production publication HOLD for one concrete P2: supported level rename is read by an uncontracted fixed label in both the new budget and actual Burn publisher.** No physical source/index/GEN/build/test/Native action by this reviewer. Await Root's fresh four-case actual execution for its reached failure stage.

## Exact reviewed source

| Source | SHA256 |
|---|---|
| Favorite test revised | 08e334e9e2f7f5f837f8c9be56221b8a3910e2f01e47186afc49a4900055f640 |
| Public Fire bomb test revised | 025c52362f0b7cda85428b296ea57ab56fe7421cfe65c4d31770210192415826 |
| Enabled Fire budget test (two cases) | 95869be98b49a1b35290146929590116f161b66d29200e63b3d7e6477db880a1 |
| Current calculator baseline | 2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a |
| Current Fire-only candidate | 0eb5400b4fa170528306f7ebe35cb7cf9b392437a5fc08ae42d0c585ab7f34bf |
| Resource calculator baseline | 02263d82ebb7e73163ec20fdc0eb502362ca4ae1908dcb4602808941efe55192 |
| Resource-integrated Fire candidate | 1e334fa9909037648af90a4a24969b56ba142fbc48a4671c022fa632dc6258a8 |

Inputs are under `.run/public-fire-tests-draft-02` and `.run/public-fire-admission-production-draft-01`. Reviewed complete source, frozen before images, implementation report, original Favorite plan, resource formula/helper review, actual tables/schema, public placement/resolver, Native lifecycle publisher and common hard-cap admission. Independent exact reversal of the four deltas recovers each production baseline byte-for-byte; independent reversal of two author capacity additions and two Required assertions recovers both old public test methods and all assertions byte-for-byte. This preserves the resource baseline as its own independent delta; it does not grant Resource closure by labeling the integrated result Fire-only.

## Four test cases and reached-stage limits

The Favorite case legitimately prepares the explicit initial selection boundary, then invokes actual SelectCharacter to bind bear/skill4. Only the physical pickup item is fixture-created; actual public PickupAbility produces and retires the held Fire slot, and public UseActiveSkillAbility must produce the genuine finite 10111 Initial/Applied result. Full handle, participant/life/generation/match/chain, source/target, duration, cooldown, Favorite snapshot and unique cast/statistic assertions remain. ReceiptProbe is a read-only borrowed phase9 observer restored through IDisposable, never a fabricated successful receipt. This one case does not prove Favorite trail production or its capacity.

The public Fire bomb case uses actual pickup and public PlaceBomb, actual stock reservation, structural publication and normal Tick HFSM initialization. It verifies immutable full historical source and unique chain, ordinary fuse, genuine Native stationary→Danger→Burn→retirement, 1500ms Burn and exactly one Fuse-credit return. No bomb/phase/clock/native snapshot is fabricated. Players are positioned away from the blast so the no-damage assertion is a valid fixture condition; this is not enemy Burn exposure/death/recovery proof.

The two budget cases use actual author export and Reader. The negative demands the exact max_bomb requirement error for4063; the positive demands exact4064/1351/336 and enabled known Fire. Both supply1351 pickup capacity. Before implementation, Fire.dormant executes earlier than RequireCapacity, so failure there is an admission RED, not a reached4063 budget RED. The negative's exact error protects that distinction: a dormant exception cannot pass it. Root must record actual fresh test/source/DLL identity; the previous single Favorite historical RED is not these four revised-source cases.

## Independent arithmetic and scope

Actual default uses20Hz; SDK Ticks.FromMilliseconds truncates milliseconds×Hz/1000. Fuse2100=42, Danger400=8, enabled Fire1500=30, retirement slack2, eight participants, six accepted primary placements per participant tick. Disabled nominal is2624; enabled is `8*(6*42 + 6*(8+30+2))+128 = 4064`, exactly1440 more. Charging every ordinary post-Fuse row the longest enabled Burn is conservative and does not discount the probability of Fire pickup. The existing checked sum/product/Int32 conversion and unchanged RequireCapacity remain. Existing live rows and future credits are still bounded by the common hard-cap owner, including retained/Unknown debts; nominal timing arithmetic does not prove all indefinite holds disappear within two ticks.

Resource baseline: stop245s=4900ticks, first160, interval160, exclusive30 opportunities; two four-cell groups yield240 possible resource cells, with worst Gold four outputs; initial361×one output plus five strong issuances×six outputs gives `361 + 240*4 + 5*6 = 1351`. No1/6 selection or gold probability discount. Current baseline retains its old31 opportunities×one-output formula and639 pickup requirement. Therefore current Fire-only0eb540 cannot satisfy new public/positive RequiredPickups1351 assertions; integrated1e334 requires the independently reviewed resource02263 logic and reward helper1958df plus its explicit publication gates. The4063 bomb negative could reach its desired first-capacity failure under Fire-only because bomb capacity is checked first, but that would not validate the other integrated assertions.

Required wall rows remain336 from `8*(40+2)`. Supply/Frenzy logic is unchanged, central supply disabled in this test-specific default, and any enabled supply contribution/profile migration must remain explicit. No source default/max/table change occurs here. Exact Split dormant rejection, known kind/effect whitelist, all dormant fixed skill/level/1500 validation, LegacyPillars/19×19/eight-participant first-round admission, other M2 enabled-block rejection, regeneration/default/role and finite storage guards remain unchanged by byte reversal. This does not establish all shipped profiles, entity/Native byte budgets, M2 or Resource box production.

## P2: supported level rename breaks budget and Native Burn

New candidate's `SkillLevels.Rows.Single(row => row.Name == "fireBomb_lv1")` adds a label precondition absent from the validated contract. The actual existing BomberBombLifecycle.Server.cs EnterBurn line75 repeats it. Exact trigger is an official supported rename of level row116032 to another nonconflicting name, preserving registry identity, SkillId40003, Level1 and Duration1500 and all existing validated fields, with Fire enabled and sufficient capacity.

Primary evidence: `schemas/skill_levels.json` declares name as required string without fixed enum/pattern. TypedTables reads name as ordinary text. ValidateProducers associates the Fire level via SkillId and checks one level1/1500 and all other exact fields, never level.Name. `BomberConfigBinding.Settings.SkillLevel` line104 is keyed by SkillId+Level; Game Tables README expressly directs keyed skill reads through that API. Config decision0-2 permits rename while preserving the lifelong ID, and tooling decision0-6 defines its official rename patch/apply route. Merely editing table name without corresponding registry migration would be an invalid fixture and must not be used to claim this bug.

This is an actionable new supported-input rejection in budget and a still-existing runtime failure after public Fire admission; it is not evidence that all semantic producer names may be renamed. The fixed fireBomb skill name remains explicitly checked by the producer contract. Smallest fix: identify that already validated actual fireBomb skill row, obtain its actual Id, use the level keyed by SkillId+Level1 in the calculator, and use `fireConfig.SkillLevel(actualFireSkill.Id,1)` in EnterBurn. Keep fixed1500/one-level checks, exact kind/effect/producer guards and all clocks. Do not add a level.Name lock to hide the bug or hard-code a new numeric ID.

Add real official rename author export/Reader regression and genuine public pickup→Place→Native Burn regression; actual failure must occur before production authorization, and post-fix assert4064 plus full source/1500/native path. The current four tests do not cover this input. No proposed fix or fifth test is written here.

## Independent proof and next execution

Private `.run/public-fire-admission-independent-review-01/verification.json` SHA256 6b4881c154e767b0c203d8775648cfe4750668398d378afab2a3a06bbe663ee0, Node v24.18.0 child0. It pins inputs, exact reversal, actual table hashes/arithmetic and rename primary source hashes. An initial private arithmetic helper used ceiling; reading actual SDK showed truncation, so it was corrected before conclusion. Both scripts/proofs are preserved; all tested default durations are exactly tick-divisible, so resulting numeric proof bytes agree. No C# execution is implied by the Node check.

Await Root build33/four-class raw records, then append actual execution only. Supported-name P2 is the concrete publication hold; broad complete-delivery requirements are reported as remaining evidence scope, not substituted for this narrow finding. Existing resource/contact capacity proof and default/profile migration remain separately owned and open.
