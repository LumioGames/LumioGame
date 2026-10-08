# Mixed fact row contract investigation — independent read-only review

日期：2026-10-03。角色：非作者 spec/quality 调查。未修改 Runtime/Engine/Game 源码，未执行 dotnet、Rust、Native 构建或生成；本次仅写此报告。Root 后续明确选择已获 Game 声明授权的独立 Participant FireFacts 方案，本报告不授权实施 Runtime generator 修改。

## 裁决

**独立 `BomberFireFacts`（26 列、cap=1）附加到真实 `BomberParticipantEntity`，10110 的 FactOwner 指向真实受害者 Participant，是现有公开合同及现有 generator 模型下可行的最小结构。** Source 保留真实 Burn/Aura/trail 来源，Target 保留真实受害者身体；合同没有要求 Owner 等于 Source 或 Target。无需通过额外 Player 槽、代理 bomb 或修改 10101 来表达这个结构。这个结论允许继续已授权源码准备，不代表 generation、Native、死亡/重生或整局已经验证完成。

原混合 Skill 结构确实不受当前 official06 generator 支持；保留失败诊断。公开机器合同本身没有“标记组件的所有物理字段都必须进入 row”规则：它独立列出完整 physical storage registry 和显式 row `columns[]`。因此，未来将 row membership 限定于显式 `[EffectRowColumn]`，同时保留完整物理 registry 与全部 row/fact/permission 验证，可以是 data-only plan 的 compiler lowering 修复，无须改变 Engine wire 合同或引入新属性/Native 槽。**这是依据公开合同的范围判断，不是现行 SDK 已支持混合声明的承诺。** 现行属性源码没有明确写出这种子集语义，generator 的接受语言会扩大，现有测试也没有直接证明混合组件，因此不能只加一个 `Where` 后宣称已验证兼容。当前有更小 Game 方案，建议不在本次闭包中实施该 Runtime 改动。

## 公开 primary 与现行实现

