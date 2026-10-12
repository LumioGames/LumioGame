---
name: game-services-chat
description: 服务器权威 HTML 聊天样例——薄荷精灵界面、操作确认、头像授权与发言榜；接入或验证聊天示例时查
metadata:
  type: doc
  status: 实施中
---

# Lumio 聊天室（服务器权威聊天样例）

位于 [`games/chat-services-sample/`](../../../../games/chat-services-sample/README.md)。目标是以最小的官方游戏验证游戏服务 SDK：昵称头像授权（`game_display`/`game_leaderboard` 两个冻结用途）、服务器权威动作（`begin`/`send`，幂等操作引用）、cumulative 发言榜（`chat_messages/all_time`）与游客/账号一致的云进度。

当前版本每人可见自己的正式消息（`chat_v1` 状态保留最近 20 条）与全服发言榜；跨玩家互见消息流不在 `game-services-v1` 公共操作闭集内（`state_get` 仅本人投影、`events` 为父容器桥事件），作为后续产品增量另行设计（需 Engine 合同新增读取面 + 字段目录 + 信息策略 + SDK 重建）。

规则插件为纯五入口（`Lumio.GameServices.Chat.ChatRules`），无随机源与壁钟；限长双重执行（catalog schema + 规则），限频归 A 侧配额。资格 key 按 roomNamespace+seq 派生，绑定保留全部 rank 历史、总数取事件 value 之和。

界面采用浅色薄荷精灵 IM：消息按本人授权投影显示昵称与头像，右对齐；窄窗在「我的云消息」与真实发言榜间切换，宽窗同时显示发言榜侧栏。消息列表独立滚动，输入区固定在容器底部，短屏仍可操作。表情是固定短文本标记，仅映射随包精灵图集，未知标记和 HTML 字样保持普通文本；动态精灵播放 16 帧，尊重 reduced-motion。

`Client/view.mjs` 管理 DOM、表情、头像缓存和操作确认；`session.mjs` 继续拥有正式/试玩生命周期。SDK 操作观察层原样转发调用、结果与异常，绑定本次操作引用记录回执，再结合权威进度判断成功；其他会话增加计数不会确认本次被拒绝的操作。发送与进入后立即查询一次，pending 最多追加三次延迟查询原操作，不重发动作；长期未确认保留草稿和手动查询入口，身份或离线变化终止旧确认流程。

头像通过 SDK 授权资源读取，仅在当前玩家和授权修订投影内缓存；SDK disclosure 失效时立即清空，异步晚到结果不跨投影显示。无授权显示明确匿名头像，不取平台 Cookie、不构造头像外链。正式打包显式包含视图模块与精灵图集，根入口与 Client 入口均按相对资源加载。纯 UI 浏览器夹具带有醒目标识，不进入正式发布包；正式匿名发送由平台容器集成验收。
