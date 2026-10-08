# Fire fact structure read-only review (2026-10-03)

State: evaluation only. No declaration, producer, reducer, ledger, Runtime or generated-output change is authorized by this review. Official generation attempt 05 failed with `effect_invalid_declaration: unaligned row fields`; all earlier diagnostics and the original v14 declaration freeze remain retained.

## Public basis and implementation boundary

Read the authoritative Engine `.spec/knowledge/features/gas.md` and `.spec/decisions/ADR-126-effect-timing-payload-and-finalization-seams.md` (P-A clauses 1-5, F-A clauses 2-5, D1/D5/D7), plus `engine/wire/effect-lifecycle-v1.json` production callback/result/capacity rules. These require complete immutable typed payload, full request identity and correlated results, bounded fixed reducer writes, and game-owned death policy. They do not promise a mixed scalar/fact component declaration. This is an unsupported current Game declaration, not evidence of a public contract defect.

Read current public Runtime EffectRow/EffectFact declarations and actual generated-plan consumer. `EffectFactAssociation` independently selects the Owner and Index from payload and validates that the owner record has the exact single row layout. Owner need not equal request Source or Target. Each associated request holds an exact column-count lease until phase-9 result/reducer completion; a row cannot be resized/reused during that lease. `EffectOperationRow` requires one ready column, unique identity selectors and uniformly aligned physical fields. Current official `BuildRowsAndFacts` selects every storage field in the marked component/layout, so adding annotations only to the 26 Skill lists cannot make its 66 scalars disappear from the row.

## Exact 10110 -> existing bomber.damage mapping

The existing 24 columns have the same types/selectors as these new fire columns:

| Existing damage column | Fire column | Binding |
|---|---|---|
| HandleWorld / HandleInstance / HandleGeneration | FireHandleWorld / FireHandleInstance / FireHandleGeneration | captured selectors 1/2/3 |
| TypeId / Target / Source / Tick | FireTypeId / FireTarget / FireSource / FireTick | captured selectors 4/5/6/8 |
| MatchId / Participant / Life / Generation | FireMatchId / FireParticipant / FireLife / FireGeneration | payload 5/6/7/8 |
| SourceParticipant / SourceLife / SourceGeneration | FireSourceParticipant / FireSourceLife / FireSourceGeneration | payload 9/10/11 |
| Family / ChainId / X / Z / Cause | FireFamily / FireChainId / FireX / FireZ / FireCause | payload 12/13/14/15/16 |
| Before / After / Actual / Ready / Status | FireBefore / FireAfter / FireActual / FireReady / FireStatus | three outputs / ready / status |

10110 parameter 1 Points and parameter 2 Fx already have the same numeric/Fx roles as 10101. Parameter 3 remains a full FactOwner identity; it would have to become a real BomberBombEntity owner of bomber.damage, and parameter 4 would be a reserved row 0..15. Parameters 5..16 map exactly. Parameter 17 SourceKind and parameter 18 Pulse have no persisted captured destination in the 24-column row. Their typed payload still can exist, but post-settlement consumption cannot recover those two values from this row or from a mutable selected exposure source. Reusing Fx/Magnitude/World service dictionaries to hide them is forbidden by the public basis.

## Producer and settlement consequences

A Burn-only 10110 can be associated with the original real bomb's existing damage row, with Source remaining the original real bomb. It is not plug-compatible with existing contact storage. TryReserveHit deduplicates by Participant, all DamageFacts counts equal parallel HitParticipants counts, ContactApplied rows retain once-per-family contact history, and SubmitDamage only submits Pending hit witnesses. A Burn pulse must independently reserve/reuse a safe completed row, reset all exact handle/status/ready keys, preserve the ordinary explosion hit history, and allow repeated exposure/new life generations without returning ordinary bomb capacity. Capacity 16 must cover actual distinct pending target identities; if it cannot, admission must retain elapsed exposure until a row is available rather than discard an accepted pulse. No Native proof exists for that redesign.

Existing settlement/outcome are also not automatic fire support. SettlementReducer accepts only 10101 and checks all parallel bomb hit witnesses before Claim. OutcomeReducer selects only 10101 CrossedZero and checks the same witness arrays before 11 lifecycle writes. EffectBusiness.Consume emits cause explosion and calls CommitContact; it would need a separate 10110 branch with actual burn cause, exact captured attribution, LastDamageTick, kill/death/boss_down journal and next-phase death structure. The current Fire candidate still lacks the complete Native death branch; its new lethal test remains prospective RED.

