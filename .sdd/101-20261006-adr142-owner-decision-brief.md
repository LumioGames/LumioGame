# ADR-142 Owner 裁定材料：离线原认证归属的本地死亡观察结算

- 日期：2026-10-06
- 性质：决策支持材料；本文不含任何已批准语义。ADR-142 在架构仓保持 Draft / Owner Pending，未裁定前不得启用、发行或进入正式包。
- 裁定者：Owner（用户）
- 材料 assembly：主协调 Agent（本对话），全部引用证据均为既有封存件，未新开现场、未改生产源。

## 一、需要裁定的唯一语义问题

既有公共契约 `engine/wire/successor-binding-v1.json` 的 `resultCorrelation` 规定 "Expiry requires disconnected context, all other operations connected"。因此：

> **一个真实已断开（Disconnect 后、原保留窗口内）的认证 controlled body，能否由原 bounded successor owner 在本地完成既有死亡结构事务（observe Applied），供原已关闭的 VerifiedHostSession 与原 timer 做本地一致性结算？**

ADR-142 Draft 的答案是新增加一个具名允许项：允许，但仅限本地结算——不授远端权威、不发旧 socket Authorization/Welcome/baseline、不建 active Session、不覆盖任何 live/pending replacement。完整草案见架构仓归档提交 `3443135b` 的 `.spec/decisions/ADR-142-retained-offline-owner-observation-reconciliation.md`（已全文复核，含接口/失败语义/兼容影响/迁移方案/验证 Fixture 六节）。

**不改动的部分（Draft 明确保留）**：所有 connected remote observe/transfer/reattach/supersede 的完整认证、socket、previous-CAS、epoch、target、witness、revision、profile、account/room/world 校验；额度与 reserve/release 次序；错误码与 typed disposition；六个 HostEntry 操作；DTO 字段与 JSON 形状；Native ABI。readiness 的 `implementationComplete/publicReleaseApproved/freezeEligible` 均保持 false。

## 二、为什么需要这个决定（证据链）

1. **故障已发生至少 11 次**（最近一次：2026-10-06 09:05:22 +08，restart-05，gameplay tick18488/host18489，checkpoint gen30；收件 `.run/20261006-delivery-takeover-review-01/scene33-occurrence11/receipt.json`，日志 SHA 已绑定）。故障形态一致：`Death structure intent no longer identifies its live old body` → DS exit 2 → 整个 8 进程场景退出。
2. **根因已定位**（Scene20 调查 + `.run/game-death-structure-investigation-01/`）：真实 Disconnect 删除 active route 后，正常 lethal Effect 写入完整死亡 intent；`PrepareSuccessor` 因无法捕获 active binding 每 Tick 返回 `binding_not_found`；原 body timer 最后销毁 body，而 Game 尚未消费死亡结构事务，下一 Tick 触发 Life 守卫 fatal。
3. **在线对照通过**：相同八人、底图、额度、Effect 与 Game 源，在线路径正常——问题是离线语义缺口，不是随机损坏。
4. **不改游戏死亡 guard 是硬边界**：清 intent 或跳过旧 Life 守卫会掩盖事务错误（Draft 替代方案一节明确排除）。

## 三、候选清单与差异

| 候选 | 仓 | 提交/位置 | 状态 | 与生产的差异 |
|---|---|---|---|---|
| Engine ADR-142 + wire Draft | LumioGameEngine | `3443135b`（归档 refs/notes/101-bomber-handoff-20261005-closeout01/group-01） | Draft；3 处 wire 说明文字 + ADR markdown；无代码 | 仅契约文字新增「DRAFT ADR-142, pending Owner decision」三段；无 DTO/ABI/消息形状变化 |
| Runtime25 离线受控死亡 | LumioGameRuntime | `41405896`（归档 group-07；原 common DB 已清理，恢复走 GitHub fetch） | 隔离实现；真实 Native 32/32、successor 227/227 GREEN；独审 `ACCEPT_REAL_NATIVE_OFFLINE_CONTROLLED_DEATH_EXPIRY_RED_CAUSALITY_ONLY`（`.run/offline-controlled-death-independent-review-01/result.json`，基线 Runtime 520ffe48 + 官方12包） | 生产源五文件隔离修复；非作者独审确认真实 RED→GREEN 因果；基线比当前 complete27 的 a5907448 旧一个增量（a590 为表现发布键缓存，与本语义无交集，但合入时须在新基线重放回归） |
| Server12 离线死亡测试 | LumioServer | `11cdb390`（归档 group-11） | 仅四份新测试；三份生产文件未应用；Host RED/GREEN 未执行 | 测试先行；生产 Server 侧接线（本地 drain、due 迁移）尚未实现，等待裁定 |

