# 林间远征：服务器权威 HTML 样例

R-00833。浏览器只需要普通 HTML、ES modules 和 WebAssembly。入口是 `Client/index.html` 的 `<script type="module" src="./app.mjs">`；不需要 React、.NET 浏览器运行时、npm 开发服务器或前端编译器。C# 仅用于私有服务器规则插件。

玩家从营地开始，可领取一次三份补给。每次选择山脊或河谷，消耗一份补给并完成一个挑战。山脊 10–29 分，河谷 15–24 分；分数由服务器已登记机会的固定材料确定。最高挑战分进入 `expedition_best/all_time`。这个技术样例围绕一次简短试玩展示规则、云存档和防重；不扩展商业化或长线玩法。

## 所有权

- `Gameplay/ExpeditionRules.cs`：公开 `IGameRulePlugin` 的五个纯入口；无数据库、HTTP、壁钟、发奖或随机源。返回候选状态、成本、资格和成绩，实际提交归 Platform/A。
- `Server/catalog.json`：闭合 action/state/view schemas、机会 selector、迁移和公开业务拒绝原因。`deployment.json` 为无秘密的测试环境发布输入。
- `Server/disclosure.json`：从精确 view schema 派生的 H 动态投影登记输入。它是部署输入，不表示已写入平台。I 必须补当前 scope/release/可信规则 registration ID/revision，并从 catalog 取 `SchemaJson`。普通玩法字段使用冻结的 `state.view` / `operation.result`；两候选摘要使用 `binding.candidate_summary` 及明确 `/source`、`/target` owner。没有新建权限字段。
- `Client/`：调用实际 S SDK，接收父容器已过滤的投影；头像昵称首次授权、账号登录、两份存档选择由真实 Platform 父 UI 负责。拒绝资料权限仍可匿名游玩。
- `Tools/`：自己的纯规则测试、真实 R/Native/TLS 集成探针、纯 HTML 浏览器探针、打包和攻击考卷。没有引用 Engine 的 tests/fixtures/samples。

规则插件使用根统一的 `GameRulePluginProject=true` 专项生产 profile（net10/C#14/文档/分析器/警告即错误）；不能使用双 TFM 或测试 profile 伪装生产插件。根构建/CI/知识导航由 I 接线。

## 正式状态与资格

首次 initialize/project 的服务器空快照投影为“未开始”。玩家仅发送 `begin`、空 arguments、服务器 revision=0。prepare/evaluate 返回初始文档候选，由 A 在同一正式事务中创建；没有 seed 上传、客户端覆盖存档或第六个公开入口。

`claim_supplies` 和 `begin` 的 arguments 必须是 `{}`。`explore` 只接受 `{"route":"ridge"}` 或 `{"route":"river"}`。客户端不提交分数、完成标记、数量、时间、随机值、nextState。

补给资格是 `supplies/starter_v1`，永久 grant=3。每次挑战 spend=1，并返回 `challenge/expedition_<drawIndex>` achievement 与同资格的榜单 contribution。prepare 在发放随机前验证余额，selector 只引用受信文档里的 `eligible/entitlementKey/drawIndex`，还须匹配 A 提供的准备事实。evaluate 对固定材料重算；修改 operation ID 不刷新结果。一次候选包含完整 state/ledger/rank，纯函数重算没有提交副作用。

随机机会的 entitlementKey 与账本 starter_v1 资格分开：首次 begin 对受信 game/environment/originSubjectId/starter_v1 做 SHA-256 生成私有 namespace；不同玩家同 ordinal 不共用机会。已有文档保持原 key，迁移保留，绑定优先保留账号原 key（无账号存档才承接游客 key），选旧档不换材料 namespace。真实熵材料仍只由 A 生成并持久化，游戏不自造随机源。

绑定只选择服务器提供的 reference。保留所有 ledger/rank 事件原 ID 和原 subjectId；A/B 负责同一一致性快照的当前 alias 归属证明。相同 canonical starter 资格的 grant 取最大值，全部 spend 相加，余额最低为零。即使两个游客各领三份并各花两份，合并后也不会多出补给。有效榜单贡献全部保留，最高分重建；旧存档只影响可逆的路线展示。容量不够必须先拒绝，不截断历史、不删除 guest、不阻断账号登录。

`expedition_v1` 到 `expedition_v2` 是本新功能自身的规则版本迁移：补上 `trail=camp`，并用当前不可回滚账本重建机会 ordinal/eligibility；不迁移旧 SDK，不产生 ledger/rank 效果。

离线试玩使用页面内独立临时值，不写 localStorage、IndexedDB 或动作队列。重新联网只读 getState/getProfile；未确认正式操作保留原 SDK reference 供查询，not_found 不解释为已关闭。身份变化后清空资料/视图/榜单并停用旧实例。

## 运行独立验证

设置源码位置（以下均为受信实际检出，不是复制的合同）：

