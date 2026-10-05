# Schema16 工具独立审查

裁决：`ACCEPT_EXACT_FIVE_TOOLS_WITH_PENDING_V16_GATE_PRIVATE_TESTS_ONLY`。最终五生产工具没有待解 P1/P2；可以按精确 hash 继续源码交付。此裁决不更新 Schema16 pins、不应用 ledger、不批准实际源码/GEN/包的发布身份或浏览器验收。两个新测试依赖私有 fixed capture，只保留在私有封件；普通部署测试接线仍是待办。

非作者读取作者 NEW `seal-02/manifest.json`，SHA256 `263126279b7cbd0310acfcd13c928c5f3486add44c3e31c90bab5d6a396856c9`，并核对七文件 current/frozen/before/patch 的实际 hash。未改生产、测试、pins、历史、服务或浏览器，没有重构建或 Native 测试。额外执行的是本独立目录内的两个窄 Node 证明脚本；raw exit 均为 0。

## 精确交付范围

| 文件 | 资格 | SHA256 |
| --- | --- | --- |
| schema-identity-read.mjs | 生产 | `98ba79ffe729d67bf4e3272be7c010e25ee78760acf6af66723bee0caeb7ad40` |
| schema-identity-model.mjs | 生产 | `51794fddaddf6c7e654c45a6bc38ff61b1f0129d08c0b2d83095aa4ae2c5436b` |
| verify-schema-identities.mjs | 生产 | `f4390362bdbeb0a48e683679c87751b3ec5d5f91b0c62d8452d2c143e41aa9c3` |
| schema-identity-v16-evidence.mjs | 生产，默认 pending | `cf438deffcf41e7a153df7a262ace5c0868002d39952b6bed47b48de44caa141` |
| schema-identity-owner-prediction-migration.mjs | 生产，显式审核迁移出口 | `50c7ee9a5ae07491b7539d19d5ed702b8b90884c9618b77d26400016e2eb7841` |
| schema-identity-v16.test.mjs | 私有 fixed-capture 测试 | `69bd5b634feaa57b11fe037c2f24287f74e62f81029a68d49737606a717569d4` |
| schema-identity-owner-prediction-migration.test.mjs | 私有 fixed-capture 测试 | `f0df874594b146164b1dcd63616b5f9d81205791d002002b568056bcec6d25ee` |

五生产工具只增加独立 Schema16 选择、对应严格有限模型/完整比较索引、默认关闭的闭集合门与显式 audit ledger 迁移。原 Schema15 默认选择、原模型规则、history storage、hash 外部格式和原迁移器保持。原 39 shared Tools 文件全部仍等于 source-before SHA；候选中除三被修改的已有工具外，其余 36 原工具逐字一致。原 Schema15 pins 模块与 storage 模块在 shared/candidate 两处 byte hash 相同。

## 闭集合漏项已修正，默认门仍关闭

旧 120-input 封件没有接受为最终闭集合。Root 先发现新的 `Gameplay/BomberTerrainRead.Client.cs` 未 pin；本审查又发现 `Client/UI/Spectator/SpectatorDump.cs` 中已审核的 completed-Self pose helper 既未 pin，也未进入原 reader capture。作者在新的封件中精确补入这两文件；旧 120/121 封件和 raw 继续保留。

最终闭集合实际为 68 authored、52 generated、manifest/SDK 两项，共 122。独立实际检查 MoveAbility.Movement、common Danger、Terrain.Client、SpectatorDump、PresentationDump 五关键 body 都存在于固定 author 集合。294-input final12 capture 的记录 hash 全部实读一致，观察器产出 787 identities。

本审查对 122 每个输入实际追加一字节，全部在对应 review byte 门拒绝；额外/缺失 inventory、未知 MoveAbility.Shadow partial 同样拒绝。默认 `V16_REVIEW` 实际仍 `pending-nonauthor`、无 evidence、author/generated 空、package null；默认 `selectV16Review` 和 Schema16 observation 均精确 `v16_review_required`。默认 v15 仍读取其 787 旧 identities，拿新 v16 bytes 冒用默认 v15 实际 `v15_review_bytes`。测试 envelope 显式标记 `TEST_ONLY_FIXED_FINAL12_CAPTURE_NOT_A_NONAUTHOR_REVIEW_OR_RELEASE_PIN`，没有安装到生产常量。

Reader 的固定 author input 路径由独立 schema selection 决定；前后完整 fingerprint 比较仍存在。新增 Movement partial 只对明确 Schema16、指定 CLR MoveAbility 和该精确路径成立，其他 ability shape/body、GEN 结构、原 namespace/字段规则保持。Schema16 finite effect10112 继承旧 exact field/control 规则，没有新增宽泛 finite-body例外。

## 完整 256-bit 内部键及原额度