**消费链闭合顺序（获批后）**：架构仓 ADR 定稿 + wire 文字转正 → Runtime 五源合入上游并过三套件 → Server 三份生产文件应用 + Host 链 → 官方完整包（新 SDK）→ Game 消费 → 浏览器复验。任何一步失败即停在该仓，不串联放大。

## 四、回滚条件

- 全部候选都在隔离 worktree/归档 ref，未进任何正式包；当前生产组合（complete27/Game29）不含任何 ADR-142 语义。**获批前回滚 = 什么都不做**（现状即安全）。
- 获批后回滚点：
  - 包级：任一完整包验证失败 → 弃该包号，现场不切换（现有 complete27 服务继续）。
  - 源级：Runtime/Server 合入后回归失败 → revert 对应提交；schema/pins 不受影响（无持久化变化）。
  - 语义级：上线后新 fatal 形态出现 → 关闭该路径的配置开关不存在（Draft 未加开关），回滚 = revert Runtime 提交 + 重新打包；因该路径只影响离线死亡结算，revert 不影响在线对局。
- 不可回滚项：无（无 DB 迁移、无 schema 持久化变化、无 wire 消息形状变化）。

## 五、验收条件（获批后放行前必须全绿）

来自 ADR-142「迁移方案」与「验证 Fixture」，逐条可执行：

1. 隔离 Runtime 五源在**当前**组合基线（≥ complete27 的 Runtime a5907448）重放：真实 Native 离线死亡 RED→GREEN、successor 全量、GAS/Replication/ECS 三套件零失败零跳过。
2. Server 原已签 socket → 真 close → offline lethal → 本地 observe Applied drain → 原 due expiry → fresh signed reattach → Native restore/transfer 两边界，逐项负控（错误 tuple、活/pending replacement、stale expiry、容量预留失败、drain 债务退休、consumed successor 再次离线死亡）。
3. 完整原生产 Game、真实八人准入/正常地图/默认额度：Disconnect 后 lethal 死亡消费在原 expiry 前完成；timer 原 due 及 epoch 拒绝保持。
4. 原 signed verifier + 真实 socket：无旧 Auth/Welcome；新准入有真实授权基线与 Native 恢复。
5. 非作者独立审查 Draft 与实现（Runtime25 独审已完成一项，须覆盖新基线重放后的状态）。
6. 官方完整包消费 + 真实双玩家八人房间连续移动、放弹与十次 close/newpage 验收（与既有体验门合并执行）。

## 六、不批准时的替代路径（Draft 已排除项 + 现实代价）

- 维持现状：离线死亡 fatal 将继续复发（已 11 次），每次整场景退出；用户验收无法通过。
- 清 intent / 跳过 Life 守卫（游戏侧遮掩）：违反硬红线，不会执行。
- 离线即提前删 body：改变五分钟房间模拟语义，损害重连与观察归属，需另一个 Owner 裁定。
- 恢复旧 route / 伪 Session：误给旧连接控制权，不可接受。

## 七、决定请求（只需回答一个问题）

**是否批准 ADR-142 Draft 所述的唯一新增允许项**（离线保留窗口内、原认证归属、本地 observe Applied 死亡结算，无任何远端权威）？

- 批准 → 按 §三顺序闭合消费链（预计一轮完整包 + 回归 + 独审）。
- 不批准/暂缓 → 死亡链保持 OPEN，现场继续以 complete27 服务，验收门保持未过；其余工作流（os-error-5、P2、schema16 资格）不受影响。

