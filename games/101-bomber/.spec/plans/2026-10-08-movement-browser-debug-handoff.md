# 101「帽王乱斗」移动手感：先 Review 提交，再直接网页调试

## 任务与用户验收

工作目录 `C:/Work/LumioGames/LumioGame`。接手先核实当前分支、main、PR 和工作树；不要继承现场存活假设。用户已授权继续修复、提交、合并与开发预览，遇到普通阻塞自己修，不要询问是否继续。真正的 Owner 裁定门不得自行批准。

用户原始症状：「我现在发现自己本机走路卡卡的，而别人看是正常的」「手感跟原型完全不一样，本地的手感非常差」。后续还有持续 W 时位置往回拽、朝向转过去又回转、A 不能动而 B 可能能动。最新 Game35 反馈仍是「现在的问题还是一卡一卡的 手感非常差」。**移动手感验收 FAIL，根因未完整定案，任务未完成。** 单测、Native/Client 轨迹、构建通过与源码合并都不能代替用户前台通过。

本次交接是用户要求先提交合并收尾，并要求你先 Review 上一 Agent 的改动，再自己网页调试优化、找到原因；不是宣称移动问题已修好。不要先让用户重复试很多版没有浏览器证据的补丁。

## 必读顺序

1. 根 `.spec/AGENTS.md`、`.spec/knowledge/README.md`，再读 `games/101-bomber/.spec/AGENTS.md`、该目录的知识导航。
2. 唯一进度账本 `games/101-bomber/.spec/plans/2026-10-02-delivery-progress.md` 底部 checkpoint102 起，尤其107–110及后续新增 checkpoint。账本只追加。
3. `docs/specs/bomber/design.md`、`stage0-kernel-contract.md` 与 `games/101-bomber/.spec/plans/2026-09-28-prototype-convergence.md`。
4. `C:/Work/LumioGames/LumioGameEngine/.spec/knowledge/features/` 的 movement、GAS、ECS 及热更设计，从导航定位。GAS 本地预测与服务器确认节奏不能混为一谈；不预设本地预测或表现只有20Hz。LogicTransform 是逻辑真值，ModelTransform 是表现，不建立影子模拟。
5. 合并后原开工提示词位于 `.spec/archive/plans/2026-09-27-101-bomber-engine-build-prompt.md`；读常设授权与 Owner 门。Engine `development-verification.md`/ADR088 区分编译合入门和后续行为验收。

## 先 Review 的提交和范围

`R = C:/Work/LumioGames/LumioGame/.run/20261007-runtime-movement-repair-01`。

