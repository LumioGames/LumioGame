# Terminal receipt 有界测量修复

已冻结窄提交 `80eed3c229ce3ea2964d652ad1fa2dfc44b07b28`，父版本 `e00aa599482970faaae52ee0863bf351d5feefcd`。工作树 `C:/Work/LumioGames/LumioGameRuntime-101-terminal-receipt-window`，只改 OperationReceiptMessage、WireCodec.WindowMessages 和新增 TerminalReceiptWindowTests 三文件。

冻结结果不必先构造一个 OperationReceiptMessage 才能测量/写入：两种来源借用同一只读 ReceiptView 和同一 JSON 遍历。ValidateTerminal 保留原验证顺序、文本限制和异常，四种终结枚举改为显式闭集检查，合法路径无装箱。FromTerminal 既有公共行为保留。没有修改 wire 字段、Native ABI、任何容量或结果语义。

实际证据均在该树 `.run/terminal-receipt/`：

- `receipt-red-01.log`：真实旧路径 17 例，16 成功/1 失败/0 跳过，exit2；稳定测量+写入分配 544B，断言 0B。原测试全文保存 `TerminalReceiptWindowTests.red.cs`。
- `receipt-green-01.log`、`receipt-final-01.log`：17/17、0 失败/跳过、exit0；合法冻结结果稳定测/写 0B。红绿仅将测试的两个调用 helper 从既有 FromTerminal 路径切到新内部 direct API，断言未放宽。
- `build-alltfm-01.log`：完整 solution 全 TFM Release，0 warning/error，exit0。
- `runtime-full-01.log`：完整 2886/2886，0 失败/跳过，exit0；包含实际 Native suites。旧 PrimeProbe 定位仍使用传统输出路径，因此将 solution 已构建的同一 probe 映射到其期望位置，65 文件逐 SHA 验证记录 `prime-helper-stage.json`；未改断言/测试。
- `terminal-compat-01.json`：独立原 e00 DLL 与新 DLL 的 1024 样本，完整字节及异常类型/文本 0 差异。覆盖所有合法枚举组合、前后越界、全宽整数、null、UTF-8 边界与孤立 surrogate。基线 ECS SHA `869f4785922a745156b831eb62a69c5f6cd126fe3da73a0eb4c6283a3212e62c`，新 ECS SHA `30ccf725fc3525c7f530aae1c4363e41934db5a65c7d5c9171f255cea34b7bd4`。
- 官方 formatter 首轮仅发现新测试缩进，已机械修复；首次 workspace 默认 Debug 与 Release 私有输出不匹配，保留诊断。`format-03.log` 按 Configuration=Release 重验，0 更改/exit0，无该 workspace 错误。之后只重建并复测受影响 17 例，生产未再变化。
- `freeze-80eed3c.json` 保存三文件及以上日志精确 SHA。自动生成文件由正式 build 产生的 EOL 工作树提示不混入三文件提交。

范围限制：这证明终结 JSON 的合法稳定路径，未声称整个冷进程首次调用或异常分支 0B。公开 JSON-base64 wrappers 由 Gameplay 的互斥切片组合；本提交仅准备私有 `WriteTerminalReceipt(ref Utf8Writer, WorldOperationResult)` 与内部 JSON 测/写，不代表 Host 新完整 Measure/Take/ACK 协议已验收。Gameplay 已只读检查生产两文件与 17 例，未报源码阻断；最终组合需其独立回归。
