# World startup allocation independent review

PASS for Runtime commit `6de14fda44733b6cd46ad60fc177db61a14068d9`, parent `4c9e654f36e935a6ac8ddec42284556b388b7696`. This is not final browser or Platform/DS match acceptance.

The two-file delta was read independently. All four dispatch enumeration sites preserve their receiver/slot order and pass the same diagnostic source text. Dispatch still excludes arrays and incompatible receivers, calls the original FindImplementation, and applies the same null/open-generic and MethodKey eligibility as Reach. MethodKey uses the runtime method handle and exact declaring-type handle, so Reach's ReflectedType normalization does not change this key. The early duplicate check avoids only already-recorded edges. First-edge diagnostics, type-initializer traversal, comparer analysis, cache identity and JIT preparation remain intact. No coverage omission or changed failure policy was found.

Root independently executed the frozen Simulation test DLL with the verified ef9 test-support Native SHA256 `f959d1e69a2dc2ed38759c0986465a5e9dda2caf9fd1666d7b25dcfaa1e78250`. Allocation, first-Tick/admission JIT invariants, warmup coverage and collectible identity classes: **12/12 passed, 0 errors/failures/skips/not-run, exit 0**. Evidence: `games/101-bomber/.run/world-startup-independent-review/review.log`, `review.xml`, `review.exit`, `input-test-sha.json`.

Independent allocation result: **68,621,384 bytes**, **8,426 methods**, complete sorted method-set SHA256 `79db121106a2524a3614af1937615f30283d21323ab0e1916f4327ea1018fbfa`. This matches the author's candidate and baseline graph identity. The author's baseline allocation, full Simulation 252/252 and full Runtime 2689/2689 are separate author evidence; Root did not claim to rerun those full suites.

The official SDK rebuild and real browser startup comparison remain required. The approximately 21 GB original browser-world allocation is cumulative managed allocation, not resident memory. This fix does not justify raising a startup timeout or reducing any preheat coverage.
