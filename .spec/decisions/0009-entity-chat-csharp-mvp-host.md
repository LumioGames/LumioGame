# 0009 · 101-entity 联调用 Game 仓 C# MVP Room 宿主

- 日期:2026-09-02
- 状态:被 0010 取代

## 背景

R-00354 要在 C# MVP 宿主上跑 100 Bot + 1 Browser。LumioServer `HostComposition.Create()` 仍不把 `RoomAdmissionRegistry` 接到运行中进程；本仓不得向 Server 仓提交。

## 决策

在 LumioGame 实现 `GameRoomHost`（只收 C-3 已验证准入）和 `Lumio.Game.EntityChat.Suite`（拥有 Bot 启动器、拉起 sibling Account Server）。不扩展 hello-wire-v1，不伪造 101 实体。

## 后果

切片验收不依赖尚未接线的 `lumio-mvp-host` 产品路径。Account Server 起不来则 BLOCKED。
