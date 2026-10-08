# Candidate12 actual Game consumption identity audit

Verdict: **ACCEPT_ACTUAL12_CONSUMER_IDENTITY_ONLY**. No real package, CLR closure, SDK restore, current C# source/PDB or ordinary browser identity defect remains. This is not a source/spec approval, schema16 gate, Platform registration, browser performance or reopen acceptance.

Independent evidence: `C:/Work/LumioGames/LumioGame/.run/candidate12-production-identity-audit-01/consumer-identity-accepted.json`, SHA256 `6a53727b68a986fa775a3e398a9ffb9f647481ebe14ff1bdb5c9a72b106c9a2d`. Actual raw accepted exit0. No builds, broad tests, production writes, service actions or browser actions were performed by this audit.

## Complete package and source recipe

Actual release root is `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-12`. Manifest SHA256=`704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766`; version0.0.5-main.523c3d3. All305 manifest payload paths exactly match disk bytes, with zero missing/drift/extra paths; manifest is the306th administrative file. Actual builder exit0 and producer result manifest match. Eight input roots have exact recorded commits and clean tracked/untracked status:

| Owner | Commit |
| --- | --- |
| Engine | 523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0 |
| NativeCore | 81b2501a621db2657bd087db2afa808ecfb9e846 |
| Voxel | 2ba61e431d8080ff6450a07e6ee447e3f0994e0b |
| Runtime | 520ffe482e1c48fb6e48187925eecec986cdb9c8 |
| Server | 008861074a2d3c9da1b0407325ede6f851704fd5 |
| Client | 38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a |
| Platform | 3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89 |
| Config | a991a517f9dbae255321c25d65fea0bfdfdca42f |

Actual server Native SHA256=`122671a87d37cc34d8d28f11e5194a5eb38e11cc68b58086b88a99cb05d02ff5`; it matches the selected Game build result and SDK archive Native entry. No older DLL was substituted.

PEReader read actual AssemblyDefinition/AssemblyReference metadata without loading Game assemblies. Official domains have13 server SDK,28 Bot and20 browser replica assemblies, all with zero missing/version-mismatched Lumio references. Explicit assemblyVersion entries in actual domain deps.json sidecars agree with actual CLR definitions. Package-domain bytes are checked against each manifest entry; SDK/server13 are exact archive copies. Separately built official Bot/replica domains are not subjected to an invented cross-compiler PE-byte-equality requirement. HFSM's documented single flavor remains netstandard2.1 in both SDK lib groups.

Actual official SDK archive SHA512 is `I8EF6XMIYIoj4qDIN0hsrdespgAYoEkZWrozRnO1gMtDvtqWs/1R/CKkMYTEoqNEG2a5IC+WobSmfzA73qoh8A==`. Server, client Game/Bot and browser project.assets.json records resolve the same version and exact archive contents from candidate12's isolated nuget directory. This proves actual consumption, including the Native archive bytes; the producer's neutral-version payloadSha256 is recorded without confusing it with final ZIP hashing.

## Actual Game DLLs, publish and CLR closure

Build root: `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/candidate12-build-01`. All four actual managed build/publish records are exit0 and their retained log hashes match. UI typecheck/test/build records are also actual exit0; original UI log reports57 files/704 tests passed. This reviewer did not repeat them.

| Actual artifact | TFM | SHA256 |
| --- | --- | --- |
| server Gameplay | net10.0 | a757172e1bdab0393adf18eb2a1ecd655d575453d76122365d6c9f89ce67573e |
| client Gameplay | net10.0 | 47e190ddd9a6ed25974fe6e1ed9fe457ec1a019c0b4ce096980d930b00f0b4f9 |
| Bots scenario | net10.0 | e8070206157a34738291d2576e8f35e535e8cf1f7fba80e5a352eda472828506 |
| browser Gameplay | netstandard2.1 | 0bda6f5f51c90098c83537ec38463b4c9fbbe0392f22ea2ad53732db91bc4cd0 |
| browser Host | net10.0 | 8d46b0c4f82892ac1900dd241e2ece102ea58a9d810d62531752e745a5986669 |

Player-startup registry selects the actual new server Gameplay. Release/selection props and build commands select complete12/its SDK, not another root. Default HostEntry/runtimeconfig/Ecs/Replication/Native paths are the selected official package; launch-time receipt/ALC execution remains a later qualification.

