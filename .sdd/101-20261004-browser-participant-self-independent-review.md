# 合法 Participant Self 投影：非作者独立审查

日期：2026-10-04。审查者 `schema_pins_review`，非 `browser_perf_trace` 作者。

**Spec：ACCEPT。Quality：ACCEPT。** 未发现本次精确二源修复需要退回的 P1/P2。此结论接受合法 observing Self 的只读投影修复，不接受完整浏览器体验、连接生命周期或发布身份门。

## 精确冻结输入

已依次读 `games/101-bomber/.run/browser-participant-self-repair-01/independent-review-brief.md`、`task-report.md`、`exact-two-source-files.diff`、`verification-summary.json`，并读原始 before/after、实际 RED/GREEN 日志和运行输入。生产只读，独审没有重复全测、编译、发布或提交。

| Game 仓相对路径 | 已审字节 SHA256 |
| --- | --- |
| `games/101-bomber/Client/UI/Spectator/SpectatorDump.cs` before，13969字节 | `d57333020eae1c3968d84b8183fefd0171e585dd0ceafed8970732bb639c3967` |
| 同文件 after，14475字节 | `599609920469e0ba2eec906ba7425c678d6b128556cb6a548f2fefaf18ae25c9` |
| 新增 `games/101-bomber/Client/UI/Spectator/tests/ParticipantSelfProjectionTests.cs`，8609字节 | `17df0114be6332d6f2c7e6106896955887dc862ed30ba6893291eb39a5fe0d98` |

生产 after 与作者 frozen after 逐字节相等；审查结束 fence 未漂移。独立从 before 重建 after，证明只有四处精确编辑：EntityTypes using、局部 playerSelf 标志、明确 Participant 类型分支/原玩家块嵌套、inputOpen 增加 playerSelf 条件。其余所有字节（包括既有混合行尾）完全保留。原玩家六条组件/配置读取、positions、bombs、所有原 catch 与序列化字段均未弱化。

## 根因与 Spec 核查

真实 `games/101-bomber/.run/browser-experience-repair-01/live04-B-console.json` 有32条相同缺组件异常，时间为 `16:21:39.769Z` 至 `16:21:42.476Z`，实体为 Participant `...0011`。原 `DumpPlayerState` 见 live Self 后无条件 Get BomberPlayerState，和行为 RED 的同一旧 source169异常一致。

已核对 Game 的 BomberParticipantEntity 声明：它具有 participant、statistics、observer 等组件，不具有 BomberPlayerState、BomberSkillState、AttributeComponent 或 LogicTransform。Participant LifePhase 确为 `Sync<int>(Scope.Room, Authority.Server)`；NextCharacterId、SelectedForMatchCharacterId 等不参与投影。官方07匹配 Client successor 接线把 Welcome.Self/ControlledLife/mode 放入 ObservationAttachment；匹配 Runtime WorldManager 在 ApplyClientBatch 使用 `World.BindSelf(new Entity(World, welcome.Self))`。观察态的合法 view 是 Participant，不能据此读取玩家生命组件或取得输入权。

最终 source170只在 `world.TypeOf(self.Id).ClrType == typeof(BomberParticipantEntity)` 时走新增分支；Participant 的 selfId 与 participantId 使用同一实际 Self，lifePhase 只读同实体已声明同步字段。characterName、availableBombs 保持 null；没有跟随 CurrentLife/LastLife、借用其他/旧生命或读取 Scope.None 统计。该 branch 中 playerSelf 始终 false，因此所有 Participant 阶段，包括 Protected/Vulnerable 和 caller inputEnabled=true，inputOpen 均 false。

其余类型仍执行原严格 Get；没有宽泛缺组件兜底、吞异常或改变 envelope/Session 校验。实际更高 generation 把 Self 绑定新 player 后，局部标志重新计算、原玩家配置/属性/phase 投影恢复。Self 缺失时字段 null，不搜索其他玩家。bombs 遍历和位置输出没有被 Participant branch 短路，继续读同一个传入 World；没有新增预测、缓存、模型世界或第二套玩法状态。

