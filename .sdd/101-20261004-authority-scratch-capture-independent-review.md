# Authority capture scratch value ledger — independent review

Reviewer `/root/reentry_trace`; decision **ACCEPT_EXACT_REFACTOR_FOR_OFFICIAL_PACKAGE_COMPARISON_ONLY**. No source correctness blocker was found in the three-file candidate. This is approval of the narrowly scoped ledger refactor and its retained accounting behavior; it is not a browser performance improvement, a successful semantic RED/GREEN bug repair or a completed release gate. Root retains the adoption decision after an official complete package comparison. I did not compile, run tests, edit production, stage or commit, and did not touch the live browser/DS.

## Exact reviewed source

Owning tree `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeScratchCapture`, formal base `d8ae3da3793d5d95785606be319668a4318af85a`. Exact candidate:

| Source | SHA256 |
|---|---|
| `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/PredictionStateLayers.cs` | `46bd221f173c42c4d35c858a152b4b778693d6c726295ef76521c677623a65da` |
| `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs` | `b4f7d80000fb1234e2a5b037d0dbe6f40200d0e9f63deb8228faf4b0c7812375` |
| new `modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/AuthorityCaptureScratchTests.cs` | `28c2fcba93e1d76c2bcb987db164e34dca40d8c1765d55095bc8b73da5c44748` |

Both production original hashes and exact sealed candidate copies match. The production delta is57 insertions/15 deletions across those two files; the test is new. `PredictionStateLayers.Operation.cs`, `SyncFieldCloneWriter.cs`, `WorldIngressBudget.cs`, existing `PredictionOperationTests.cs` and existing `GasJointPredictionTests.cs` are byte-identical to formal d8. No terminal-observation, Transform guard, diagnostic source, protocol, quota, tick or gameplay cache is included.

## Accounting and failure review

| Boundary | Independent finding |
|---|---|
| Individual reserve calls | Every existing writer reserve still executes once in the same order before its scalar/container snapshot allocation. `AuthorityFields` changes only the handle list and delegate binding; Sync/Persist capture, metadata admission, copied values and destination writes are unchanged. |
| Two64-byte additions | `ReserveFieldScratch` retains the writer wrapper's checked bytes+64. `ReserveScratchCharge` retains its second checked bytes+64, negative validation and original `_reserve`. Component256 and structure reservations remain. There is no aggregated reserve, refund of an accepted fee or relaxed budget. |
| Normal ledger | Original `red-01` and final `semantic-green-02` raw output match exactly:35 reserves,35 releases and peak6022 bytes. First structure charge448 is still released last; all per-component scalar/container charges preserve order. |
| Origin | Old `ScratchReservation` read `_operation` in its constructor after `_reserve`; new value entry reads it after the same callback. Null/ended/active/replaced origins remain separate. `ReleaseScratch(long,Operation?)` is unchanged: decrement captured origin's LiveScratch, subtract Reserved only if that exact origin is currently active, then direct release. |
| Refusal and partial rollback | The original `_reserve` wrapper still marks whichever active operation sees the refusal. Final tests first measure the real operation's50 reservation boundaries, then refuse each one, require Refused and no LiveScratch, reject Commit, restore all retained charges/projections on disposal and permit subsequent normal refresh. Allocator rollback preparation remains charged until the operation ends; it is not falsely asserted to be only256 bytes. |
| Throw and retry | The old lease cleared `_owner` before release; the new cursor advances before the same release callback. A thrown callback therefore is not repeated on retry, while remaining records can still release in order. The final real test executes throw-after-release, retry and repeated disposal with final charges74/84/94 and zero remaining charge. A callback that fails before physically releasing retains the old no-retry semantics, not a new recovery guarantee. |
| Reentrancy/list mutation | New iteration remains foreach over List, preserving enumerator fail-fast behavior. A nested full disposal may clear the list after disposing remaining records; both old and new outer enumerators then reject list-version changes. This and arbitrary list-mutating callbacks were reviewed statically, not dynamically demonstrated by the final tests. No new concurrent-access guarantee is claimed; Runtime World remains the existing single-writer owner. |
| Append/allocation failure | After a successful reserve, a failed value-list append refunds that individual unowned charge using the existing active Reserved/direct-release accounting. It does not suppress `_reserve` refusal or combine fees. No OOM injection was run. Writer-constructor allocation failures remain an existing boundary, not a claimed general allocator repair. |
| Default limit | The original `WorldIngressBudget.Default.PredictionMaxBytes` remains1,048,576. Normal original capture passed, and the same original/candidate peak is observed. The final candidate additionally occupies the legal measured remainder and refreshes to exactly that unchanged limit, then restores the occupied baseline. That exact-limit assertion was not represented as separately executed on the original source. |

The transient list owns charge/operation handles only. It retains no gameplay values or authority world, does not add a shadow simulation and does not change any authority/input/prediction ordering. The existing single-class-lease ReserveScratch API remains used by structure and other existing callers.

