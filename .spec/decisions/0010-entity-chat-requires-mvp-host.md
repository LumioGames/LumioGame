# 0010 · 101-entity SUCCESS 必须由 sibling lumio-mvp-host 实连

- 日期:2026-09-02
- 状态:生效

## 背景

R-00354 要求 sibling Account Server + C# MVP Game host（`lumio-mvp-host`）承载 101 路活连接。ADR-0009 把 `GameRoomHost` 写成切片验收宿主，越权替代了 Server 仓的 host 决策，并把 MaxConnections=64 的容量缺口标成 SUCCESS。

## 决策

- `GameRoomHost` 只作本仓单元测试 double，不得作为 101-entity SUCCESS 路径。
- 启动器必须尝试 sibling `LumioServer` origin/main 的 `lumio-mvp-host`（或记录其 `dotnet build --project …/Lumio.Server.MvpHost.App.csproj -c Release`），并尝试 101 路活升级。
- 第 65 路 HTTP 503、Admission 未接入 FullGraph、或 host dll 缺失：写 `blocked.json`（`FullGraphComposition.cs` MaxConnections/MaxSessions 文件:行 + 实测错误），退出码 1，状态 BLOCKED。
- 不得回退 `wt-server/r-00344`；origin/main Account Server dll 缺失则 BLOCKED，不伪造 SUCCESS。
- 架构仓 / Server 仓的 host 组合与容量决策不由 LumioGame 拥有。

## 后果

当前 FullGraph `MaxConnections = 64` 时，本切片的诚实结论是 BLOCKED，直到 Server 仓提高容量并接入 Admission。
