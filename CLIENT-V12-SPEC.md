# 聊天客户端 v1.2 实现规格（LumioGame games/chat-services-sample/Client）

工作树：/Users/cui/LumioGames/LumioGame-m2（分支 codex/chat-m2，基于 PR #77 head 0f0a717）。
规则插件与 catalog 已升级（send 参数 {text, channel:"public"|"dm", channelId?}；37/37 规则测试已绿，不要再动 Gameplay/ 与 Server/catalog.json）。

## 产品目标

把"个人云消息"升级为真正的多人聊天：**公共频道**（匿名+登录互见）、**好友**（申请/接受/拒绝/删除，需登录）、**私聊**（好友间 DM）、**未读提醒**。保留既有设计语言：薄荷色精灵、浅色面板、头像、表情（[精灵:XX]）、确认/恢复状态机、离线试玩语义。不伪造任何在线人数/消息/通知。

## SDK 能力（新 bridge 方法，父容器 adapter 已放行）

- `channelRead {channelId, cursor|null, limit(1-50), markRead:bool}` → `{channelId, messages:[{messageId,channelId,seq,sender:{playerId,profile,accountLinked},text,sentAtMs}], nextCursor|null, hasMore, unread}`
- `channelSummary {}` → `{publicUnread, dmChannels:[{channelId,friendPlayerId,profile,unread,lastMessageAtMs|null}], friendRequests:{incoming,outgoing}, totalUnread}`
- `socialRead {}` → `{friends:[{playerId,profile,dmChannelId,friendsSinceMs}], incoming:[{requestId,playerId,profile,requestedAtMs}], outgoing:[...]}`
- `friendRequest {targetPlayerId}` → `{requestId,status:"pending"|"accepted"}`
- `friendRespond {requestId,accept:bool}` → `{requestId,status:"accepted"|"declined"}`
- `friendRemove {targetPlayerId}` → `{status:"removed"}`
- 发送仍是 `performAction(action:"send", {text, channel, channelId?})`（dm 必带 channelId）。错误码新增：gs_channel_denied/gs_login_required/gs_message_blocked/gs_message_moderation_unavailable/gs_social_denied。
- profile 形状同现有（displayName 授权后存在，否则 anonymousName；avatarResourceId 可能存在→getAvatar）。

## 页签结构（改 index.html）

tabs：**公共**（public，默认）｜**好友**（friends）｜**发言榜**（ranks，保留现状）。 "我的云消息"概念退役为个人状态（count 仍在头部），不再是页签。
- 公共面板：`<ol id="pub">` 消息流（所有发送者，头像+名字+游客徽标+时间+气泡/表情），底部复用现有 composer（发送到公共频道）。
- 好友面板：分区——好友列表（头像/名字/未读徽标/「私聊」「删除」）、收到的申请（接受/拒绝）、发出的申请（等待中）。空态文案友好。未登录时整面板显示"登录后可以添加好友、发起私聊"+现有登录入口。
- 私聊视图：点好友/未读徽标进入（好友页内切换，非新页签）：`<ol id="dm-msgs">`+输入行（独立 input id="dm-box"，发送带 channelId）。返回按钮回好友列表。
- 榜面板不动。
- 头部：`#player` 显示身份名 + 匿名时加"游客"小徽标；`#count` 保留。
- title 改《Lumio 聊天室》。

## 状态与轮询（session.mjs 扩展，不改既有 act/confirm/recover 语义）

新增 session 方法（全部 generation 守卫、official 模式才可用）：
- `readChannel(channelId,{cursor,limit=30,markRead})`、`channelSummary()`、`socialRead()`、`friendRequest(id)`、`friendRespond(id,accept)`、`friendRemove(id)`。
- view state 增：`channel:{public:{list,cursor,hasMore},dm:{active:null,list,cursor}}`、`social:{friends,incoming,outgoing}`、`summary`。用现有 publish() 合并。
- 轮询循环（app.mjs 启动，official 后开启；generation 失效即停）：
  - 活动 channel（公共页签=public；DM 打开时=该 dm）：每 3000ms channelRead（markRead=true 仅当该面板可见且文档可见；cursor 前向）。用 messageId 去重 append；hasMore 且用户在顶部时可再拉（v1 简化：不做历史回翻，仅最新页+增量）。
  - summary 每 5000ms；socialRead 每 5000ms（错开）。
  - offline/trial 模式停轮询；reconnect 后重启。SDK 抛 gs_rate_limited/gs_bridge_busy 时退避 ×2（上限 20s）。
