# Server admission escrow — narrow source review

2026-10-02 11:04 UTC; reviewer `client_composition`, read-only. Scope is the ongoing Server composition primitive, not the completed provider, actual Host admission, or a playable match.

Tree: `C:/Work/LumioGames/LumioServer-101-composition`, HEAD `b89b8dbcb6495a52839bc9dd36b508159218d22d` plus author-owned working changes. Reviewed working bytes:

| Path | SHA256 |
| --- | --- |
| Engine/src/admission_publication.rs | c81cb65134c4b2d9cd669f425be9dd4053fe4254abdf05b5ddec6bba6144099f |
| Engine/src/admission_window.rs | caa6b9ad9e2bc317a96feea80e7eacaa433e79c79a3df709ec0e2586b0ebf5dc |
| Platform/src/publication_budget.rs | 069add6709ea9c15455063b04fe8850a36e7133bc7ea4986f942551b052232f0 |

## Findings and current disposition

1. The earlier duplicated owned context / repeated recovery metadata charge gap was reported and accepted by Root. The current grant holds one exclusive `ParkedOwnerAccess`, moving the Vec from the shared ledger; recovery cannot duplicate a live access. The serialized Acquire envelope borrows RawValue and field strings. The capture allowance covers three encoded-size copies plus bounded keys, and is retained after remote charge reduction. The current source resolves the identified duplication path.
2. The earlier reissuable Acquire after a Retained receipt and recovery was reported and accepted. `issued` now belongs to the shared parked record; first envelope construction consumes it, receipts also seal it, and replacement/recovery cannot reset it. IDs combine an incarnation prefix with a process-ledger monotonic sequence. Wrong grant IDs, noncanonical decimal counts, sum overflow, and retained counts over the reservation are rejected. Current source resolves the reported replay path.
3. The earlier encoded payload allocation before insufficient-metadata rejection was reported and accepted. Current Acquire measures the borrowed OwnerSizing through a bounded counting writer, computes the charge, reserves the complete allowance, and only then allocates and writes the exact encoded buffer. Tests in the reviewed source include an allocation observer for the insufficient/zero-capacity paths. Current source resolves the reported ordering defect.
4. The new call window allocates request and full response buffers only after reserving their combined size. Failed request serialization clears readiness; partial or stale request bytes cannot dispatch. The grant accepts only a window charged to the same process ledger and connection, and declares that window's actual reply size. Buffers are dropped before their charge. These changes are consistent with the owning budget model at this source scope.

## Integration conditions still to verify

- A grant marked issued by envelope construction but never successfully dispatched must have an explicit owning cancellation/reconciliation path. Dropping the grant correctly retains unknown remote debt; that conservative behavior must not become an indefinite leak when the Host can prove no call occurred.
- Public `shrink_parked_to(key, 0)` can refund while an access still holds the Vec. Current production zero-refund usage is exclusively `ParkedOwnerAccess.release`, which drops the actual payload first; retain that owning seam in subsequent integration. Tests also use the lower-level method directly.
- Runtime/CLR grant consumption, real exact reply windows, same-socket authorization, actual drain/ACK/release failure, replacement debt and completed admission are outside this source-only review. The absence of a current primitive finding is not provider or profile approval.

## Independent execution

No Rust build/test was run by this reviewer in this pass; author tests and Root's reported results are not relabeled as independent execution. Root owns ongoing source changes and the combined actual Host/CLR regression. Revalidate these hashes at the final frozen review point.
