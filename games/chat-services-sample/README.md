# Lumio 聊天室：服务器权威 HTML 聊天样例

验证游戏服务 SDK 的最小官方示例。浏览器只需要普通 HTML、ES modules 和 WebAssembly；入口是 `Client/index.html` 的 `<script type="module" src="./app.mjs">`。C# 仅用于私有服务器规则插件。

玩家进入聊天室后可以发言。每条消息（1–200 字）由服务器裁决：`chat_v2` 状态保存发言总数与最近 20 条消息，每条被接受的消息向 `chat_messages/all_time` 累计榜贡献 1。首次昵称头像授权、登录与两份存档选择由平台父 UI 负责；拒绝资料授权仍可匿名聊天。v1.2 起公共频道消息跨玩家互见（`channel_read`/`channel_summary` 读取面），登录账号可添加好友（`social_read`/`friend_request`/`friend_respond`/`friend_remove`）并与好友私聊（`send` 的 `dm` 频道）；消息文本经平台 omni-moderation 审核门（fail-closed），未读由真实消息事件驱动。

## 所有权

- `Gameplay/ChatRules.cs`：公开 `IGameRulePlugin` 的五个纯入口；无数据库、HTTP、壁钟、发奖或随机源。`begin` 建房，`send` 返回候选状态与一条榜单贡献，实际提交归 Platform/A。
- `Server/catalog.json`：闭合 action/state/view schemas 与公开业务拒绝原因；无 selector、无迁移。`deployment.json` 为无秘密的测试环境发布输入。`disclosure.json` 为 H 动态投影登记输入（派生自 `chat_view`）。
- `Client/`：调用实际 S SDK，接收父容器已过滤的投影。
- `Tools/`：纯规则测试、真实 R/Native/TLS 集成探针复用 `../game-services-sample/Tools/` 的 HostProbe 模式、打包与攻击考卷。

## 正式状态

首次 initialize/project 的服务器空快照投影为「未进入」。`begin` 与 `send` 的 arguments 闭集：`begin` 必须是 `{}`；`send` 接受 `{"text":"…","channel":"public"}` 或 `{"text":"…","channel":"dm","channelId":"…"}`（文本 1–200 字；`channelId` 仅私聊频道携带，成员资格与好友关系由平台在规则调用前与提交前双重校验）。客户端不提交发言数、完成标记、时间或随机值。

发言资格 key 为 `SHA-256(roomNamespace "/" seq)`；roomNamespace 在首次 `begin` 时由受信 game/environment/originSubjectId 派生，不同主体不共用。绑定保留全部 rank 事件原 ID，按 CanonicalQualificationKey 重建资格组，`messageCount` 取全部保留事件 value 之和；可见最近消息取所选主体一份，不回滚、不补发。

限长由 catalog schema 与规则双重执行；限频由平台 A 侧配额承担（本规则无壁钟，不伪造时间语义）。

## 运行独立验证

```sh
export LUMIO_ENGINE_ROOT='<Engine 当前冻结合同树>'
export LUMIO_SERVER_ROOT='<含真实 RuleService 的 Server 树>'
dotnet test --project games/chat-services-sample/Tools/Tests/Lumio.GameServices.Chat.Tests.csproj
node --test games/chat-services-sample/Tools/client.test.mjs
node --test games/chat-services-sample/Tools/ui.test.mjs
```

显式原生集成（HostProbe / browser-probe / 攻击考卷）复用 `../game-services-sample/Tools/` 的入口与材料要求；缺库即失败、不 skip。

Repository Policy CI 执行 `client.test.mjs` 与无外部依赖的 `ui.test.mjs`，覆盖操作确认、资料失效后的原草稿确认、头像与表情行为。完整打包和浏览器验证是显式材料集成测试，不在该 CI 中运行，也不依赖正式平台会话：

```sh
export LUMIO_CHAT_BROWSER_SDK='<正式 SDK 安装根目录，包含 manifest.json>'
export LUMIO_CHAT_SDK_MANIFEST_SHA256='<外部核验的 SDK manifest SHA256>'
export LUMIO_CHAT_CONTRACT='<Engine 唯一 game-services-v1.json>'
export LUMIO_CHAT_PLAYWRIGHT='<已安装的 @playwright/test 模块路径或可解析模块名>'
node --test games/chat-services-sample/Tools/package.test.mjs games/chat-services-sample/Tools/ui-browser.test.mjs
```

PowerShell 使用 `$env:变量名='值'` 设置相同变量。所有材料必须显式提供；没有机器路径或 SDK pin 默认值，缺材料即失败并提示设置方法，不跳过。Playwright 模块还须已安装 Chromium（在对应依赖目录运行 `npx playwright install chromium`）。浏览器夹具仅在测试 HTTP 服务内替换应用入口，标注「UI 夹具 · 非正式会话」，截图写入本地 `.sdd/floating-chat-ui-screenshots/`，夹具与截图不进入发布包。

## 发布

```sh
dotnet build games/chat-services-sample/Gameplay/Lumio.GameServices.Chat.Rules.csproj -c Release
node games/chat-services-sample/Tools/package-rules.mjs --engine '<冻结Engine树>' --dll '<Release规则DLL>' --out '<新的私有规则目录>'
node games/chat-services-sample/Tools/package.mjs --browser-sdk '<正式SDK安装根目录>' --manifest-sha256 '<外部钉定的manifest SHA256>' --contract '<Engine唯一game-services-v1.json>' --platform-origin 'https://<实际可信平台origin>' --out '<新的游戏静态发布目录>'
```

I 发布时采用实际分配的 game/environment/release/ruleVersion/serviceId 等一致登记；`Server/deployment.json` 是固定测试输入，真实 release ID 与受信 publication 快照必须一致。