- 未读推送：每次 summary/轮询后计算 totalUnread（含公共未读+dm 未读+incoming 申请数），与上次比较：变化时 `window.parent.postMessage({type:'lumio:chat-activity', totalUnread, pulse: 新消息到达}, platformOrigin)`。platformOrigin 从 publication.json（app.mjs 已读）。仅这一种自定义消息；不携带任何聊天内容。
- 发送：controller.submit(text) → 依当前 composer 目标（公共或 dm.channelId）组装 arguments；confirmed() 逻辑沿用（state.view.recent 会包含新文本——注意 dm 文本也进 recent，确认逻辑不用改，但要防止公共与 dm 的 text 相同造成误判？——confirmed 用 includes(text) 属现有弱确认，保持不变，提交后立即触发一次 readChannel 刷新真实列表）。
- 身份隔离：identity_changed/invalidate 已有；重置 channel/social 状态并清轮询。

## 渲染（view.mjs 扩展）

- `renderChannel(list, {selfPlayerId})`：每条消息：头像（复用 createAvatarCache，sender.profile）、名字=displayName??anonymousName、`游客`徽标（!accountLinked）、时间（HH:MM，sentAtMs）、气泡（messageParts 表情解析沿用）、自己的消息右侧对齐 `.mine`。**不显示 playerId 原文**；点击他人头像/名字 → 弹小菜单「加好友」（自己/游客目标禁用并说明）。
- 好友列表项：头像+名+未读徽标（summary.dmChannels 对应 unread>0）+按钮。DM 视图头部显示对方名字+返回。
- 全部 aria/tab 语义照现有写法；禁用态完整（busy/pending 时禁用全部写操作按钮——沿用现有 busy 状态机）。
- 错误呈现映射（notify 用）：gs_login_required→"请先登录"，gs_channel_denied→"没有权限访问该频道"，gs_message_blocked→"消息未通过安全审核，请修改后重发"，gs_message_moderation_unavailable→"安全审核暂不可用，稍后重试"，gs_social_denied→按 gameReason 提示（target_not_logged_in→"对方是游客，无法添加"；already_friends/already_requested/self→对应文案）。
- 移动端 390px 与短屏（max-height 320px）可用：好友行/徽标压缩。风格沿用现有 CSS 变量（薄荷/浅色）。

## 测试（必须更新并全绿）

- `Tools/ui.test.mjs`：node --test 无外部依赖级 DOM 测试照现有模式扩展：公共频道渲染他人消息+游客徽标、好友列表/申请按钮、DM 视图切换、发送参数组装（public 与 dm 各断言 arguments 形状）、未读推送 postMessage（stub parent）、去重（同 messageId 不重复渲染）。
- `Tools/client.test.mjs`：session 新方法的请求/响应/generation 守卫测试（照现有 sdk stub 模式）。
- `Tools/ui-browser.test.mjs`（材料集成，Playwright）：补一条公共频道双消息渲染冒烟（沿用现有夹具模式；缺材料时该文件本就不跑）。
- 运行：`node --test games/chat-services-sample/Tools/ui.test.mjs games/chat-services-sample/Tools/client.test.mjs`（在仓根）必须 0 失败。

## 边界

- 不改 SDK/合同/规则/catalog/打包工具（package.mjs 等）。
- 不做在线状态、已读回执、历史回翻、图片消息。
- 不伪造数据：任何列表/未读只来自真实 SDK 响应。
- 提交：git commit（feat(chat-ui): ... 风格），不 push。
- 完成后报告：文件清单、测试结果、与规格的偏差。