Actual server application+SDK14, server Game14, browser Game11 and browser Host22 PE graphs have zero reference-version gaps. Bots intentionally ships one scenario DLL: current project explicitly clears copy-local dependency paths. The production BotAssemblyLoader resolves Default context first, then explicit gameplay/scenario directories. The complete selected Bot.Host28 plus actual client Gameplay and actual scenario DLL yields30 actual definitions, zero Lumio reference gaps. This is a static recipe/PE closure result, not an executed ALC enumeration or actual Bot startup claim.

The initial reused directory-only consumer script reported five absent dependencies in the single-file scenario output. Its raw exit1/JSON are preserved. The project/actual loader contract and new actual30-recipe audit correct that invalid directory assumption; no production guard or loader behavior was changed to achieve acceptance.

## PDB/current source and deployed WebCIL

All five actual Game/Host DLL CodeView GUIDs bind their current PortablePDB IDs. Actual five PDBs contain612 documents.610 physical source/SDK-generated documents were mapped and hashed against the current exact byte inputs, all matching. Two Host interop generator documents were recovered from actual PDB EmbeddedSource records and their hashes exactly match the PDB Document checksums. Their frozen source bytes and all610 physical source copies are retained under mapped-source-inputs.

Game builds set ContinuousIntegrationBuild and actual produced SourceLink records map the deterministic `/_/` repository prefix. The audit maps it to the real Game repository and still verifies each individual checksum; the SourceLink commit alone is not taken as proof for a dirty workspace. This includes actual common movement/client terrain reads, Owner/Aoi declarations, published predicted-Self projection, generated schema files and Results33bae source. No current source was patched for this audit.

The first Node auditor did not understand deterministic paths and classified two in-memory interop generator sources as absent. That first REFUSE JSON and raw1 remain intact. The accepted supplemental record explicitly replaces that interpretation with the612 exact physical/embedded checks and paired PDB identities. EmbeddedSource decoding follows its documented Document custom-debug kind and raw/deflate format. [Official PortablePDB format](https://github.com/dotnet/runtime/blob/main/docs/design/specs/PortablePdb-Metadata.md#embedded-source-c-and-vb-compilers).

Actual published framework contains22 Lumio WebCIL modules. Each contains the exact metadata of its corresponding actual Host-output PE. The20 Engine DLLs in that output are byte-identical to complete12's browser replica payload; the two Game modules are byte-identical to their selected actual browser Gameplay/Host DLLs. There is no inferred old browser assembly or Native replacement.

## Ordinary835-file browser and local freeze

Actual ordinary publish has835 files. main.js is the reviewed scheduler source, SHA256=`25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c`. No private measurement wrapper is present. Published presentation.js/css are exact current freshly built dist bytes. The ordinary main, UI, actual22 managed PEs and22 published WebCIL modules contain none of the tested private Runtime/Host/pump diagnostic markers.

The private local18086 qualification profile freezes all835 ordinary bytes at `C:/Work/LumioGames/LumioGame/.run/platform-release-binding-01/local-test-profile-18086-01/games/bomber/795a98d4153935db6b6a72ac0d56086864a5578aa0d5cdd79a9a5bf672ba213b/`. Independent comparison found zero missing/extra/changed files. Its path hash is a canonical path/byte-length/SHA256 inventory identity, not a Publishing ZIP BundleHash or admin approval. This audit does not claim that the new Platform profile was started or that its signed release identity has already closed.

## Explicit schema15 closure limits

schema-identity-v15-evidence.mjs remains SHA256=`70cc863748a3ba9bf91095208f3ccbba2b1bb80269293bbedb96f79f9dcba44f`. The prior97 source/generated set has12 current differences: PresentationDump.cs, BomberBombState.cs, and ten client/server generated BombState/reducer/registry/declaration/operation-plan files. The prior110 generated/lock inventory has10 differences, all client/server generated registry/reducers/player/participant/bomb sources. Exact before/current hashes are recorded, without replacement or source-pin updates by this reviewer.

These changes are intentionally outside the old schema15 accepted set. That old gate remains closed. Product16 qualification and independent source/spec reviews are separate, owned by the parent and other reviewers. Identity acceptance above does not certify schema16 authorization, reinterpret old pins, or erase the12/10 drift. No strict protocol, quota, simulation or validator threshold was changed.

The package/consumer identity is ready for the parent's next qualified run. Real independent players, bidirectional movement and bombs, at least ten actual close/new-browser rejoins, measured performance and local signed release/endpoint evidence remain required. Public Publishing/admin release approval is still a distinct formal delivery gap.
