# Independent review of root summary and checkpoint113

Final verdict: PASS for the corrected summary and checkpoint113 as frozen in the re-review section below. The first-review finding and hashes are preserved as history. No production source or author document was edited by the reviewer. Remote Git-tree inclusion of the ignored logs remains the root's packaging verification and is not claimed as completed here.

## Finding

P2 — RESOLVED IN RE-REVIEW. The original G1 paragraph following the experiment table incorrectly made the fake-Doll owner-pose test sound part of the 33 executed Node tests. The actual fake Doll is in `Client/Presentation/src/view/__tests__/owner-pose.test.ts` (Vitest/TS), whereas the executed Node files were `game-view.test.mjs`, `owner-presentation.test.mjs`, and `player-controls.test.mjs`. Required correction was to state that those 33 Node tests passed, then identify the separate existing TS owner-pose test as source-inspected and not executed in this round. The corrected README does so explicitly. Checkpoint113's test-count statement was already accurate.

## Verified

- G1's 3 RED / 1 control cases are explicitly scoped to actual production methods, synthetic poses, and neutral scene-property stubs; they are not called browser, Native, WASM or Game35 reproduction.
- 0.01-cell correction, 46.65°/25.07° yaw deviations, and zero Model rotation reads agree with both result JSONs.
- Root archive script differs from the reviewed portable script only by `{flag:'wx'}` on JSON output creation. The source commit remains fixed via git show.
- Root-01 result JSON is byte-for-byte equal to portability-01 (`c28919...`). Receipt exit1 and result3RED/1control agree with the script and captured output. This reviewer inspected the receipt; it did not rerun the root command.
- 33/33 PASS, 0 skipped is supported by the archived Node log, identical to the original focused-run log.
- Prior ledger bytes are preserved as an exact 511397-byte prefix. Git's final-line newline diff is append behavior, not a historical rewrite.
- G1/Facing source attributions are correct; design §8.4 line432 contains the primary/blocked/fallback/freeze/spawn rule.
- R2/C1 are separately labeled unexecuted source counterexamples; G2/hitstop is separate from sustained-W causality. Source/CI/Windows-field limitations and continuing FAIL are explicit.
- The public summary contains repository paths, source links, descriptions, and conditional numerical examples, not copied private Runtime/Client source bodies.

Packaging requirement: three `.log` files are ignored by the current game `.gitignore` (`*.log`). They must be explicitly included when staging evidence, or the report's linked Node log and receipt-referenced raw logs will be absent from the PR. This review does not require changing `.gitignore`.

## Frozen SHA256 (first review snapshot)

| File | SHA256 |
|---|---|
| README.md | 284155ae88aaae8ac003602543354d7a1acaffb617a4332fefc6cb1b2771d060 |
| ../../plans/2026-10-02-delivery-progress.md | af5789993c658929c72651b9f062fee20a54bacba13428ebc3a4dd486feed805 |
| consumer-probe.mjs | f03282aae9d7f332fcc595ec2bcaebac8e381f6a53b0e14651b7f1eec3c790aa |
| root-01/consumer-probe.json | c28919cab61c82ff1f19420182d62dbce934a1f0c51c8902f123f7c93d9c6e66 |
| root-01/receipt.json | a26c1886250087ef7a3e5f1c82ff47b93c78df8d723a4f5a76e1c7c7f5229a4d |
| root-01/consumer-probe-red.log | 42696f5f1cbd460c8ced7dddd911615db613faac55df4d0a97e67fb63addd2fa |
| existing-focused-tests.log | 4c2ba44ae1b3a84f2b9bda2cefbcbd8cae250c06c9fba3dc12a3f6fcbc8b2a5d |

Archive root: `repos/LumioGame/games/101-bomber/.spec/archive/reviews/2026-10-08-movement-postmerge/`. Ledger path in the table is descriptive; the exact repository-relative ledger path is `games/101-bomber/.spec/plans/2026-10-02-delivery-progress.md`.

## Re-review — final approved document identities

PASS. The G1 paragraph now explicitly separates the 33 executed Node tests from the existing TS/Vitest owner-pose test, and states that the latter was not run or counted. Section6 now links the root-01 receipt and per-frame JSON, accurately describes the sole exclusive-output change, and preserves the earlier evidence-overwrite disclosure. Both new local links resolve to actual files. The ledger, script and receipt hashes are unchanged from the first review. No additional gameplay or browser validation is claimed.

| File | Final SHA256 |
|---|---|
| README.md | d261c02bba556c6e64bf5cf0cc05cf737b9138376583c317111ca8ebb02af3ec |
| games/101-bomber/.spec/plans/2026-10-02-delivery-progress.md | af5789993c658929c72651b9f062fee20a54bacba13428ebc3a4dd486feed805 |
| consumer-probe.mjs | f03282aae9d7f332fcc595ec2bcaebac8e381f6a53b0e14651b7f1eec3c790aa |
| root-01/receipt.json | a26c1886250087ef7a3e5f1c82ff47b93c78df8d723a4f5a76e1c7c7f5229a4d |

Approval scope is accurate reporting and the local evidence package, not movement acceptance, deployment, release, private full-suite behavior, or an Owner gate. Movement remains FAIL. Root will explicitly include the three ignored logs in the remote Git tree and verify each blob before merge; this pending mechanical inclusion does not require a new implementation or assertion change.

## Final mechanical delta confirmation — supersedes document hashes above

PASS retained. Only the following two document deltas were confirmed:

1. R2's test attribution now points to `OwnerExpiryContinuityTests.cs:71–80` with the label `现有 late-replacement 测试`. Reversing only this link/label/line-reference edit reconstructs the prior approved README SHA256 `d261c02bba556c6e64bf5cf0cc05cf737b9138376583c317111ca8ebb02af3ec` exactly. Runtime attribution validation belongs to the Runtime reviewer/root readback; this check confirms the mechanical incorporation and unchanged Game/experiment text.
2. The ledger loses exactly one excess terminal LF. Appending that LF reconstructs the prior approved hash `af5789993c658929c72651b9f062fee20a54bacba13428ebc3a4dd486feed805`. The original 511397-byte ledger remains an exact prefix; current total size is 515579 bytes and it ends with one LF. `git diff --check` exits0.

Final README SHA256: `66bf92b0f8192638ef229015bd9d1e0ebb171cc34fb3c7390d72b01e98828988`.

Final ledger SHA256: `425d56b3427559774b89ffcd8bed268a225d57d0f9b690bf29bd157cec5110ae`.

These replace the earlier approved document hashes for merge verification. No experiment or behavior claim changed; movement remains FAIL.
