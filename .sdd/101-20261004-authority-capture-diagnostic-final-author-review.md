# Authority capture 私有诊断作者封存

本轮只资格化有界、默认关闭的 Runtime 诊断。三处候选源已停止写入，Root依据最终有限非作者资格仅提交这三处，作者没有提交混合成果。此报告封存时完整15构建尚未启动；没有变更 Game 共享源、协议、额度、Native ABI 或正式 pins。真实 CoreCLR Native 和浏览器 WASM 的同 payload 结果通过，Game 八人 Running 性能根因和体验验收仍开放。

## 精确生产写集

所属新树：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeAuthorityCaptureDiagnostic`，基线 `520ffe482e1c48fb6e48187925eecec986cdb9c8`。Root最终白名单提交 `0247a914edfca401dd232e30fb250cfba9561986`，index 为空，1120个其他 tracked 物理字节提交前后不变；原生成 EOL 副作用未纳入提交。

| 路径 | 最终 SHA256 |
| --- | --- |
| `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs` | `d9445847a78cc6222301f208497beb521f1f1b8eedae161b6ff6655959eb676f` |
| `modules/ecs/src/Lumio.GameRuntime.Ecs/World/World.cs` | `2b3d6218f63bbef1906ed15af055472ce6ab18a4762452a544877348e6ace8bd` |
| `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/AuthorityCaptureCostProbe.cs` | `297a6024d44388068ec3f81844f4e0d237c1bb9578e66569092ff85ab47d9a05` |

计划：`docs/plans/2026-10-04-bomber-browser-authority-capture-diagnostic.md`，SHA256 `72913ee8c87541d7544fce728e4f5d98ce0b3ca6d37c6728761bc9bd1e23a422`。原两个正文的完整逆变换、测量副本移除诊断后的完整 token 等价已通过作者检查和 Task12 非作者审查。普通 `AuthorityFields` 和 `CopyCapturedFields` 保持原文；热路默认关闭仅一处分支，没有 Stopwatch/TLS/额外分配。

## 诊断边界

仅 `LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG` 精确字符串 `1` 开启。每64组采一组、总计最多64窗口；八桶均为 inclusive，不能相加或用探针部分成本净相减。输出仅固定计数/时间，不含字段 payload、票据或凭据；每窗口至多两行并限制行长。时钟、部分 bookkeeping、首行格式化/输出成本另记。所有原 delegate 调用、异常语义和 authority typed world 更新保留；没有 Native/Runtime 额外查询或世界副本。

## 已完成资格

1. 严格双 TFM Ecs 构建及正常 GAS 图构建均 raw0/0 warnings。八项正常 helper 检查通过：精确 opt-in、cap、并发/TLS、默认关闭零分配、probe writer 故障时保持原 delegate 异常。两个 inverse 坏变体被拒绝。
2. 正式14 Native 上，正常 ProjectReference 和真实 GEN fixture 的 empty/queued × off/on 四组均 raw0。全部最终 typed 结构、输入/authority digest、清理结果相同。每采样 GEN marker22 × 八实体 =176，实际保留 uint/u64、非空列表和字典。Builtin legacy fixture 的 field_sink=0 只记录为未资格化 GEN 分层，未拿它代替 GEN 案例。
3. 正常 BrowserWASM publish02 raw0；Root 实际打开四个新页87–90并点击 Run。四组均完整执行、清理；off 没有日志，on 各四样本/八行，最终 typed 结构与对应 CoreCLR Native 全结构相等。实际 runtime MVID `258fa550-a3a6-4462-8444-7a7434eedc6c` 等于 portable producer PE 和 WebCIL，13个程序集完整 metadata 逐字绑定。正式14 Engine WASM `668197d048c8c76fe7030c3907b5ec84acd5d05e330b41227258d7c9bd43dee6`、bridge 和 sidecar 原字节保留。
4. 正常扩展回归427案有426 PASS/1 FAIL/0 skip；唯一 `StructuralScratchIncludesReachablePendingLinksToMissingParents` expected12706/actual11966。候选 off/on 和 pure520 同样失败，原测试断言/源不改，作为已有失败保留。此处不宣称全 suite 绿色。

四真实浏览器结果是合成 GEN 负载的诊断资格；elapsed 包含启动、世界创建、JIT和夹具全运行，不能用作 Game 主瓶颈、性能改善或联机体验通过的证据。

## 不可变证据链

| 封件 | manifest SHA256 | 范围 |
| --- | --- | --- |
| `.run/browser-authority-capture-diagnostic-01/seal-task12-01/manifest.json` | `e6c3ac968fe69d6ea352a118a1dfc9b4d530ac2b9b7125bb278e504cf15628bb` | 原/后源、inverse、helper、构建及原 Native 记录 |
| `.run/browser-authority-capture-diagnostic-01/seal-task12-artifacts-01/manifest.json` | `b1122e1ced59ca459eb8489a0a350728c2fbcecb7a1e89ad725df5e4db486589` | 477已记录产物的实际字节补件 |
| `.run/browser-authority-capture-diagnostic-01/generated-sideeffects-seal-01/manifest.json` | `12158b9b8107fca2dcc126d6f0dbd2d2bf3543bcb7a82178bf6dfc317ebc46c4` | 正常生成器48个测试 GEN EOL 副作用，归一内容未变，保留未还原 |
| `.run/browser-authority-capture-diagnostic-01/seal-native-gen-01/manifest.json` | `6a7d76635b5319aed30f04707624f72e311608bfd989fdad21f616f88efd14ed` | 真 GEN Native四组、PDB及既有失败对照 |
| `.run/browser-authority-capture-diagnostic-01/seal-browser-01/manifest.json` | `b5ca64db43c6d2cb09dfaa260d2fb8ecd7b83e7c4215db268cda0b805e594953` | 689记录；发布02、13PE/WebCIL、PDB、bridge、实际四页 raw |

Task12 非作者结果 `0d305f1460b9af3abb9f953ce44fe3f3802b873cece0a1de2fc602c0f12aeea5`：`ACCEPT_PRIVATE_TASK12_ONLY_PENDING_REAL_BROWSER_WASM`。GEN Native 非作者报告 `.run/browser-authority-capture-gen-native-independent-review-01/review-report.md` SHA `885f3b4df626ff3c803b07fbb24bb1d8d82532d49b4ccd6e563d51aea265779a`：`ACCEPT_PRIVATE_TASK3_GEN_CORECLR_NATIVE_RECORDS_ONLY_BROWSER_WASM_PENDING`。Root已实读最终有限 Browser NA结果 SHA `3d7c4c81711551482b61ace2a3cd22fdf30d224bbabb11017a1a9ad10ccb6e09` 并授权私有完整15流程。Root提交结果 `.run/browser-authority-capture-diagnostic-root-commit-01/result.json` SHA `7d4c85452bdab022101bdb2cf03044dd6a8f3c68dac45b0779e586626259d7f6`；作者不自授准入。

行政/环境失败原件都保留：首次缺 probe 的 CS2001 编译 RED 只证明接口缺失；fixture 编译/容器 shape 错误、首次 test Native 环境缺失、publish01中央包版本 NU1008、host 相对 AssetFile 路径错误及 cross-separator aliases404均非产品行为 RED。对原 `.html` selector 双反斜杠的错误解释已由纯检查反证，未改原静态页面来迎合错误假设。Root四组实际使用 extensionless alias，服务的就是原 HTML/JS。只替换已授权自有 host，其他现场未动。

## 完整15准备

准备封件 `.run/browser-authority-capture-complete15-recipe-01/recipe.json`，SHA `1a0783d8f4b668744477dcea1434b01e518c83c1c9dfebd5f463c7e0c5667c51`；封件 SHA `7c50ba6cd63cf0e1c35e5bb1a22fe83f50f2a847f55e51724c56a14de918211f`，保留其当时“等待审核/提交”的准确状态。Root现已授权，NEW clean `LumioGameRuntime15AuthorityCaptureDiagnosticComposition` 位于精确0247，helper实核三 path rawhash/only-three diff/八 HEAD clean 后生成真实 `games/101-bomber/.run/20261004-browser-experience/full-pack-15-input.json`，SHA `19203fb70fac381086336e81ce3aceaad10895fcb23583dab4884351d1063959`；只改变 Runtime root/commit、输出/evidence，另七仓/config/baseVersion不变。没有伪造待审 commit。

原官方 runner `6702dd187c3fa6b57e63c291396d68164cbb0faba9670a3cc369307d03708bb7` 只调用 packFromMain，没有复用旧 Native/stages 的 complete-pack 参数；其中 defaultNative、defaultWeb 仍构建正式 Native 和 Engine/Voxel WASM。Root已确认按未改官方 whole 流程构建新15，记录新字节身份并与14比较；不手拼旧产物、不增加 builder 旁路、不承诺重编 hash 相同。完整15原流程的后续构建结果将另封，不改变此时“尚未构建”记录。

默认 off 与私有显式 on 独立：未来私有测量页仅 `dotnet.create()` 单 anchor 注入精确环境 `1`，再叠已审 V9 observer并分别反向验证；普通发布、共享 Game、pins保持原资格。真实两人加六Bot Running 同期同负载采样尚未进行。
