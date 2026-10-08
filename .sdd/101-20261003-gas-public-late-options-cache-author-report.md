# PublicPlacement and LateResults diagnostic cache derivations

Date: 2026-10-03. Author: `/root/favorite_behavior_review` under Root's explicit bounded instruction. **PRIVATE AUTHORSHIP ONLY / UNRUN / UNCOMPILED / STOP FOR ROOT NONAUTHOR REVIEW.** No self-approval is issued.

Root requested mechanical cache derivatives of the two previously reviewed revision02 diagnostics. Each candidate adds one private static readonly JsonSerializerOptions field with `WriteIndented = true`, then replaces the one Serialize argument that allocated an identically configured options object. No further source change is present. This addresses the same allocation pattern previously observed at the repository's CA1869 gate; no compile result for either new candidate is claimed.

## Complete inputs and candidates

| Diagnostic | Frozen before SHA256 / bytes | Private candidate SHA256 / bytes |
|---|---|---|
| PublicPlacementBurst | `b9a848dc8855dc95cdc77047e221da0022438fd6181db25ad3790f21f96342dd` / 7479 | `502db244aae6e7d6fdae127ab22c0988f3d9d3f5779715764d5c827545e96c7a` / 7553 |
| LateResultsControl | `011ddbcd93c1353fc01d3f410c1e8c689a82ed5280ed5cfdab2d7f0737645c40` / 7441 | `24a07de984fa802431c0e7af9db3c1ccd40efa8b05ce1abe15fb1559dce7503d` / 7515 |

Complete [PublicPlacement candidate](C:/Work/LumioGames/LumioGame/.run/gas-additive-diagnostic-options-cache-draft-01/BomberGasPublicPlacementBurstTests.cs.draft) and [LateResults candidate](C:/Work/LumioGames/LumioGame/.run/gas-additive-diagnostic-options-cache-draft-01/BomberGasLateResultsControlTests.cs.draft) are accompanied by full before images, full forward/inverse patches, explicit two-operation descriptions and full base64 byte pairs in [the private bundle](C:/Work/LumioGames/LumioGame/.run/gas-additive-diagnostic-options-cache-draft-01/README.md).

The full original sources were read before derivation. The original revision02 private files remain exact at their supplied hashes. The complete original manifest remains `ce30203eeb474d7f01a134928ea06074d72e4a4a6a91d65553b5d6e25665a88d`. The earlier [nonauthor diagnostic review](C:/Work/LumioGames/LumioGame/.sdd/101-20261003-gas-diagnostics-independent-review.md) remains byte-identical at SHA256 `7282c06125eac39f1e5456daec0784d6abf5391482765b394161f7a99601bff3`; it has not been rewritten or expanded by this authorship task.

## Exact mechanical changes and authored checks

Both classes receive `private static readonly JsonSerializerOptions EvidenceJsonOptions = new() { WriteIndented = true };` plus a blank line immediately after the class opening. Their sole Serialize suffix changes from `}, new JsonSerializerOptions { WriteIndented = true }));` to `}, EvidenceJsonOptions));`.

The derivation requires a unique exact occurrence of each substitution. Sequential application reproduces the entire after file, and reverse application restores the entire before byte image. A separate full unified-patch replay within the authored checker also reproduces both entire files, including their existing LF/CRLF sequences. No patch was applied to the original private input or a production target.

All original Assert source lines are byte-exact: PublicPlacement retains 23 Assert references across 19 source lines; LateResults retains 18 references across 16 source lines. Complete file reconstruction restricts the changes to the options field and call argument, so all ability calls, Native/tick timing, inventories, qualified profile inputs, result observer lifetime, death/cleanup setup, receipt fields and count assertions retain the original source.

The authored checker records these results in [verification.json](C:/Work/LumioGames/LumioGame/.run/gas-additive-diagnostic-options-cache-draft-01/verification.json). These are author static checks for Root's review, not an independent acceptance decision or actual C# test result.

## Publication boundary and delivery

The proposed additive targets are `games/101-bomber/Server/Tests/Gameplay/BomberGasPublicPlacementBurstTests.cs` and `BomberGasLateResultsControlTests.cs` in the same directory. Both were absent at the author's initial inspection. Root must inspect current target state before publication and independently compare the supplied full candidates, allowed operations and inverses. Their logical patch target is the frozen private revision02 source, retained unchanged for review; the production copies have not been created by this task.

No production, helper, Runtime, Engine, generated, schema or Config file was written. No .NET build, official GEN, config compiler, Native execution, staging or commit occurred. Only lightweight Node derivation, exact byte/patch/assertion/hash checks and private artifact writes ran. No production result quota or budget was selected. The separate private window experiment and its actual results are outside this cache-only delivery.

The bundle manifest records every delivered artifact and this report's hash. Its hash is delivered separately to avoid a report/manifest cycle. Root is the nonauthor reviewer for this mechanical authorship and owns publication and actual validation. **STOP.**
