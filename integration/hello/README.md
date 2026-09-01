# MS-00002 Hello World 集成启动器

MS-00002 Hello World 端到端里程碑的集成验收工具:集成启动器(launcher)、静态文件服务(static-server)与单轮证据三方对账器(verify-evidence)。契约真值是架构仓 [`engine/wire/hello-wire-v1.json`](https://github.com/LumioGames/LumioGameEngineArchitecture/blob/main/engine/wire/hello-wire-v1.json)(`lumio.hello-wire.v1`),本目录不复制协议语义,只实现执行与验收逻辑。

- Node ESM,除 playwright 外零运行时依赖;Node >= 24(`engines` 已固定)。
- 真实端到端由主 loop 在全部上游构建产物就绪后执行;`npm test` 面只含 verify-evidence 的正反单测。

## 文件

| 文件 | 职责 |
|------|------|
| `launcher.mjs` | 总指挥:prepare → round 1/2 → finalize,产出证据包并给退出码 |
| `static-server.mjs` | web 资产静态服务(动态端口 + ready-file + stdin shutdown) |
| `verify-evidence.mjs` | 单轮三方对账器(可独立 CLI 运行,也导出纯函数供单测) |

## 前置(各仓构建产物)

| 参数 | 来源 |
|------|------|
| `--server-exe` | LumioServer 仓构建输出 `target/<profile>/lumio-server.exe` |
| `--native-dir` | LumioGameEngineArchitecture 仓 `.run/<BuildId>/win-x64/`(含 native dll 与 `build-info.json`,buildId/abiHash/binarySha256 从后者读取) |
| `--runtime-dir` | LumioGameRuntime 仓 `modules/hello/entry` 构建输出(须恰有一个 `*.runtimeconfig.json`,同名 `.dll` 为 entry 程序集) |
| `--bot-dll` | LumioClient 仓 `modules/hello/host` 构建输出 `Lumio.Client.HelloBot.dll` |
| `--web-dir` | LumioClient 仓 `modules/web/hello/`(须含 `index.html`;契约会在 prepare 阶段复制为 `contract.json` 放 web 根) |
| `--contract` | 架构仓 `engine/wire/hello-wire-v1.json` |
| `--out` | 证据输出目录(建议放仓外或本目录 `evidence/`,已被 gitignore) |

安装:`npm install`(仅需 playwright;浏览器用系统 Chrome/Edge,无需 `playwright install`)。

## 运行

```bash
node launcher.mjs \
  --server-exe <LumioServer>/target/release/lumio-server.exe \
  --native-dir <LumioGameEngineArchitecture>/.run/<BuildId>/win-x64 \
  --runtime-dir <LumioGameRuntime>/modules/hello/entry/bin/... \
  --bot-dll <LumioClient>/modules/hello/host/bin/.../Lumio.Client.HelloBot.dll \
  --web-dir <LumioClient>/modules/web/hello \
  --contract <LumioGameEngineArchitecture>/engine/wire/hello-wire-v1.json \
  --out evidence
```

- 退出码 0 = SUCCESS,1 = FAILED;任何一步失败都会完整清理(kill 树)并保留已产证据。
- server CLI 参数按 LumioServer 约定透传:`--engine-native/--hostfxr/--runtime-config/--assembly/--entry-type/--entry-method/--wire-contract/--audit-file/--ready-file`。
- 可选覆盖:`--entry-type`(默认 `HelloEntry`)、`--entry-method`(默认 `Run`)、`--hostfxr`(默认 `C:/Users/g923/.dotnet/host/fxr/10.0.11/hostfxr.dll`)、`--dotnet`(默认 `dotnet`);环境变量等价物 `LUMIO_ENTRY_TYPE` / `LUMIO_ENTRY_METHOD` / `LUMIO_HOSTFXR` / `LUMIO_DOTNET`。

单轮对账器可独立运行:

```bash
node verify-evidence.mjs --audit <round>/server-audit.ndjson --bot-trace <round>/bot-trace.ndjson \
  --bot-result <round>/bot-result.json --browser-result <round>/browser-result.json \
  --contract hello-wire-v1.json [--json]
```

## 一轮流程(launcher.mjs)

1. 起 server,等 ready-file(30s 超时);
2. 起 static-server(root = web 资产目录),等 ready;
3. 起 bot(`dotnet Lumio.Client.HelloBot.dll --url ws://127.0.0.1:<serverPort>/ --role bot --contract <契约> --trace <round>/bot-trace.ndjson --result <round>/bot-result.json`),轮询 trace 出现 `connected`(未见也固定等 2s,由 result/verify 兜底);
4. Playwright 启动真实 Chromium(`channel:"chrome"` headless,失败降级 `msedge`),开 trace → 打开 `http://127.0.0.1:<staticPort>/index.html?ws=...&role=browser` → 等 `window.__lumioResult.status==="ok"`(30s,期间收 console/pageerror/网络错误)→ 截图 `hello-received.png` → trace 存 `trace.zip`;
5. 等 `bot-result.json` `ok:true`(30s);
6. shutdown 前先做一次对账(仅记录);向 server stdin 写 `shutdown` 行,等全部子进程退出(15s 宽限,超时强杀并判失败),记录每个进程退出码(必须全 0);
7. shutdown 后做权威对账(契约:server 退出前 flush audit)写 `verify-report.json`。

## 证据目录结构

```text
<out>/
  release-manifest.json        # prepare 产物:全部工件 SHA-256、buildId/abiHash/binarySha256、web 资产清单
  launcher.ndjson              # launcher 自身事件流(每步)
  manifest.json                # 最终结论:两轮摘要、对比、残留进程检查、全部 evidence 文件哈希、SUCCESS/FAILED
  round-1/                     # round-2/ 同构
    server-ready.json          #   server ready-file({"port":N,...})
    server-audit.ndjson        #   server 审计事件流
    server.log                 #   server stdout/stderr
    static-ready.json          #   static-server ready-file({"port":N})
    static-server.log
    bot-trace.ndjson           #   bot trace 事件流
    bot-result.json            #   bot 最终结果(ok/received/...)
    bot.log
    browser-result.json        #   window.__lumioResult 快照
    browser-console.ndjson     #   console/pageerror/requestfailed/bad-response
    hello-received.png         #   截图(失败时为 failure-evidence.png)
    trace.zip                  #   Playwright trace
    verify-report.json         #   三方对账报告(逐项失败带行级摘录)
```

## 对账规则(verify-evidence.mjs)

- **非 Echo 链**:audit 中每条 `ingress_received` 之后必须存在 `deltaCount>=1` 的 `tick_committed`,且随后有路由给**对方会话**的 `delta_routed`(同 sender/sequence/payloadSha256,携带该 tick 的 tickId/revision);任何 `delta_routed` 之前也必须存在匹配的 `tick_committed`——「无 tick 即 egress」即 Echo 链,判 FAIL。
- **方向**:browser `received` 须含 `sender=bot` 记录,bot `received` 须含 `sender=browser` 记录;`payloadSha256` 都必须等于 `sha256("Hello World")`(`a591a6d4…f146e`,与契约 `hash.example` 交叉核验)。
- **一致性**:revision/sequence/tickId 单调;browser result、bot result、bot trace 的每条 received 记录必须能在 audit `delta_routed` 中对到同值记录(三方对账)。
- **延迟**:所有 `latencyMs` < 1000。
- **词表**:事件必填字段按契约 `process.auditEventKinds` / `botTraceEventKinds` 动态核对,不在本工具复制第二份。
- **两轮对比**(`roundsComparison`):方向(sender)/revision/payloadSha256/tickId 必须一致(`sequence` 一并核对);`latencyMs` 只要求两轮均 < 1000。

## 集成假设(与上游对齐点)

- audit 与 bot trace 均为 NDJSON,每行一个事件对象;判别字段容忍 `kind`(首选)或 `event`。
- bot result 形状:至少 `{ok:boolean, received:[{sender,sequence,tickId,revision,payloadSha256,latencyMs}], errors:[]}`;browser result 按契约 `process.evidence.browserResult`(`window.__lumioResult`)。
- `--entry-type`/`--entry-method` 默认值 `HelloEntry`/`Run` 是占位,以 LumioGameRuntime hello entry worker 的交付为准,可参数覆盖。
- 残留进程检查:跟踪 PID 精确核对 + CIM 扫描 `lumio-server.exe` 与含 `HelloBot` 的 dotnet;本机无关 headless chrome 只告警不判失败。

## 测试

```bash
npm test          # = node --test verify-evidence.mjs(正反 fixture:好链通过 / Echo 链 / 坏 hash / latency 超标 / 词表缺字段 / 两轮漂移)
node --check launcher.mjs && node --check static-server.mjs && node --check verify-evidence.mjs
```
