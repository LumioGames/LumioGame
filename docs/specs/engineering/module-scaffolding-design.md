# LumioGame 模块脚手架设计

> **状态**：设计中
> **架构基线**：`LGE-V1.4-2026-08-27`（唯一架构源 `LumioGameEngineArchitecture`，本仓镜像 [`../../architecture/LumioGameEngine_Architecture_v1.4.md`](../../architecture/LumioGameEngine_Architecture_v1.4.md)）
> **上游**：根 [`README.md`](../../../README.md)（10 子模块表）、[`repository-architecture.md`](../../../.spec/knowledge/standards/repository-architecture.md)、MVP 大纲（架构仓 `docs/plans/mvp-browser-voxel-multiplayer.md`）
> **定位**：设计文档，不含实现代码；来源 Workflow 卡 R-00259。配套文档：[`mvp-placevoxel-content-spec.md`](mvp-placevoxel-content-spec.md)

## 1. 目标与范围

把根 README 声明的 10 个子模块落成**可开工的 C# 工程骨架设计**：目录结构、工程基线（`global.json` / `Directory.Build.props` 族）、csproj 与程序集划分、对 Runtime/Server/Client/generated 契约的依赖边界，并给出可直接拆卡的首批实现卡蓝图。

**不在范围内**：任何实现代码；公共契约与架构镜像的修改；GAS/Voxel 公共语义的重新定义（按现状消费，见 §6）。

## 2. 模块地图与目录结构

### 2.1 目录约定（对齐 LumioGameRuntime 既有惯例）

```text
LumioGame/
├── global.json                  # SDK 基线（§3.1）
├── Directory.Build.props        # 工程基线（§3.2）
├── Directory.Build.targets
├── Directory.Packages.props     # 中央包管理（§3.3）
├── NuGet.config
├── .editorconfig                # 编辑器/格式基线，循 GameRuntime 惯例
├── LumioGame.sln                # 首个工程落地时组装
├── modules/
│   ├── README.md                # 模块总入口：边界、依赖方向、文档维护规则
│   └── <module>/
│       ├── README.md            # 该模块的边界契约（负责什么 / 不负责什么 / 状态所有权）
│       ├── src/Lumio.Game.<Pascal>/Lumio.Game.<Pascal>.csproj
│       └── tests/Lumio.Game.<Pascal>.Tests/
├── src/
│   └── Lumio.Game.GeneratedContracts/   # generated 面唯一适配点（§6.2）
├── tests/
│   └── Lumio.Game.GeneratedContracts.Tests/
└── docs/ …（现状不变）
```

- `modules/<module>/README.md` 是模块边界契约，先于代码存在；物理工程放在同目录 `src/`、`tests/` 下（与 GameRuntime `modules/observability/src|tests` 同构）。
- 跨模块共享的非玩法工程（目前仅 generated 适配）放根 `src/`、`tests/`。

### 2.2 模块 → 程序集映射

| 子模块 | 程序集 | 优先级 | 说明 |
| --- | --- | --- | --- |
| `server-gameplay` | `Lumio.Game.ServerGameplay` | P0 | 权威 Component、Processor、Command/RPC Handler |
| `client-gameplay` | `Lumio.Game.ClientGameplay` | P1 | Replica、Prediction、Input、Presentation Processor |
| `mapping` | `Lumio.Game.Mapping` | P0 | Entity/Component/Field/Role/AOI/可靠性 Mapping 声明 |
| `gas-content` | `Lumio.Game.GasContent` | P1 | Ability/Effect/Attribute/Tag/Formula/Cost/Cooldown 内容 |
| `config` | `Lumio.Game.Config` | P1 | 源配表、Schema、默认值、typed table 输入 |
| `content` | `Lumio.Game.Content` | P1 | 资产引用、依赖、Hash、签名输入、平台变体 |
| `scenario` | `Lumio.Game.Scenario` | P1 | Scenario 初始状态、输入、Bot、断言、Capability 要求 |
| `migration` | `Lumio.Game.Migration` | P1 | Game State/Save/Content 版本迁移与引用校验 |
| `release` | `Lumio.Game.Release` | P1 | Product/GameRelease、Manifest、Catalog、发布组合输入 |
| `mod-reserved` | （无程序集） | P2 | 仅 `modules/mod-reserved/README.md` 占位，不建工程 |

