# v14 冻存资格在新版主测试中的执行候选

2026-10-03，作者 `/root/frozen_v14_suite_adapter`。状态：**完整私有源码候选；尚未发布；C# 编译、13 个保护用例、两个新派发子进程和 Native 均 UNRUN**。Root 负责独立审查、实际构建与执行。

## 交回目录与写域

候选目录为父仓 `.run/frozen-v14-suite-adapter-draft-01/`。`before/` 保存两原文件完整字节；`draft/` 有四份最终源码；`forward/`、`inverse/` 各有四份路径规范化补丁；`manifest.json` 记录来源和候选 SHA256、原断言数及 fence；`patch-qualification.json` 记录最终补丁正反实际应用和逐文件字节比对。未改生产源码、任何生成物、Runtime、SDK 或冻存 archive。

| 文件 | 原 SHA256 | 候选 SHA256 |
|---|---|---|
| `BomberContactImmutableV14CompatibilityQualificationTests.cs` | `ff28567a450c761f0a69e26bc749e345c6960a9de6d06404fbcf0ef573deb5bc` | `f93eb014035e868add736844ed2939be97b20b9b5748ee7364c9febb5cb1a692` |
| `BomberContactOldWorldSnapshotTests.cs` | `f6ae21120da18be7424453e65a1b0772e70aafeb1f6f261d7f5f912d785dd3d5` | `be212cd67e45862b8e841a74ae0fdd92b296e42e23373cc75581c1e8e58d15a8` |
| 新 `BomberFrozenV14Qualification.cs` | 不存在 | `40991c9215d970dbcfd3dc3465baeab9deea35807ec8056fde9c262d21694655` |
| 新 `BomberFrozenV14QualificationGuardTests.cs` | 不存在 | `6cb4f5eb868bec7796a33b55bb8dcfda2833ee1cfcdab1e2e828e4d59877292e` |

两原 Fact 只在入口新增一次版本明确的执行派发。去掉该入口插入后，全文逐字节还原原件；两文件所有 19 和 9 个 `Assert` 调用及其表达式均保留，未删 Fact、未 skip、未把容量 5 改为 52。完整未加 adapter 的原源码还在被冻结的旧 executor 中；实际子进程执行的 a64e31 Tests DLL 就是该原源码的已确认构建。

## 执行规则与原事实体

若当前 Game 文件 SHA256 恰为 `61ffd66564c634a13b173a04af4eefcd212e1305da41d27d07675de1f13b5e55` 且当前 Ecs 为 `aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`，Fact 在当前进程继续执行完整原 body。任何其他 Game 字节进入明确的旧 reader 路径。

旧路径锁父仓 `.run/v14-cap5-executor-freeze-01/executor-freeze.json`，SHA256 必须为 `9311302f83d1d8ebaeec3f37a444d7680a43a7853cce17fe5e41bc2d918a2775`。也可用绝对路径 `LUMIO_BOMBER_V14_QUALIFICATION_ARCHIVE` 指向正式安装的同一 archive；manifest 本身保留原字节，里面的历史绝对路径仅通过唯一的固定 `/.run/v14-cap5-executor-freeze-01/workspace/` 段提取相对路径，不按历史机器位置读取文件。

archive 中全部 **3688 文件、42,037,481 字节**逐项核长度及 SHA256。Game 锁 `61ffd...`、Tests 锁 `a64e31f353fbd962de55674348222038b8cddf1ccaf2b63b523ab90fa856f009`；两原测试源码也单独锁 hash。executor 内完整 113 项文件 inventory 必须精确一致，禁止额外程序集等解析输入。所有路径必须是安全相对路径并包含于指定工作目录，拒绝 `..`、绝对路径、Windows drive/ADS 和任何路径层级的 reparse point/链接；递归 inventory 先查链接再进入子目录。

