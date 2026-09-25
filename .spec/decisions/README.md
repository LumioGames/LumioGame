# Decisions(决策记录 · ADR)

用 ADR(Architecture Decision Record)记录决策:为什么这样调度、为什么定这种结构、为什么划这条边界。**本目录是全仓决策记录的唯一落点**——功能内决策与框架级决策都记这里,feature 文档只描述设计现状,不留决策记录。

> 跨仓公共语义的决策只在架构仓 `LumioGameEngine` 维护；本目录仅记录 Game 产品实现决策，从 `0001` 开始编号。

## 怎么写一条 ADR

- 一个决策 = 一个文件 `NNNN-<slug>.md`,编号从 `0001` 递增;写完在下方索引加一行。
- **一旦记录不改写**:被推翻就新增一条,把旧的状态标成「被 NNNN 取代」,历史留痕。
- 无 frontmatter。格式照抄:

      # NNNN · <一句话决策>

      - 日期:YYYY-MM-DD
      - 状态:生效 | 被 NNNN 取代

      ## 背景
      面对什么问题。

      ## 决策
      定了什么。

      ## 后果
      接受了什么代价。

## 索引

| 编号 | 决策 | 状态 |
|------|------|------|
| [0001](0001-art-director-skill-family.md) | 美术总监做成 art-* 技能族而非子 Agent | 生效 |
| [0002](0002-design-specs-landing-point.md) | 策划案与美术规范统一落 docs/specs/ | 生效 |
| [0003](0003-design-director-skill-family.md) | 策划总监做成 design-* 技能族而非子 Agent | 生效 |
| [0004](0004-art-skill-family-iteration-1.md) | art-* 第一次迭代:骨架对齐实际文档、技术合规门禁前置 | 生效 |
| [0005](0005-skill-description-as-routing-basis.md) | skill 的 description 改为「宿主路由依据」口径 | 生效 |
| [0006](0006-bomber-hat-scoring-rolling-room.md) | 炸弹人核心循环改为帽子计分乱斗,会话模型改为滚动房间 | 被 0011 取代 |
| [0007](0007-art-style-reset-three-way-pitch.md) | 美术风格框架推翻归零,进入三方向比稿 | 生效 |
| [0008](0008-worldview-animal-plush-party.md) | 世界观定调「动物玩偶派对」 | 生效 |
| [0009](0009-entity-chat-csharp-mvp-host.md) | 101-entity 联调用 Game 仓 C# MVP Room 宿主 | 被 0010 取代 |
| [0010](0010-entity-chat-requires-mvp-host.md) | 101-entity SUCCESS 必须由 sibling lumio-mvp-host 实连 | 被 0022 取代 |
| [0011](0011-bomber-100-player-io-gear-slots.md) | 炸弹人升级为 100 人 .io 混战,新增 3 槽装备与击杀铸帽 | 被 0012 取代（「帽子只来自击杀」另被 0027 修订、0028 取消） |
| [0012](0012-bomber-hearts-replace-one-hit-kill.md) | 炸弹人由一击即死改为三颗心血量,单发削血、连锁秒杀 | 被 0014 取代 |
| [0013](0013-logic-first-browser-client-no-engine.md) | 交付顺序逻辑先行、表现最后接;后续客户端暂定浏览器,首发不接任何游戏引擎 | 生效 |
| [0014](0014-bomber-v04-stage0-convergence.md) | 炸弹人采纳 v0.4 收敛:Stage 0 前置、官方房范围收敛、据点改补给、装备替换需确认 | 生效（血量表示一条被 0017 取代；终局演出 / 不用致死收缩圈 / 死亡不清糖果与无出局观战被 0025 取代；HatPile 被 0028 取代；首发不做角色 / 装备替换确认 / 首测技能清单被 0030 取代） |
| [0015](0015-bomber-stage0a-runtime-capability-finding.md) | Stage 0a 不依赖 Runtime Processor 与公开 CrossWorldTxn/IVoxelWorldPort,网格改为 Game 自有 EcsComponent 状态 | 生效（「网格为 EcsComponent」一条被 0016 取代,Runtime 能力核验结论继续有效） |
| [0016](0016-bomber-terrain-out-of-ecs-3d-coords.md) | 炸弹人场景改为三维坐标与 ECS 外的地形存储,地图以数据持久化 | 生效（`ITerrainStore` 三方法签名、`MaterialId` 类型、地形快照口径、不锁 chunk 尺寸、方块目录归属、分帧提交归属六条被 0019 取代,其余继续有效） |
| [0017](0017-bomber-explosion-and-health-model.md) | 炸弹人爆炸与血量模型修订:炸弹实体持有火焰、血量改半心点、水改为可溺死 | 生效 |
| [0018](0018-bomber-k1-k2-resolution.md) | 解决契约 v1.1.0 的两条缺口:DamageApplied 补来源炸弹身份、两个区间默认值收敛为单值 | 生效 |
| [0019](0019-bomber-terrain-align-voxel-world-contract.md) | 炸弹人地形口径对齐上游体素契约:坐标映射、BlockId、blockRead / blockWrite 形状 | 生效 |
| [0020](0020-exit-legacy-contract-regime.md) | 退出旧合同制:删架构镜像与基线闸门,公共语义改指架构仓 Living Architecture | 生效 |
| [0021](0021-bomber-contract-v2-align-engine-second-exemplar.md) | 炸弹人 Stage 0 契约升 v2.0.0,六个环节改按架构第二样板重写 | 生效 |
| [0022](0022-retire-entity-chat-harness.md) | entity-chat harness 整体退役,101-entity 端到端验收交由 Sample 11 场景链承接 | 生效 |
| [0023](0023-wire-contract-pinned-in-tests.md) | 契约一致性测试在测试期直接读架构仓 wire JSON,缺检出即失败 | 生效 |
| [0024](0024-per-game-directories-and-101-web-prototype.md) | 仓库按游戏分目录,炸弹人为 101;网页原型作为抛弃型参考落在 games/101-bomber/prototype | 生效（原型内容范围与「表现层不得依赖 NON-CONTRACT 字段」被 0030 取代） |
| [0025](0025-bomber-final-circle-and-death-drops.md) | 炸弹人终局改为「最后一命决赛圈」,死亡掉落一半强化 | 生效（帽子资源条款被 0028 取代；90 秒 / 6 分钟封顶 / 3 段安全圈 / 恒定毒速 / 按帽子数定胜负 / 锁入 ≤ 90 秒被 0031 取代） |
| [0026](0026-bomber-small-map-regen-and-resource-trigger-gate.md) | 19×19 档也做软砖再生,资源触发决赛圈只在再生停止后生效 | 生效 |
| [0027](0027-bomber-powerup-pickup-mints-hat.md) | 炸弹人吃一个强化铸一顶帽,帽子塔同时表示「谁最富」 | 被 0028 取代 |
| [0028](0028-bomber-hats-are-powerup-count.md) | 炸弹人取消独立的帽子资源,帽子只表示身上的强化数 | 生效（局终帽子最多者胜被 0031 取代） |
| [0029](0029-bomber-death-drops-blast-protection.md) | 死者掉出的强化落地后 3 秒内不会被爆炸摧毁 | 生效 |
| [0030](0030-bomber-characters-exclusive-skills-and-combos.md) | 炸弹人开局选角色:四个角色各带一个专属技能,局内开出技能糖,两个技能凑齐自动进化 | 生效 |
| [0031](0031-bomber-final-circle-to-one-cell-last-survivor-wins.md) | 炸弹人决赛圈一直缩到 1×1、只剩一人立即结束:活到最后者胜,整局封顶 7 分钟 | 生效 |
| [0032](0032-bomber-movement-dual-direction-and-doll-footprint.md) | 炸弹人手感补充:同按两个方向走得通的那个、转角吸附 0.5 格、玩偶视觉占地不超过 0.7 格 | 生效 |
