# Attribute query casing and final Runtime validation

The public query grammar requires a lower-first field name. `AttributeComponent.FieldId` already emitted that identity on the wire; declaration generation alone emitted Pascal-case `HealthPointsCurrent`. Consequently Pascal queries failed `invalid_attribute_id`, while canonical camel queries failed `undeclared_attribute`. The actual eight-client tour exposed this as permanently unavailable HP and stalled product decisions. The owning fix changes only the two attribute row names in `CodeEmitter.BuildRows` to `Camel(attr.Name)`; it does not change query grammar, delivery checks, authority checks, or wire fields.

Runtime tree: `C:/Work/LumioGames/LumioGameRuntime-101-attribute-query`. Production freeze: `23356eaf`; independent Client review verified all 11 source identities and ran 4 real Native replica query cases plus 3 generator cases. Native coverage includes initial delivery, owner visibility rejection, revocation, later delta visibility, Pascal rejection, and undeclared spelling. The Native fixture uses the real Runtime reducer and delivery visibility fixture; it is not a full ClientSession test.

Final test-only suffix: `9b1c5a91058d21bcead1dea474640b6657976c9d`, parent `23356eaf`. Manifest `.run/attribute-query/freeze-9b1c5a91.json`, SHA256 `7086bc2cc4b3b3287ceb8d45d65821f857ad33aaaa2636c9937b3f1325f37ee4`. Production code is unchanged by this suffix.

## Full validation and retained failures

- `build-default01`: full solution/all TFM, zero warnings/errors, exit 0.
- `full01`: private artifacts layout, 2962 total, 2960 passed, 2 failed, zero skipped, exit 2. Two existing PrimeProbe tests require the default build output and could not locate it. These failures remain recorded.
- `full02`: default layout, 2962 total, 2961 passed, 1 failed, zero skipped, exit 2. Both PrimeProbe tests passed. One GAS test required a particular textual stack frame.
- `scratch-full-diagnostic02`: the same actual Native snapshot-budget refusal retained the complete original budget, rollback, and restoration assertions. Tiered JIT inlined `SettleOne`; CLR reported its caller `Settle`, IL offset 62, the three argument-load sequence immediately preceding the actual `SettleOne` call at IL offset 67.
- `scratch-location-red01`: 7 cases, 6 passed, 1 failed, zero skipped, exit 2. Initial direct-frame-only helper rejected the actual inlined call site. `full03` retained the failure when a subsequent helper still recognized only the call opcode and not its sequence point.
- `scratch-full-green01`: complete GAS, 926/926 passed, zero failures/skips, exit 0. The final helper recognizes only the real callee or its exact IL call/three-argument sequence. Eight positive and negative cases reject other methods, method entry, missing offsets, and call operands. No production `NoInlining` was added. All existing 1 MiB budget, refusal count, retained-byte, rollback, and Native recovery assertions remain.
- `full04`: complete solution, **2970/2970 passed**, zero failures/skips, exit 0; 2m06.547s.
- `format-verify02`: failed on one final CRLF in each of two otherwise-LF files. Only those trailing CR bytes were normalized; Git blobs are unchanged. `format-verify03`: zero changed files, exit 0.
- `generated-final-identity.json`: 125 tracked generated C# files recorded; no generated difference from production freeze 233. This records the final generated identity and does not pretend to be a separate forced-regeneration run.

All logs and the exact test DLL identity are in the Runtime tree `.run/attribute-query/`. Earlier `native-red02/03/04` attempts did not reach the intended query assertion and are not counted as semantic RED evidence. `native-red05` and `generator-red02` do reach it.

## Game consumption and actual chain

Root built the official complete release 06 into Game `.run/20261003-fullpack06-game` with fresh private locks/cache and regenerated the canonical declarations. Game Bot queries now consume those exact lower-first identities. Capacity owns schema-history migration; old identities must remain retired history.

Actual run `.run/product-bots/real-tour09a` uses Platform 18085, complete release 06, same-source server/client/Bot assemblies, explicit seed 1 and new login prefix `FollowupTour09a`. It has already observed public health changes and multiple real successor Lives (`Respawned=true`), unlike the old run's perpetual null HP. The full tour is still in progress at this report and is **not** claimed passed. All 13 assertions remain required.

The preceding `.run/product-bots/real-tour08a` failed naturally. Its DS stopped advancing applied Tick at 6325 while Host calls continued, immediately after final-circle entry. This separate real-chain failure remains under investigation; old full/GAS success does not close it. Do not print old Bot command headers containing launch tickets; inspect only `BOMBER_MATCH_READ`, result files, and service logs.