原 5-contact Fact 的 `ContactSnapshotEvidence.Save` 会创建新证据，因此候选每次把全部冻存文件复制到当前游戏 `.artifacts/v14-qualification/<class>-<fresh-guid>/workspace/` 的新工作副本。不存在覆写或当前 DLL 替换；子进程的 RepoRoot 由该副本中的原 `LumioBomber.slnx` 定位。archive 与工作副本不能互相包含，副本只复制 manifest 项，新增测试输出保留在本次副本。成功或子进程失败后的 finally 均重新核 archive、工作副本全部 frozen inputs，以及双方 executor 精确 inventory。

每个主 suite Fact 仅派发自身同名原 Fact。注册白名单固定两组 class/method，过滤器按 Root 已确认的 MTP 用法使用 `*Lumio.Bomber.Gameplay.Tests.<Class>` 和 `*<Method>*`，`--minimum-expected-tests 1`。旧 a64e31 Tests 没有 adapter，因而不存在递归；无需反射或重新生成旧 DLL。必须本次子进程 raw exit 0、无超时，并有唯一完整的 total/failed/succeeded/skipped 四项计数 **1/0/1/0**。零例、缺项、重复 summary、失败或 skip 均显式失败。

输出是新建目录中的 `child.log`、`child.exit`、`qualification.json` 和 `config-inputs.json`。只读本次进程捕获的 stdout/stderr，不读取旧日志，也不做失败重试或旧成功恢复。stdout/stderr 并行读取，超时结束整个子进程树后仍保存实际退出码和完整输出；Passed 同时依赖本次执行及全部前后 fence。子进程只继承明确列出的系统/宿主路径环境项，额外仅加入 Config/Python/旧 capture 路径和 UTF8/英文 UI 设定，不继承或序列化认证环境项。主测试仅打印证据目录，不展开可能敏感的进程环境。

## 不可变旧 capture 的核验

archive 与本次工作副本都单独核原 `original.lwm` **21,487 字节**、SHA256 `6a0e5a671cdb89a003c4567ccefa9534481c0fcd48e147b10c583d8aabd755a8`；原 `actual.json` SHA256 `d9512037e1f85c11775ced7271a31ceb970e6947bcf67b9789b00060d25fb573`。metadata 里的 capture Game 必须为 `78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e`，Runtime 必须为 aa552...；31 项 export 必须唯一、实际完整路径集相等、各文件 hash 相等，前后均核。

原兼容 reader Fact 仍执行其所有原断言、实际官方 `WorldManager.Restore` 及 whole-World CaptureSnapshot 字节相等。原 producer Fact 仍执行正式 Config 编译、真实 World 启动与 Tick、五个实际 chest EntityId、全部原 storage assertions、whole-World 保存与实际 Restore。这个 producer 是原 cap5 storage/World 资格用例，不能改称 Native 六箱 producer。

**capture 的原 Game78b1 executor 尚未找回。** archive 是身份明确且已单独资格验证的兼容 v14 Game61ffd reader，证据中一直保留 `OriginalCaptureExecutorRecovered=false`。本候选不声称恢复了原 producer binary，也不声称当前 v15 正向 Restore 该不兼容旧 schema。

## 单独的外部依赖与正式安装落点

旧 producer 使用其原 AuthoredFixture 源编译路径，仍依赖外部 `LUMIO_CONFIG_ROOT` 和 `LUMIO_PYTHON`。候选要求两者是绝对路径且实际存在，Config git HEAD 为 **a991a517f9dbae255321c25d65fea0bfdfdca42f**，工作区含未跟踪源文件在内必须 clean；所有 tracked 文件另做本次前后长度/hash fence，并保存实际列表。Python executable SHA256 必须为 **5f7b89a612c9b8af1d6456cdfcd1dbe5ca630849e79aebced9bee9a6694952ec**，本次 `--version` 必须 raw0 且为 **Python 3.11.9**。这两项仍是单独安装依赖，Python 全部 standard library 未归档、未做完整文件 manifest，**不称 hermetic**。git/dotnet 主机 executable 路径从当前安装定位、记录 hash 并做前后 fence；需要已安装 .NET 10 runtime。