| 仓库 | 提交 / PR | 做了什么及注意事项 |
|---|---|---|
| Runtime | `8752a69997292ebfce0ffca1ec77debb10a20f2c` | 真实权威纠偏时，把此前已经显示的有效前探一次性转入纠偏残差，避免直接丢掉导致回跳。 |
| Runtime | `7fa253ce9f1d383c81129a4fd5188f2d83c77a78` | 有资格的前探在原 h 内增大，h 后连续收回，2h 清零；过期才完成的输入不复活前探。**这仍会真实向后收回，速度存在折角，不能默认就是正确最终方案。** |
| Runtime | `f43dbe81e06a3dc839a6fa9541ee8261fee3724f` | 旧 scratch 断言12706→12070，历史 typed Transform 计费差636有证据；未改预算或生产计费。 |
| Runtime | `de5a44e34be4d777b6c287d36d8bcedd53cb54e2`，PR [277](https://github.com/LumioGames/LumioGameRuntime/pull/277)，merge `f69e2c9445fd5cf39b005c0857308cd96da1f04d` | 整合到当时 main `9bc2fc2d`；scratch 冲突保留 main 已合入的更完整精确边界/Undo 测试，生产 Owner 代码保持上述修复。Owner后续明确授权强制合并，现已读回MERGED；必需Build排队时合入，不代表CI通过。 |
| Game | `b07f45125eb71bc60466ff78570a6eab6ef00610` | Session Owner Model 完整 pose 经浏览器桥接；自角色/镜头/标签用本地 Model XZ，远端仍插值。当前 Doll 朝向仍从显示位移差推导，未消费 Model quaternion 来表达玩法朝向。 |
| Game | `474d557`、`5680905be791032a70d61ce20c16b4b827f7f128`；PR [48](https://github.com/LumioGames/LumioGame/pull/48)，merge `8aaab64a53a4682dfd6ae275604c9ac9fd8ce195` | 前者整合 main 文档/原型并处理六处冲突；后者合入 b07 消费接线。原型与 main af385a9 一致；c490d70 配置/身份原始字节保护保留。交接文档提交fc361b5同在已合入PR48内。 |
| Game | `b475473`、`1eb7aaa` | 旧「按接收时间再插值自角色」方案已撤回，**不要重新合入**另一个旧工作树18868cc。 |
| Client | `693095a690f3268fb300289139262147d9266b23`、`df649e3fa2ff10e103f03419616949a8963f4ff8` | 本地预测时钟/表现接线和生命周期补全；后者处理 same-manager 驱动换代、successor/reconnect、失败清理。已在 PR [181](https://github.com/LumioGames/LumioClient/pull/181) 合入，merge `5b7ef6101bef5250a66fc4813e75d0038da990e8`。**Game35 仍消费 Client17，未部署 Client18。** |

先看 `R/closeout-runtime-final-review.md`、`closeout-runtime-integrated-review.txt`、`closeout-game-final-review.md`、`closeout-game-merge-report.md` 和 `closeout-game-merge-package/`，再查 Task1/2/5/6/9/14/17 原报告、测试与审查。不把独审 PASS 当作最终设计无问题；评估已合入方案是否仍制造用户症状。最终 Game 分支含累计正式玩法/配置/文档交付，不能把整个大分支都说成只有移动修复。

## 已测到什么、没有证明什么

- Runtime Task14 有 ECS RED17（9失败）及有效真实 Native RED19（13失败），最小实现后119个独立聚焦用例全部通过；实际 Client17 私有组合探针4/4通过。该探针四条采样的活动期回跳从旧120Hz的3/4次变为0。
- 但显式 Native +7ms 迟到矩阵仍有2/3次活动期退步，总约0.014m；停步后仍连续收回。正常新目标、晚到同序号替换、受阻/反向/垂直转向仍可能跳。**三角形收回可能仍是手感差的因素，应测量和质疑。**
- f43历史完整 ECS660/660；GAS1033/1034，一项栈文本断言失败。集成 main 已修改这项测试，因此旧失败既不能写成集成版仍失败，也不能凭静态变化声称已通过。de5 完整 solution Release 全生产TFM编译通过，零警告错误；未重跑集成后的完整行为套件。
- de5 编译证据 `R/closeout-runtime-build-02/`，使用 Engine main 冻结快照4bf8d283。attempt01 使用旧523冻结依赖，因缺 PeriodFact 契约编译失败，证据保留。编译生成物147项仅换行差异已逐项核对并还原。
- Game 最终合并复用了已审 b07 源码，98项消费轻量测试及48项仓库轻量测试通过，root lint通过；Game spec-lint12项历史/隔离路径问题保留。旧完整消费桥接回归31/32失败、单独4/4通过的差异尚不能冒充全绿。默认旧 SDK pin 未重新资格验证；开发预览使用显式官方 complete31。
- PR48 必需README policy通过并正常合并；自动LumioBomber CI的build/test/external-clone失败：`LUMIO_SDK_VERSION_MISMATCH`，检出的Engine为`0.0.4-main.ecece8a`，要求`0.0.5-main.0e2fc74`。见`R/closeout-game-ci-failed.log`。这是已登记的默认发布物对齐问题，不能把源码合并称为CI全绿，也不得放宽版本守卫或自行批准正式发布来消除它。
- **没有本轮真实浏览器逐帧性能/输入链路 trace。** Native/Client 探针不是浏览器结果。优先补这个缺口，别继续只靠离线数字推测。

## 网页调试要求

你自己使用 Playwright/CDP/可用浏览器开发工具启动可控的新浏览器会话，进入实际新版 A/B、选择角色并复现持续W、起停、转向、贴墙、双窗口对照。工具缺失就自行安装/接通必要调试环境；不要把默认浏览器未开启调试端口当作只能让用户代测的理由。可观测、可控、可导出 trace 的页面才算你的复现；最终用户仍需前台验收。

把同一角色同一时段至少这些量对齐：keydown/up、held 输入发布、Session pump起止/耗时、输入序号及准入/执行、GAS本地 Logic pose、Model pose/残差/前探、服务器ACK/权威pose、render/rAF间隔、Doll实际位置和朝向、镜头、long tasks/GC/WASM耗时、可见性/焦点。给出按帧位移、速度/角度、回拉次数和大小；不要用长时间窗口平均FPS掩盖尖峰。

区分三个变量：(a)自角色预测/表现回路，(b)DS确认节奏，(c)整机CPU/内存/文件IO停顿。观察Bot/远端是否同时卡；在相同机器负载下做受控前台A/B对照。隐藏标签rAF会被节流，旧有经验已证明后台标签会制造假低Hz；记录document.visibilityState，避免将其归因为网络预测。

重点线索（都是待验证或部分验证，不能先定案）：
- Game held `setInterval(50)` 与 Session截止时间pump相互独立，可能出现0/2输入批次；旧探针没有量化实际浏览器发生频次。见 `R/task-10-independent-input-diagnostic.md`。
- `Doll.update` 从显示位置差算朝向，校正/尾部收回会导致持续W反向；Game现有Facing决策未写入LogicTransformrotation。候选最小设计 `R/task-12-facing-design-check.md`，尚未实施。不得另造held-key朝向影子真值。
- 复核本地预测真正执行频率、墙钟推进、输入时标、模型发布/读取顺序和迟到判别，不能把服务器20Hz直接等同于本地预测30/60Hz或屏幕刷新率。
- 原服务器tick曾有120–155ms尖峰、7进程日志近同步冻结；仍只是叠加因素线索，不能据此无证据认定磁盘/杀毒为根因。

优先让本地手感接近原型。用户已明确「不一定要保护」「没意义的东西就干掉」，允许用证据修订不合理的表现规则和过期测试；保全旧失败和原始收据。不得吞错、调低模拟频率、放宽协议/额度、减玩家或Bot、关闭体素掩盖。Runtime/Client/Server问题回所属仓；玩法和表现规则归Game。先RED、最小修复、独审，再新版网页实测；确证后再走官方整包和完整验收。

## 现场与热更

最近实际试玩为 `.run/game35-owner-expiry-dev-preview-01`：官方complete31基础，Game b07 + Runtime7fa私有网页替换，Release优化解释执行，非AOT、**hotReload=false**。Runtime WebCIL SHA `f90727188c5bb56eacbfeda04a7bc154924c8a578abb82f2cfa2d6eac24a0dfe`。这不是新正式complete包，且没有更新Server/Client18。

A/B旧入口18105，DS18333，平台18402。交接复查18105/18333已不监听，18402仍在；DS最后CP13，Game tick7949出现 `Death structure intent no longer identifies its live old body`，随后fatal。证据 `.../prior-failure-01/failure-receipt.json`，最新前台原话 `.../foreground-observation-01.json`。接手重新核实，不把verification.json历史SERVING当实时状态。

恢复调试场景：先保全新事件，沿已审launch/guard模式使用新证据目录、新运行副本、新账号前缀并写prefix receipt；密码每次launcher运行只在内存生成一次，永不持久化。隐藏独立 `Start-Process pwsh -WindowStyle Hidden` 脱离会话树。不要删除旧fault日志通过文件数守卫，不循环重启当修复。ADR142死亡链仍Draft/Owner Pending，不能自动启用。

用户想要真正敏捷热更。`R/task-13-hot-reload-feasibility.md`、`R/task-15-dev-loop-design.md` 已完成调查/最小四文件接线设计，但未实施。需要一次Debug/非优化/portable-PDB精确MVID基线、agent、玩家入口和安全点；计划每个玩家独立DevHost以避开现有单邮箱竞争。必须拿真实非空delta、apply ACK和行为改变，保持页面/连接/会话/World不重建，才可宣称热更。非AOT≠热更。

## 边界与交付

18085发布身份、生产schema等Owner门保持OPEN；受保护18081/18082/18084/18085/18092–18097不动。保留他人脏文件/未跟踪文件（特别是`.sdd`迁移草稿、`.zcodeignore`、`pelican-cycling.svg`）和旧封件。不要杀别人的构建/Runner任务以腾资源。

Runtime PR277已按Owner最新原话「你直接强制合并 全部合并进去」完成管理员合并，merge `f69e2c9445fd5cf39b005c0857308cd96da1f04d`。此前普通merge和直接`--admin`均被排队Build阻挡，因此本次仅临时解除main的管理员执行保护，指定精确HEAD合并后立即恢复；必需检查列表未改，管理员保护已读回enabled=true。证据`R/owner-forced-merge-01/receipt.json`及前后保护快照。本次授权不自动批准其他Owner门或未来绕保护操作；未伪造CI通过。仓库/工作树位于 `C:/Work/LumioGames/.101-restore-01/`，证据路径即使git忽略也保留，不清理。

每段实质工作追加账本并提交，记录实际源码/包/页面字节身份。最终交付必须有浏览器可复现实验、根因因果证据、所属仓修复与回归、独审、官方complete包/消费构建/新现场，以及用户前台手感通过。现在不要把这个任务标完成。
