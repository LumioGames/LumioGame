# Durable statistics and results independent review

Verdict: PASS for the reviewed durable statistics delta. No blocking finding. This is not a complete Game delivery or browser acceptance claim.

- Source identity: `games/101-bomber/.run/statistics-production/freeze-durable-01/manifest.json`; all 12 source hashes match the current delivery tree. Independent audit: `games/101-bomber/.run/statistics-production/durable-independent-source-audit.json`.
- Independent execution: `games/101-bomber/.run/statistics-production/durable-independent-gameplay01.json` and `.log`; actual cdab SDK test DLL, **12 passed / 0 failed / 0 skipped, exit 0**, no build performed. The evidence records the exact test/Gameplay/ECS/GAS DLL hashes.
- Death and healing are consumed before match rollover. `TryCurrent` checks both the durable participant and current world's MatchId. Health TypeId retirement and committed bomb contact prevent replayed counters; rejected health does not count.
- Enemy kills are credited to the original participant recorded by the settled damage fact. Suicide does not increment kills or boss kills. Boss classification reads the still-live old body's maximum health before its later destruction.
- First acquisition order survives special-bomb replacement and life destruction. Storage is capped at six identities; the persisted result spelling is bounded at 65 characters and rejects duplicates, noncanonical numbers, zero, overflow and excess entries.
- Character is retained on the durable participant, so results do not require the dead body's skill component. Next-match latch updates both selected character and its statistics view.
- Final one-heart survival is added to the detached result row only. It does not mutate the live clutch counter, so later reads, snapshots and subsequent matches do not count it again. Healing across the threshold remains a separate actual applied event.
- `BomberResults` validates complete matching columns, ordering and two-match retention. The new six highlight fields are copied into result rows and read back independently of presentation events. Next-match counter reset leaves the retained result rows intact.
- The presentation dump reads replicated statistics/results and decodes the bounded history. It does not reconstruct durable values from event history.

Limits: the 12-case execution covers real Native growth, heal, lethal boss/self damage, character retention, actual result publication, cold restore and next-match reset. It does not substitute for the full multiplayer, browser, long-duration or periodic-skill acceptance work. Production source was read only.

Subsequent browser build correction: the original test assembly did not compile `Client/UI/Spectator/PresentationDump.cs`. Root's actual browser-host publish exposed its missing `using Lumio.Bomber.Gameplay;` for the new bounded-history decoder. Reviewed that one-line namespace import as the narrow correction; it supersedes that one file in the original 12-file freeze. The earlier 12/12 source identity and test result remain evidence for that earlier cut only. Final browser-host compilation and browser behavior require the new publish evidence, not the earlier Gameplay test result. The other 11 reviewed source files are unaffected.
