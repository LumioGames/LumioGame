# 101 正式表现与交互恢复审计（2026-10-02）

范围：只读核查当前 `games/101-bomber/Client/Presentation`、`Client/UI/Spectator` 与候选成果；未修改实现、未启动浏览器、未运行测试。以下行号以审计时当前源文件为准。没有 `Client/UI/Player` 目录；正式可玩页与旁观页共用 Spectator 宿主，通过 player mode 接真实 GAS 输入。

## 基准与裁决

- 按序读取父仓与 101 AGENTS、知识导航、架构和测试规范、9/28 收敛计划、执行账本，使用 `art-director` 路由的 `art-review`。旧 `docs/specs/art-direction.md` 已由 ADR0007 推翻，不能用作生产硬标准；本次依据是用户确认的原型与当前 design/ADR。
- 最新确认原型是 Git 对象 `af385a9cd0f261317e97240a7e55accdda8d01d5`。主协调者 10/2 fetch 后确认 origin/main 仍是该提交。**当前工作树 prototype 是更旧版本**，其 README 仍四角色/19×19/7分钟；对照必须读取上述提交的原型，不能用当前工作树旧页面。
- 当前原始工作树、`probe/container-delta-candidate-game` 和后续各隔离候选不是同一实现版本。特别是已独审通过的增长投影仍在 frozen GHC，当前原始表现投影和 container-delta-candidate-game 没有该修复。历史“通过”不代表这些变更已装入交付树。
- 裁决：**退回整体表现验收**。L1 仅确认依赖方向与源码资产复用；L2 确认部分资产与基准文本相同；L3/L4 真实正式浏览器、同视口同状态对照、触屏/声音/完整局仍未验证。本报告不把静态分析或旧夹具截图算实际体验通过。

## 要求 → 当前实现 → 缺口 → 修复任务 → 验收

下表 `P` = `games/101-bomber/Client/Presentation/src/`；`S` = `games/101-bomber/Client/UI/Spectator/`；完整路径均相对仓根。