## Actual evidence and provenance limits

Author report SHA256 `090a6589f88bc12e45bed97e027e8bbbf3b1308160fe0bf4a78e075a85cc324c`; original seal03 SHA256 `5c926329d3bf33fbcc80956a522076668249c436ad4fda6837a413357ecff3e4`. I independently parsed all TRX counters and raw exit files:

| Validation | Actual result | Meaning |
|---|---|---|
| baseline-04 on original d8 | raw0;3 passed/0 failed/0 skipped | Corrected normal scalar/container/refusal/allocation baseline. |
| semantic-green-02 | raw0;11 executed/11 passed/0 failed/0 skipped | Six new cases plus all five unchanged PredictionOperationTests. Includes all50 final measured refusal boundaries. |
| native-green-02 | raw0;4 executed/4 passed/0 failed/0 skipped | Unchanged real Native reparent rollback/sibling order; teleport refusal local true/false; transform budget refusal and resume. |
| semantic test build, GAS test build, netstandard-green-01 | raw0,0 warnings/errors | Existing strict build behavior retained. Native-green-02 reused the completed GAS build from native-green-01; it has no separate build log. |
| native-green-01 | raw9;0 executed/4 notExecuted | Missing GAS loader environment; excluded from acceptance. |
| red-01 and misleadingly named green-01 | both raw2;3/4 and8/9 pass | Both failed the newly invented96KiB cap. Neither is a successful semantic RED/GREEN pair. |

Baseline01/02 discovery/invocation errors and baseline03's incorrect allocator accounting assertion remain preserved. No old production test was weakened. Removing only the new unsupported96KiB cap is acknowledged as correction of an unjustified experimental goal. The remaining allocation observation has no magic cap or pass/fail assertion about browser speed.

The allocation sample uses net10 x64, eight warmups and16 synchronous real RefreshJointAuthority calls with a1024-item test list. Original1,765,760 bytes versus candidate1,623,680 yields8,880 fewer bytes per refresh,8.046%. The test's call-list logger is disabled only during allocation measurement; copied values and zero outstanding scratch are still checked afterward. Larger value-record backing arrays offset part of removed class allocation. There is no sampled browser GC/CPU/frame time, native-call saving, saved milliseconds or proof that Bomber's CaptureFields cost is resolved.

Real Native input is official09 DLL SHA256 `030046d7563efd8cfe01e127bd719470eaba06ef81c7f808b640d97efea78ba8`, complete09 manifest `6de6e91240457ed90ed7edcc0140bedb41724fabeaa5d9c93faa8ca3c78ba29b`. Tests load formal d8 managed Runtime plus these exact two candidate files, not diagnostic09 managed assemblies. Their current published compiled identities were independently checked and copied: Ecs net10 `7810f8ca66519eb65f9057ff26bb0dc32b7a9da47d46ce2bcca07fa7713f359c`, Ecs netstandard2.1 `d9c4d95bffdce301bbf13baf5360de9b40bf3b1cd2003b0e9bf0ce85c4d1f4a1`, ECS tests `a46c24ba7bedb2c929f52117a3a1cb68656f6b5f1095b33d6ccc3fd132e0ae21`, GAS tests `85c939c89d6581c7f8127e2781307f79caacd43070ccae80ffb49e276bf34b89`. I inspected author raw results rather than executing new tests or reconstructing load-time snapshots.

## Seal correction and protected files

There is one administrative seal inconsistency: original seal03 inventories `seal-03-result.json` while its redirect is still empty (0 bytes/empty SHA). The actual completed file is3994 bytes, SHA256 `5347758418d769db1fddec5c1d755be90dfc138298cb823ed69b8238033dcb04`. I do **not** count that row as matching its original inventory. The other63 raw entries are independently hash/size verified and copied. Author appended [the separate supplement](C:/Work/LumioGames/.101-pack07/LumioGameRuntimeScratchCapture/.run/scratch-capture/seal-03-self-output-supplement.json), SHA256 `0ec917c86bc2a099e1eeb8d2f5787b23a332b5829c79295fcb32302b8ae000eb`; original manifest/report/result bytes remain unchanged. This administrative exception does not invalidate source, test log, TRX or compiled identities, which have separate valid rows.

All127 physical generated paths were independently compared with base;48 physical changes are exclusively CRLF/LF, zero normalized semantic drift. They stay excluded from any candidate commit and were not restored. Exact three candidates and unchanged old tests remain frozen. Independent audit copies and verdict: [manifest.json](C:/Work/LumioGames/LumioGame/.run/authority-scratch-capture-independent-review-01/manifest.json), SHA256 `81d261eb0c460559551578d86d1668e3ad3dece0561e6425b21cbc0531332b8b`.

No further action is authorized by this review alone. I am waiting for Root's next scope instruction; an official complete package and controlled real eight-player browser comparison are required before calling this a browser improvement. The current live reentry investigation remains separate and takes priority.
