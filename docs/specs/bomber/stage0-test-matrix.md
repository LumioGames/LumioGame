# 体素炸弹人 · Stage 0a 用例矩阵

> **状态**：已冻结 v1.0.0
> **序位 / 适用范围**：G-1..G-7 实现卡与 I-1 集成收尾的风险驱动用例清单
> **上游**：[`stage0-kernel-contract.md`](stage0-kernel-contract.md)、[`design.md`](design.md)

按 `.spec/AGENTS.md`「测试先行」纪律，每条在对应实现卡先写失败测试（Red）再实现（Green）。「自动化层级」标注证据的最低要求；「消费卡」标注负责实现与验证的卡。

## 1. 传播

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 1.1 | 炸弹引信到期 → 十字四向逐格推进，遇硬砖立即阻断 | G-1 | 单元 |
| 1.2 | 遇软砖 → 摧毁该格后阻断（不越过） | G-1 | 单元 |
| 1.3 | 遇他人炸弹 → 立即并入同一 `ChainId` 引爆（同 Tick 递归完成） | G-1 | 单元 |
| 1.4 | 单次爆炸摧毁格数上限 24（火力上限 6 × 4 向） | G-1 | 单元 + 边界 |
| 1.5 | 放弹：同格已有炸弹或超过 `BombCapacity` → 拒绝 | G-1 | 单元 |
| 1.6 | 离格穿透：放弹者离开该格前可穿过；离开后重新进入被阻挡 | G-1 | 单元 |

## 2. 连锁与结算

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 2.1 | 同一颗炸弹对同一玩家 → 最多命中一次 | G-1 | 单元 |
| 2.2 | 同一 `ChainId` 对同一玩家累计伤害 → 不超过心数上限 | G-1 | 单元 |
| 2.3 | 三颗同链炸弹对满心（3）玩家 → 第三颗致死，第四颗不再产生 `DamageApplied` | G-1 | 单元 |
| 2.4 | 每次扣心 → 恰好一条 `DamageApplied` 事件，字段含来源炸弹/主人/ChainId | G-1 | 单元 |
| 2.5 | 同一 Tick 内完成整条链的权威结算（非跨 Tick） | G-1 | 单元 |

## 3. 血量与死亡

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 3.1 | 心归零 → `PlayerDied`，Killer=打掉最后一颗心的炸弹主人 | G-1 | 单元 |
| 3.2 | 自杀（自己的炸弹打掉自己最后一颗心）→ Killer==Victim | G-1 | 单元 |
| 3.3 | 死亡 → `RespawnAtTick = 死亡 Tick + respawnMs` | G-1 | 单元 |
| 3.4 | 重生 → 满心、位于合法出生候选格、带 `ProtectedUntilTick` | G-1 + G-4（出生点查询） | 单元 |
| 3.5 | 保护期内 → 不受伤；玩家放弹 → 保护立即解除 | G-1 | 单元 |

## 4. 帽子守恒与竞争

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 4.1 | 击杀（killer≠victim）→ killer.HatCount +1 | G-2 | 单元 |
| 4.2 | 死亡 → victim 全部帽子散落为 3–6 个 `HatPile`，落在死亡点周围可通行格 | G-2 + G-4 | 单元 |
| 4.3 | 散落 0/1/5/50/500 顶 → 仍只生成 ≤ 6 个 `HatPile`，Count 总和守恒 | G-2 | 单元（边界） |
| 4.4 | 同 Tick 两人进入同一 `HatPile` → 恰好一人转移成功（确定性顺序） | G-2 | 单元 |
| 4.5 | `ExpireAtTick` 到期 → 回收并发 `HatPileExpired`，计入销毁量 | G-2 | 单元 |
| 4.6 | 玩家退出 → 帽子走同一散落路径 | G-2 | 单元 |
| 4.7 | 任意时刻：Σ玩家 HatCount + Σ HatPile.Count + 累计超时销毁 == 累计铸造数 | G-2 | 单元 + 长跑断言（I-1） |
| 4.8 | 帽王判定：每次 HatCount 变化 → 重新判定最高者，变更发 `HatKingChanged` | G-2 | 单元 |
| 4.9 | 结算：按 HatCount 排序名次，并列同胜 | G-2 | 单元 |