```powershell
$env:LUMIO_ENGINE_ROOT = '<Engine 当前冻结合同树>'
$env:LUMIO_SERVER_ROOT = '<含真实 RuleService 的 Server 树>'
dotnet test --project games/game-services-sample/Tools/Tests/Lumio.GameServices.Sample.Tests.csproj
node --test games/game-services-sample/Tools/client.test.mjs
```

显式原生集成入口不进入默认无 Native 单测；缺库即失败、不 skip：

```powershell
$env:LUMIO_ENGINE_NATIVE_PATH = '<官方构建的 lumio_engine_native.dll；旁边保留原 build-info.json>'
dotnet run --project games/game-services-sample/Tools/HostProbe/Lumio.GameServices.Sample.HostProbe.csproj
```

探针由真实 R `RuleHostRuntime` 装载样例插件，使用生产 Native/HFSM，启动真实 R `RuleHttpHost`，以 TLS1.3、双向证书及双方 pin 调用五入口。证书只临时在本进程使用，不安装信任、不输出私钥。输出 `.run/game-services-host-probe/<id>/evidence.json`，包含请求/响应摘要和仅用于受控测试的私有候选；不可放入公开游戏发布包。

纯 HTML 浏览器验证使用已经完成的 HostProbe 结果，生产 SDK/adapter/WASM 与两个不同 loopback origin：

```powershell
node games/game-services-sample/Tools/browser-probe.mjs --browser-sdk '<正式SDK安装根目录>' --manifest-sha256 '<外部钉定的manifest SHA256>' --contract '<Engine唯一game-services-v1.json>' --host-evidence '<本次HostProbe evidence.json>' --chromium '<Chromium可执行文件>' --playwright-package '<安装@playwright/test的package.json>' --out '<新的空.run目录>'
```

浏览器探针明确使用受控 HTTP 数据夹具，其公开玩法投影来自真实 R 返回候选。它证明模块接入、真实 WASM、资料拒绝、正式意图、离线隔离及父 UI 选档；它不实现、不验证 PostgreSQL 事务、账号认证、真实 alias 或最终两个玩家浏览器组合。上述最终证据归 I。

## 发布

```powershell
dotnet build games/game-services-sample/Gameplay/Lumio.GameServices.Sample.Rules.csproj -c Release
node games/game-services-sample/Tools/package-rules.mjs --engine '<冻结Engine树>' --dll '<Release规则DLL>' --out '<新的私有规则目录>'
node games/game-services-sample/Tools/package.mjs --browser-sdk '<正式SDK安装根目录>' --manifest-sha256 '<外部钉定的manifest SHA256>' --contract '<Engine唯一game-services-v1.json>' --platform-origin 'https://<实际可信平台origin>' --out '<新的游戏静态发布目录>'
```

静态发布消费已可信安装的完整官方浏览器 SDK 制品，要求外部 manifest pin 与 Engine 唯一合同；不接受源码树或缺依赖回退。工具逐文件校验字节、依赖、生产 WASM 和执行预算，再原样保留 `vendor/core`、`vendor/lumio`、`vendor/manifest.json` 全布局。Client 在 `Client/`，根 `index.html` 通过 base 指向该目录以对接正式 H 入口。包内没有规则 DLL、catalog、完整服务器状态、随机材料、证书或 Key。规则制品独立，完整 DLL 清单和原字节 SHA-256 写入冻结 `RulePluginArtifact`。输出目录必须为空，工具不会覆盖既有发布。

打包守护测试要求 `GAME_SAMPLE_BROWSER_SDK`、`GAME_SAMPLE_BROWSER_SDK_MANIFEST_SHA256` 和 `LUMIO_ENGINE_ROOT` 指向实际材料，再运行 `node --test games/game-services-sample/Tools/package.test.mjs`；缺材料失败，不跳过。

I 发布时采用实际分配的 game/environment/release/ruleVersion/serviceId 等一致登记。此仓 `deployment.json` 是固定测试输入；真实 release ID 与 H 受信 publication 快照必须一致，不能凭客户端字段推断。生产 origin 必须按 H 隔离域策略配置。`Client/publication.json` 的 platformOrigin 是可信发布配置；fragment 只允许 S 的非秘密 `lumioContainer` 当前文档标识，不携带 session/AI grant/密钥。

I 还需把 R 两个实际生产项目、Engine Contracts 和本插件加入实际构建/依赖图；注册 R 制品/catalog/pins/证书提供器与当前修订，D 的最高分整数榜（season 两端为 null），H 九个动态出口及当前文档归属。不要向 Game 注入数据库或平台提交服务。

## 攻击考卷

`Tools/attack-exam.json` 给出 20 个稳定编号的前置、操作、期望及已实现模块证据；涉及 DB 故障、重启、容量、旧来源 alias 的条目由 I 在隔离真实平台执行，未运行不记通过。

`Tools/replay-http-attacks.mjs` 可在独立 loopback 平台执行 6 类最终值注入、同 ID 异载荷与关闭竞争。参数为非秘密 context 文件和证据输出文件；session/CSRF 只从环境读取，证据不输出凭据。它拒绝非本地目标和缺失环境。DB 全部效果一致性仍需 I 查真实事务审计，不能用 HTTP 终态代替。
