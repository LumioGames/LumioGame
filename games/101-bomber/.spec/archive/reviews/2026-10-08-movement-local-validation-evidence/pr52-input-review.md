# PR52 窄范围只读 Review：pump 输入与 movement trace

日期：2026-10-08。审阅的是 `git show` 读取的 Game PR52 合并提交 `40556477683e46a9e248812119fb3e6bd76c07c1`，生产改动提交 `ed354852b23d82c7359dc8c5c1635b98e3ff9ab0`。没有用旧工作树文件冒充新 main。

范围仅为 `player-controls.mjs` / `main.js` 的 `?input=pump`、`?trace=movement` 以及直接相连的 trace/frame 输出。**没有运行测试、游戏、浏览器或其他新实验，没有修改生产代码或此前冻结的七项报告。** 下列时序均为代码逐步推导，待用户本地验证。

源码身份（Git blob）：

| 文件 | PR52 blob |
|---|---|
| `Client/UI/Spectator/player-controls.mjs` | `53b870b60a306b45afe769f04e310dfd5fbbc113` |
| `Client/UI/Spectator/main.js` | `8676462cb41df486efc019b4374f38e3d2efeeb0` |
| `Client/UI/Spectator/movement-trace.mjs` | `1ced96a00536fc5a0584d47c7bb9b83af8bb5fc9` |

## 默认行为核对

