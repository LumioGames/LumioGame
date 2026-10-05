# V10 首次入场与 world 停滞窗口有限分析

裁决：仅确认初始调用边界和未完成握手，**不接受为静默性能或双人入场体验验收**。只分析 Root 准入的 `browser17-v10-real-root-01/01-initial.json` 至 `04-reentry-stage-current.json` 四个双端 DOM 原件；未读取新增 05、活日志、截图、浏览器或服务。引擎仍正式完整16，Game17，私有 V10 仅观测层。Root 提供页面号143/144；这四份 probe 包络本身未记录 tab ID，不能把该外部标识说成 JSON 字段。

一次原分析 `actualNodeExit=0`。派生目录：`C:/Work/LumioGames/LumioGame/.run/v10-first-entry-finite-analysis-01`，完整原边界在 `derived-01/analysis.json`；更紧凑的事实以 `finite-summary-02.json` 为准。01 紧凑版误将两个 raw before/after context 当已解析 context，造成该项 null；02 只纠正解析接缝，保留01、原分析、原数据，不增造字段。

## 握手与首次绘制

下表为各页面自己的原始 `performance.now()` 毫秒，不跨页面直接相减。

| 已观测阶段 | A | B |
| --- | ---: | ---: |
| starting | 136.9 | 157.8 |
| wasm-ready | 712.6 | 609.2 |
| selecting | 1099.5 | 881.2 |
| `/api/player/launch` start→end，status200 | 73216.5→73579.8，363.3ms | 73304.6→73466.0，161.4ms |
| negotiating | 73934.2 | 73886.8 |
| WebSocket opened | 73953.1 | 73905.8 |
| 首 Welcome | 73988.6 | 未收到 |
| 现有 WorldInstanceId 首非空读取 | 74593.4 | 未观察到 |
| 首 raw Self/participant 读取 | 74593.5 | 未观察到 |
| active | 74599.9 | 未到达 |
| 首 WorldChange 头 | 74613.1 | 未收到 |
| 首实际 CPU 绘制完成 | 75099.2 | 未观察到 |

A negotiating→active665.7ms；socket.open→Welcome35.5ms；Welcome→首 Identity604.9ms。首绘制回调起74978.2、持续121.0ms、26 draw calls，negotiating→首实际 CPU 绘制完成1165.0ms；这不证明 GPU 提交、呈现或视觉延迟。A 阶段 UTC 为11:57:52.317 negotiating、11:57:52.982 active、11:57:53.482首 CPU 绘制完成。

`/api/player/launch` 耗时包含本地路由和真实委托，不能拆成 Platform-only 延迟。选角至 launch 的约72–73秒包含 Root 人为操作及工具等待，原件没有独立 Start 点击时间；不能把这段叫系统 negotiating 耗时。

A 首 Welcome 是 generation **341**、Self `00000000000000010000000000001804`。首 WorldChange 头 tick93445 内含 Welcome generation342/Self participant `0000000000000001000000000000000f`；末头 tick93453 内含 generation343/Self `00000000000000010000000000001880`。原头共3 SuccessorAuthorization、3 Welcome、2 WorldChangePart、9 WorldChange。收到头不等于客户端已应用 ACK；session generation 不代替 attachment generation。

B 在04的 sample271640.6仍 negotiating；socket opened 至该 sample **至少197734.8ms**，socket received0、bytes0、Welcome0、无 raw Identity/非空 WorldInstanceId/实际绘制。A 三个后续切片始终 raw authorityTick93453，received29；渲染计数274→1772→10472仍增加，展示8人、Protected/inputOpen。两端 faultCount0不能证明 world 正常推进或 B 已准入。A 所谓 active HUD 只代表已应用的旧状态；B 的失败阶段当前可收窄到 socket 已打开、首收到包尚未发生。

Root/Reentry 另有 DS applied93454固定/frames0事实；本分析未读其日志，不把那个单独证据冒充本脚本输出，更不把停滞归因于 V10 或某份源码。

## 最重调用边界与实际对象

