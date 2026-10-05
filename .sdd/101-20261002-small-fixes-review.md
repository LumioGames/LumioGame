# 101 两项小修复独立审查（2026-10-02）

裁决：**V/M 快捷键修复 spec PASS / quality PASS；schema 证据指纹刷新 spec PASS / quality PASS。** 本次范围内未发现必须修复的缺陷。没有批准新 schema、接口冻结、完整正式版本或真实浏览器验收。

审查分支为 `feat/101-bomber-engine-foundation`。已按顺序阅读父仓和 101 的 AGENTS、知识导航及适用架构、开发、测试规范；审查现有改动，没有修改实现、重跑已通过测试或触碰其他工作。仅新增本报告。

## 1. V/M 快捷键

审查输入：`.sdd/101-20261002-presentation-fix-report.md`、`.sdd/101-20261002-presentation-fix.diff`，以及当前三个源码、原型键盘、正式宿主输入/重建生命周期、HUD 弹窗、相机、音频和设置代码。差异文件 SHA256 为 `04c695acdbcd3017d60d8c01329d80dfdaf03d159f6cfb0293bdfcbd45d07590`。

- 原型 `games/101-bomber/prototype/src/input/keyboard.ts:31` 的 V→overview、M→mute 与正式绑定一致。调用现有相机/音频实现，不新增规则输入、模拟循环或状态真值。
- `Client/Presentation/src/index.ts:55` 将键盘与顶部按钮共用同一个静音回调；更新 settings、audio、HUD（包含设置复选框）后走既有 localStorage 保存路径。相机也使用既有 `view.toggleOverview()`。
- `src/present/shortcuts.ts:12` 在调用前检查已消费事件、重复、IME、Ctrl/Alt/Meta、页面/弹窗阻挡以及可交互/可编辑祖先。`src/index.ts:78` 的 `.hud-modal.is-on` 对应 `src/hud/overlays.ts:51` 实际设置/换角弹窗开关，能够覆盖焦点仍在非表单元素时的表现键防穿透。
- 正式 `Client/UI/Spectator/main.js:994` 在 `start()` 和首次表现创建之前注册玩家输入；其监听器先看到未消费的 V/M 且不将其作为玩法命令处理，随后表现监听器消费事件。因此当前宿主不会因 V/M 的 `preventDefault()` 误清除移动键持有状态。未将假设的其他宿主顺序列为缺陷。
- `src/index.ts:107` 的幂等 dispose 在销毁 HUD/音频前移除同一 keydown 回调；`Client/UI/Spectator/game-view.mjs:24` 和 `:47` 在对局/本地身份变更时先 dispose 再建新表现。新局不会保留旧快捷键回调。
- `.sdd/101-20261002-presentation-fix-files.json` 的三个源码及两个 dist 文件，长度和 SHA256 **5/5 与当前 bytes 相符**。已查看 `npm run build` 的 TypeScript/Vite 日志，129 模块构建完成；未手改或重新生成产物。

已读既有测试证据：预期 RED 为缺失模块、1 失败 suite/0 执行；GREEN 为 9/9；完整表现测试为 51 文件、647/647；依赖守卫为 1/1。报告所记退出码分别为 1、0、0、0，正式构建为 0。测试覆盖计数不相加，9 项包含在 647 项中；本审查未重新执行这些测试。

边界：EventTarget 用例和构建只能支持本修复的局部裁决。真实页面发布、V/M 操作、设置/换角防穿透、移动时操作、刷新静音设置、同房下一局，以及声音/画面实际体验，仍归协调者最终浏览器验收。Esc、触屏、首局选角不在本修复范围。

## 2. schema 身份账本证据刷新

审查输入：`games/101-bomber/.run/acceptance-20261002/schema-identities-before.json`、当前 `Gameplay/Compatibility/schema-identities.json`、同目录 `refresh-schema-evidence.mjs` 与 `schema-evidence-refresh.json`；只读调用实际 `readObservation`/`audit` 并独立重算当前源文件 SHA256。

独立只读核对结果（命令退出码 0）：

- 去除每条 active 的 `evidence` 后，前后**整个账本深比较相等**：468 active、343 retired；身份值、顺序、owner、shape、字段/序列化信息、历史墓碑及顶层元数据均未变。`schema=bomber-v3`、`status=audit-draft`、`freezeEligible=false` 保持不变。
- 恰好 11 条 active evidence 变化，逐项与刷新记录完全一致；每条 evidence 的 repo/path/order 均未变，仅 revision 变化。六条引擎组件来自 `Engine/manifest.json`；五条 Effect（121001、121006、121008、121009、121010）来自 `Gameplay/Effects/BomberInstantEffects.cs`。Effect 两侧生成 Registry 的指纹未变。
- 两个变化源的当前 SHA256 分别为 `ed5079929c9757df5cb0a493f468b81bcd7b251f1c4a23c315b38f40fa310fe9` 和 `bb3d45e7ce98e01d63ca2291e7a106bbdbd8026af28127bee6dfec264b6676e3`，均与账本一致。
- 实际只读 observation 捕获 134 个输入文件，重建 active 与当前账本完全相等，`audit({ baseline, candidate, observed }).diagnostics=[]`。
- 刷新脚本由正式 Reader 生成 evidence，不手填 hash；先断言非证据结构不变、限制变化路径和数量，再 audit，复读输入集合与账本检查并发改动，保留原 bytes 后写候选。符合本次只刷新证据的边界。

账本 bytes 指纹：刷新前 `0a604b8558af8c7fa9acbfcaa1257a1f6fcbd0d3318df2144fb59f5084203fe9`；当前 `7004279b097f4f37b18f2e420bc4d5d8be33ef335cccc9abfedf9090090e8776`。

已读 `.run/acceptance-20261002/tools-baseline.log`：328 执行/324 通过/4 失败/0 跳过，四个失败均在 schema 测试。已读 `schema-green.log`：修后专项 54 执行/54 通过/0 失败/0 跳过。原始两日志没有独立的 shell exit-code 标记；退出码应保留协调者原工具返回记录，本审查不从摘要虚构退出码，也不把专项 54/54 改写为修后完整 Tools 328/328。

本次刷新只消除已变源文件造成的陈旧指纹，不批准底层 Effect 行为、发布物来源变更或 Gameplay 新 schema；更不证明完整对局、复制传输预算、确定性回放、稳定性和多种子指标。后续任何字段形状/身份变化仍须按规定单独审查和更新账本。

知识同步：本轮仅独立审查已有纯修复/机械证据刷新，没有新增产品或公共契约知识；豁免扩展知识导航。
