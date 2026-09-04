# 0016 · 炸弹人场景改为三维坐标与 ECS 外的地形存储:实体恒 Z=0、地形走 ITerrainStore、地图以数据持久化

- 日期:2026-09-04
- 状态:生效

## 背景

ADR [0015](0015-bomber-stage0a-runtime-capability-finding.md) 锁定「软砖/据点等地图格子在 Stage 0a 是 Game 自有 EcsComponent」,G-0 契约据此把网格的具体表示留给 G-4(`stage0-kernel-contract.md` §1「明确不在本冻结物内」),G-4 卡进一步要求「新定义一个 Game 自有的网格 Component(字段=每格材质枚举)承载整张地图」。

2026-09-04 对 sibling `LumioGameRuntime` 的直接核验证伪了这条实现路径:`modules/ecs/src/Lumio.GameRuntime.Ecs/Sync/SyncTypes.cs:216` 的 `Sync<T>` 文档注释原文是 "Replicated scalar",每个字段一个 `SyncSlot<T>`、一个 ordinal、一个 attributeId,由 `gen-declarations` 逐字段绑定(现有 6 个 Component 共 `FieldCount = 34`),**没有数组、集合或 blob 字段类型**。19×19 = 361 个字段已不可维护,[`design.md`](../../docs/specs/bomber/design.md) §5 的 61×61 = 3721 个字段不可能。唯一的绕法是把整张地图编码进一个 `Sync<string>`,但那样每炸掉一格都要全图重传,且每次写入都对整张地图做一次相等比较——正是分块存储要避免的事。

同时,仓内存在两套互不相容的坐标口径:炸弹人 Stage 0a 契约的 6 个 Component 全部只有 `CellX/CellY`(二维),而体素侧是三维——[`mvp-placevoxel-content-spec.md`](../../docs/specs/engineering/mvp-placevoxel-content-spec.md) §5.1 的 `PlaceVoxelCommand` 是 `Cell: int32 ×3`,架构 v1.4 的 ChunkId 键是 `c:x:y:z`。用户 2026-09-04 定调:炸弹人本质是 3D 体素世界,Stage 0 阶段在俯视角下平铺呈现,但**代码只有一套**,不做二维与三维两份实现。

## 决策