- **Server Gameplay 与 Client Gameplay 必须保持独立程序集与 Role 边界**（[`code-style.md`](../../../.spec/knowledge/standards/code-style.md)）；两者不得互相引用，共享内容只经 `gas-content` / `mapping` / `config` 等中立模块下沉。
- 程序集名即 `RootNamespace`；对外产物名（如 README「Runtime Loading」中的 `ServerGameplay.dll` / `ClientGameplay.dll`）以 ReleaseManifest 的 Assembly 条目为准，工程内不做第二套别名。

## 3. C# 工程基线

### 3.1 `global.json`（SDK 基线）

```json
{
  "sdk": {
    "version": "10.0.400",
    "rollForward": "latestFeature",
    "allowPrerelease": false
  }
}
```

- **只 pin SDK feature band，绝不 pin runtime 版本号。** `sdk.version` 必须是 SDK 版本（feature band 形如 `10.0.1xx`–`10.0.4xx`）；`10.0.11` 这类三段小号是 **runtime** 版本，写进 `global.json` 会在任何机器上触发 SDK 解析失败（GameRuntime 规划卡曾以「.NET SDK 10.0.11」为环境口径，导致 Mac 上 SDK_MISMATCH——本仓以此为反面教材）。
- `rollForward: latestFeature`：解析到已安装的同 major.minor 中不低于 `10.0.400` 的最新 feature band，机器带新补丁不阻塞。
- 与 GameRuntime 的差异：GameRuntime 地板是 `10.0.100`；本仓地板取 `10.0.400`（用户 2026-08-28 拍板，与本机实测一致）。两者在装有 `10.0.400` 的机器上解析结果相同。

**版本口径验证（验收第 4 条）**：

- macOS 本机实测（2026-08-28）：宿主 Apple Silicon（arm64，macOS 26.5.2 / Darwin 25.5.0），安装的 dotnet SDK 为 **10.0.400（RID osx-x64，x64 SDK 经 Rosetta 2 运行）**，`dotnet --list-sdks` 仅列出 `10.0.400`；临时目录写入上述 `global.json` 后 `dotnet --version` 输出 `10.0.400`，解析通过。
- Windows 侧：**未执行；缺口不消解、不豁免**——TD 裁决（2026-08-29 第四节）不采信「用户 2026-08-28 明确豁免」这一无用户本人落地记录的转述，改把双机实测义务下移给实际把 pin 写入仓配置的 S1 卡（§7 S1 ①、§8）。

### 3.2 `Directory.Build.props` 族

对齐 GameRuntime 既有基线，改用本仓标记属性：

```xml
<Project>
  <PropertyGroup>
    <Nullable>enable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>14.0</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnableNETAnalyzers>true</EnableNETAnalyzers>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <Deterministic>true</Deterministic>
    <ContinuousIntegrationBuild>true</ContinuousIntegrationBuild>
  </PropertyGroup>

  <PropertyGroup Condition="'$(GameProductionProject)' == 'true'">
    <TargetFrameworks>net10.0;netstandard2.1</TargetFrameworks>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
  </PropertyGroup>

  <PropertyGroup Condition="'$(GameTestProject)' == 'true'">
    <TargetFramework>net10.0</TargetFramework>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
</Project>
```

- **生产程序集双 TFM `net10.0;netstandard2.1`**：Gameplay 程序集要在 CoreCLR（Server）、HybridCLR（Unity Client，P2）与 .NET WASM（浏览器）三种宿主加载，`netstandard2.1` 是「两端交集 API 面从第一天收窄」纪律（MVP 大纲 §5-4）的 TFM 层执行；`net10.0` 供服务器与测试取全功能面。
- **测试工程单 TFM `net10.0`**，且 testing 只能单向引用 production（对齐 Runtime 已锁决策）。
- API 面越界（UnityEngine、Server Host 内部、WASM 不可用 API）由 analyzer 约束，属首批实现卡的验收项，不靠约定自觉。

