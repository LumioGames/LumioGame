# Client rejection diagnostics independent review

Scope: Client commits `07f0301d749a064b80ed1ebda5dc70547b09fe93` and `786aa3e7c9d55c26a4a0cdca56c6147df408a167`, following the previously reviewed world-retirement fixes. This is a narrow source and execution review, not final 101 match acceptance.

Root reviewed protocol classification/decode rejection, authority rejection, and the preauthorization successor failure path. The last fix routes the existing failure through `RejectProtocol("successor")` before the same session retirement. The original connection BadEnvelope close is retained. Diagnostic fields are fixed bounded reason/phase/step values; received bytes and credentials are not emitted.

Root independently executed the existing built Session tests using the exact official 43a59 Native DLL (SHA256 `51c449c32c964d38a503d62ef7e71466a1e52d56af0e6d5cb7248f74fe967c16`). Gameplay/authority diagnostic tests: 2 passed, zero failed/skipped, exit 0. Preauthorization malformed successor frame across four negotiated profiles: 4 passed, zero failed/skipped, exit 0. Assertions preserve the Faulted state, retired world, zero authority calls and absence of the test secret in diagnostics.

Evidence in `C:/Work/LumioGames/LumioClient-101-composition/.run/composition-20261002`: `session-reject-root-review-01.log/.exit`, `successor-reject-root-review-01.log/.exit`. Author full Session regression reports 257 passed, zero failed/skipped. Actual Game Native/WS and browser evidence remains separately versioned under Game `.run/20261002-client-session-integration`; it does not substitute for Platform/DS whole-match acceptance.

Verdict: PASS for this scope; no actionable findings. Full release composition and end-to-end gameplay acceptance remain required.
