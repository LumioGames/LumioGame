// Schema16 is closed until its final authored/GEN/package bytes receive nonauthor review.
// The v15 pins remain a separate immutable historical qualification.
import {createHash} from 'node:crypto';
import {V15_AUTHOR_PATHS,V15_GENERATED_PATHS} from './schema-identity-v15-evidence.mjs';
export const V16_SCHEMA='bomber-v16-owner-prediction-candidate';
export const V16_PREDECESSOR=Object.freeze({path:'Gameplay/Compatibility/schema-identities.before-owner-prediction.json',
  sha256:'8616a73978d008d14b26ffc4441b56565690d07dbb2b555278891fdc816094f9'});
export const V16_AUTHOR_PATHS=Object.freeze([...new Set([...V15_AUTHOR_PATHS,
  'Gameplay/Components/Bomber/BomberPlayerState.cs','Gameplay/Components/Bomber/BomberParticipantState.cs',
  'Gameplay/Components/Bomber/BomberResults.cs','Gameplay/Components/Bomber/BomberResults.Server.cs',
  'Gameplay/Abilities/MoveAbility.cs','Gameplay/Abilities/MoveAbility.Server.cs','Gameplay/Abilities/MoveAbility.Client.cs',
  'Gameplay/Abilities/MoveAbility.Movement.cs','Gameplay/BomberMovementDanger.cs','Gameplay/BomberInputMemory.cs',
  'Gameplay/BomberTerrainRead.Client.cs',
  'Gameplay/BomberSuccessorLifecycle.Server.cs','Client/UI/Spectator/SpectatorReplicaHost.cs',
  'Client/UI/Spectator/SpectatorDump.cs','eng/BomberRelease.props',
])].sort());
export const V16_GENERATED_PATHS=Object.freeze([...new Set([...V15_GENERATED_PATHS,
  ...['client','server'].flatMap(side=>['BomberPlayerState.g.cs','BomberParticipantState.g.cs','BomberResults.g.cs',
    'MoveAbility.g.cs'].map(name=>'Gameplay/generated/'+side+'/'+name)),
])].sort());
export const V16_REVIEW=Object.freeze({
  "schema": "bomber-v16-owner-prediction-candidate",
  "reviewStatus": "accepted-nonauthor",
  "reviewEvidence": ".run/schema16-final122-pins-independent-review-01/result.json@8e51647913110ba9d3e7a195a76d00a3ec32d2e24608e9f9836e416946b7b3c3; .run/candidate12-production-identity-audit-01/consumer-identity-accepted.json@6a53727b68a986fa775a3e398a9ffb9f647481ebe14ff1bdb5c9a72b106c9a2d; .sdd/101-20261004-candidate13-production-identity-audit.md@1cce3a9f5a87795be72256b69b4b867fe74cbea07edd668209738ee692962e56; .run/candidate13-production-identity-audit-01/attempt-02/consumer-identity-result.json@a7a9e301f0560bc8034d6c86a417029a7b521972abf240402777def97ac140ea; .run/complete14-package-independent-review-01/result.json@3fcc8c5a6eb7f169094f0488be1f0ec645dfe91f00269ab602228083def85a37; .run/candidate14-production-identity-audit-01/consumer-identity-result.json@54a19df34cbb5c0ab64f309c395f6a823ed530482f9d9344baff0f883d76b6ea; .run/observer-entry-independent-review-01/attempt-04/result.json@a5ddf232d8eb027ccc0fa2946b5752d71af09ee33b81af9546384e75856f7b8f",
  "author": {
    "Client/Bots/BomberPlayObservation.cs": "ae03de8bf355ac08e81c79bed7dd143012493773451ece460dde06b2a39afe50",
    "Client/Presentation/src/contract/events.ts": "60abbf036711a8826c215cc20178aef62ac267b38aa82efcb495433c16cae5dc",
    "Client/Presentation/src/contract/snapshot.ts": "9d92058b60274a75bf72ce356a12f223da35d476eed35c0c7027ec754225eeb1",
    "Client/Presentation/src/fire-region-coverage.test.ts": "f453ccce1dbd1f4212d80ac266bfca10dc07f54476ddfeeb0c405099fdbe80b6",
    "Client/Presentation/src/fire-region-coverage.ts": "9aa3b06d7af4d06799e35500e0aa3225bb86a30c256759f41c0c5d9ba224f87b",
    "Client/Presentation/src/replica-adapter.test.ts": "4f11e7a2aebbd6015051e6a628a8aebf4af55d500e75070472ba3774aecaeae0",
    "Client/Presentation/src/replica-adapter.ts": "d89e22570469574b759398ecf39cd00202a7e2cc83f1c822504063f8c3aa939c",
    "Client/Presentation/src/replica-events.test.ts": "30635987fb3a74f27e9376c3230addd758cd9b9730576259de2bc87f2aff3996",
    "Client/Presentation/src/replica-events.ts": "77b86fc5f3a809d6f498755b4e35451f215f5be0f6b177390a12c8f2c8e5f865",
    "Client/Presentation/src/replica-types.ts": "db0500e04755f75713a58b67bf5ee0dc7022bf235a3bd5a9d3f5a6ec02db6789",
    "Client/UI/Spectator/PresentationDump.cs": "042d45624b5bbb5ada07177bae6f8cf48033559a243486fe0edd3e4ee4e56a32",
    "Client/UI/Spectator/SpectatorDump.cs": "2bfc9e6bb275aefebfd08189b41e07126034b1301145d6f134de576dc2ef5e37",
    "Client/UI/Spectator/SpectatorReplicaHost.cs": "e46d2970012e2980fd5cf74aa80803affcaefff59fae26dba3b38da750973b03",
    "Gameplay/Abilities/MoveAbility.Client.cs": "638a946b68218bb16eb4d9a06bdaa7245e33608e4836d8d7493817b9bf3d364a",
    "Gameplay/Abilities/MoveAbility.Movement.cs": "0b2417ad09e3a2d72d371d150fc4c5dbc321c703202fe59b2e4b97cc75dff835",
    "Gameplay/Abilities/MoveAbility.Server.cs": "b2de6f914e14e4d5d1c02e55b54d17b88d295da1af5338d27283db0e9935a648",
    "Gameplay/Abilities/MoveAbility.cs": "723b57e7a342b98bd19990a23eabf8a1b9924810873fce8821fd1ea032f47075",
    "Gameplay/Abilities/UseActiveSkillAbility.Server.cs": "3274aa0be4373c4013c676fb829d945da9434470cab165aab6ada933ac5eaf64",
    "Gameplay/BombSystem.Server.cs": "06523b7df9b82a58cde31643bf3ee7935d522efefd5af2ca4bdfbc2eb25ef487",
    "Gameplay/BomberBarrelBombPromises.Server.cs": "93f366f9799ef16d9f9b2d76805e74302c823d2fc9410e7e3e81460a82524bf9",
    "Gameplay/BomberBlastTerrain.Server.cs": "05905abebe97fe2ee36f8354190d883165fae078fd3e04d276f1d2b8cfdebece",
    "Gameplay/BomberBombLifecycle.Server.cs": "997217d757939c35dd6e11741b5d6c0af639a1be19cfd14dd39a7e95d21642e7",
    "Gameplay/BomberEffectBusiness.Server.cs": "ed5b990cbb3a5243d6d486c063f6853addecfc6094ae94d4f91fb54278d15ebb",
    "Gameplay/BomberFavoriteFireZones.Server.cs": "7527a8ccd625ea9e74e1c4056af7b72009b20e2664d32c89303f49568043b16b",
    "Gameplay/BomberFiniteAura.Server.cs": "80131735cc7acbbb16c9cfdd304fa8e48998a2680e3ca3ad584c7fa4981712aa",
    "Gameplay/BomberFiniteFreeze.Server.cs": "d1961bb4b6b6d478fdfc9eaa9d2d38dcd626d0ed4ea25c8f29efa68ee9a9ceb0",
    "Gameplay/BomberFiniteSkills.Server.cs": "676c05f13389863801f9bf0ab1475460a9c99a36ad940d404afe53bbe9e0cfef",
    "Gameplay/BomberFireExposure.Server.cs": "09901b51804c2368838c72d77d93b3a977a4c59d04a55cdab95e420133afc07c",
    "Gameplay/BomberFireReducer.Server.cs": "d606559911e2b42cf7a2d1fab05b77230d60f38ca74ad8fd218c02ead1c3063d",
    "Gameplay/BomberFireRegionCoverage.cs": "992ed51759c086b2a500c434aac6330c2816c8ba5cda1b1d33b364d549daa5a9",
    "Gameplay/BomberFireZoneLifetimeReducer.Server.cs": "ec97a9bdaf648638dd4b57ad4c82dea44543acfbc21f6eb662c4dcfb20bef58c",
    "Gameplay/BomberHealthReducer.Server.cs": "3c89297d3b257b7993748525998342e6a4d84aedfe4d5c8146bdcf0a7ec22921",
    "Gameplay/BomberIceBridges.Server.cs": "76688e244236f45719b214273dd76183f3fa26cbc141e4397589f5cfab94811c",
    "Gameplay/BomberInputMemory.cs": "f6b0edaf5db3542fa0a857af031a06c9abbe9e62d93b6c01c806e2c9cc658232",
    "Gameplay/BomberMovementDanger.cs": "74dada3611850e4392ddbfbe70a72043980eecd8b17380c5363423af085961a8",
    "Gameplay/BomberOutcomeReducer.Server.cs": "4aa133f174000e306fc86edcf0d83644b9108cf2d544d4bb83e8eed580dd3be2",
    "Gameplay/BomberRoundTransition.Server.cs": "df44b12b588eeea03f57c5cfadd05c2fa93dbd565e88aff767f94b612641ac8f",
    "Gameplay/BomberSettlementReducer.Server.cs": "d0448130e45695a2099935a9bf0abf70dc9586f9b4c2edbcbb75b63339a8824a",
    "Gameplay/BomberSuccessorDeclaration.cs": "020c5394d4b4382dbcf14d7d290cd8cb75fa5ad1b808185032d926d5ee7f29a2",
    "Gameplay/BomberSuccessorLifecycle.Server.cs": "97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de",
    "Gameplay/BomberTerrainRead.Client.cs": "9303f7b05f2c16aac9728fb370af2921a75a05aaf701bc9d14cea0f1d460a9ea",
    "Gameplay/BomberTerrainRead.Server.cs": "e19b1f510d5d551862aed77cc6cac02b70dd3eaa1a73e6db4d202ab1bbac3223",
    "Gameplay/BomberTerrainTransactions.Server.cs": "0e1a188f812edceb596f202ea32d0b3cc99e40c3fef5bde2c16a9188b217bf9c",
    "Gameplay/Components/Bomber/BomberBombState.Server.cs": "e82428b3b203a1758754b0884a928580e805cba2426f52c3e86b87a9f11091e5",
    "Gameplay/Components/Bomber/BomberBombState.Traversal.Server.cs": "adaa009f19029344cf4b6a029777b6de6d5557039b9b578c063232c0509e40ca",
    "Gameplay/Components/Bomber/BomberBombState.cs": "449993e985d57c83c1c041bdf37162caf481ea4dd65f4a3075b92df1481ca6e2",
    "Gameplay/Components/Bomber/BomberFireZoneState.Server.cs": "43f3f8c4ac3ce54b530a42de22920b61f10d8254b757c8297153f6d17b71a552",
    "Gameplay/Components/Bomber/BomberFireZoneState.cs": "e34adb4314989f0cdcc4631cf3952cce874e7b75b1e1469a6530397350b054aa",
    "Gameplay/Components/Bomber/BomberParticipantState.cs": "0d552e6770b122a06a1dfe8b08ab2b4f48a3a96e3441725f99dcf61656faede3",
    "Gameplay/Components/Bomber/BomberPlayerState.cs": "c97ab698fa35bd196f20e1089ae7b939b3b556ec6d5b56c8bcce691f7f9e1cf7",
    "Gameplay/Components/Bomber/BomberResults.Server.cs": "33bae49d123302710427ea56f2de59f1d88457bc94c41439d49c09554b9779b9",
    "Gameplay/Components/Bomber/BomberResults.cs": "b891600953866bb6b550b2c412c03d0f79666cc50f24e44b47c3ad7f20478625",
    "Gameplay/Components/Bomber/BomberSkillState.Server.cs": "5a8faeefb22458b6cd2db7a1e677060858df9457184649a4f6192a5295123c29",
    "Gameplay/Components/Bomber/BomberWorldRuntime.Server.cs": "6c40dd4eed4c82c2e26087aa14492b1b8482cff31408d350dabc41c2c1c6df63",
    "Gameplay/Config/BomberConfigBinding.cs": "bcb2a54ab403d2ad21730a132d2231875af9c39000db2b778d949754ec779d7a",
    "Gameplay/Config/BomberObjectBudgets.cs": "2d18858387b49cc985af5b2631c360c7a7c4122de8a37f0ed9d5d813fe98d2c3",
    "Gameplay/Effects/BomberBubbleEffect.Server.cs": "d91942cc391d629753af2349e061a8b8a23353cddb1913002882b36fe028a426",
    "Gameplay/Effects/BomberFireAuraEffect.Server.cs": "83b6573cc06d078efe6af9c5b98a76c52ce021c3857aac927cc859d36709fa03",
    "Gameplay/Effects/BomberFireZoneLifetimeEffect.Server.cs": "dcb36a087babb5928f8686e06f4f89b920895108d9117bb9c15c588086d70342",
    "Gameplay/Effects/BomberFireZoneLifetimeEffect.cs": "b6d633a514c73deb90220e50cea4cdee7ca559b86be765e419e4a55865ff399c",
    "Gameplay/Effects/BomberFreezeEffect.Server.cs": "df46009f5203a613b036221b9598ac154b0075e21327280befe6a26c4d36a06c",
    "Gameplay/Effects/BomberFreezeImmunityEffect.Server.cs": "e29c26a4d409f98b58184c549f0bdd7fc62d5f7501cd928a51339881913364b7",
    "Gameplay/EntityTypes/Bomber/BomberFireZoneEntity.cs": "d19ba51eb56549f857277651ef1e9f2f32b24f88571b4ccacecea5c99f4e89d2",
    "Gameplay/Events/BomberEventCatalog.cs": "5c8621eac2dd5859ead667287ad1b5c7f640f04d29aad9adac8e9f2efca57174",
    "Gameplay/Events/BomberEvents.cs": "2ba824feb7654e4c22ee60b08161ca3afee3286676c380c97b6c2e36db19b2cf",
    "Server/Tests/Gameplay/BomberEventContractTests.cs": "dd644627cca48dc2b027bbf3bc78bd1fc0bb08aa86e1e5029018c1cb94e5ba6d",
    "Server/Tests/Gameplay/BomberFavoriteFireFollowupProductionTests.cs": "3e67509385c6ea8232e5d0f15298745db0cd85eb64c137b13aff6ee55af1b57b",
    "eng/BomberRelease.props": "8a401c8df039fab34f9de44598a9fe625ad3dcf2413fded7d79f1b05af29a499"
  },
  "generated": {
    "Gameplay/generated/client/BomberBombState.g.cs": "3b4fc431f5981ebdad25168a969e4cd9fd1f6ac7814c8faa2e2c31213d0ac948",
    "Gameplay/generated/client/BomberBubbleEffect.g.cs": "31bda8e96b81e2bb0d53509d0efbf46f0f2001c286e9303139200138f0f43c7d",
    "Gameplay/generated/client/BomberBurnDamageEffect.g.cs": "9d12c4469743900ca8916ed8122131fab175c34b4ad1b4a5ecb5955d1a03b3b0",
    "Gameplay/generated/client/BomberDamageEffect.g.cs": "603f286e056220b6661b68b25b889bcc81c196b0a254a9dca8db6f6121a34084",
    "Gameplay/generated/client/BomberFireAuraEffect.g.cs": "d11d3ec5510eec02ae3dc0668f3e1be383f6dbc194648866f6b9f7a073f4b313",
    "Gameplay/generated/client/BomberFireZoneEntity.Template.g.cs": "e438c52d406261a928a2536bc2ec75de4ee0cda0afa34e645683d3ad604553bb",
    "Gameplay/generated/client/BomberFireZoneLifetimeEffect.g.cs": "a0c9681b829a03875ef56a804abbf11d2f5944d44aa27074760e221e2bfe9dc5",
    "Gameplay/generated/client/BomberFireZoneState.g.cs": "3a2789908d21956a450841a3319e8e9e407369e5f9945fcdcd02ce7dcc66087f",
    "Gameplay/generated/client/BomberFreezeEffect.g.cs": "c9fc886f1abc29b188ce95b4f2dfcb292977ad91de697dd3ec1521b6db9449f1",
    "Gameplay/generated/client/BomberFreezeImmunityEffect.g.cs": "270532285971f268fb3353bd16d34cebc39159b2effaa93f41010aedd7b5267a",
    "Gameplay/generated/client/BomberHealEffect.g.cs": "d8888f8f66edac4cc263d685a4ec18fe7ea0df6a4dca40cd4572f327e7f5ffbe",
    "Gameplay/generated/client/BomberInventoryEffect.g.cs": "b8798b55a4465be46151010d86217d4d73f49aa07dd0f6e72b7b72e2d3308ecd",
    "Gameplay/generated/client/BomberNewMatchEffect.g.cs": "e86a86cf6b65fcc4adba0d22f0ce1192a89fe1fa28452db19a527d456233d2c7",
    "Gameplay/generated/client/BomberParticipantState.g.cs": "c905b1349103aa8d7d3e547dcd9d2292075bf6bba35cfb674bdd47f9cf570884",
    "Gameplay/generated/client/BomberPlayerState.g.cs": "b1f98f5e7648b1b207b749702bb28fb567c4f86fad63600c8767a756f75d2857",
    "Gameplay/generated/client/BomberRestoreHealthEffect.g.cs": "df5eef2bc179ee5a7510058c2a25c38925df3da19c4d425ee732f9322c782c38",
    "Gameplay/generated/client/BomberResults.g.cs": "1cf5131f00803d5dc7d95bf56589a9cdd7b5cf6a00d1db84fe8bf6b2c346e73e",
    "Gameplay/generated/client/BomberSuccessorRestoreEffect.g.cs": "853c58c76a80ef2e6e36c7001f415cfe7e64aee3ac95e775d1e1c96edb72e621",
    "Gameplay/generated/client/GeneratedEffectCodecs.g.cs": "2cee2681c4620df046bc172978092e5eef4db8fa0d65b7526272d5381dd59f2e",
    "Gameplay/generated/client/GeneratedEffectReducers.g.cs": "8e4f95d164f73f8c5d198e01b9e49fc27b788a5ba2427537274214da61d31a48",
    "Gameplay/generated/client/GeneratedEffectRegistry.g.cs": "d705061c59cbed76b7c83dc48878023a263b5826cb12483274c7b80d0ce33a42",
    "Gameplay/generated/client/Lumio.Bomber.Gameplay.Registry.g.cs": "16304d51c8896034d2a004118d85d7fbfd8f7a1d9b9cb66d0dcdca0636e399b7",
    "Gameplay/generated/client/Lumio.Bomber.Gameplay.Sync.g.cs": "750132d3b76290c7125466030aff0f6a01c8e5996532645ff15dfee9b1cd33db",
    "Gameplay/generated/client/MoveAbility.g.cs": "52d2b8abe1a5401867964e4c26e84237c5684e765a88f58f22aa043100371062",
    "Gameplay/generated/client/attribute-declarations.json": "36c077df8e42da171b21d802dc9608c956500bd979adbc20240427698385416a",
    "Gameplay/generated/client/effect-operation-plans.json": "426955ec563ccf9a60305cc4e2242b15b829f3a2189118bfb59382eb670271de",
    "Gameplay/generated/server/BomberBombState.g.cs": "3b4fc431f5981ebdad25168a969e4cd9fd1f6ac7814c8faa2e2c31213d0ac948",
    "Gameplay/generated/server/BomberBubbleEffect.g.cs": "31bda8e96b81e2bb0d53509d0efbf46f0f2001c286e9303139200138f0f43c7d",
    "Gameplay/generated/server/BomberBurnDamageEffect.g.cs": "9d12c4469743900ca8916ed8122131fab175c34b4ad1b4a5ecb5955d1a03b3b0",
    "Gameplay/generated/server/BomberDamageEffect.g.cs": "603f286e056220b6661b68b25b889bcc81c196b0a254a9dca8db6f6121a34084",
    "Gameplay/generated/server/BomberFireAuraEffect.g.cs": "d11d3ec5510eec02ae3dc0668f3e1be383f6dbc194648866f6b9f7a073f4b313",
    "Gameplay/generated/server/BomberFireZoneEntity.Template.g.cs": "e438c52d406261a928a2536bc2ec75de4ee0cda0afa34e645683d3ad604553bb",
    "Gameplay/generated/server/BomberFireZoneLifetimeEffect.g.cs": "a0c9681b829a03875ef56a804abbf11d2f5944d44aa27074760e221e2bfe9dc5",
    "Gameplay/generated/server/BomberFireZoneState.g.cs": "3a2789908d21956a450841a3319e8e9e407369e5f9945fcdcd02ce7dcc66087f",
    "Gameplay/generated/server/BomberFreezeEffect.g.cs": "c9fc886f1abc29b188ce95b4f2dfcb292977ad91de697dd3ec1521b6db9449f1",
    "Gameplay/generated/server/BomberFreezeImmunityEffect.g.cs": "270532285971f268fb3353bd16d34cebc39159b2effaa93f41010aedd7b5267a",
    "Gameplay/generated/server/BomberHealEffect.g.cs": "d8888f8f66edac4cc263d685a4ec18fe7ea0df6a4dca40cd4572f327e7f5ffbe",
    "Gameplay/generated/server/BomberInventoryEffect.g.cs": "b8798b55a4465be46151010d86217d4d73f49aa07dd0f6e72b7b72e2d3308ecd",
    "Gameplay/generated/server/BomberNewMatchEffect.g.cs": "e86a86cf6b65fcc4adba0d22f0ce1192a89fe1fa28452db19a527d456233d2c7",
    "Gameplay/generated/server/BomberParticipantState.g.cs": "c905b1349103aa8d7d3e547dcd9d2292075bf6bba35cfb674bdd47f9cf570884",
    "Gameplay/generated/server/BomberPlayerState.g.cs": "b1f98f5e7648b1b207b749702bb28fb567c4f86fad63600c8767a756f75d2857",
    "Gameplay/generated/server/BomberRestoreHealthEffect.g.cs": "df5eef2bc179ee5a7510058c2a25c38925df3da19c4d425ee732f9322c782c38",
    "Gameplay/generated/server/BomberResults.g.cs": "1cf5131f00803d5dc7d95bf56589a9cdd7b5cf6a00d1db84fe8bf6b2c346e73e",
    "Gameplay/generated/server/BomberSuccessorRestoreEffect.g.cs": "853c58c76a80ef2e6e36c7001f415cfe7e64aee3ac95e775d1e1c96edb72e621",
    "Gameplay/generated/server/GeneratedEffectCodecs.g.cs": "2cee2681c4620df046bc172978092e5eef4db8fa0d65b7526272d5381dd59f2e",
    "Gameplay/generated/server/GeneratedEffectReducers.g.cs": "2c8b0b2408f7c2ae6bf040de6d3bb244e294d91f4bd5ed6a57c18c25c24974b9",
    "Gameplay/generated/server/GeneratedEffectRegistry.g.cs": "d705061c59cbed76b7c83dc48878023a263b5826cb12483274c7b80d0ce33a42",
    "Gameplay/generated/server/Lumio.Bomber.Gameplay.Registry.g.cs": "3074600096668feae12b6f282199132e938b234543fd2538e990621155ded6c1",
    "Gameplay/generated/server/Lumio.Bomber.Gameplay.Sync.g.cs": "6b1c42c22480e53e53b0f74ff49205aa2f35892482e7108feab667d3c5bc673f",
    "Gameplay/generated/server/MoveAbility.g.cs": "52d2b8abe1a5401867964e4c26e84237c5684e765a88f58f22aa043100371062",
    "Gameplay/generated/server/attribute-declarations.json": "8e3b9f5183e5cc4ba54a0e4eb2602889ee3ef142db57731b4094614b95af86af",
    "Gameplay/generated/server/effect-operation-plans.json": "426955ec563ccf9a60305cc4e2242b15b829f3a2189118bfb59382eb670271de"
  },
  "package": {
    "manifestSha256": "65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9",
    "sdkPath": "Engine/sdk/Lumio.Engine.SDK.0.0.5-main.523c3d3.nupkg",
    "sdkSha256": "d7c97107620696669d8657e590d19d085cc2112243783ce48ac2d912bbdb21d0",
    "version": "0.0.5-main.523c3d3",
    "sources": {
      "LumioGameEngine": "523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0",
      "LumioNativeCore": "81b2501a621db2657bd087db2afa808ecfb9e846",
      "LumioVoxelEngine": "2ba61e431d8080ff6450a07e6ee447e3f0994e0b",
      "LumioGameRuntime": "520ffe482e1c48fb6e48187925eecec986cdb9c8",
      "LumioServer": "008861074a2d3c9da1b0407325ede6f851704fd5",
      "LumioClient": "862f3ed231bdd0d8b9f9e953291222b2e07a67f7",
      "LumioPlatform": "3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89"
    }
  }
});
const error=(code,message)=>Object.assign(new Error(code+': '+message),{code,exitCode:2});
const exactKeys=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  JSON.stringify(Object.keys(o).sort())===JSON.stringify([...keys].sort());
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const SOURCE_REPOS=Object.freeze(['LumioGameEngine','LumioGameRuntime','LumioClient','LumioServer',
  'LumioNativeCore','LumioVoxelEngine','LumioPlatform']);
