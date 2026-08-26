# LumioGame

> Lumio 的最终游戏产品、最高层业务和唯一发行组合入口。

## 定位

`LumioGame` 不是底层示例，也不是单独的 Gameplay 库。它最终会构建成一款完整游戏，包含客户端、UI、表现、内容和资产，同时产出运行同一款游戏的 Dedicated Server Gameplay 与发行包。

五个底层仓库保持可复用和与产品解耦；本仓库锁定它们的兼容版本并完成最终组装。

## 职责

- 客户端游戏本体、UI、输入映射、表现层、音频、场景和平台入口。
- 客户端与服务器共享的 Gameplay 规则、Component、RPC、Ability、Buff、AI、任务、背包、经济和建造规则。
- 服务器专用 Gameplay Handler、热更程序集、状态迁移、Schema、配置和内容包。
- 游戏数据、关卡、资产、产品配置、版本信息和第三方内容授权记录。
- 锁定所有底层仓库的 SemVer、Commit、原生产物 Hash 和兼容矩阵。
- 组装最终客户端，以及 `LumioServer + GameRuntime + Gameplay + Config + Content` 的游戏服务器发行包。

## 依赖关系

### 上游依赖

- [`LumioNativeCore`](https://github.com/LumioGames/LumioNativeCore)：通过锁定的原生产物间接组合。
- [`LumioVoxelEngine`](https://github.com/LumioGames/LumioVoxelEngine)：体素世界和客户端/服务器共用核心。
- [`LumioGameRuntime`](https://github.com/LumioGames/LumioGameRuntime)：共享 ECS、稳定运行时和热更宿主契约。
- [`LumioServer`](https://github.com/LumioGames/LumioServer)：通用 Dedicated Server 宿主。
- [`LumioClient`](https://github.com/LumioGames/LumioClient)：通用客户端运行时与宿主适配。

### 下游使用者

- 无。`LumioGame` 位于依赖图最上层，是最终产品与发行根节点。

```text
LumioNativeCore ─> LumioVoxelEngine
        │                  │
        ├──────────┬───────┘
        ▼          ▼
LumioServer   LumioClient
        ▲          ▲
        └─ LumioGameRuntime
                │
                ▼
            LumioGame
       client + server + UI + content
```

## 契约所有权

本仓库是具体游戏 RPC、Gameplay Component、Ability、业务 Schema、内容配置和状态迁移的唯一事实源。底层传输协议、Native ABI 和 Voxel ABI 由对应底层仓库拥有。

## 禁止事项

- 禁止复制、Fork 或内嵌五个底层仓库的源码作为长期依赖方式。
- 禁止重新定义 Native Handle、Voxel Mutation、Managed Host API 或服务器传输信封。
- 禁止让任何底层仓库反向依赖本仓库源码；服务器只能在运行或打包阶段加载本仓库产物。
- 禁止把产品特例下沉到底层库，除非它已经被证明是可复用、无业务语义的公共能力。
- 禁止提交无再分发授权的第三方资产、凭据、签名密钥或生产配置。

## 当前状态

`v0.1.0` 仅冻结游戏组合入口、仓库职责与依赖边界；尚未创建游戏代码、UI、资产或软件包。