| 要求 / 依据 | 当前实现（代码定位） | 缺口 / 状态 | 修复任务与必须保留的证据 |
|---|---|---|---|
| 原型场景、材质、颜色和玩偶比例；design §6.1 | `P/view/materials.ts`、`palette.ts`、`textures.ts`、`geo/doll.ts`、`world/dolls.ts` 逐文件与 af385a9 对应原型文本一致（忽略 CRLF/末尾换行）；五模型分支 `geo/doll.ts:209,225,245,258,337` | 资产是真正迁移，不能称占位；只有代码一致性，未证明实机场景一致 | 保留原资产，在相同地图/位置/视口拍兔鸭猫熊袋鼠、帽塔0/4/超过4、受击三档、死亡重生。正式与 af385a9 并排比对 |
| 跟随/俯瞰、窄屏镜头 | `P/view/camera.ts:38`、`logic/camera-math.ts:4` 与原型相同；`view/runtime.ts:1407` 的跟随选择、`logic/spectate.ts:16` 支持无本机选择帽王/存活者 | `P/index.ts` 仅绑音频解锁/resize；`S/player-controls.mjs:32` 只处理移动/Space/Shift，**V/M 快捷键丢失** | 接正式表现快捷键（不发规则命令、不暂停服务器）；测输入焦点/选角不会穿透，桌面 V/M 实操；无本机旁观跟随与同房下一局镜头重置截图 |
| 灯光/阴影覆盖19/23/27档 | `P/view/scene.ts:43` 阴影相机仍固定 ±14，注释明确仅覆盖19格；灯光强度与色彩保持原型 | 27档边缘阴影覆盖风险，静态代码不能直接判视觉失败 | 按棋盘尺寸计算完整阴影边界或实测证实覆盖；保留2048预算、原光色，三档四角与中心同视口对照 |
| 先单屏五选一，默认上次角色；design §3支柱4/§8.0 | `P/hud/character-select.ts:219` 有完整 `pickCharacter`；正式 `P/hud/overlays.ts:34` 却只创建 `mode:'switch'`，`S/game-view.mjs:43` 仅显示换角按钮 | **首局没有自动单屏选角路径**。`pickCharacter` 未被正式入口调用；switch confirm 也未调用 `saveLastCharacter`。原型原始入口已不存在 | 接首次准入选择 UI，合法服务器选择窗口内提交 `SelectCharacterAbility`，保存上次仅作预选；不得本地写角色真值或暂停房间。实际五次角色选择、默认上次、过期选择拒绝、下一局换角 |
| 四向移动与手感；design §6.1 | `S/player-controls.mjs:14` 每50ms提交主/副方向；`Gameplay/Abilities/MoveAbility.Client.cs:7` 明言等待正式体素绑定，客户端预测不移位 | 当前原始版本缺正式预测、转角辅助和输入缓冲；`.run/game-movement-shared-authority-implementation-progress.md` 最后记录“未改源/未构建”，不能把计划当已实现 | 归 Game/Runtime 所有者完成共享能力/正式体素接缝，表现只插值；按墙角、双方向、丢包/纠正、125ms放弹缓冲逐条真实浏览器验证 |
| 触屏左摇杆、右下放弹与带CD技能按钮；design §6:261-268 | `S/index.html:38` 是44px四方向按钮；`spectator.css:62` 放左下，`:63` 隐藏两个动作按钮；仅 HUD 顶部放弹和底部技能chip可点 | **未复用原型触屏摇杆/右侧动作布局**；当前移动为方向按钮，位置/反馈与基准不同。`P/index.ts` 未给 HUD `isTouch` 回调，移动端提示可能仍写 Shift | 迁移原型 input 中纯键盘/摇杆/触控交互，发送现有正式 GAS callbacks；不能引入 app/local-host/sim。390×844、横屏、平板验证双轴阈值、双指移动+放弹/技能、CD/死亡禁用、无覆盖 |
| 放弹/连锁/爆炸/地形碎裂 | `P/replica-events.ts:46-58` 映射实际 bomb placed/exploded；`P/view/runtime.ts`、`audio/index.ts:397` 有快照差分兜底；`S/PresentationDump.cs:55` 读取实体范围 | 基础资产与事件接线存在；完整特效和因果仍依赖真实 journal/权威伤害。`replica-events.ts:89` 未识别 kind 丢弃 | 核对生产 journal 与所有需表现事件；真实同时爆炸/同链多炸弹/穿透与留火，确认画面、声音和伤害一致，不能仅事件夹具 |
| 动态心数、金心、Boss体型/心条/倒台；design §8.5/§12 | 原始 `P/replica-types.ts:16`、`replica-adapter.ts:164` 和 `S/PresentationDump.cs:36` 无 maximum/gold/Boss；渲染器已读 `maxHealth/goldHearts` | **已有可复用完成候选，未集成**，见下节 GHC。不可重新发明/用帽数在表现层计算权威血量 | 集成 GHC 依赖链与投影，复核官方生成bundle，再以实际拾取/受击/死亡回落/重生截图证明；包含无落点 pending gold 不能画作已落地 |
| 三级资源箱、中央补给、狂暴与高光；design §5/§8.5-8.6 | `P/contract/snapshot.ts:191,241,295` 与 `view/runtime.ts:1701` 已有 ResourceBoxes/Supply/狂暴模型；原始 `replica-types.ts:72`、adapter输出不提供这些字段；GHC投影仅补增长 | 表现资产可复用，**实际权威快照未提供 ResourceBoxes、match.supply、frenzyUntilTick**；规则还需候选整合，不允许造本地计时器冒充正式状态 | 等 Game 真字段/已提交事件后贯通 dump→types→adapter→view/audio。实际木/铁/金箱不同命中、补给50s预告60s一次开启、6s狂暴、结算数据截图与日志 |
| 护城河/冰桥/爆炸桶；design §5.1-5.2，ADR0048 | `P/replica-terrain.ts:7` 只有旧 air/floor/iron/hardPillar/softBrick/crate/chest/wood/firecracker/water/ice 名称，未知配置名称抛错；地形shader是真实水面迁移 | M2新增块名/状态与表现尚未对接，桥/桶不能用旧软砖占位。最新 GT3 有规则候选，未见对应正式表现投影 | 以整合后真实块表/体素状态映射，水/白色冰桥/桶轮廓可辨；桥结成/融化、火撞水白汽、桶来源继承连锁均真实操作录像 |
| 五角色技能/六特殊炸弹/最爱提示 | `P/replica-config.ts:40-112` 从生成配置投影角色/技能；`:134` 清空旧 combos；`present/skill-hud.ts` 已改两chip；`hud/select-model.ts:46` 读最爱名称 | UI已做M2两格，但部分技能依赖 Effect；`replica-adapter.ts:87` 把回春时间固定0（Server-only，无倒计时）；`replica-events.ts` 无 heal/freeze/cure 等明示映射 | 核对 Game新状态/合法复制域后补显示；不可读取服务端私有状态冒充已公开。每角色技能+最爱/非最爱、六形态、拒绝/冻结/CD跨生命实际验证 |
| 音效、音乐层、距离与事件节拍 | `P/audio/{synth,sounds,music,mixing}.ts` 与原型相同；`audio/index.ts:285-328` 有治疗/冰冻/补给声音；`:389` 四总线压低/距离衰减 | 音效资产复用正确；欠缺正式事件/快照意味着部分声音无法触发。只测有音频对象不能算听感过关 | 同状态原型对照录音；近/远爆炸、4声合并、本人/他人击杀、回春/冻结、补给、Boss、结算音乐；键鼠/触屏首次手势解锁和静音持久化 |
| 缩圈/死亡/重生/出局 | `P/replica-adapter.ts:123-156` 按participant保留跨生命只读展示；`:203` finalCircle；`view/runtime.ts` 快照驱动 | 架构形状正确；临终→无life→successor与Tick重置依赖上游修复，真实链路未证明 | 常规死后3秒重生、决赛圈死亡观战、已在重生倒计时者入圈复活一次、毒圈不受泡泡免疫，检查实体销毁期间HUD/镜头无抖动和旧技能残留 |
| 领奖台、高光卡、自动同房下一局 | `P/hud/results-view.ts:32` 已有高光卡/Top10/个人最佳；`S/PresentationDump.cs:136` 读取保留结果；`S/game-view.mjs:22` match变动重建表现 | 已有完整展示，不等于整局/结果数据正确；当前无真实下一局证据。旧 results 注释写“换角暂停倒计时”，与正式不暂停房间相冲突但实现 Overlays 明确不暂停 | 真实完整局→10s领奖台→6s高光结果→同room新match；五角色结果、结束三原因、每人至少一张高光、打开换角不延缓其他人，保留录像/日志 |
| 响应式、清理与浏览器错误 | `P/index.ts:88` ResizeObserver/dispose；`presentation.css:17` 600px布局；`tests/browser-smoke.mjs:15` 1440×900与390×844**构造fixture** | 已有夹具验证脚本，但不是实际正式链路。场景dispose/camera/audio重复注册仍需多局实测；错误页隐藏重连按钮需核对 | 同三档实际页面无横向溢出、无HUD遮挡、界面聚焦不走路；连续至少两局/刷新/断线重连；控制台、网络、服务端日志无异常，帧时/音频保持稳定 |