| A 原始边界 | Tick inclusive | 同 pump inclusive | Tick 内 Native 已观测 |
| --- | ---: | ---: | --- |
| pump3，74005.3→74599.9 | 585.3ms | 594.6ms | 123 calls / 11.8ms |
| pump5，75117.6→76045.4 | 919.6ms | 927.8ms | 417 calls / 21.5ms |
| pump6，76049.9→76192.1 | 139.1ms | 142.2ms | 64 calls / 0.6ms |

Native 数值是原包装器观测的 inclusive 操作时间，不涵盖全部跨桥/包装/managed成本，不能从 Tick 扣掉它后称净 managed 时间。pump5原记录包括 hfsm_evaluate25、clock_now319、voxel_world_create4等真实调用；单凭这些不裁定 world held 根因。

两次独立重绘更新在 Tick 外，原 `pumpId=null`：

| 原边界 | main.gameView.update | 内层 gameView.update | 实际 presentation.create |
| --- | ---: | ---: | ---: |
| span34，74616.4→74973.4 | 357.0ms | span36 302.3ms | span40 277.2ms |
| span55，76193.3→76428.5 | 235.2ms | span57 231.0ms | span61 222.8ms |

第一更新另嵌 `csharp.presentationState`54.1ms，第二为3.9ms。各层有包含关系，不相加/相减；不能把两次 Tick 外边界强绑到最近 pump。内层创建本身已观察到数百毫秒，是后续 Running 下检验 renderer 成本的具体接缝，而不是这次停提交的原因证明。

实际 GameView 对象为1创建→1销毁→2创建→2销毁→5创建；adapter3→6；实际 Presentation4创建→4销毁→7创建。`presentation.dispose` 方法调用6次，但其中空对象路径不能算6个实例被销毁。B 只创建一个顶层 GameView1，没有实际 Presentation 创建。

A pump3、5中真实 closeVoxelWorld→GameView.dispose→Presentation.dispose 嵌套存在，耗时分别0.3/5.8ms；对象2内部实际 Presentation4销毁5.6ms。直接 WorldInstanceId 原读取由空变 `0000000000000001`，在第二重建附近仍是此值；opaque native handle却有4→空5→6真实变化。handle字节完整保留、不解 epoch，也不以相同 WorldId猜测同 Native 资源可复用。raw participant始终0f，Self由1804/AwaitingRespawn变1880/Protected；localRendererSurrogate7仅 renderer缓存，不能当 participant。

match-key reset 原代码路径及实际 adapter.create 嵌套支持有限 **SOURCE_INFERENCE**，不是原数据里的业务原因 token。对象创建/销毁和原上下文尚不足以证明任何 renderer 重建是错误的。

## 缺口与观测成本

四个 anchor 之间约50.129秒、28.138秒、162.353秒。独立 ring及1MiB DOM预算已裁剪：A Tick保留边界有23.845/158.349秒缺口，B为20.552/149.297秒。因此原派生 `commonWindow.seconds=197.7495`只是一组稀疏保留边界的凸包，**不是完整共同窗口**，不作为Hz、长帧占比、连续时序或quiet分母。保留 Tick仅A277/B561；最终 cumulative calls3919/3956，不能混用。

04尾部 A/B stringify retained mean2.569/1.751ms、max9.3/5.9ms，最多2pass；lastDomBytes640521/981774，预算1048576。尾部 V10 bookkeepingMsPartial mean0.00397/0.00167ms、max0.1/0.2ms，均有裁剪且不含括号 clock/push全部成本；clockCalls141206/142439、clockFailures0，clock净时间未量。A wire扫描29次/6.5ms，B0次；该字段只含decoder+scan。drawObserver345.4ms是A累计旁路记账，不能当GPU成本、完整渲染总成本或本窗口净成本。这些成本全部保留，不从原 delegate耗时中净化。

后续允许结论仅为：A已收到并渲染最后93453状态，B尚无首包；初始 A 同时存在重 Tick 和重 Presentation创建。停提交根因、普通8人 Running长帧频率、双人完整准入、输入/ACK/持续位移及关闭重进体验均保持未闭合。未改生产、包、pins或服务，未编译或操作浏览器。
