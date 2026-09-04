# 0019 · 炸弹人地形口径对齐上游体素契约:坐标映射、BlockId、blockRead / blockWrite 形状

- 日期:2026-09-04
- 状态:生效

## 背景

ADR [0016](0016-bomber-terrain-out-of-ecs-3d-coords.md) 定 `ITerrainStore` 时,上游只有 `LGE-V1.4-2026-08-27` 的只读镜像。此后架构源换了仓(`LumioGameEngine`),并冻结了体素世界的公共契约 `engine/wire/voxel-world-v1.json`(`contractId: lumio.voxel-world.v1`),配套设计概要在同仓 `.spec/knowledge/features/voxel.md`(模块图 M1–M10)。2026-09-04 对这两份的逐条核验证伪了 0016 的六处依据:

1. **16³ 的数据单元叫 Section,不叫 Chunk。** Chunk 是 16×256×16 的列,`carriesData: false`,不持有独立 revision;版本锚点在 Section 上。契约 `layering.namingDiscipline` 点名了这条纠正。
2. **竖直轴是 `y`,且无符号。** Section 键 `s:<x>:<y>:<z>` 的 y 是 uint8 0–15,世界高 256 格(`limits.worldHeightBlocks`)。**负竖直坐标在键语法上不可表示**——0016 的 `z = -1` 过不了这条边界。
3. **格值是 32 位无符号 BlockId** = `BlockType << 8 | BlockState`,引擎按 BlockType 查材质类表解释它(网格 / 渲染通道 / 碰撞 / 透光四轴)。0016 引 `mvp-placevoxel-content-spec.md` §6.2「不透明 uint16、VoxelEngine 不解释其含义」已被取代;`blockId.unsignedDiscipline` 另明写「用有符号 int32 承载会变成负数」。
4. **尺寸已冻结。** `limits` 段锁死 Section 16³、每 Chunk 16 层、世界高 256、调色板 256 项 / 索引 8 位,`notes` 原文「改动它等于全量转档,没有例外」。0016 依据的 `VOX-D-001` 那张 gate 卡仍在且 approved,但它自述 "does not freeze a public Chunk extent"——它从来不是「尺寸未决」的依据。
5. **`voxel-snapshot-payload`(ADR-035)定的是 snapshot 载荷信封,从不定义方块字节。** 拿它当地形 canonical 字节的口径是错的。
6. **方块目录的内容是游戏配置,不是引擎交付物。** `blockCatalog.mintingProcedure` 原文「官方内容层在目录里加一行;**实现仓不得自行铸号**」。0016 把方块目录整体判给 Voxel 侧,判错了半边:引擎给的是段表、材质类的两个类与四轴、目录行结构与铸号规程(机制),表里填哪九种方块、什么外观、归哪一类(内容)归本仓。

同日该契约再扩一版,新增 `blockCatalog` / `blockRead` / `blockWrite` 三段,把玩法侧的读写形状写死了——正是 0016 当时只能自拟的那部分。

## 决策

- **游戏坐标不动,映射做在 `ITerrainStore` 边界上。** 游戏侧继续用 (X, Y, Z)、`z = -1` 地面层 / `z = 0` 砖层 / `z ≥ 1` 预留、实体恒 `Z = 0`(0016 该条保留)。到引擎坐标的映射是 **游戏 (X, Y, Z) → 引擎 (x = X, z = Y, y = Z + 1)**:游戏 `z = -1` → 引擎 `y = 0`,游戏 `z = 0` → 引擎 `y = 1`。映射只出现在 `ITerrainStore` 的实现里,玩法代码一行不改。
- **`ITerrainStore` 改照 `blockRead` / `blockWrite` 定形,取代 0016 的三方法签名。**
  - 读三种请求:单格、列(一个 (x, z) 加 y 范围)、盒(轴对齐矩形,固定序 y 外层 / z 中层 / x 内层)。**每个结果必须带取自的 `sectionRevision`**,并按 Section 分段标注 Ready / Unchanged / Pending / Unavailable 四态。
  - `ChunkRevision(chunkId)` **删除**——revision 随读结果返回,且 Chunk 本来就不持有 revision。
  - 写条目形状 `{sectionKey, cellOffset, blockId, expectedSectionRevision}`,整批一个 `transactionId`,all-or-nothing 且幂等。
  - **`expectedRevision` 的粒度从「整批一个」改为「每条目一个」**——单次爆炸 ≤ 24 格会跨多个 Section,整批一个 revision 表达不了。