## 已批准候选：优先复用，不重做

1. GHC 的真实文件：`games/101-bomber/.run/bomber-growth-hearts-corrective/final-02/source/games/101-bomber/`。`Client/Presentation/src/replica-adapter.ts:168` 写入 `maxHealth/goldHearts/isBoss`；`replica-events.ts:79-90` 保留四种 GrowthFact 原始身份与 pending-debt语义；`Client/UI/Spectator/PresentationDump.cs:42` 提供真字段。
2. `.run/bomber-growth-hearts-corrective-independent-review.md:7-10` 明确 SPEC PASS / QUALITY APPROVED，仅 scoped correction，不批准整体M2/浏览器/发布。该报告可复用的历史证据：真实Native普通Tick15/15、源导出fixture的投影27/27、类型检查与官方构建。**本次未重跑**。
3. `final-02/growth4231-to-final.patch` 是16文件窄修复；`original4224-to-final.patch` 是507文件含增长规则/配置的完整候选。报告中 `after-manifest.json` SHA256=`122ee51d9df4280fb7853aa5b944e3193255650d0725ead40562aff7af6c4515`。不要对当前原始树盲贴16文件窄补丁，它依赖GH4231。
4. 合并前置仍是 `.run/bomber-growth-hearts-corrective-report.md:41-45` 所述共享GT3 pickup producer credit P1；`.run/terrain-growth-credit-corrective-exec.log` 末尾HTTP502，不能当已交回。GT3最新来源查 `.run/bomber-terrain-terminal-corrective-report.md` / 独审；表现工作不能宣称替代这项规则修复。
5. 既有完整原型资产来自 af385a9，不要重画、不引入占位。此次13个关键文件比较中11个完全相同（忽略换行）；renderer/scene差异集中dispose/新版Three阴影类型适配，尚未逐像素验收。

## 与原型的已批准差异（应继续写入最终差异账）

- M1三槽/等级/组合 → 正式角色技+一特殊炸弹槽、无升级/组合；六等权特殊炸弹、保留中毒与稀有踢糖：ADR0047 / design §7.3、§8，不能把M1直接复制成正式规则。
- 原型小水塘/溺水 → 护城河、取消溺水、冰桥/爆炸桶：ADR0042/0048与较新正式design。
- 原型本地暂停/换角暂停结算 → 正式只关闭个人输入/打开UI，房间时钟继续：正式选择边界/收敛计划。旧“浏览器只读”限制被本次用户完整可玩浏览器要求取代。
- 默认12人/23档、16人/27对照、8人/19回归：9/28确认、ADR0044。本地旧prototype目录的8人7分钟不构成差异批准。

## 可独立立即实施的表现任务

1. **P1 玩家入口与操作还原**：首次五选一/上次预选、V/M/本地Esc、原型摇杆和右下动作控件，正确UI焦点与服务器窗口。仅改Presentation/Spectator交互和测试，不改Game规则。
2. **P1 权威展示贯通**：先合并GHC；与Game集成者约定真实资源箱/补给/狂暴/技能/地形输出，再实现纯投影。字段缺失明确未完成，不能造状态。
3. **P1 实际整局表现验收**：正式浏览器与af385a9对照，三档/五角色/全部技能与爆炸、死亡复活、结算下一局及声音；真实截图/录屏与console/network/DS日志。当前旧fixture evidence不能关闭本项。

新增审计文件是本次唯一写入。未触碰当前dirty实现、生成物、候选、Engine、浏览器或服务。