Model diff 的索引变更只有内部 `Buffer.from(canonicalHash(value),'hex').toString('latin1')` 表示以及说明；所有 versionKey、retirementKey、完整 row/identity comparison 均使用同一内部函数。该值仅用于本轮 equality Map/summary/index，不写 ledger、identity、retirement、page、snapshot 或外部 provenance。外部 canonical/file/page SHA256 仍为完整 64 字符 hex。没有 `normalize`、截断或额外编码回路。

独立证明覆盖 256 个 byte 值和 256 个单 bit 位置：32 个 Latin1 code units 可逐字还原完整 32 bytes；Map key、JSON escape roundtrip 保留控制字符/高 byte。组合 `é` 和分解 `e+combining`、字符串/数值等 canonical value 的摘要不被归一。真实旧 tombstone 的 complete-row 比较通过；只改 reason 的负例精确得到 `retirement_changed`。

Storage 源逐字未变，`MAX_INPUT_BYTES` / `MAX_INDEX_BYTES` 都是 8,388,608。原 reserve 在 insertion 前计算固定 512，加唯一 string 的 `80+2*length`；没有下调 precharge。独立确认第一 unique32-unit digest charge=656，重复 key 再计完整 512 行 charge。16384 次无 string 行 charge 恰填满 8MiB，再加一行严格 `retirement_index_capacity`。作者私有实际 9975-row instrumentation 峰值 8,346,738，留 41,870；这是保留完整 bit 的表示减少字符串长度，未改 quota或放弃历史字段。

## 精确迁移与历史

独立从 hash `8616a73978d008d14b26ffc4441b56565690d07dbb2b555278891fdc816094f9` 的真实 v15 predecessor 调用 pure prepare。其前置要求精确 format/schema/787 active/9188 retired/39 pages；只允许七 movement memory 的 None→Owner、participant generation None→Room、两 bomb source-life None→Aoi 以及相应 CaptureSync/已审核 package provenance。ordinal、authority、persistence、类型、其他 shapes 等不能变化。

本审查实际得到 787 active、9975 retired、四新页；原 39 descriptors 完全相同，全部 9188 原 row 和新 787 个 complete original identity 逐项相同且顺序保留。旧 39 页实际内容与前后 hash 一致；另外 65 个现有历史 snapshot/page 的 source 和作者副本全部仍为原 hash。新 manifest SHA `a990db67405f71c32bb642387cf3b4edcf73b6af83c32650bdc7b5939ac97202` 是私有准备结果，未写共享 ledger。

独立负例实际拒绝替换 predecessor（在读取 page 前）、篡改认证页、额外 identity、超范围 scope/ordinal/authority；正例 `validateLedger` 和 `compareHistory` 均为空诊断。原 retained/added history 由正式 storage iterator 持续认证，prepare 没有删除或重编码旧页。默认 freezeEligible 仍 false，新增 breaking transition 的 releaseDecision 仍 null。CLI private apply 位置明确拒绝，普通 CLI 仍通过 pending review 门，无法以这份 test envelope 自动应用迁移。

## 证据与验收边界

独立证据：`C:/Work/LumioGames/LumioGame/.run/schema16-tools-independent-review-01/`。

- `result.json` SHA256 `a6018836f6a2b7f70a4b7150be0ed63d3b73c31724aa320d9d3082c250f6ade0`，冻结七源、author final raw、source closure / 实际迁移 / 独立负控。
- `cache-proof.mjs/json/log/exit`，独立完整摘要与精确额度/旧 row 负控。
- `protected-history.json` SHA256 `7bdc89ad03ecc5e0336e88033c2cba41f25b464cd7bdf71353e6501119cb7417`，65 现有历史文件实读身份。
- 作者最终 raw 12 PASS/0 skip 和原 bounded 15-case 结果保留，未把其两项未配置 Git-fixture case 宣称执行，也未在本审查重跑宽套件。

Capture 的 package manifest `704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766` 和 SDK `b103008d92bd53abe00fe6b3f82a6df947a3d99d0625ea3187fcd525ecf1509c` 对应真正完整 12（Client `38ead5f...`）；完整 12 的 305 文件、五 PE 闭包和 default CLR 资格另见本轮完整包作者封件。Tools 私有解析通过仍不替代 Schema16 source/GEN/包正式审核 pins。作者另封 generated14delta语义证明；实际 CaptureSync 出口与旧 Persist/Restore 边界应按其准确源码理解，先前 prose 的 CapturePersist 名称误记没有改旧证据。

本裁决只接受五个 pending-gate 生产机制和两份私有测试资格；正式 source/package pins 接受、普通测试集成、发布身份/旧发行不可变资格、实际 ledger 应用以及八人浏览器重进/移动/性能仍须 Root 的后续独立门，不能用本裁决宣称正式体验已闭合。
