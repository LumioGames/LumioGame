---
name: bomber-gameplay
description: 炸弹人玩法与世界模型——查实体、配表、原型取舍和 Sample 省略项时使用。
metadata:
  type: doc
  status: 实施中
---

# 101 · 帽王乱斗

八人、19×19 的体素炸弹人：炸积木、捡强化、抢帽王，最后在六段决赛圈争夺存活。规则真值见仓根 [design](../../../../../docs/specs/bomber/design.md) 和 [内核契约](../../../../../docs/specs/bomber/stage0-kernel-contract.md)。本页说明工作区消费方式，不复制引擎公共契约。

当前为第一轮骨架，v3 接口尚未冻结。五个 Ability 明确拒绝尚未就绪的比赛；构建和骨架测试通过不表示完整局已实现。交付证据见 [R-00798](https://lumiogamesengine.workflow.games/requirements/01a0e1a5-5ac1-785e-b552-81217b7d7be7)。

## 世界与规则落点

| 内容 | 引擎表示 | 游戏职责 |
|---|---|---|
| 地面、外铁皮、硬柱、积木、木箱、水 | 体素 | 官方目录关联游戏材质行为表；体素不存业务数据 |
| 玩家和 Bot 角色 | 同一个 PlayerEntity | LogicTransform 唯一位置，Identity/Observer/GAS 与 Bomber 状态组件 |
| 稳定参赛者 | BomberParticipantEntity | 参赛身份跨角色生命保存；Life 与 generation 区分每次生命，强化与统计有独立归属 |
| 炸弹 | CS 实体 | 主人、引信、四臂、命中记忆和生命周期；不另存地图炸弹列表真值 |
| 强化、血包、技能糖 | CS 实体 | 保护、竞争拾取，成功一次 |
| 强力宝箱 | 带逻辑的方块实体 | 命中记忆归实体，位置来自引擎稀疏绑定，无第二个 Transform |
| 对局、圈、结果 | WorldEntity 上的组件 | 唯一世界、阶段、帽王、统计和冻结的结果列表 |
| 火焰光环 | 施放者的 Skill/Effect 状态 | 范围从施放者 LogicTransform 推导，施放者死亡即结束 |
| 火墙伤害区 | CS 实体 | 有界范围、来源与 Effect 伤害，施放者死亡后仍保留至到期 |
| 爆炸闪光、帽塔、光柱、领奖台演出 | 客户端 Local 实体 | 只表现，不影响权威状态 |

六属性：HealthPoints、BombPower、BombCapacity、AvailableBombs、SpeedTier、MovementSpeedMilli。Base 与 Current 两本账；帽数由火力、容量和速度级的 Base 强化数派生，库存、技能、水/麻痹减速不改变帽数。三心用六个半心点表示。

移动、放弹、拾取、主动技能、选角色经 GAS Ability；伤害、毒、麻痹、回春及其他既有持续减速经 GAS Effect。水减速只在移动求值时应用，不分配新的水 Effect。移动输入主/副方向与转角按键；放弹不接受客户端火力或来源。实体引用保留完整 NetEntityId。

系统注册到引擎业务相，由 WorldManager.Tick 唯一路径驱动；状态迁移经 lumio-hfsm。帧内只读绑定配置，随机用引擎确定性流。系统文件放 Gameplay 根，与 Sample 的放法一致。

## 对局、死亡与技能

常规死亡在真实跨零 Tick 记录，下一业务帧处理掉落/重生结构单。强化逐级按配置概率掉落，掉多少扣多少；拾取技能也按规则掉落，专属绑定技能保留。决赛圈出局全掉可掉部分，已预排的一次重生按契约保留。死者掉落具有防爆保护。

帽王取帽数最高且至少一顶者，并列保留现任。最后一名存活者胜；同 Tick 全灭的最后一批并列第一。超时存活者按帽数，出局者在其后按出局时间排序，同名次跳号。领奖台、结果结束后在原房间开始下一局。

四角色、三槽、八种技能糖、三级升级和三条组合由表声明。skills-off 不授技能、不生成技能糖、拒绝主动输入，仍需完整跑 A/B 规则。持续状态不能用普通字段计时取代引擎 Effect。

R-00799 登记架构接缝，R-00800 补 Bot 只读投影，R-00801 补持续/周期 Effect。引擎 ADR-126 的 T-A 四项计时行为已获 Owner 批准，声明/API/失败映射及发布实现仍待收口。完整参数、逐请求结果 P 与同 Tick 全批后写终局 F 仍待裁决；游戏不自行插入结算相或延后一 Tick 偷换验收。批准行为不代表接口已冻结或能力已通过运行验收。

游戏事件具有43种类型化载荷，目录同时列出14项派生指标和2项排除映射；保留完整参赛者/生命/generation、来源、体素回执和冻结结果引用。目录中的T/P/F依赖不等于对应引擎能力已经成立，事件生产与传输验收见R-00798。GAS Tag词汇不能用字符串投影名充当注册身份，声明、冻结表与握手接缝见R-00301/R-00306。

## 配表与底图

Gameplay/Tables 的 schemas、tables、registry、profiles 是源，LumioConfig 生成双端 JSON 和只读 Reader，启动时绑定不可变快照。27 表、16 个核心 A/B、附加变体及 skills-on/off 见 [源表说明](../../../Gameplay/Tables/README.md)。每行记录来源/单位，生成物不手改。配置绑定核验世界声明 Tick 频率，毫秒换帧采用 SDK 语义。

object_budgets 按全部有效配置重算炸弹、拾取物和火墙容量，技能生产入口按已支持的语义元组校验；不能拿独立变体的最大值替代组合校验。规则记忆由组件的服务端持久字段承担，进入现有快照/哈希，表示约束见 [ADR0046](../../../../../.spec/decisions/0046-bomber-bounded-rule-memory.md)。其 19/8 数值是旧包络，12/23 与 16/27 的新增生产者和寿命尚待重算；容量算术不等于生产系统已证明驻留界或耗尽行为，边界验证与存储实施见 R-00798/B-00142。

底图只含地面、外铁皮和硬柱；作者工具经发布 SDK 写格、Capture，DS 启动只 Restore。每局种子软砖/木箱/水、再生和圈清格属于玩法批量写。帧初照片/本帧写集是暂态，成功结果才更新资源计数和掉落，不另存地形真值。

游戏编译运行只取 Engine/ 同一完整发布布局。LumioConfig 是 Sample 同用的作者工具，不是 Runtime 源码引用。缺工具/发布物明确报 BLOCKED_ENV。

## 原型取舍对照

依据 [原型 README](../../../prototype/README.md) 的取舍与 NON-CONTRACT 清单。移植行为及表现，不导入或照抄 prototype/src/sim。

| 原型取舍/扩展 | 正式口径 |
|---|---|
| 毫秒向上取整 | SDK 截断：20Hz 下100/125ms同为2帧、150ms为3帧，报告注明实际帧数 |
| 双方向与转角 | 采纳手感，经技能输入，不提交位置 |
| 软砖不计Reach、水计入后停、火焰穿过连锁弹 | 采纳；消费官方体素和炸弹四臂 |
| 引爆返库存、容量按手上加未爆 | 采纳；离开引信状态action恰好一次，熄灭也返还 |
| 跨零当帧事件、次帧结构动作 | 采纳，Tick取真实结算，不预扣血 |
| 帽数派生、帽王并列保留 | 采纳；帽堆/铸帽/过期退役，旧ID留墓碑 |
| 最近格心、再按ID拾取 | 采纳完整ID稳定排序；权重进表 |
| 闪现/火冲最远落点 | 采纳契约范围，失败无CD，火墙不含落点 |
| 光环随人、暴露才伤、重叠只算一份 | 采纳；伤害区实体、Effect伤害、稳定归因 |
| 踢弹先于移动、玩家不挡、入水熄灭 | 采纳；唯一LogicTransform，碰撞消费引擎能力 |
| 冰/毒/麻先伤后上状态，仅幸存者 | 采纳，按真实结果关联，禁止共享“最后来源”猜配对 |
| 水减速在移动时临时乘 | 采纳：先取麻痹等既有 Effect 修饰后的 MovementSpeedMilli Current，再在移动求值时乘水的700‰，且只应用一次；Base不变，不分配水 Effect |
| 同帧最后死亡结束、全灭并列 | 保持要求，等待ADR-126合法接缝 |
| 玩家互不阻挡、末格可多人占据 | 采纳，超时按帽数 |
| 角色/槽/等级/组合/毒麻枚举 | 纳入v3草案与源表，不保留proto附包作正式数据面 |
| 踢弹/火区/圈/结果/保护快照 | 纳入实体组件与事件，表现从复制当前状态恢复 |
| 表现事件、metadata、teleport提示 | 经正式复制适配GameSource，晚加入不重播旧爆炸 |
| ProtoRules与技能/角色/组合表 | 全迁源表，推断值标来源和验证目的 |
| Bot三档及脚本玩家档 | 表驱动；脚本玩家是验收工具，不算第四种产品难度 |
| 本机暂停/选角、浏览器输入预测 | 换角不暂停房间，下一局Warmup开始采纳已提交选择；首版浏览器旁观，输入预测归Client上游 |

## Sample 省略项

目录同构；下表是范围取舍，残留清理和验收见 R-00798，不代表清理已经全部完成。

| Sample 文件/内容族 | 处理与原因 |
|---|---|
| Chat组件/SendMessage、Client/UI/Chat和Chat测试 | 省略，本任务不含聊天；Application改为游戏注册组合 |
| MineAbility、Mining回调/Vein、OreDrop/PickupOre、Stamina/Ore | 省略，由炸弹/爆炸、六属性、糖果替代；不能保留冲突TypeId |
| Box库存、矿脉绑定演示 | 省略；宝箱仅消费通用稀疏绑定能力 |
| MiningPlan/MiningScenario | 省略；第一轮准入只证明真实房间/实体，第二轮Bot负责整局 |
| RestoreVerifyScenario、存档关服重启tour | 省略，用户明确不做该场景；底图Restore和通用快照接缝测试仍保留 |
| Minecraft导入、MC映射、湖边acceptance地图/资产 | 省略，只消费自己的官方目录及19×19底图 |
| 24/48/100 Bot与大地图演示 | 省略；八Bot30分钟稳定性仍必做 |
| final-shas.txt、Sample专属integration历史 | 省略；以本任务回放/规则/指标/旁观证据接替 |
| 根LICENSE、.gitmodules | 复用或放父仓，受许可证及Git/GitHub机制约束 |
| `.github/workflows/ci.yml` | 改为父仓 `.github/workflows/bomber-101.yml`：保留构建、测试、发布物接缝检查与 `external-clone` 匿名递归克隆并构建；按本游戏路径触发。 |
| `.github/workflows/tour.yml` | 不另建第二条 workflow。其 clean-machine 匿名克隆/构建由 Bomber CI 的 `external-clone` 覆盖，`test` job 执行自动测试；现有 job **不运行**启动器十四步、八 Bot 整局和旁观。第四轮仍须在合入后的 main 本地完成整局、确定性、规则、稳定性、skills-on/off 与真实浏览器旁观门，然后手动触发同一 `bomber-101.yml` 并确认 CI 全绿；不能把 `external-clone` 或自动测试当作完整 tour 验收。 |

prototype 原样保留，不进正式solution/CI/Release。旧根C# Bomber壳迁移后删除；根仓Chat/Identity等非本任务内容保留。

## 验收

完整清单见 [验收矩阵](../../../../../docs/specs/bomber/stage0-test-matrix.md) 和 [启动导览](bomber-tour.md)。八Bot整局、逐Tick回放、规则、稳定性、技能开关、旁观均需实际证据。缺记录、空集合、零测试和进程存活都不构成通过。
