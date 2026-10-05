# Fresh observing Self presentation repair

Root owns the narrow Game UI repair; no engine ownership or gameplay state changes.

1. Preserve exact adapter/test/pin bytes before writing. Actual presentation Self can legally be the durable participant entity during AwaitingRespawn or Eliminated; current fresh adapter only recognizes a player life or participant current/last life, so it cannot identify its own HUD row.
2. Add meaningful fresh-adapter regressions for both legal observing phases with no player life, plus a stale different-match participant exclusion. Run them before the production change and preserve the original failing output and exit.
3. Resolve the exact participant Self from the current match in the existing fallback. Preserve existing player and old-life lookup, tick/identity checks, empty pose and input restrictions. Add no prediction, authority, cached gameplay or rendering interpolation.
4. Run the adapter regression and appropriate typecheck; preserve exact source/logs and ask a non-author to review. The schema15 source pins must stay closed until that review accepts the changed adapter and tests; only then append the explicit review chain and update exact pins.
5. Consume through the next actual browser Game publish, and verify fresh observing reconnect in the final eight-person room. A unit result cannot substitute for that experience gate.