## 5. 拾取与上限

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 5.1 | 软砖摧毁 → 按 `dropRatePermille` 与权重决定是否生成 `PickupItem`（固定 Seed 下序列可断言） | G-3 | 单元（确定性） |
| 5.2 | 拾取 → 走过即生效；`BombPower`/`BombCapacity` 上限 6，`SpeedTier` 达上限 | G-3 | 单元 |
| 5.3 | 达上限时拾取 → 不生效，物品留地 | G-3 | 单元 |
| 5.4 | 掉落物被后续爆炸覆盖 → 销毁并发事件 | G-3 | 单元 |

## 6. 地图断言

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 6.1 | 双密度指标（`potential_walkable_cells_per_player`/`initial_open_cells_per_player`）落在目标带，否则换 Seed 重生成 | G-4 | 单元 |
| 6.2 | 软砖全清后 → 任意两可通行格连通 | G-4 | 单元 |
| 6.3 | 每个可通行格 3 秒内可达一处掩体（硬砖阵列） | G-4 | 单元 |
| 6.4 | 出生候选点 ≥ 8 个，各带 L 形 3 格安全区，彼此距离 ≥ 6 格 | G-4 | 单元 |
| 6.5 | 四象限镜像对称（软砖分布随机但镜像同步） | G-4 | 单元 |
| 6.6 | 5 个固定 Seed 快照 → 逐格比对，防生成器回归 | G-4 | 快照回归 |

## 7. 回放确定性

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 7.1 | 同一 Seed + Config + 命令流 → 两次运行逐 Tick `statehash.ndjson` 相等 | G-6 | 集成（真实运行） |
| 7.2 | 篡改任一哈希行 → oracle 判 FAILED | G-6 | 集成 |
| 7.3 | 空 `commands.ndjson`/`statehash.ndjson` → oracle 判 FAILED（不得合成行） | G-6 | 集成 |
| 7.4 | 19×19 场景 → 可无渲染连续运行 10 分钟不崩溃 | G-6（Gate 0 退出条件） | 集成 |
| 7.5 | 8 Bot 30 分钟长跑 → 无异常退出、无实体卡在不可重生/不可拾取状态 | G-6 + I-1 | 集成（真实运行） |

## 8. 遥测完整性

| # | 输入 → 期望 | 消费卡 | 自动化层级 |
|---|---|---|---|
| 8.1 | §17.1 全部 18 个事件 → 均有 JSON Schema 与合法样例，样例通过校验 | G-7 | 单元 |
| 8.2 | 缺必带字段（matchId/playerId/tick/…）→ 校验失败 | G-7 | 单元 |
| 8.3 | 一次 6 分钟 Bot 运行的 JSONL → 报告工具产出完整报告（体验指标中位数、帽子经济七项、性能项） | G-7 + I-1 | 集成 |
| 8.4 | Sink 写入 → 不在 Simulation Thread 同步阻塞（压力测试或代码审查证据） | G-7 | 单元/审查 |

## 9. Runtime 接入核验（已在 G-0 完成，登记供 REV-1 核对）

| # | 断言 | 证据 |
|---|---|---|
| 9.1 | 6 个自定义 EntityType/Component 注册、创建、Tick、快照全部成功 | `RuntimeIntegrationProbeTests.AllSixEntityTypesRegisterCreateAndParticipateInSnapshot` |
| 9.2 | 同一命令序列在两个独立 World 上产出逐字节相等快照 | `RuntimeIntegrationProbeTests.SameSeedAndCommandSequenceProducesByteIdenticalSnapshotOnTwoIndependentWorlds` |
| 9.3 | Runtime 无公开 Processor 注册面、无公开 IVoxelWorldPort（阻塞项，已定案不等待） | `docs/specs/bomber/stage0-kernel-contract.md` §0 |