Engine owning freeze：`C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e`，HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`。以下是本地公开 primary 的实际内容，不依赖 Root 倾向或历史报告的结论：

- `engine/wire/effect-lifecycle-v1.json`，`/production/reducer/operationPlan/rowSchema`（896–927 行）：envelope 有 `ownerLayout`、`columns[]`；每列由 `registryFieldIndex/role/maxReducerWrites` 绑定。indexed 行要求**所列 columns** 是同一 concrete owner layout、无 hooks、同一正 capacity 的 lists；scalar 行要求 capacity=1。六身份、ready/status/codec、重复 columns/keys 等仍必须验证。未规定 row columns 等于某个 component 的所有 storage。
- `/production/reducer/registryBinding`（约 960–1000 行）：完整实际物理字段身份是 registrySha256/concrete layout/slot/ordinal，并有稳定 component/field keys。每条 registry、row、fact、包括 unused hooks 都独立验证；row entries 是 captured records 的整数索引。完整 registry 与 row membership 是两个对象。
- `/production/settlementFacts/schema`（1082 行）：支持既有 scalar fields 或 aligned pre-reserved fixed-capacity SyncList columns；不增加持久队列/result-layout 字段。`planSchema` 要求每个 captured/output column 完整绑定、六身份加 Tick、ready-last、精确写/字节预算；`associationScratch` 要求 row 的全部 immutable columns certificate 和 `row.columns.length` 个 retained binding references，包含 status/non-written columns。这里的“完整”指 validated row，不是组件全部普通字段。
- `/production/reducer/registryBinding/fieldPermissions`（996 行）：captured/output/ready 不可 F-write；indexed F-write 必须持有 live claim 且目标是该 row 的 status。普通非 row scalar 按既有显式 permission/hook closure 管理。
- `.spec/knowledge/features/gas.md` 的 data-only operation plan、aligned claim/immutable association 规则，以及 ADR-126 P-A/F-A/D1/D5/D7，没有发现额外 whole-component 行成员要求。它们也没有宣称现行 Game 混合声明一定可生成。

Runtime owning：`C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity`，此前核验 base/HEAD `23356eafc365c753b6e8d9987fd069815ff067ce`。本次关键文件实际 hash 见后表。

`tools/gen-declarations/EffectReducerLowering.cs:185` 从完整 supported Sync/SyncList storage 选中同组件/同实体布局的**全部**字段；186 行先判 storage category/capacity 是否统一，因此 Skill scalar + cap-1 lists 报 `unaligned row fields`。191 行随后要求每个所选字段都带 column role。这里实际定义了当前 generator 的严格接受范围。后续 194–209 行仍执行 role、codec、positive status bound、keys、hook-free、named status/ready、唯一 ready 与六身份校验；fact 生成从这个 row 显式列集推导 bindings/outputs/writes/bytes。

`modules/gas/src/Lumio.GameRuntime.Gas/Effect/EffectFactDeclarations.cs:5–24`：EffectRow 是 class 属性；EffectRowColumn 是 field 属性，含 Role/Selector/PayloadFieldId/MaxWrites。现行属性源码没有 whole-component 或 mixed membership 的说明文字。对 Runtime `.spec/knowledge` 及 generator 文档/源码的检索未找到明确 mixed-component 支持说明，不能将 field 属性的自然含义提升为已发布 SDK 的明确兼容承诺。

消费者 `EffectOperationRow.cs` 逐项解析 explicit Columns，验证 layout/category/capacity/codec/hooks/roles；没有 columns count 等于 component field count 的检查。`EffectFactAssociation.cs:31–45` 从 owner/index selectors 捕获 Owner/Index，再验证真实 owner record live 且 layout 恰好等于 row layout；它没有 Owner=Source/Target 等式。证书、storage identity、extent、所有 row values 从 row Columns 计算并验证。

## 未标记列是否会绕过拒绝

把 row membership 改成标记子集，不应删掉普通物理字段登记。当前 `EmitPlans` 建立完整 storage 表、全局 physical indices，并独立处理 hooks。这个步骤必须保留，以免改动 slot/ordinal/key、普通 reducer reads/writes 或 unused-hook 验证。

`EffectOperationValidation.cs:258–275` 验证 SetAt：要求声明可写、非 protected field、live claim local；然后在该 claim row 的 Columns 中寻找同一 field 且 role=status，找不到即拒绝。因此未进入 row 的 SyncList 不能借此变成任意 indexed 写目的地。`EffectOperationClaim.cs` 在运行时还重查完整 association/storage/value 与 status 写界限。普通非 row scalar Write 仍可能按原 permission 合法；普通非 row Read/At/Count 仍可能合法，不能把“未标记”概括为“所有读写都拒绝”。

已有 `EffectFactGenerateTests` 覆盖生成 fixture fact decode、无 reducer 的 metadata；`EffectFactListReadTests.FactReadsFixedSyncListCountAndIndexedScalar` 等覆盖非 row 普通固定 list 读取和禁止 mutation；fixture HitRowsComponent 的字段均带 row 标记。现有 generator 测试源码检索未发现 mixed scalar/list row 或一个未标记 row-component 字段的直接正/负用例。这是支持未来 compiler 修复前的测试缺口，不是现行公开合同要求整组件的证据。本次没有重跑这些测试。

若未来单独实施 generator 修复，最小可靠算法应从**所有显式标记成员**建立候选集合，要求每个成员能在指定实体布局解析到恰好一条受支持 physical storage，再按既有 storage 顺序保留全局 field indices。不能只筛已有 storage 中“碰巧有 marker”的字段，静默遗漏带 marker 的非 Sync、unsupported codec 或不在指定 layout 的成员。必须保留全部 named ready/status、六身份/Tick、unique keys、完整 fact payload/codecs、positive aligned capacity、hook-free、完整 certificate/scratch 与 permissions 校验。专门回归应覆盖 mixed 成功、未标普通字段不入 row、未标 SetAt 拒绝，以及缺身份/错 named status-ready/重复 keys-ready/不同 capacity/有 hook/unsupported marked field/错误 owner layout 拒绝；旧 all-marked 生成计划应保持相同语义。

## Game 独立结构评价与真实验证门

原 freeze `games/101-bomber/.run/resume-capacity-20261003/v14-declaration-freeze-01/source/Gameplay/Components/Bomber/BomberSkillState.cs` 和 `v14-generate-05-server.log` 保留；日志原文为 `effect_invalid_declaration: unaligned row fields`。生成驱动 `generate-v14-05.mjs` 引用 official06 SDK `0.0.4-main.0e2fc74`，并在 server 非零退出时立即断言，不能推断 client 尝试或新结构生成成功。

本次读取正在准备的新 `BomberFireFacts.cs`：EffectRow ownerLayout=BomberParticipantEntity；26 个 Persist/Scope.None/Authority.Server SyncList 均 cap=1；21 captured、3 i64 output、1 bool ready、1 i32 status；MaxStatusWrites=360。含六身份、Tick 及 payload 5–18（SourceKind/Pulse 有实际 captured destination）。这些列在声明层面满足当前 gen uniform membership 模型。Participant 当前 Has 已出现新 FireFacts，源码准备仍在进行；本报告不以跨时刻读取的 Skill/Has/generated 文件组合判为完成或缺陷。

读取的旧 generated server template 仍是 ComponentCount=6（Observer + 五个 state components）。旧 registry concrete Participant layout=4 的 128 条 physical field records 实际占 slots 1–5；Observer 无这些 storage records。故“新组件后预计六个 Native state components”有明确基线依据，但 source Has=7 不等于新 Native binding=6 的实际证明。新增后的真实 Native 个数、slot mapping 和 Root 规定的上限 8 必须由最新产物/真实 Native 注册确认。

后续必须检查真实事项，不能由结构可行替代：

1. 使用同一批准的 official generator 成功生成 server/client；Skill 去掉 EffectRow 与26 lists，保留23新 scalars；只有一个 bomber.fire schema；Participant 新槽真实映射、Player public slots 未变。ledger/component/field keys 及各 concrete physical indices完整、无重复；10101 descriptor/fingerprint/原 damage row 精确保持。
2. 10110 owning descriptor fingerprint、payload selector1–18/owner/index绑定、ownerLayout Participant、row26/cap1、ready/status、write/indexed-write/byte/claim-work/association-scratch/Q 总预算由实际计划/validator核验，而非手算摘要。全局 physical indices 不应由移动后的旧列表索引猜测。
3. Native 实际创建与注册六个 state bindings（Observer 特殊路径保持）；完整源/产物/Runtime/Native identities 固定。不能用旧 registry、DLL 或仅 managed source Has 数量作成功证据。
4. Producer 在真实 victim Participant row0 reserve，10110 Owner 与 captured participant 一致；Target/Life 是真实当前受害者身体，Source 是真实原始 Burn/Aura/trail，SourceKind/Pulse 独立于随后变化的 selected coverage。单行 pending 时按批准的保留/重试规则阻挡下一 pulse，不覆盖已接受行。
5. 一旦 admission 成功，row count/shape/storage/full keys/status/ready/certificate 在结果窗口和所有 reducer leases 结束前不能移除、复用或重分配。Participant 虽较身体长寿，仍要检查其退房/销毁与 lease 生命周期；拒绝 admission 的 reservation 普通清理与 admitted Rejected 分支分别验证。
6. 真实 Native RED/GREEN 覆盖恢复和 malformed memory、old source/new life generation、拒绝保护/Bubble、重叠曝光/重复 pulse、Source 死亡/消失归因、10110 lethal outcome、kill/death/boss_down、LastDamageTick、下一阶段身体结构退休和重生。现有 explosion-only HitParticipants/10101 consumer 分支不能自动当 fire death 支持。

DamageFacts 仅绑定 BomberBombEntity；Aura Player/FireZone 的 Source 不能直接作为该 row Owner。全功能复用现有24列还缺 SourceKind/Pulse，合并为26列会改10101 schema/fingerprint；追加独立26列会 duplicate identities/ready且不支持多 EffectRow。以上替代均不能当本次最小方案或全功能已完成。

## 精确证据身份与限制

SHA256（按实际文件字节；Game 源码准备继续时，下面仅标记本次读到的快照）：

| 文件 | SHA256 |
|---|---|
| Engine effect-lifecycle-v1.json | `2d44e039770920de13a8dd335278bcc34e2792dac9c9ff707731185009083102` |
| Engine gas.md | `1abdd3fb0c692677a589413005a8b8ca9a0a53d3605d5eec2dd9c9dea68a078d` |
| Engine ADR-126 | `5f34879e5c711ffc2585a3199d66a0a5a58ae7529d057380d2a8ca4f20ab4c0b` |
| Runtime EffectReducerLowering.cs | `92557e8fecd5cf7598f2512925d7c53d3247fee65a074f96b8bfd2835d8e3746` |
| Runtime EffectFactDeclarations.cs | `cbf70439c2d12485f7618b49e8866457d20e2f98f55fbde45af3a3b3284ad433` |
| Runtime EffectOperationRow.cs | `803306f5d06c796a0e8424081d1ddd74254472301c45d9f4c7f1cbf72526fcd8` |
| Runtime EffectOperationValidation.cs | `ca8c14ebd7e2a7af627e56bb08137fb024332cdacfd8bb2ce7b71b6b9f4107e6` |
| Runtime EffectFactAssociation.cs | `a6d79b9f543f6138f4ce914867a65adce55527e3d9ec75c8d2e1bbfa50177f13` |
| EffectFactGenerateTests.cs | `084f16aa6daf1e379676fbf5b73fd24f1999a4bf0ea7cae8fcb0fd4cec16bdc5` |
| EffectFactListReadTests.cs | `fa59d1390213ee7b5802bc1b2435dc8ee9aa5f8e58a9363771f314b00431665d` |
| Frozen mixed Skill source | `7bc2fe26cc3bd357c48bdefbdb5cec386956794ff27566242ca50b6601e7e6ec` |
| Official generation05 server failure log | `b238bb9d0525080333b5a427c04b5534be4d1cf8e36df866f850f9ecb3cded4e` |
| In-progress BomberFireFacts.cs read snapshot | `c547a37b69f8621ec71c87dbf50c6f734b94352c9d17e54a5100ea5d89bf1a67` |
| In-progress Participant Has read snapshot | `2c03d5aeaef74f2c489941f6c073b212c4ce4c8d500b0a6105b122d9007cf89b` |
| Old server registry read snapshot | `0db41de1e2663042afe821f7dd2dc0e7ac4a1b250c59b8e1ba46f98085bcd52b` |

证据范围是源码/机器合同/已有日志只读核验及低内存文本计数。静态计数确认新 row26/cap1，旧 Participant physical slots1–5；不等于执行消费者校验。本次未验证新 Game 产物、Native 注册、完整玩法、现行全部 tests，也未发布任何新官方包。无须因本报告阻断已授权的最小 Game 结构准备；完整生成与真实行为检查仍必须完成。
