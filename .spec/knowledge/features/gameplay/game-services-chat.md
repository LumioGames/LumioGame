---
name: game-services-chat
description: 服务器权威 HTML 聊天样例（Lumio SDK 验证）——最小官方 SDK 验收游戏；接入或验证示例时查
metadata:
  type: doc
  status: 实施中
---

# Lumio SDK 验证（服务器权威聊天样例）

位于 [`games/chat-services-sample/`](../../../../games/chat-services-sample/README.md)。目标是以最小的官方游戏验证游戏服务 SDK：昵称头像授权（`game_display`/`game_leaderboard` 两个冻结用途）、服务器权威动作（`begin`/`send`，幂等操作引用）、cumulative 发言榜（`chat_messages/all_time`）与游客/账号一致的云进度。

当前版本每人可见自己的正式消息（`chat_v1` 状态保留最近 20 条）与全服发言榜；跨玩家互见消息流不在 `game-services-v1` 公共操作闭集内（`state_get` 仅本人投影、`events` 为父容器桥事件），作为后续产品增量另行设计（需 Engine 合同新增读取面 + 字段目录 + 信息策略 + SDK 重建）。

规则插件为纯五入口（`Lumio.GameServices.Chat.ChatRules`），无随机源与壁钟；限长双重执行（catalog schema + 规则），限频归 A 侧配额。资格 key 按 roomNamespace+seq 派生，绑定保留全部 rank 历史、总数取事件 value 之和。