默认仍为 **interval**。`main.js` 39 初始化为 interval；634–637 仅对 loopback 或显式 development 页面解析开关，而且只有精确 `input=pump` 才选 pump。`createPlayerInput` 的默认 driver 也是 interval；非 pumped 的方向按下仍立即 `move(true)`，独立 timer 仍以 50 ms 调用 held pulse。新增 turnPending/tapDirection 在默认分支不会被 latch，因此没有从这段差异中发现默认输入被切换到 pump 的问题。[main.js:38–40,634–637](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/main.js#L634) [player-controls.mjs:3–15,41–65](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/player-controls.mjs#L3)

pump 模式把独立 timer 换成保存 callback 的单个 pulse，并由 `pumpSession` 在 `csharp.tick()` 之前调用。持续保持一个方向时，每次有效 JS pump 可以产生一个 Move，第一次带 turn、后续不带；单个“按下再松开、其间没有其他方向、下一泵前全部松开”的短按也通过 tapDirection 保留一次。**这只是代码行为推导，不代表一个 JS pump 必然对应一个新的本地 prediction ordinal 或一次成功 GAS 执行。**[player-controls.mjs:10–14,31–65,153](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/player-controls.mjs#L31) [main.js:740–746](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/main.js#L740)

## P52-1：pump 模式可丢掉短转向，并把 TurnPressed 赋给仍按住的旧方向

**建议优先级：P1，限定显式 pump 实验模式。**

`latch` 只保存一个 tapDirection 和一个布尔 turnPending；`move` 优先读取当前 held/touch，只有方向列表为空时才使用 tapDirection。发送后 pulse 无条件把两项清零。[player-controls.mjs:31–39,48–58](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/player-controls.mjs#L31)

在 ready、focus、visibility 一直有效，且两个相邻 pump 之间有这些事件时，代码可得到：

| 时点 | held / 待发状态 | 调用结果 |
|---|---|---|
| 上一泵后仍按住 W | held={W} | 已正常持续向 Up 发布。 |
| 按下 D | held={W,D}；turnPending=true；tapDirection=Right | 只 latch，没有调用 sendMove。 |
| 下一泵前松开 D | held={W}；tapDirection 仍 Right | release 只删除 held 并更新 timer。 |
| 下一泵 | move 选当前 held 的 W；随后清空 latch | 发送 `(Up,None,true)`，**从未发送 Right**。 |

这不只是释放输入被省略：新的 D 转向消失，同时旧 W 收到了这次 `TurnPressed=true`。任何依赖主方向/TurnPressed 的转向缓冲或 Facing 都会收到与 D 按下不同的载荷。若同一泵间隔里完成 W 短按、再完成 D 短按且全部松开，第二次 latch 也会覆盖第一次，下一泵只发送 D；当前存储不是有顺序的事件队列。

**本地最小判据（未执行）：** 给真实 `createPlayerInput` 的 sendMove 记录调用参数；分别按上述事件顺序驱动 interval 与 pump。先证明 D 在 pump 组的发布记录中缺失、W 带了错误归属的 turn，再进入实际 Session/GAS 验证玩法影响。不能仅凭 held Move 总数减少或曲线更平滑认定输入节奏优化成功。

**修复原则：** 明确定义如何保留方向变化与短按事件的身份/顺序；不能让一个全局 turnPending 自动附到后来剩下的方向上。若选择只按每泵末尾状态采样并故意舍弃短事件，应把它作为改变操作语义的方案评审，不能把它称为仅调整调度时机。

## P52-2：方向延迟到 pump，技能和放弹仍立即发布，可颠倒跨能力顺序

**建议优先级：P1，限定显式 pump 实验模式。**

方向键在 pumped 分支只 latch；Shift 仍立即调用 useSkill，bomb begin/end 仍在原按键/按钮回调中调用。`main.js` 将技能、炸弹直接接到各自 C# 导出，方向的 C# 调用则等 `pumpSession → playerInput.pump()`。[player-controls.mjs:41–45,67–78,104–110](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/player-controls.mjs#L41) [main.js:740–746,925–937](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/main.js#L925)

例如在两个 pump 之间依次发生 `D keydown → Shift keydown → 下一 pump`：

| 模式 | 发往 C# 的调用顺序 |
|---|---|
| interval | `sendMove(Right,...,true)` → `useActiveSkill()` |
| pump | `useActiveSkill()` → 下一 pump 的 `sendMove(Right,...,true)` |

同理，方向→Space 的按键顺序可以变成 bomb begin→Move。**这里调用顺序翻转是源代码可以确定的；不能仅凭这一层直接宣称 DS 必然已经用旧 Facing 完成某次技能。** 仍须记录 Client 发布序号和实际 DS/GAS 顺序；如果正常保序执行，依赖 Facing 的技能或依赖位置的放弹就可能观察到方向更新之前的状态。

**本地最小判据（未执行）：** 先对所有三个发布回调记录顺序，证明同样原始事件在两模式中是否翻转；再用已激活的角色与真实输入通道记录技能/Move 的 sequence、准入和执行时点。验证时不要在 D 与 Shift 之间调用会自动 pump 的等待函数，那会消除这个条件。

**修复原则：** 调度持续移动时，方向变化与其他能力的顺序必须有明确策略。当前 A/B 同时改变了事件保留与跨能力顺序，不能把体验差异全部归给“消除了独立 interval/pump 相位”。

## 现有 trace 的三个必要口径限制

这些是使用新 trace 时必须说明的边界，不是已经证明的网页故障：

1. **accepted 不是完整 GAS 执行收据。** main 的 accepted 只取 `publishRequest()===true`；trace 记录这个 bool 和方向参数。它没有在此处记录 AbilityActivateResult、RejectedStep、对应的发布 inputSequence 或 DS ACK。bomb/skill 回调也没有对应 `movementTrace.input(...)` 调用，故不能只用现有导出把 P52-2 的实际能力顺序或此前 F2 的冷却拒绝定案。[main.js:879–899,930–937](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/main.js#L879) [movement-trace.mjs:21–25](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/movement-trace.mjs#L21)
2. **cx/cz 是最终相机位置，不是跟随中心。** 新 `debugLocal` 读取 `this.cam.camera.position`，而后映射到 trace.cx/cz。它含镜头位置偏移和可能的震动，不等价于 CameraRig.lookTarget；不能把这两列直接当 F7 的基础跟随中心。[runtime.ts:524–529](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/Presentation/src/view/runtime.ts#L524) [movement-trace.mjs:27–37](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/movement-trace.mjs#L27)
3. **有帧采样接线，不等于此前要求的全部因果字段已齐。** main→game-view→Presentation.onFrame 在 view 更新后拿 pose 和 debugLocal；但当前导出没有 frozen/viewNow、Logic/Model quaternion。frame.dt 由 index 的 rAF real-time 间隔传入，不是 ViewRuntime 内由 viewNow 计算的 hitstop dt。因此还不能只凭这份 JSON 验证 F1 朝向是否和 Model quaternion 一致，或 F7 是否处于表现时间冻结。[index.ts:113–123](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/Presentation/src/index.ts#L113) [game-view.mjs:111–115](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/game-view.mjs#L111) [movement-trace.mjs:27–37](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/movement-trace.mjs#L27)

本补充不认定 PR52 已在用户页面部署，也不认定 pump 模式手感变好或变坏。默认 interval 仍在；上述两个输入风险限定于选择 pump 的实验分支。确认发布与执行记录之前，PR52 的新采样开关不能代替此前七项报告的本地验证。