当前被冻结的 native 仅 **win-x64**。候选在其他平台显式报依赖缺失，不能 skip 或把 Linux/macOS 的当前 Native 套进旧 archive。正式 CI 可使用 Windows x64 qualifier job 安装此身份；若要求其他 RID 同样执行，必须以原 v14 源另做实际官方构建/资格验证、保存独立 manifest 与 reader identity，然后新增对应映射。尚无此跨 RID 归档资格证据。

建议正式 Game-owned fixture 依赖落点：小型声明文件置于 `Server/Tests/Fixtures/v14-cap5-compatible-reader-61ffd/qualification-dependency.json`；不可变发行附件命名 `bomber-v14-cap5-compatible-reader-61ffd-win-x64.zip`，只含 `executor-freeze.json` 原字节和 `workspace/` 下 manifest 列出的全部 3688 项。安装解压到独立 fixture cache，给该测试进程设置 `LUMIO_BOMBER_V14_QUALIFICATION_ARCHIVE`。Root 应在实际打包后计算 ZIP hash，把真实 archive identity 写入声明、发布组合和 CI 安装步骤，并另声明 Config/Python 的安装与 hash 检查。**当前尚未创建 ZIP、正式声明、上传发行附件或接入 CI；不能猜 ZIP hash 或称已完成 standalone dependency。** archive 缺失、截断、混入 DLL、依赖缺失/漂移均明确失败，不静默绕过旧用例。

## 本作者实际检查及未执行项

- `prepare-draft.mjs` 实际 raw0：两原 production files 0 drift；去掉唯一派发插入后原文 byte-exact；19+9 原 Assert 调用不变；全部冻存 3688 文件及 113 executor inventory 0 drift。
- 最终 `verify-patches.mjs` 在独立私有 `patch-check-06/` 应用四个 forward 和四个 inverse，8 次 git apply 各 raw0；四份 forward 字节等于候选 hash，两原 inverse 还原原 hash，两新增文件 inverse 删除。无生产写入，无重型构建。
- 首次补丁验证因 git 在父仓子目录按 prefix 跳过 patch，实际 raw1；随后三次因 Windows text=auto/core.eol 把候选 LF 转为 CRLF，hash fence 正确阻止通过，实际 raw1；这些失败工作副本及修订前脚本保留。最终显式指定 `core.autocrlf=false` 和 `core.eol=lf` 后，正反 byte-exact 实际通过。建议 Root 按 manifest 校验后直接复制完整候选字节，或用上述两个 git 配置执行补丁。
- 13 个新的 C# 保护例包括完整单例成功计数、6 个缺失/空/失败/跳过/重复/非法计数、5 个逃逸路径、1 个安全相对路径。测试源码先于 helper 保存，**C# 执行尚未进行，因此不声称完成 TDD 红绿验证**；这些输入是 parser/路径保护单测，不作为真实旧 reader 资格证据。
- Root 既有 `frozen-qualification-proof.json` 的两次真实 1/1/raw0 属既有旧执行器资格证据；本作者未重复运行，也没有将其计入新 adapter 的成功次数。
- C# 编译、13 guard、两个 adapter Fact 及其本次真实旧 reader 子进程、Native、当前 v15 全量均 **UNRUN**。

Root 后续应独立审查后按四个具体 hash 发布，正式构建并执行保护类（最低 13）和两原类（各最低 1），核两个新 child.log 各完整 1/0/1/0/raw0 和所有 fence。当前 v15 的容量 52、原 whole-World 拒绝/迁移边界及六 chest Native producer 仍需其各自当前版本用例与实际证据；这份历史资格 adapter 不替代任何当前规则、容量或 migration 验收。