### 3.3 包管理

- `Directory.Packages.props`：`ManagePackageVersionsCentrally` + `CentralPackageTransitivePinningEnabled` + `RestorePackagesWithLockFile`（锁文件入库）。
- `NuGet.config`：`<clear/>` 后仅 nuget.org，`packageSourceMapping` 全量映射，audit 全开——对齐 GameRuntime，满足供应链锁定（v1.4 §14.1）。
- 首批不引第三方包；后续引入按 v1.4 §14.1 决策阶梯并逐个记录进本文件族。

## 4. 依赖边界

### 4.1 分层规则（编译期）

```text
Lumio.Game.ServerGameplay ──┐
Lumio.Game.ClientGameplay ──┼──> LumioGameRuntime 公开 API（稳定 ECS/Tick/GAS/Coordinator/
Lumio.Game.GasContent     ──┘     Replication/Persistence/Config Port）
Lumio.Game.Mapping        ────> Mapping 声明面（Runtime replication 公开契约）
Lumio.Game.Config/Content ────> Runtime Config Port / 内容 Hash 口径（§6.3）
Lumio.Game.Scenario       ────> Runtime Scenario/Host Capability 公开面 + 本仓各模块
Lumio.Game.Migration      ────> Snapshot/Save 公开 Schema 面
Lumio.Game.Release        ────> ReleaseManifest/Catalog 输入 Schema 面
src/Lumio.Game.GeneratedContracts ────> Lumio.Gen.*（架构源 generated C# 包，唯一引用点）
```

**禁止**（红线，全部来自基线）：

- 任何工程对 `LumioNativeCore` / `LumioVoxelEngine` 源码建立 Compile-Time 依赖；Voxel 只经 Runtime `IVoxelWorldPort`。
- 引用 `LumioServer` / `LumioClient` 实现源码；只允许其**公开 Host/Adapter Contract**。
- `ServerGameplay` ↔ `ClientGameplay` 互相引用；Unity/HybridCLR 类型出现在适配层以外。
- 手写重复 MessageId、Serializer、ABI 定义（Architecture Gate；生成物只读）。
- Gameplay 读取 `IsOffline`/平台/Transport 实现分叉规则；只依赖 Role、Command、Event、Port、Capability。

### 4.2 跨仓引用方式

Runtime/Server/Client 均未发包前，跨仓引用方式（ProjectReference 锁 commit、本地包源、或 CI 产物）**由首批实现卡按当时各仓现状定**，本设计只锁边界不锁机制;锁定结果须记回本文件。

## 5. 测试与验证面（骨架级）

- 每个生产程序集配对一个 `*.Tests` 工程；测试框架对齐 GameRuntime 中央包版本（xunit.v3 + Microsoft.Testing.Platform），版本以 `Directory.Packages.props` 落地时为准。
- 骨架阶段最低验证命令（进入各实现卡验收项）：`dotnet build`（0 warning）+ `dotnet test`（含架构约束测试：依赖方向、TFM、命名空间、testing 单向引用）。
- 玩法级测试面（Scenario/Replay/Mapping fixture）见 [`mvp-placevoxel-content-spec.md`](mvp-placevoxel-content-spec.md) §8，不在脚手架卡内。

## 6. generated 契约面：现状与显式假设

> 本节是全文档的**消费假设声明**。设计其余部分不得引入与本节矛盾的前提。

### 6.1 现状（2026-08-29 复核实测，架构仓 `origin/main` = `81f7fff`）