- **坐标一律三维。** 全部 Cell 类字段升为 (X, Y, Z);实体(玩家、炸弹、帽堆、掉落物)在 Stage 0a 恒 `Z = 0`,不做垂直移动;地形分层:`z = -1` 地面层、`z = 0` 砖层、`z ≥ 1` 预留。爆炸传播函数接受三维方向表,Stage 0a 只填 `±X` / `±Y` 四个水平方向,`±Z` 留空。`design.md` §5.3 的可玩性断言在单层前提下语义不变。
- **地形不进 ECS,走 `ITerrainStore`。** 取代 [0015](0015-bomber-stage0a-runtime-capability-finding.md)「网格为 Game 自有 EcsComponent」一条。接口形状照 Voxel 的分块布局定义:`GetBlock(x, y, z) -> MaterialId`、`ApplyBatch(mutations, expectedRevision) -> Result`、`ChunkRevision(chunkId) -> u64`。Stage 0a 的实现是 Game 自有的 `InMemoryChunkStore`;Stage 2 起换成 `VoxelWorldStore`,**只换实现不改调用方**。0015「真实 Voxel 集成留给 Stage 2+」及其 A2 / A8 前置继续有效。
- **动态物是 Entity,地形是数据。** 炸弹、帽堆、掉落物、补给箱、玩家是 ECS Entity;硬砖、软砖、空地、水、木箱、木头、鞭炮、冰是地形方块。木箱按 `design.md` §5.1 归地形(其「必掉」是材质行的掉落字段),与 §8.6 的小补给箱(带命中计数的实体)是两个不同的东西。
- **地图以数据持久化,不再只靠 seed。** `scenario.json` 携带地形数据本身,取代「只存 `mapSeed`、每次从 seed 重生成」。理由:生成器代码一改,全部历史回放基线会静默失效;且 [`ugc-ladder.md`](../../docs/specs/ugc-ladder.md) L1 的地图编辑器本就要产出同一份数据,两处复用一个格式。
- **Stage 0a 地形不分帧、全提交。** 内存存储下批量写入不构成瓶颈;分帧提交策略与每 tick 预算属 Voxel 侧与 A8 的范围,本仓不自定。连锁不设上限,本仓只提供尖峰数字(见下)。
- **方块目录与行为绑定分属两仓。** 方块目录(世界里存在哪些方块、外观与存储)是平台级公共材质库,归 Voxel 侧;每个方块在炸弹人里的行为绑定(可破坏、阻断爆炸、破坏后残留、掉落、地面效果、可通行)归本仓、随 `GameReleaseId` 锁定。依据是 `LumioVoxelEngine` README「不实现 Ability、Effect、Attribute、Tag、背包、权限、扣费、战斗或其他 Gameplay 判断」与 `mvp-placevoxel-content-spec.md` §6.2「MaterialId 是本仓拥有的产品语义目录;Voxel 侧按不透明 uint16 存取,VoxelEngine 不解释其含义」。同一块「水」在炸弹人是阻断爆炸 + 禁止放弹,在别的产品可以是别的语义。
- **地形快照口径对齐上游。** 地形必须能产出确定性 canonical 字节以支撑同 Seed 回放对账,编码对齐架构源的 `voxel-snapshot-payload`(ADR-035,随 `LGE-V1.4-2026-08-27` 冻结)。硬要求是同一份地形两次编码逐字节相同。实现归 Voxel 侧,本仓只登记诉求。
- **向 Voxel 侧登记的写入量。** 单次爆炸 ≤ 24 格(火力上限 6 × 4 向,`design.md` §7.4 已有);**一条连锁最坏约 1200 格 / 单 tick**(100 人、约 50 颗弹并入同一 ChainId);稳态破坏 100–300 格 / 秒;出生点清软砖 ≤ 2 格 / 次、峰值约 33 次 / 秒。登记进 [`risks-and-engine-asks.md`](../../docs/specs/risks-and-engine-asks.md) A8。
- **锁与不锁:** 锁三维坐标、地形出 ECS、`ITerrainStore` 的三个方法、动态物与地形的划分、地图以数据持久化、目录与行为绑定的两仓划分。不锁 chunk 尺寸(架构源 VOX-D-001 未决)、不锁 `ITerrainStore` 的失败语义细节、不锁地形数据的具体序列化格式(进 G-0 契约 v1.1 与 G-4)。

## 后果

- 取代 [0015](0015-bomber-stage0a-runtime-capability-finding.md) 的「软砖/据点等地图格子在 Stage 0a 是 Game 自有 EcsComponent」与「六个实体类型与组件挂载」两条;0015 其余条款(不经 Runtime Processor、不经 CrossWorldTxn/IVoxelWorldPort、命令 / 事件 / 端口为 Game 内部纯 C# 类型)继续有效。其「Runtime 无公开 Processor 注册面与 IVoxelWorldPort」的核验结论不受影响。
- `stage0-kernel-contract.md` 升 v1.1 并重新计算冻结物 sha256;`design.md` §5 / §5.1 / §5.2 / §5.3、`stage0-test-matrix.md`,以及 **G-1 / G-4 / G-5 / G-6 / G-7 卡**按本 ADR 改写——G-5 因新增 Config 键、G-6 因 StateHash 须覆盖地形且 `scenario.json` 携带地形数据、G-7 因遥测事件增删,漏改任一张都会让执行者拿到一个绿色但错误的验收。
- Stage 2 的「换成真实 Voxel 存储」从「替换一份 Component 状态」变成「替换 `ITerrainStore` 的一个实现」,调用方零改动。代价是 Stage 0a 要多写一层看似多余的分块与 revision 机制。
- 地图存数据使 `scenario.json` 变大(61×61×2 层约 7442 格),换来生成器可自由演进而历史回放不失效。
- 三维坐标使全部 Cell 字段多一个分量,`Sync` 字段总数上升;Stage 0a 这些 Z 分量恒为 0,复制开销可由后续量化压缩处理,不在本 ADR 范围。
