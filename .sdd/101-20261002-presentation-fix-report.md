# 101 表现快捷键修复交回（2026-10-02）

状态：实现与回归完成，待主协调者独立 spec/quality 复核；真实浏览器验收尚未执行。整个101交付目标未完成。

## 问题与修复

确认原型 `af385a9` 的 `prototype/src/input/keyboard.ts` 定义 V 切换跟随/俯瞰、M 静音。正式 `Client/UI/Spectator/player-controls.mjs` 只有移动/Space/Shift；`Client/Presentation/src/index.ts` 只有音频解锁和resize监听，因此迁移后两个表现快捷键不可用。

新增 `Client/Presentation/src/present/shortcuts.ts` 把 V/M 绑定到正式表现的现有 camera/audio/HUD/settings 回调，M 与顶部静音按钮共享相同保存路径。已被UI消费、长按重复、IME组合输入、Ctrl/Alt/Meta组合、输入框/按钮/可编辑目标、打开的表现弹窗和后台页面不触发。dispose准确解绑，下一局重建不保留旧回调。

没有Gameplay命令、服务端状态、公开字段、成长投影、引擎依赖或美术资产变化；不引入原型模拟器。Esc及触屏/首局选角缺口仍在审计清单中，本次没有宣称修好。

## 文件与审查材料

- 修改 `games/101-bomber/Client/Presentation/src/index.ts`。
- 新增 `games/101-bomber/Client/Presentation/src/present/shortcuts.ts` 与 `shortcuts.test.ts`。
- 计划 `docs/plans/2026-10-02-bomber-presentation-shortcuts.md`。
- 完整审查差异 `.sdd/101-20261002-presentation-fix.diff`，包含3源码文件。index只读对照来自未装此修复的 `probe/container-delta-candidate-game` 同路径，与本次开工读到的原始入口相同；新增两文件为空前像。此diff是文本审查材料，不冒充原始字节备份。
- 当前3源码和2构建输出长度/SHA256：`.sdd/101-20261002-presentation-fix-files.json`。
- 官方 `npm run build` 重建 `Client/Presentation/dist/presentation.js` 和CSS；未手改产物。宿主下次publish应消费该bundle，当前已发布浏览器并未自动替换。

## 实际验证

工作目录 `C:/Work/LumioGames/LumioGame/games/101-bomber/Client/Presentation`。

| 命令 | 数量 / 结果 | 退出码 | 原始日志 |
|---|---|---:|---|
| `npm test -- src/present/shortcuts.test.ts`（修复前） | 缺失模块，1失败suite、0执行测试；只作预期RED，不算通过 | 1 | `.sdd/101-shortcuts-red.log` |
| 同一命令（修复后） | 9执行/9通过/0失败/0跳过 | 0 | `.sdd/101-shortcuts-green.log` |
| `npm test` | 51文件，647执行/647通过/0失败/0跳过；含上方9项，不重复计数 | 0 | `.sdd/101-presentation-tests.log` |
| `npm run guard` | 1执行/1通过/0失败/0跳过 | 0 | `.sdd/101-presentation-guard.log` |
| `npm run build` | TypeScript检查与Vite正式构建通过，129模块 | 0 | `.sdd/101-presentation-build.log` |

测试通过真实EventTarget派发检查V/M、一按一次、重复/修饰键/IME/已消费事件、其他游戏键不消费、UI阻挡及销毁后下一局解绑。未进行真实WebGL/音频/服务器实玩；不能用这些测试关闭完整局/视觉还原/声音验收。无提交、推送、重置或清理他人成果。

## 主协调者后续

1. 独立复核3源码文件与生成输出来源；本报告不自称独审批准。
2. 把该小修复保留在最终组合树，官方重新build/publish后在真实DS页面验证V切视角、M与按钮状态/刷新设置一致、设置/选角期间无穿透、同房下一局不重复切换。
3. 继续执行 `.sdd/101-20261002-presentation-audit.md` 的其余必要项，包括已批准GHC增长候选整合、权威资源箱/补给/狂暴/地形投影、首局选角、触屏布局和实际完整局对照。
