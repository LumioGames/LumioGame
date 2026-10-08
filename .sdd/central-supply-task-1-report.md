# Central Supply Task1 源码交回

状态：SOURCE READY；尚未生成、构建或执行 GREEN。写域已冻结并交还 Root。Root 保持重型窗口；本执行者没有运行 .NET build/test/format、C#/Rust/Config 生成、提交或暂存。本轮仅写六个授权生产文件、本报告与独立取证目录。

**授权与输入**

- Task1 brief：`.sdd/central-supply-task-1-brief.md`，SHA256 `7dee5835860e6ed4dc824b931ae0e43b51a8682e4f0b71665bcdb9e99bd5d72f`。
- Root 本轮显式授权了原计划 Task2 的三处 Round 窄接缝，与 post-results materialization 同时集成；原计划表中的 Round owner 分工由本次授权覆盖。未实施 Task2/3 的测试或其余业务。
- 独立源码取证：`games/101-bomber/.run/central-supply-task1-source-01/`，含 before/after 原字节、六份窄 diff、输入身份和 source-freeze.json。
- source-freeze.json SHA256：`12f623fbd1f4557d3d10bc35022b1c2c1b7df34496c5f326b3e540bf423b830f`。

**原件 RED 身份（逐项已重算）**

两项原测试源码 SHA256：`2c4124da0ff04bf86c10205f3382e0995ef06f4e914ba268b994df6fad7d92e9`；与 RED JSON sourceSha256AtStart 完全相同，本轮未改源码和断言。

原运行：2026-10-03T04:42:26.6731657Z 至 04:42:37.9660949Z，实际 total=2、passed=1、failed=1、skipped=0、raw child exit=2。默认19房间 disabled 用例通过；真实 Native UGC 19/8 来源开启用例在第36行失败，50秒公告 match marker Expected=1、Actual=0。失败发生于发行之前；现阶段不声称九份 live 或后续断言已经通过。

| 原件 | SHA256 |
|---|---|
| supply-production-red-01.log | `7c41afc9b2931203cda936a1108bda6d5cc94b0560ed57ed1a89798eea4e0dfb` |
| supply-production-red-01.json | `85df26b6afabe1c74e206d6076f6b3b5dcbf257b17fee8c97c3f5d272120af46` |
| supply-production-red-01.exit（内容2） | `df4e26a04a444901b95afef44e4a96cfae34690fff2ad2c66389c70079cdff2b` |

| RED 实际程序集 | SHA256 |
|---|---|
| `Lumio.Bomber.Gameplay.Tests.dll` | `fae681d39a68bcc40996f5745d1eec792075f0fa6285833ed2fa7b2c9e985b8d` |
| `Lumio.Bomber.Gameplay.dll` | `7b850bbf9979b328f685d1769ec86aa2ee0774e3630fd82301b0addaa01fe50d` |
| `Lumio.GameRuntime.Ecs.dll` | `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def` |
| `Lumio.GameRuntime.Gas.dll` | `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc` |

选用完整06 manifest SHA256：`8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`。RED 的完整 Gameplay/Tests 源码清单仍保留在原 JSON 中。Root 交接说明的 diag05 四个 program Validate=true、EffectIntegration 8/8 与 Native child=0 为前置证据，本轮没有重跑或扩展这些证据；本源码快照不构成发行包或 Native 独立验收。

**六文件变更与精确终态**

窄 diff 总计 +351/-4 行。两份新文件的核心与 brief 逐字机械核对，仅有一处字典闭括号缩进、系统 XML 摘要/空行、以及已实际集成的 Round gate 约束注释不同。

| 授权文件（相对101） | 终态 SHA256 |
|---|---|
| `Gameplay/Components/Bomber/BomberPickupItem.Server.cs` | `c78951138ae164cdb62e8feaeb4c94a947f96bf87afc55be5657432e945a38a7` |
| `Gameplay/Components/Bomber/BomberWorldRuntime.Server.cs` | `7fde39b62f811b9dd8042ef8cd3fe2f41d7633b5c52f667b7947f65f7ceb36e3` |
| `Gameplay/BomberTerrainTransactions.Server.cs` | `46cafe153ba20e83f2e4d9c2698f72149a078aebaf00218bceb7142582754b85` |
| `Gameplay/BomberRoundTransition.Server.cs` | `e9a18ec95df73a0b669348692465f821a05324163a4ad3dcf00577dbc0732ce5` |
| `Gameplay/BomberCentralSupply.Server.cs` | `098c406e78e703f4a7f4f4097c48e3bdfb0d4a637e9f331a955df16d810dd242` |
| `Gameplay/BomberCentralSupplySystem.Server.cs` | `e3f9c56869609bf08f643f3ad7f1e032dabf25864f2ee7840c60214e1bdd82fa` |