export function selectV16Review(review=V16_REVIEW) {
  if(!exactKeys(review,['schema','reviewStatus','reviewEvidence','author','generated','package'])||
      review.schema!==V16_SCHEMA||review.reviewStatus!=='accepted-nonauthor'||
      typeof review.reviewEvidence!=='string'||!review.reviewEvidence.length)
    throw error('v16_review_required','Final exact nonauthor-reviewed schema16 source/GEN/package bytes are required');
  for(const [name,paths]of [['author',V16_AUTHOR_PATHS],['generated',V16_GENERATED_PATHS]])
    if(!exactKeys(review[name],paths)||!Object.values(review[name]).every(sha))
      throw error('v16_review_inventory','Closed '+name+' inventory or hashes differ');
  const p=review.package;
  if(!exactKeys(p,['manifestSha256','sdkPath','sdkSha256','version','sources'])||!sha(p.manifestSha256)||
      !sha(p.sdkSha256)||typeof p.version!=='string'||!/^\d+\.\d+\.\d+-main\.[a-f0-9]{7}$/.test(p.version)||
      p.sdkPath!=='Engine/sdk/Lumio.Engine.SDK.'+p.version+'.nupkg'||!exactKeys(p.sources,SOURCE_REPOS)||
      !Object.values(p.sources).every(v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v)))
    throw error('v16_package_review','Exact full-package sources, version, manifest and SDK archive are required');
  return review;
}
export function requireV16Review(files,review=V16_REVIEW) {
  selectV16Review(review);
  for(const name of ['author','generated'])for(const [path,expected]of Object.entries(review[name]))
    if(!Buffer.isBuffer(files.get(path))||hash(files.get(path))!==expected)
      throw error('v16_review_bytes','Unreviewed '+path);
  const p=review.package;
  for(const [path,expected]of [['Engine/manifest.json',p.manifestSha256],[p.sdkPath,p.sdkSha256]])
    if(!Buffer.isBuffer(files.get(path))||hash(files.get(path))!==expected)
      throw error('v16_package_bytes','Unreviewed '+path);
  const manifest=JSON.parse(files.get('Engine/manifest.json'));
  if(manifest.version!==p.version||!exactKeys(manifest.sources,SOURCE_REPOS)||
      SOURCE_REPOS.some(repo=>manifest.sources[repo]!==p.sources[repo]))
    throw error('v16_package_sources','Reviewed manifest provenance differs');
  return review;
}