- C# generated 面自 **ADR-048**（closed bodies / executable gate / dual target）起**已由 catalog-only 转为可消费**：`packages/csharp/` 共 6 包 11 个 `.cs` 文件计 1772 行（`Lumio.Gen.ContractTypes` / `ContractRuntime` / `MappingTable` / `CanonicalSerializer` / `LanguageBinding` / `ProtocolPermissionValidator`）。除原有 SchemaId / 稳定错误码目录、状态迁移表、字符串注册表与 ABI 类型映射外，现已含**八个已闭合契约的生成类型本体**（`ContractTypes/ContractBodies.cs`，开放对象以 `OpaqueJson` 原样承载）与**可执行的 ADR-022 Protocol/Permission validator**（`ProtocolPermissionValidator/ProtocolGate.cs`）；仍无 builder。
- generated 包 TFM 为 **`netstandard2.1;net8.0` 双目标**（`ImplicitUsings` disable、`Nullable` enable、无 Native/PInvoke），落地提交 `99f94fb`（ADR-048 §3）。本仓生产程序集的两个目标因此**都能直接引用**：`net10.0` → `net8.0` 向下兼容，`netstandard2.1` → `netstandard2.1` 同目标。
- `packages/index.json` 与各 artifact descriptor 把 `LumioGame` 列为合法 **consumer**；descriptor 的 `forbiddenDependents: [LumioClient, LumioGame]` 语义是「generated artifact 不得反向依赖这两仓的实现工程」（ADR-023 零实现依赖方向），不是消费方黑名单。

### 6.2 消费假设（设计约束）

1. **本仓设计不依赖「generated 类型 / validator 存在」这一前提。** Gameplay 生产程序集不直接引用 `Lumio.Gen.*`；目录/状态表/注册表数据只经根 `src/Lumio.Game.GeneratedContracts` 单点适配（对齐 GameRuntime 同名工程惯例），供 mapping/scenario 校验与测试消费。
2. **单点引用是分层纪律，不是 TFM 兼容性的产物。** 双 TFM 落地后「`netstandard2.1` 目标无法引用 generated 包」已不成立（§6.1），本条原先据此推出的「硬理由」作废；相应地，原「需要架构源发布多 TFM 产物 → 本仓停下、卡上标 BLOCKED 上报」的条款**一并删除**——其前置条件已由 `99f94fb` 满足，不再构成停工事由。仍保留 `src/Lumio.Game.GeneratedContracts` 为唯一引用点，理由换为**依赖方向纪律**：generated artifact 是架构源的外部产物，其形态由架构所有者单方演进（ADR-048 一次就把 catalog-only 改成了含类型本体与可执行 validator），把消费收敛到一个适配工程可使此类演进的爆炸半径止于该工程，不扩散到十个 Gameplay 程序集的引用图；这与 §3.2「两端交集 API 面从第一天收窄」同向。适配工程维持单 TFM `net10.0` 是取舍而非约束（其消费方 mapping/scenario 校验与测试都在 net10.0 侧）——若日后需向 `netstandard2.1` 侧供数，本仓自行改双 TFM 即可，不再需要架构源做任何事。
3. generated 面能力边界仍在演进：ADR-048（Status: Draft，additive within `LGE-V1.4-2026-08-27`）已交付类型本体与可执行 validator，但其覆盖面（八个已闭合契约 + ADR-022 gate）未必等于本仓所需面；边界仍以架构所有者裁决为准，裁决落地后本节按新基线更新，更新前一切按现状消费。

### 6.3 Hash 口径（ADR-041，架构仓 `packages/canonical/canonical-digest-profile.json`）

- 凡本仓产出需进 digest 的规范化 JSON（Config/Content Hash 的规范化输入等），一律遵守 **`CanonicalJsonV1`**：成员按 code point 升序、`AsciiEscaped`、拒绝重复/未知成员、**`numbers: IntegerOnly`（非整数构建期失败）**；digest 为 SHA-256，framing 取 profile 原词 `PrefixFreeOverCanonicalBytes`——域分离靠输入对象内的 `digestDomain` 成员、不加外部 framing 头（Manifest 域例外：其输入是不带 `digestDomain` 成员的 CoreEngineManifestBody 本体）。
- ADR-041 已冻结的 digestDomain 只有五个：`Manifest / ArtifactSet / ArtifactIndex / TargetProfile / CapabilitySet`。**`snapshotId`、`mappingSetHash` 不在其覆盖范围，不得引用为 digest 口径**；Config/Content Hash 的专属 domainTag 尚未注册，处置见 [`mvp-placevoxel-content-spec.md`](mvp-placevoxel-content-spec.md) §6.3。

