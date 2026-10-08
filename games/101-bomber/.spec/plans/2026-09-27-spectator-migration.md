# 101 Bomber 浏览器旁观迁移

## 第一轮：复制与体素旁观骨架

浏览器使用发布物 `Engine/web/` 的连接、Replica 和体素 wasm。C# 宿主通过 `ReplicaApplyTickLoop` 应用 WorldChange；页面只读取 `SpectatorDump` 的实体投影和体素 wasm 的表面读数。SectionFrame 仍经有界队列传给体素 wasm。浏览器不调用 Ability，也不发送 InputCommand。

实体投影以 `LogicTransform.WorldPosition` 为位置，以 Registry 的 wire name 为类型。玩家额外输出当前复制的 `IdentityComponent.Name`、`BomberSkillState.CharacterId`，并用已激活的客户端角色表将非零角色 ID 查为角色名；缺失值为 `null`。当前声明没有玩家颜色字段，所有实体暂用中性灰，自身用白圈区分。地图宽深由已激活的 `map` 表供给页面，当前是 19×19，不使用 Sample 的 32×32 / 30f 常量。

本轮边界：这只是只读、俯视图的旁观骨架；没有原型表现层的 `GameSource`、完整 D 表现或同局旁观验收。`IdentityComponent.Name` 当前为 Room 复制范围；投影仍对尚未交付的值保留 null。Gameplay 浏览器目标与正式 wasm 宿主本地构建已通过，消费只读 Engine 发布物；不通过复制同级客户端 DLL 绕过。

## 第二轮接口

在冻结的复制字段上接原型 `src/view/`、`src/hud/`、`src/present/` 和 `src/contract/` 的正式表现；补齐对局状态、角色/炸弹/拾取物的呈现和同局旁观证据。若表现需要尚未声明或复制的字段，应先在上游玩法/契约定形，再由页面消费。`prototype/` 保持原样，不引用 `src/sim/`。
