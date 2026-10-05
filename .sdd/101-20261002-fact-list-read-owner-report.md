# Runtime fact 固定列表与完整 Handle 读取修复

## 冻结交回

- Owner 工作树：`C:/Work/LumioGames/LumioGameRuntime-101-fact-list-read`；基线 `ed5fae193cd871d2399836c41b79dba181323d53`。
- 实现提交 `100e6417bd4d0370618f4f220aa9e691571d9dfb`，精确两个文件：`tools/gen-declarations/EffectFactVerification.cs`、`tools/gen-declarations/tests/Lumio.Tools.GenDeclarations.Tests/EffectFactListReadTests.cs`。
- 独立机械格式提交 `f56067a2ebb4093bc9c562b9e70480d2568fb943`，仅基线已有 `RestoreCompletionTests.cs` 的两行对象初始化拆行，无非空白字符改动。完整 format 检查要求此修复；没有修改断言。
- 输入、二进制与日志 SHA：owner 树 `.run/fact-read/proof.json`；真实 Native 身份：`.run/fact-read/native-standard-identity.json`。

## 问题与闭集

Game 的冻结爆炸必须先确认全部依赖请求已正规准入，伤害 CanSettle 才可应用。私有固定行以参与者、生命、代际和实际 Damage Handle 三元组核对准入见证。现有 canonical `effect-lifecycle-v1.json` 已批准 immutable callback Handle 与 fixed-capacity SyncList 只读 storage，生成器却缺少 Handle inspection facade，且将真实 SyncList Count/index 误判为不支持的属性。

修复只在生成器验证器：完整 Handle 的 WorldId.Value、InstanceId.Value、Generation；ECS 所属程序集里的真实 sealed SyncList<T>，仅已声明组件字段的 Count/索引读取，T 必须是已有标量闭集。属性实例必须直接来自该固定字段，所有索引子表达式仍递归验证。没有新增 Runtime API、容器写入、一般索引器、列表别名或未界定枚举。身份 facade 只信任生成器自己的 syntax tree；同名用户类型不能取得权限。

14 个新增用例覆盖 CanSettle/Apply 正向读取、完整身份及局部不可变身份、两个 facade shadow 拒绝、真实列表四类写入在两种回调中拒绝、用户 getter、副作用索引、枚举、列表别名、同名自定义容器拒绝。

## 实际验证

| 证据（均在 owner `.run/fact-read/`） | 实际结果 |
|---|---|
| `fact-read-red-02.log` | 新增初始 11 例，9 pass / 2 fail / 0 skip，exit 2；两失败分别是 Handle 缺失与 Count/index PropertyReference |
| `fact-read-green.log` | 原 Fact 组 + 初始 11 例，50/50，0 fail/skip，exit 0 |
| `restore-standard.log`、`build-standard.log` | 全解决方案 locked restore、Release 全 TFM，exit 0；构建 0 warning / 0 error |
| `test-standard.log` | 全解决方案实际 Native 2674/2674，0 fail / 0 skip，exit 0，3m40.155s；包含完整 generator、GAS 和最终 14 新例 |
| `format-02.log` | 全解决方案 format --verify-no-changes --no-restore，exit 0；工具报告 workspace load warning，未报告格式错误 |
| `spec-lint-02.log` | 显式配套 Engine ef9 与 Workflow 1.3.6，strict 14 项全通过，exit 0 |
| `spec-lint-tests-02.log` | 23/23，0 fail/skip，exit 0 |
| `game-generator-baseline.log` | 官方 SDK06 对当前真实 GTCG Game 声明失败，Handle facade 缺失，exit 1 |
| `game-generator-probe.log` | owner 修复的官方 generator 读取相同真实 Game 源码，独立输出 `game-probe-server`，exit 0；没有修改或回接 Game 生成物 |

真实 Native 为官方 SDK06 原包的 DLL，SHA256 `51c449c32c964d38a503d62ef7e71466a1e52d56af0e6d5cb7248f74fe967c16`，buildId `2020bcc47cee042330ff5a8d949ada92`，ABI `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`。测试启动脚本先验证 sidecar SHA 与 DLL 身份。预测测试另用既有独立 Native fixture，路径和 SHA 同样保留。

## 失败历史与运行方式

`test-all.log` 的首次私有统一 ArtifactsPath 运行是 2674 总计 / 2669 pass / 5 fail / 0 skip，driver exit 1（MTP 子退出 2）。4 项失败为环境变量传入临时工程/PrimeProbe 后的路径错位，另 1 项为原 GAS scratch 拒绝测试堆栈字符串缺少 SettleOne；该原断言在标准布局全量重跑中通过，没有改断言或放宽预算。失败日志完整保留。首次 spec 工具误用同级旧 Engine/旧 Workflow，分别有布局报告和 22/23 失败；显式选配套来源后全绿。

复跑完整测试用 `pwsh -File .run/fact-read/run-standard-tests.ps1`。该脚本不把 ArtifactsPath 传给所有子工程，Runtime 用原有布局；`.run/fact-read/isolated-upstream.props` 只把配套 Engine 项目导向本树独立输出，避免其他代理的输出竞争。构建使用相同 CustomBeforeDirectoryBuildProps / LumioArchRoot，正式 `dotnet restore LumioGameRuntime.slnx --locked-mode`、`dotnet build LumioGameRuntime.slnx -c Release --no-restore -m:1`。解算覆盖另执行 `node eng/verify-solution.mjs`，35 projects，exit 0。

## 尚未宣称的结果

Game 仍消费 SDK06，whole-contact witness WIP 尚未正式编译/Native 回归。必须先完成此 owner 窄独审与官方 SDK 打包，然后按既有 identity/hash/private-lock 流程回接。Game 已补完整 Handle 比较，并准备危险区晚进入、同格两生命和请求容量边界用例；不得用此生成探针替代真实 Game 链路验收。Periodic fact 仍是未批准的独立候选，本修复不开放 periodic fact。
