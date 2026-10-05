# Schema v15 作者字节闭包修订

2026-10-03，schema作者处理独立review的单项P1。**PRIVATE READY / STOP，等待同一非作者复审。** 新bundle为 .run/schema15-migration-draft-02/。第一版全目录及报告原样保留；没有物理Tools、Gameplay、Config、Client、Server Tests、Compatibility、DECL、generated、Engine、Runtime写入，没有build、GEN、配置编译器、Native、实际readObservation、stage或commit。

应用workflow:receiving-code-review，先完整读报告并复核落点。P1成立：原35条作者路径确实缺失Coverage、Barrel pending owner、SkillState hydrate和ObjectBudgets；普通Gameplay词法解析不是完整body审查，Config被walk排除。复核review的synthetic探针能解释为什么这些文件变动不进入原gate。

## 冻结输入和并集依据

| 输入 | SHA256 |
|---|---|
| 原schema01 manifest | 93c61b7548e41f9582796a40df4fa44a3688d2f78c857d466bffcdb7bac920e0 |
| 独立review报告 | 943a588cf2464d26cc902e46ac3a9e1cc0cef5bcc0a951414cabff9d3a38d1a3 |
| traversal revision03 manifest | fae6a3f08cb09885a6d7526ba32be4e959d6b0415a90f30ae299be7de051be0d |
| Favorite最终revision03 manifest | 5fa10fe79af49d45a1f5ac55abd6a2128ecd5c061c6da2e112c750b061261b2d |

prepare.mjs先验证上述完整bytes SHA。遍历traversal fullProductionDrafts的8项，利用sourceFence精确目标路径；唯一新Traversal partial不存在旧physical fence，其完整目标已单独核对。遍历Favorite全部24 patches + 8 newFiles，包含C# Bot、Presentation、TS mask/adapter/events和所有测试源码；逐项验证draft字节与manifest after SHA。追加Favorite manifest引用的三份schema声明：FireZoneState、FireZoneEntity、10112 Effect（实际声明在favorite-region-draft01，由draft02/finalmanifest引用）。最后并入原35条有限效果/owner审查集合及实际Gameplay/Config/BomberConfigBinding.cs。

结果是 **固定53条作者源闭包**。43个manifest target记录（8+32+3）对应42个唯一目标，WorldRuntime.Server被两族草案同时修改。closure-provenance.json保留两个不同draft SHA，**不选择任一作为真实合并body**；Root合并两族后须重新冻结完整actual作者字节并非作者审查。草案after SHA只认证规划输入，不充当accepted生产body pin。

## 精确修订

只有proposal/schema-identity-v15-evidence.mjs及proposal/schema-identity-read.mjs逻辑变化，其他schema工具、迁移、模型及旧C#候选逐字继承01。

- V15_AUTHOR_PATHS固定53条：补齐四个P1源，显式纳入ConfigBinding、Bot、Presentation、TS coverage/types/snapshot/adapter/events以及manifest测试targets。保留原所有有限Effect/producer/CanSettle和旧review源码，不用泛化新effect白名单。
- readObservationInputs的输入枚举取Gameplay原遍历与固定V15_AUTHOR_PATHS的集合并集，排序去重。Config继续不做普通目录遍历，但两个实际Config闭包文件明确读入；Client/Server tests和TS同样真正读入。缺失实际target文件不会静默退回草案。所有fixed path bytes在observeSnapshot任何schema解析之前进入review gate，并参加前后fingerprint。
- 只对原受支持的Gameplay且非Config的C#文件做声明词法解析。Config及外部C#/TS/tests参与完整bytes审核与input fence，避免把消费者语言、测试原始字符串或Config类型误当新schema声明。这不放宽原Gameplay结构校验。
- V15_GENERATED_PATHS从32增加至 **固定44条完整生成文件**：保留全部Effect outputs，加入两端BomberBombState.g.cs、BomberFireZoneState.g.cs、BomberFireZoneEntity.Template.g.cs、Registry、attribute-declarations.json及Sync table。原review关于capture只检查写调用存在的关注点现在另有完整受影响文件bytes pin；Root填pin前仍必须审完整CapturePersist/CaptureSync/RestorePersist。原结构规则仍在。
- 精确路径集合、缺/多key拒绝、SHA256 bytes拒绝、reviewStatus要求和exit2保持。V15_REVIEW仍null；**没有填任何actual v15 generated或accepted作者hash**。默认观察仍v15_review_required，不能将synthetic accepted test object发布。