Aura source is a real PlayerEntity and trail source is a real BomberFireZoneEntity. Neither hosts BomberDamageFacts, and the current row layout is specifically BomberBombEntity. Merely using their real source IDs as FactOwner fails exact layout validation. Using a newly minted or unrelated bomb as a surrogate carrier introduces structural entity credits, durable ownership/lifetime and bomb behavior hazards; it does not constitute this minimal reuse. Attaching DamageFacts to additional source entity types also does not create multiple row layouts: EffectRow currently declares one entity type. Therefore existing 24-row reuse can cover a narrowed Burn-only producer after substantial lifecycle changes, not the full Burn/Aura/trail contract.

## Can 26 Fire lists live on existing DamageFacts?

Appending a second independent 26-list set at capacity 16 to the current 24-list component is invalid under current row construction: duplicate captured identity selectors and two ready columns; a component cannot declare multiple EffectRow attributes. Changing capacity alone does not fix that.

Merging the row into one shared 26-column damage row by adding only SourceKind and Pulse would fit the uniform storage model and keep the current bomb slot count. But every fact association captures all columns. It requires adding compatible payload fields 17/18 to 10101 (or otherwise changing its approved fact schema), producer/CanSettle/hydrate/Reserve/Remove migration, and explicit values for all ordinary requests. This changes the prior effect descriptor/fingerprint instead of preserving the old nine Effect semantics. It still has the single BomberBombEntity layout limitation for Aura/trails. This is a new breaking schema decision, not a safe implementation-only patch.

## Actual raw storage / operation effect

Computed from frozen official v13 operation-plan field codecs: the 24 damage columns are 205 raw value bytes per row (six full entity IDs, seven u64, two u32, five i32, three i64, one bool). At approved capacity 16 this is 3,280 value bytes per actual bomb, excluding list/object/serialization headers. The 26-column Fire row is 217 bytes including SourceKind 4 and Pulse 8. The proposed cap-1 Fire row over 16 participants is 3,472 raw value bytes.

Merging two columns into existing bomb rows adds 192 raw value bytes per actual bomb (12*16); at the current 2,784-credit shared hard cap that is 534,528 extra raw bytes, excluding headers/objects. Literal 26 new cap-16 lists would add 3,472 raw bytes per bomb, 9,666,048 raw bytes at 2,784, and remains invalid. The old actual 10101 plan quotas are 23 writes / 23 indexed writes / 937 write bytes; a merged 26-column row would require 25 / 25 / 1,013, adding 76 write bytes per ordinary damage request and updating its certificate/scratch quotas. Fact-field unique count would become 49 instead of the candidate separate-row 72, but no generated actual budget proof exists for this alternative.

## Smaller complete Game alternative for Root decision

Keep Skill's 23 new exposure/Aura scalars and move the 26 cap-1 Fire columns into a dedicated `BomberFireFacts` on the existing long-lived BomberParticipantEntity, with EffectRow layout BomberParticipantEntity. Participant currently has six Has declarations including non-native Observer and five actual private state components; append one dedicated fact component only after verifying the generated Native binding count stays below eight. Player has no new slot, no new entity is minted, and all 77 planned Persist fields and cap-1 raw Fire storage remain the same. New schema identities add one component and one Participant slot (candidate active 765 instead of 763); all 26 field owners change from Skill to FireFacts. Root must approve this precise replacement before edits.

Then 10110 FactOwner=the actual victim Participant, Target/Life=the exact victim body, Source=the original real Burn/Aura/trail entity, Row=0. CanSettle validates participant-owner equality, row keys, full current life/generation/match and actual protection/Bubble/health. SourceKind/Pulse remain in the independent accepted snapshot. One pending row per participant blocks another pulse until consumed, survives old-body structure retirement independently of selected coverage, and is validated before Target generation changes. Native outcome and business consumption still need actual 10110 death integration; they cannot rely on explosion-only parallel hit arrays. Existing DamageFacts/10101 effect descriptors remain exact. Generated-registry Native slot/field-index audit, paired restore and malformed-memory tests, old-source/new-life attribution, overlap timing and all genuine Native RED/GREEN remain mandatory. This recommendation is a structure candidate, not a claim of generation or test success.