- BomberCentralSupply.Server.cs：不新增实体槽；最多11条、UTF8至多8192字节的持久 promise；确定性按 match seed、逻辑 open tick、Schema epoch、命名 RNG stream 选择5类发行内容，skills=false过滤两个特殊份额。只在 Running/FinalCircle 创建新发行，公告/发行以持久 match marker 各一次；发行时一次预付整批信用。
- BomberCentralSupplySystem.Server.cs：ProcessorPlan、After BombSystem 的唯一入口。需要 Root 通过正式生成器更新生成注册后才进入真实 WorldManager.Tick 路径。
- BomberPickupItem.Server.cs：Awake/OnHydrate 接完整来源校验与实际 publication 确认；旧 terrain OnHydrate body 仅移入 ValidateTerrainProvenance，机械证明原字节完全相同。
- BomberWorldRuntime.Server.cs：原 terrain validate 之后只增一行 Supply validate；未改 roster、terrain、resume gate。
- BomberTerrainTransactions.Server.cs：新增同Tick prepaid 集合、清空、可选参数与信用公式；TryDestroy admission 改用统一信用使用量。Occupied/PickupCells 的 live+queued 物理视图及既有普通 producer 调用保持原样。
- BomberRoundTransition.Server.cs：Prepare 在破坏性清理前等待 HasPending；旧 pickup Destroy 入队后等待旧 Supply 实际不再 live；StartNextGeneration 拒绝未结债务再清零两个 marker，不通过 reset 丢弃 SupplyPending。

**自审证据**

1. 对实际 GameRow 的 bool/uint/int 字段与既有 API 逐项只读核对。BombPlacementCells 使用 Count/index，无 SyncList LINQ、Contains 或 IEnumerable 假设；world.Each/配置 Rows 使用其已有枚举接口。
2. submitted 状态、坐标和 SpawnTick 先写持久 memory，再接受 structural Create。只提交一次，后续跳过 submitted；没有 assigned-id-as-published、超时回收、重投或对 Unknown 的成功推断。
3. Confirm 要求 world.IsLive，match/ordinal/content/spawnTick/坐标完全一致；重复 live 身份、错误来源或混入 death/terrain/组合字段拒绝。匹配的实际 live 与 submitted row 可短暂并存，ReservedCount 不重复收费，ObservePublished 才删行。
4. 当前 Native 地形可放、无已有 pickup、无当前可阻挡 bomb、无同Tick pending bomb 时，按中心距离/z/x稳定顺序选点；无落点保留原份额与债务。
5. 普通来源与补给使用同一 live+queued 位置视图；queued prepaid 从信用使用量扣一次，持久 pending 继续持有原信用。既有 terrain pending/unstaged 的 Reserved 避免重算同一笔 reservation。
6. 六份 no-index whitespace diff 无诊断；该命令正常 exit=1 表示存在差异，并非测试结果。第一次机械脚本因 Git safe-CRLF 提示停止，未改源码；第二次只对只读 diff 加关闭该提示的进程参数，未改 Git 设置。记录分别在 static-check-01.log/static-check-02.log。六文件均 LF，旧 terrain 校验 body 原字节保留；原 RED/log/JSON/exit/四程序集和两项测试 SHA 再次一致。

**Concerns / 尚待真实验证**

- GREEN 仍待 Root 串行正式 GEN、fresh build 和原 Supply2：预期2/2、0skip、raw child=0，必须保留实际同源源码/生成/DLL身份；不可用旧 DLL 或改断言替代。
- 原 Supply2 只覆盖正常来源开启9份及默认禁用。credit exhaustion、无落点、submitted unknown、错误完整来源、paired restore hydrate 顺序、post-results/下一局实际退休及 marker reset 的 Native 回归由后续 Task2 承接；当前没有这些 GREEN 证据。
- typed gameplay events/catalog 属后续 Task3；当前只用既有 journal/log 字符串 occurrence 接缝，未写 Events/catalog。
- Supply/Frenzy object-budget 下界仍属独立计划和 Root 后续任务，本轮没有提高任何 max 或改 M2/Legacy guard，也没有让正式23/12或27/16房间绕过原 admission。
- 无新生产阻塞点在此次静态自审中被证实；编译、真实 native publication、restore 与换局的结果仍须按以上入口取得，源码交回不等于验收完成。
