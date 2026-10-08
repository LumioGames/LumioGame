# 正式结果与高光的 TS 消费

范围：`games/101-bomber/Client/Presentation/` 下 `replica-types.ts`、`replica-adapter.ts`、`contract/snapshot.ts`、`hud/stats-tracker.ts` 及两个对应测试。未改 C#、Schema、生成物或任何玩法规则。

## 结果

- 正式统计与终局行消费 `deaths`、`peakHealthPoints`、`bossKills`、`clutchEscapes`、`goldenHeartPickups`、`specialBombHistory`，终局冻结总数优先于实时统计；合法零值同样覆盖本地推导。
- 特殊弹历史使用已激活配置的 `bombSkills` 与 `skills` 映射 config skill row ID 为现有 SkillId，按首次顺序去重，不混入角色技能、未知项或原型组合技。协调者已确认 §13 不另列角色固有技能。
- 玩家一旦具备权威 `clutchEscapes`，不再按低血量快照或 `finalizeClutch` 增加计数。新局 reset 清除此标记与字段可用性。
- 即使所有 Life 和旧事件已消失，保留的 Participant/结果仍能提供死亡次数、最高心数、技能历史与 Boss/金心高光。角色来自当前 Match 的持久投影，覆盖旧缓存动物；其他 Match 的结果不能污染当前角色。
- 旧表现夹具在新统计字段缺席时仍沿已有事件/快照行为；正式 Replica DTO 要求新字段完整，不用原型模拟器补真值。

## 实测

证据根 `games/101-bomber/.run/durable-results-ts/`：

| 项目 | 实际结果 |
| --- | --- |
| 初始 5 个缺口 RED | 24 中 5 失败、19 通过，exit 1，`red-01` |
| 最小修复 GREEN | 24/24，exit 0，`green-01` |
| 完整 HudBrain 迟加入结算消费 | 聚焦 25/25，exit 0，`green-02` |
| 缓存角色/跨 Match 两个新增 RED | 21 中 2 失败、19 通过，exit 1，`character-red-01` |
| 最终 Presentation 全量 | 674/674，53 文件，0 失败/跳过，exit 0，`full-02` |
| 最终 TypeScript 与 Vite build | 133 modules，exit 0，`build-02` |

HudBrain 用例经过正式 Adapter → StatsTracker → 结算表/高光分配，验证无历史事件时 Boss 与金心卡的确切归属和值，以及重复快照不再次结算。数据源是新正式投影形状夹具，不宣称替代 C# 复制/真实多人整局；协调者负责把同步新增的 C# 声明/生产统计/Dump 与本切片一起生成、构建并做真实复制验收。

冻结 6 文件：`.run/durable-results-ts/freeze-01/manifest.json`，含原文件 SHA256、副本和证据哈希。仓内既有未提交/未跟踪成果未被整批提交或覆盖。