任何accepted source/GEN输出进一步增减目标，都需要重新冻结并复审固定inventory；不能在review map中临时加额外key绕过闭包。

## 真实轻量验证

新closure.test.mjs只运行纯gate与私有临时filesystem capture，不运行readObservation或解析真实官方generated。测试包的synthetic bytes和accepted-nonauthor字符串都明确TEST-ONLY，不能作为正式body审查。

| 执行 | total / pass / fail / skip | exit |
|---|---|---|
| 原01闭包复制进02，新增closure测试真实RED | 7 / 3 / 4 / 0 | 1 |
| 修订53/44闭包与输入枚举后同组GREEN | 7 / 7 / 0 / 0 | 0 |
| 02模型回归 | 4 / 4 / 0 / 0 | 0 |
| 02迁移/完整历史回归 | 6 / 6 / 0 / 0 | 0 |

RED具体是：manifest并集缺项、遗漏源缺失/改变仍未拒绝、组件capture生成body改变仍未拒绝、Client输入未捕获。GREEN保持同组测试，验证原遗漏18条源每一条missing及changed都会失败，新追加12条生成文件每一条改变都会失败；null/fake status拒绝；review缺key/多key/fake digest拒绝。私有fixture共97条来源/生成文件加manifest/SDK，共99条，readObservationInputs全部捕获、没有重复；ConfigBinding前后变化由assertInputsUnchanged拒绝。记录在closure-red/green.log及exit文件。

全部proposal模块node syntax通过。模型与迁移不改：exact10112 uint只准AuraGeneration10，旧finite与10111 Favorite bool不扩；36旧页+765旧active完整退休，retired9188/pages39，完整required history snapshot闭包在原8MiB index及512-byte precharge下通过。1MiB blob、64MiB World record不提高，本次没有actual世界尺寸测量。

原6个实际Tools+67个Compatibility共73项保持73/73；原01全文件SHA逐项不变，原目录额外项0。新53条目标补充source fence把尚未出版文件记为absent，不伪造存在/接受。最终after对账和private inventory在02 manifest.json。

## 旧保存资格的最新准确口径

01的exact-original资格草案保持原字节、UNRUN。Root已有290程序集/102 hash的独立扫描没有找到原Game78b1，因此不能写成已找回原release executor。独立review静态接受Root另一个兼容v14 qualifier（SHA ff28567a450c761f0a69e26bc749e345c6960a9de6d06404fbcf0ef573deb5bc），准确区分原capture Game78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e与兼容reader Game61ffd66564c634a13b173a04af4eefcd212e1305da41d27d07675de1f13b5e55。

原World SHA6a0e5a671cdb89a003c4567ccefa9534481c0fcd48e147b10c583d8aabd755a8（21487B）、metadata d9512037e1f85c11775ced7271a31ceb970e6947bcf67b9789b00060d25fb573和31个export文件须持续immutable。Root当前build42只加该qualifier源码；本作者没有跑该Restore或修改它。Root须在v15前实际执行兼容v14 Native Restore/whole byte roundtrip并冻结清楚标明双Game身份的v14 executor/source/generated/SDK/config/test outputs。该额外资格不能改名成原same-release恢复；原旧5Fact和exact qualifier保留，不删/skip/放宽。

## Root后续门

1. 同一非作者复审此单P1闭包修订，核对53来源/44生成固定清单、manifest并集和99-input测试，确认01原字节不变。
2. Root处理两个WorldRuntime owner草案的实际合并与独立行为审查。Favorite审查指出48 MaxWrites不满足实际2×ResultRecords，以及提高ResultRecords到704时现有Fire1816可能不足；**本修订没有改这些业务上限，也不宣称现有draft cost/admission正确**。ConfigBinding现在进入字节闭包，实际新GAS配置成本/全局admission仍单独复核。
3. Root串行正式发布accepted作者源码和07 GEN；冻结实际53条作者bytes及44条generated完整bytes，经非作者审完整body/capture/reducer/program cost后才能填写V15_REVIEW。不得使用本目录TEST-ONLY buffers或manifest candidate SHA作为accepted production pin。
4. schema CLI/全集、distinct GameReleaseId、whole oldSnapshot strict negative早于OnHydrate、actual traversal/region/paired restore/cohort以及固定budget测量仍由Root执行。52未选择，原cap5与全部历史预算不变。

本次只修复工具审查闭包及输入捕获。正式v15身份/GEN、GAS预算、旧恢复策略执行、Gameplay/Native与容量接受均未完成。作者停止，释放工作槽供同一reviewer复审。
