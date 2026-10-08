# SDK actual CLR closure and isolated build — independent review

Reviewer `/root`, non-author of the Engine repair. Decision **ACCEPT_EXACT_THREE_SOURCES_FOR_OFFICIAL_COMPLETE_PACKAGE_CONSUMPTION**. No source correctness blocker remains in this scope. This does not qualify complete11, Game prediction, browser performance, reentry or formal delivery.

Owning tree `C:/Work/LumioGames/.101-pack07/LumioGameEngineSdkClosureRepair`, base `0e2fc74783f9f186d59909b38d4ee70887a21137`. Author seal `seal-01/manifest.json` SHA256 `67ab2e045125df1ac07a898bb4498fc424409ea6e71c40559e2bfeecb4a7beec`; author report SHA256 `b7151bd53f32d874486f8ab6d482c1def0f53c7885106a026d637b55abf17a42`. I checked all45 sealed evidence hashes, all3 current source hashes and the full exact diff `0345060fb7047615731206891ff595203e7eedf315d9c959da24d26818ba127d`.

| Exact accepted source | SHA256 |
|---|---|
| `eng/pack-sdk.mjs` | `65089a489b97287527c8eeabc6d54103b7778e07899bb9a2d965daa2f3f73f3c` |
| `eng/pack-closure.mjs` | `f7645f65d1c38972d07ad0ff4a7afd48a5f9797ace3b2dab63c8e0a64075cd8b` |
| new `eng/pack-clr-version.test.mjs` | `b2cf0248dd8e97883c73ced847055a73c7f9b6d6cdd0abff89b52d35eaf4a191` |

The producer now isolates the whole managed graph under a unique ArtifactsPath; SDK, Runtime TFMs and GenDeclarations receive that path with the original compatibility properties. Each copied project's real evaluated TargetPath must be absolute and remain inside that directory. The original build, no-incremental, source-root, PathMap, closure, Native and package checks remain. No loader/version resolver, Native implementation, Runtime production, Game production, schema, quota or protocol changed.

The closure parser distinguishes project/archive versions from the actual project runtime asset's CLR assemblyVersion. Only the latter introduces a four-part comparison for producer and consumer edges. The prior three-part compatibility policy and exact NuGet archive identity stay intact. The original candidate missed CLR revision; the author retained that actual RED and added the matching narrow regression. Missing or malformed original metadata still follows the original rejection paths. The parser does not inspect PE itself; actual matched PE inputs are a separate qualification below.

I independently used System.Reflection.Metadata/PEReader to read definitions and references from both actual13-file net10 closures, without loading assemblies or using the candidate parser. Old SDK10 has exactly three Hosting references at1.0.0.0 against packed Engine.SDK/NativeLoader/Hfsm definitions0.1.0.0. The isolated new13 have no Lumio reference mismatch. Independent proof `C:/Work/LumioGames/LumioGame/.run/sdk-clr-closure-independent-review-01/pe-closure.json` SHA256 `f1cabe02a27417eeed5456d0b3aa7c025b05196f9c93e3df21e17a97d5c32724`.

I rechecked all66 copied DLL/deps/XML source and staged file hashes and their containment under the actual `pack-managed-zaTY7j` root. The generation tool's evaluated TargetPath and staged hash also match. I read the final actual related-suite output:91 passed,0 failed,0 skipped,raw0; and the checker rejecting the unchanged old complete10 Hosting closure. The SDK-only constructor Program uses a normal PackageReference and explicitly rejects non-default ALC. The old program fails on Hfsm1.0 (dotnet raw-532462766, outer PowerShell1); the new program builds and starts actual Native/HFSM with raw0/default ALC and matching0.1 references. I did not rerun the suite or constructor; I verified the sealed raw output and independently read PE.

The new constructor consumes a private official packSdk qualification archive and unchanged official10 win-x64 Native `ecd86e78bc66a94bdf49d4bc4bee9abef6f1329cba8a1dd4c0e96a9e5944cefd`. It is not a complete11 package. The first long-cache-path attempt and the early misplaced parser-throws expectations remain INVALID evidence. The exact original writer/concurrent moment of SDK10's stale references remains unproven: fresh normal/buildManaged sequences did not reproduce it. Approval rests on the demonstrated bad CLR closure, the corrected emission gate and elimination of shared managed output paths; it does not claim a proven original race trace.

Only these three paths may be explicitly committed. The next step is a clean source freeze, official complete package, normal Game consumption and real browser acceptance. Existing failed runs and remaining formal delivery gaps remain open.
