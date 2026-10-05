# GAS diagnostic independent review — cache repair addendum

Date: 2026-10-03. Reviewer: `/root/favorite_behavior_review`, nonauthor.

Decision: **STATIC ACCEPT for the two-operation JsonSerializerOptions cache repair only.** No further code change is required within this scope. The earlier diagnostic review and its AcceptedLease findings remain in force; this addendum does not grant capacity or Favorite enablement approval.

The original report [gas-diagnostics-independent-review](C:/Work/LumioGames/LumioGame/.sdd/101-20261003-gas-diagnostics-independent-review.md) remains byte-identical: SHA256 `7282c06125eac39f1e5456daec0784d6abf5391482765b394161f7a99601bff3`. This separately dated addendum retains that report rather than rewriting its findings or evidence.

## Exact reviewed input and inverse

Root publication [publication.json](C:/Work/LumioGames/LumioGame/.run/gas-native-diagnostic-options-repair-01/publication.json), 911 bytes, SHA256 `81068e50d67352ce50053b03393cc21c2f33f3d6aceeba01ba2916f117fada4c` supplies the complete two operations and raw before/after files for `games/101-bomber/Server/Tests/Gameplay/BomberGasCohortNativeBurstTests.cs`:

- Before: 6379 bytes, SHA256 `e7686ccc0f502acca2171439a737555d468cf4c6ef41d517d81201305df50d15`.
- After: 6444 bytes, SHA256 `ce3b65d541a2b9cb1014d20e3e2bdb2be25788cf79860e4a5989e850ffc0a280`.

The sole field added is `private static readonly JsonSerializerOptions EvidenceOptions = new() { WriteIndented = true };`. The sole call replacement passes `EvidenceOptions` where the same `WriteIndented = true` options had been allocated for each serialization. Independent sequential application matches the entire after file; reversing both operations in reverse order restores the entire before file, including its original newlines. A separate expected-change construction matches the entire after file as well. The current physical test matched the after hash at inspection.

All seven Assert references and their complete source lines remain exact. Inputs, Native calls, observation timing, receipt contents, row construction, expected counts and failure conditions retain their full source. The private static options are supplied only to serialization and are not mutated; caching them preserves the intended JSON formatting and addresses the allocation analyzer without changing the diagnostic's acceptance rule. The publication's `afterBuild: UNRUN` is a historical author field, not independent execution evidence.

Independent evidence and full raw forward/inverse bytes are under [gas-native-diagnostic-options-independent-review-01](C:/Work/LumioGames/LumioGame/.run/gas-native-diagnostic-options-independent-review-01/evidence.json). No reviewer .NET build, generator or Native invocation occurred.

## Separate actual receipt observation

Root supplied the subsequent [Native cohort receipt](C:/Work/LumioGames/LumioGame/.run/gas-actual-cohort-native-01/native-cohort-25-by-8.json), SHA256 `e941263607cb5ddc322c15ce0671af5c7327b884fa9d87ca8ce295e3867e31b8`. An independent read of its 200 rows at tick 5 found:

| Observed row state | Count |
|---|---:|
| Missing at least one full-handle member | 95 |
| Full handle, status 2, not Ready | 81 |
| Full handle, status 1, Ready | 24 |

The receipt reports `refusedPrimary = 95` and `refusedDependent = 0`; 95 rows have `dependentAdmitted = false`. The latter summary counts dependent refusal for admitted primary contacts. A dependent admission flag does not prove eventual finite TargetAttribute application. This audit uses handle members only for zero/nonzero completeness and preserves the original receipt bytes; it does not reinterpret unsigned full-handle numeric identities through JavaScript's numeric precision.

Root reports Native run 73 as 0 passed / 1 failed / raw exit 2 with no source changes. This addendum independently verifies the receipt hash and row counts, not a runner log or build result. The receipt supports retaining the diagnostic as a pressure witness. It supplies neither a public-history placement proof nor evidence that the proposed broader GAS budgets are sufficient, and it does not identify the precise resource or settlement cause of every refused row.

## Scope and quality result

The mechanical repair preserves the prior static test-quality assessment. No production rule, public limit, placement rule, full-handle predicate or old assertion was weakened. Original AcceptedLease repair requirements are unchanged. The reviewer wrote only private review artifacts and this addendum; production publication and actual execution remain Root-owned.