- **格值类型 `MaterialId`(uint16)改为 `BlockId`(uint32 无符号)。** 玩法层不得对 BlockId 直接做位运算,一律走转换函数(契约 `blockId.consumerDiscipline`)。
- **读结果必须能表达「不知道」。** Stage 0a 的 `InMemoryChunkStore` 永远返回 Ready,但接口现在就要留出 Pending / Unavailable 两态,否则 Stage 2 换实现时全部调用点要改。缺块不得填空气、不得填 0、不得省略(`blockRead.presence.missingIsNotAir`)。
- **StateHash 的地形那一半改由确定性 box 读定义,取代 0016 的「编码对齐 `voxel-snapshot-payload`」。** `blockRead` 的 box 请求已冻结「顺序排死,同一请求两次运行逐字节相同」,故地形哈希 = 对「一次覆盖全图的 box 读结果(固定序 BlockId 数组)」求 SHA-256。不再需要引擎提供地形 canonical 存档字节。
- **方块目录的内容归本仓。** 九种方块(Air / 铁皮 / 积木 / 木箱 / 木头 / 鞭炮 / 地面 / 水 / 冰)按 `blockCatalog.rowShape` 六字段登记进**官方全局段**(作用域位 = 0,256 起连号稠密):它们跨房间恒定、玩法代码要写常量,且起床战争与 duckoff 大概率复用同一批。房间局部段是玩家素材库,不放官方内容。材质类只用 Solid 与 Liquid 两类。
- **「阻断爆炸」不是引擎的轴。** 引擎材质类只声明 mesh / renderPass / collision / lightAttenuation 四轴,且 `Liquid.collision = passable`——**引擎的水不挡路**。水阻断爆炸、禁止放弹、溺水全是本仓配表的玩法列,读 BlockId 后自己判,不走引擎碰撞面。
- **撤销三条对引擎的诉求。** ①「极扁世界的 chunk 尺寸需确认」——`limits` 已冻死;②「需要引擎给每 tick 阈值,超了就下调火力上限」——Delta 编码每条 6 字节是契约数字,1200 格 = 7.2 KB / 客户端 / tick,不下调火力、不做分帧提交;③「方块目录(公共材质库)」——降级为本仓配置项。

## 后果

- 0016 的以下条款被本条取代:`ITerrainStore` 的三方法签名、`MaterialId` 类型、「地形快照口径对齐上游 `voxel-snapshot-payload`」、「不锁 chunk 尺寸」、「方块目录归 Voxel 侧」、「分帧提交策略与每 tick 预算归 Voxel 侧决定」。0016 其余条款(坐标一律三维、地形不进 ECS、动态物是 Entity 而地形是数据、地图以数据持久化、实体恒 `Z = 0`)继续有效。
- `stage0-kernel-contract.md` 升 v1.3.0。**冻结物 sha256 不变**——`ITerrainStore` 明确不在 `Bomber/Contracts/**` 内(该契约 §4 自述),本条改动一行 C# 都不碰冻结面。
- G-1 / G-4 / G-6 卡的接口口径随之改写:G-4 出四态读与每条目 revision 的写;G-1 的十字传播改用**列读**(每步一次拿到两层),不再是逐格单读;G-6 的 StateHash 改用 box 读。卡在 `.workflow-drafts/` 的本地 bundle 里,不入库。
- 仍待引擎侧答复四条,登记进 [`risks-and-engine-asks.md`](../../docs/specs/risks-and-engine-asks.md) A9:`cellOffset` 的确切算式、区域常驻声明、`behaviorTemplate` 可用清单的登记处、单格读的缺块表达。前两条 P0。
- 本条只对齐口径,不引入实现。Stage 0a 仍然零 Voxel 依赖,`InMemoryChunkStore` 照做;真实 Voxel 集成的前置仍是 A2 与 Runtime 侧那两条(ADR [0015](0015-bomber-stage0a-runtime-capability-finding.md))。
