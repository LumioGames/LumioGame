# Complete release selection for 101 validation

The launcher now accepts `--engine-release <root>` for an explicit complete official `pack-release` output. It verifies the selected RID through that release's own verifier, derives every engine path from that one root, and never falls back to the submodule when explicit selection fails. Browser-only candidates are refused. The default remains the existing Engine submodule.

`node eng/select-engine-release.mjs <root> <selection.props>` produces a matching SDK feed and version selection for `-p:LumioEngineSelectionProps=<selection.props>`. MSBuild reruns the complete release verifier before restore/build. The existing browser candidate uses its original narrower verifier. Bot scenario references now derive from `LumioEngineRoot`, matching DS, browser and SDK selection instead of silently reading the old submodule's Bot graph.

Focused verification: 129/129 tests, zero failures, skipped or cancelled, exit 0, in Game `.run/explicit-release-green-02.{log,exit}`. This includes the existing launcher/release suites, rejection and no-fallback behavior, and actual MSBuild property evaluation. RED evidence is `.run/explicit-release-red-01` and `explicit-bot-selection-red-01`. The latter observed the old Bot reference continuing to point to Engine even when another root was selected.

These checks validate selection and orchestration. Actual complete candidate verification, three-end compilation and real Game launch remain required after the corrected Runtime/Host composition is officially packed.
