# Resume6 independent review — source and history scope PASS

Reviewed 2026-10-02 by client_composition. No blocking source finding in the requested scope. This permits narrow integration, not final gameplay or provider acceptance.

## Frozen identity

- Candidate patch: `C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/games/101-bomber/.artifacts/resume-20261002/resume6-finite.patch`; SHA256 `f3990d60c4db41a0cc41c7523f736306c83bd7f64f75d047f454bdb83071bc70`.
- `resume6-finite-proof.json`: all 66 after files independently hashed against the sparse `resume6-finite/replay` and matched. Unchanged historical inputs were resolved through `resume6-frozen-read-index.json` and their exact SHA256, not copied from the mutable working tree without verification.

## Source findings

1. Bubble protection on authority reads Runtime `EffectComponent.HasActiveEffect(10107, tick)`. The public `BubbleUntilTick` is reconstructed output and does not grant protection. Submission stores the returned allocation identity only after successful admission. Settlement checks source, target, participant/current life, match/generation, life/health, skill binding and pending allocation. Cooldown and cast outcome publish only for matching Applied initial settlement. Removal/expiry clear projection; next-match preparation waits for actual active rows to disappear before resetting correlation.
2. Paired cold restore rebinding is gated on `CompletedRestore.PairedCheckpoint` and matches type/source/target/instance/generation; only the owner-changed WorldId is replaced. It does not manufacture a row or extend lifetime. The paired tests retain original applied/end ticks, reject the old handle, check explicit removal and compare protection through expiry.
3. Speed pickup, successor and new-match payloads now carry the configured movement speed corresponding to their own resulting tier; Apply updates MovementSpeedMilli together with SpeedTier. The tests check actual Native movement for all tiers and three approved profiles, then successor transfer and round reset. Payload values are produced by authoritative config at submission; settlement retains the original life/intent checks.
4. New terrain production admission includes live pickups, queued creates, held upgrades/special skill/hearts, pending death cohorts, prior terrain rewards and newly reserved outputs. A consumed pickup releases its old producer credit once in the same Tick only after matching health Applied consumption or committed skill-slot transfer. Frame reset occurs before consumption. Physical placement still counts live objects until structural finalization; it does not spend the same free cell twice. CarryPresent owns inherited wealth instead of also counting the dormant life. Deferred cohorts retain original match/life/generation/tick and survive later rounds.
5. Root damage persistence coverage now uses the actual paired persistence owner and verifies Base immediately plus Base/Current after a real restored Tick. The successor test uses the real controlled binding, a genuinely placed inherited Fuse and its original lingering lethal danger source; it preserves the old-source identity and checks duplicate-hit rejection and unchanged successor health. It no longer fabricates a bomb with a destroyed source. Root must preserve its diagnostics wrapper and independently adapt the release-version test to its official selector.

## Independent execution

- `games/101-bomber/.run/20261002-client-session-integration/review-resume6-history.mjs` executed against the frozen replay plus read index.
- `resume6-independent-history-02.json`: 8 assertions passed, 0 failed/skipped, exit 0. Candidate has 620 active identities and 3,870 exact tombstones. All four independently required snapshots compare with zero lost/changed historical identities. Removing one snapshot retirement yields 2 expected failures; removing all 225 yields 340 expected failures. Candidate references cannot hide the required baseline set.
- Initial history probe `...history-01.json` correctly failed because the replay is sparse; resolved unchanged inputs by the pinned read index before rerun. No missing baseline was bypassed.
- No independent C# gameplay execution claimed: the live `build-sdk06` test DLL no longer matches author final evidence SHA `7d53e15d8d948b48108da598b27f64f8fa3e24d94361e29240f1fa185394ddc4`. The identity check refused execution. Author confirmed that output is now Resume7 WIP and no frozen binary copy exists. The reported 622/622 remains author evidence only. Root will rebuild and run integrated source against its actual official SDK selection.

## Integration limits

Preserve Root-owned UI/host/selector, BombSystem diagnostics and independent product/SDK versions. Runtime/Server provider readiness, real full matches, all seeds, deterministic replay and the 30-minute run remain separate mandatory acceptance work. This review does not approve the unreviewed Resume7 work or grant any successor profile readiness.