## Quality 与实际验证核查

| 原始记录 | 独审读回实际结果 |
| --- | --- |
| `attempt-03/red-result.json` / `red.stdout.log` | raw exit2；7项，5 fail、2 pass、0 skip |
| `attempt-03/green-result.json` / `green.stdout.log` | raw exit0；整个 Spectator C# 项目60项、60 pass、0 fail/skip |
| 原 `before-manifest.json` 的 generated/lock 清单 | 独立重读110个当前文件 SHA，110/110相等，drift0 |

RED 五个具体失败是四种 Participant phase 与新生命切换用例的观察阶段；五份调用栈都指旧 SpectatorDump.cs169，报同一 `Component BomberPlayerState is not on entity ...0004`。既有受控玩家投影与缺 Self 用例在 RED 已通过。相同新测试 SHA 在 RED/GREEN 前后均不变；生产 source 的红前/后均为精确 before，绿前/后均为精确 after。没有把早期编译 exit1 或测试 CLI exit5、零行为测试的 setup 失败算作 RED。

新七项不是 mock 调用计数：它们经现有 BrowserSessionOwner 的真实官方 Native owner 创建官方 ClientWorld，向该 WorldManager 提交 Welcome/Create/同步字段并正常 Tick，然后读取真实组件与 JSON。四phase测试还验证明确 CLR 类型及确实没有 PlayerState、输入关闭、stats null、其他生命与bomb的位置、PresentationDump 的 participant/player 列表。受控路径检查真实 duck/availableBombs9/inputOpen；新 generation 检查新生命成为位置 Self；缺 Self 检查不借用其他 replica life。未禁用测试、增加 skip 或移除严格玩家读取。

测试 seam 的限制保留：新用例直接向官方 ClientWorld 提交 authority records，不经真实 DS 验票、ClientSession 的授权 receipt/完整 transport transition；BrowserSessionOwner 自带真实 socket 不等于这些新 case 已覆盖完整认证链路。positions/bombs 检查证明本地只读投影能继续，不证明真实两玩家实时同步。110清单只冻结生成文件/锁文件，未提供全部旧 C# 测试源码独立 before/after fence，故不声称逐字节独审了所有旧测试的历史变化。

原实际 Native 路径与哈希读回相符：官方完整包07 `0.0.5-main.0e2fc74`、`lumio_engine_native.dll` SHA `c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`；server Gameplay fixture SHA `6b37c0aaabf045eb21cfdaa62764223df86e87277324872039b50e245bb1e83d` 也与两次输入相符。正常 Gameplay GEN 与打包 analyzer 保留，Tests 项目原本局部 LumioEcsGenerate=false 未被扩成全局。私有验证真实参数是 `RestoreLockedMode=false`，锁路径在 attempt03 下；这不宣称 locked restore，通过110原生成/锁字节 fence证明没有改提交输入。没有替换旧 DLL 或用原型模拟器取得绿色。

## 结论限制与独立证据

仍需 Root 正常浏览器构建/发布后，真实八人对局反复跨越 death→observing→新生命，确认 presentation 当前、无 dump 异常；双向移动/放弹、性能与至少十次关闭重进仍须真实验收。Server 重进、预测/Model、发布 gameReleaseId 差异和其余正式缺口没有因本报告关闭。

独立目录为 `C:/Work/LumioGames/LumioGame/.run/browser-participant-self-independent-review-01/`：

- `verification.json` SHA256 `1392ba64d0b58546bebbbb184a54ff41343a79dd913a31bf91810120aaa9c395`；包含源码前后 fence、110个实际 hash、原始两次运行输入和精确失败项目、真实 console32条范围与限制。
- `verify.mjs` 为纯文件/原日志读回和精确四编辑重建；最终运行 exit0。无生产写入、无重复重型验证。
- `frozen/` 保存独立 before、after 与新增 test；`author-verification-summary.json` 保存原 summary。最终 `manifest.json` 固定报告及所有证据 path/bytes/SHA256；本报告封存后不覆盖修改。