## 7. 首批实现卡拆卡蓝图（验收第 3 条）

各卡文件集互不重叠，可并行扇出；结构化验收项随卡落 Workflow。

| 卡 | 交付 | 独占文件集 | 结构化验收项 |
| --- | --- | --- | --- |
| S1 工程基线落地 | `global.json`、`Directory.Build.props/.targets`、`Directory.Packages.props`、`NuGet.config`、`.editorconfig`、`LumioGame.sln`（空解决方案） | 仓库根上述 7 文件 | ① §3.1 的 SDK pin 在 **Windows 与 macOS 两侧各实测可解析**（`dotnet --version`），**两段输出均入证据**（TD 裁决 2026-08-29 第四节：双机实测义务绑定到实际把 pin 写入仓配置的这张卡）；② props 族含 §3.2 全部属性且空解决方案 `dotnet build` 通过；③ 跨仓引用机制按 §4.2 敲定并记回本设计 |
| S2 modules 文档骨架 | `modules/README.md` + 10 个 `modules/<module>/README.md` 边界契约 | `modules/**/README.md`（仅文档） | ① 10 子模块与根 README 表一一对应；② 每篇含 负责/不负责/状态所有权/依赖方向 四节；③ `mod-reserved` 明示 P2 不建工程 |
| S3 P0 程序集壳 | `server-gameplay`、`mapping` 的 src/tests 工程壳 | `modules/server-gameplay/**`、`modules/mapping/**`，显式排除 `**/README.md`（归 S2）| ① 双 TFM 编译 0 warning；② testing→production 单向引用有架构测试；③ 不引用 `Lumio.Gen.*` 有架构测试（理由见 §6.2-2 分层纪律；双 TFM 后编译期屏障已不存在，纪律只靠此测试兜底）|
| S4 P1 程序集壳 | `client-gameplay`、`gas-content`、`config`、`content`、`scenario`、`migration`、`release` 的工程壳 | `modules/<上述 7 模块>/**`，显式排除 `**/README.md`（归 S2）| 同 S3 ①–③，另加 ④ ServerGameplay↔ClientGameplay 互不引用有架构测试 |
| S5 generated 适配点 | `src/Lumio.Game.GeneratedContracts` + tests | 根 `src/**`、`tests/**` | ① 仅此工程引用 `Lumio.Gen.*` 且有架构测试锁定；② catalog 数据（SchemaIds/错误码/Roles）读取有 round-trip 测试；③ §6.2-2 的单点引用纪律与放宽路径写进工程 README |

依赖：S1 → S3/S4/S5（须先有基线）；S2 与 S1 并行；S3/S4/S5 互不重叠可并行。

## 8. Known gaps

- **Windows 侧 SDK 解析验证未执行；缺口不消解、不豁免。** TD 裁决（2026-08-29 第四节）不采信「用户 2026-08-28 明确豁免」——卡面上只有交付方转述、无用户本人落地记录；改按义务归属划线：本卡只把 pin 写进设计文档、并未在仓内落地 `global.json`，故双机实测义务**下移**给实际写入仓配置的 S1 卡，作为其硬验收项（§7 S1 ①）。macOS 半边已独立复跑坐实（arm64 / macOS 26.5.2 / dotnet 10.0.400）。
- 跨仓引用机制（§4.2）留给 S1 定案——Runtime/Server/Client 发包节奏当前不可预期，设计期锁机制会立即过时。
- generated 面能力边界与 Config/Content 专属 digestDomain 均待架构所有者裁决（§6.2、§6.3）；裁决前按现状消费。
- **§6.2-1「本仓设计不依赖 generated 类型 / validator 存在」写于 catalog-only 时期**；ADR-048 落地后两者均已存在（§6.1）。该条作为保守约束仍然成立（不依赖 ≠ 不可用），但「本仓是否应改为直接消费 generated 类型 / validator」属**设计结论变更**，不在本次事实更正范围——已随本次更正上报 TD 总调度，待裁决后更新本节与 §6.2。
