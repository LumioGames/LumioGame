# Fresh participant Self HUD binding — author review request

Author: Root. Status: code GREEN, independent source review and schema15 pin update still required; browser experience gate OPEN.

The real legal Self projection can be the durable participant during AwaitingRespawn/Eliminated. `SpectatorDump` already handles that identity and the Runtime terminal observation fixes separately govern its transport. A fresh ReplicaPresentationAdapter instead only recognized a player life or a participant's current/last life. Its local HUD handle stayed0 when Self was the participant itself. This UI repair does not claim to fix Native projection closures or the Host stall.

Before bytes were copied from the mixed Game workspace; no reset, restore, staging or commit. Exact two source files:

| File | Before SHA256 | Candidate SHA256 |
|---|---|---|
| Client/Presentation/src/replica-adapter.ts | a918a29dba8a34d16759c357b834bfd4d7bf31c199b0acb03fac0d49d6008bf1 | d89e22570469574b759398ecf39cd00202a7e2cc83f1c822504063f8c3aa939c |
| Client/Presentation/src/replica-adapter.test.ts | d6450b7af1351fb3269e7e92a5e85436a87255b9105dfa18ddc6765d7ad28df2 | 4f11e7a2aebbd6015051e6a628a8aebf4af55d500e75070472ba3774aecaeae0 |

Production only adds direct exact participant-ID/current-match recognition to the existing fallback. Player-life recognition and current/last-life fallback stay intact. No pose, health, input permission, gameplay, tick, identity or interpolation is generated. Three new tests verify fresh observing phases2/3 retain their own durable HUD row while position remains unknown/health0, and a direct participant Self from another match does not become local.

Actual before-production RED:25 tests,23PASS/2FAIL, raw Vitest exit1; both fresh observing phases fail at localPlayerId expected1/actual0. Cross-match exclusion and all22 original cases pass. Same test bytes after production:25/25PASS, raw exit0. Existing TypeScript no-emit command raw exit0. Original logs, JSON reports, raw exits, RED source, before source and candidate copies are in `games/101-bomber/.run/browser-observer-self-adapter-repair-01/seal-01/manifest.json`; seal script checked RED tests equal GREEN and RED production equal before.

`Tools/schema-identity-v15-evidence.mjs` still has exact before SHA256 `aa880ac3839ced140386d2a17c974077a763a4e9c27a220f234725a72a9e8a6e`. Two source pins therefore deliberately remain stale until independent acceptance. Reviewer should inspect complete inverse diff to these preserved before bytes, validate actual result data and authoritative participant Self generation, and verify no other source/lock/generated-member drift. Only after that acceptance may Root append explicit review evidence and update these two exact pins. No hash-only approval substitution.

Final Game publish must consume these changes through the official complete engine candidate, then actually close/reopen while observing in the unchanged eight-person room.
