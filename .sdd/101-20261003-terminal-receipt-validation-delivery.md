# Terminal receipt 非异常判定交付

窄提交 `7eb89b563ef25b27065b8155ad007e5f9a726757`，父 `80eed3c229ce3ea2964d652ad1fa2dfc44b07b28`。工作树 `C:/Work/LumioGames/LumioGameRuntime-101-terminal-receipt-window`，仅 OperationReceiptMessage.cs 与新 TerminalReceiptValidationTests.cs 两文件。前置 Host query/实际 producer 调查见 [边界报告](101-20261003-host-query-receipt-boundaries.md)。

新增内部 TryValidateTerminal，合法与拒绝均使用同一 TerminalFailure 判据；原 ValidateTerminal 复用结果按既有顺序、类型、文本抛异常。UTF-16 扫描不调用会抛异常的编码器，保留后部孤立 surrogate 比该字符串长度超限优先的旧规则；只有原抛异常入口仍调用 StrictUtf8 取得相同异常文本。操作生产的合法规则、wire、容量、Native ABI 均未修改。

实际证据在该树 `.run/terminal-validation/`：

- `validation-red-01.log`：22 例，17 失败、5 成功、0 跳过、exit2。旧 catch 路径拒绝时分配 304–1088B；保存原测试 `TerminalReceiptValidationTests.red.cs`。
- `validation-green-02.log`：22/22、零失败/跳过、exit0。含 null、非法枚举、负 part、缺 mapping、UTF-8 长度、多种孤立 surrogate、可选空值，以及真实 TryDeferOperation → CompleteDeferredOperation → DrainOutbox 的 1024/1025 字节 transaction。两长度均产生成功操作；1025 的回执编码仍按旧规则拒绝，Try 判定稳定调用 0B。
- `window-regression-01.log`：旧合法终结测量/写入 17/17、零失败/跳过、exit0。
- `compat-01.json`：与原 e00 不可变 DLL 的 1024 样本比较，完整字节和异常类型/文本零差异。当前 ECS SHA `cf0a363602b587579c669b9123879873f1dbff89be0432321f94292f37e2fc64`。
- `build-all-01.log`：完整 solution 全 TFM Release，零 warning/error，exit0。
- `runtime-full-01.log`：完整 Runtime 2908/2908，零失败/跳过，exit0；包含实际 Native suites。原 PrimeProbe 路径兼容采用同次 solution 生成文件的精确映射，65 文件 SHA 记录在 `prime-helper-stage.json`，无测试断言修改。
- `format-02.log`：官方 formatter 验证 1572 文件，0 修改，exit0；诊断无 workspace warning/error。保留首轮环境 warning。`validation-green-01` 是不被 runner 支持的中部通配过滤导致零发现、exit5，已明确重跑，不作为通过。
- `freeze-7eb89b56.json`：两文件、实际 DLL、完整证据 SHA；正式构建生成物均逐文件归一化对比 HEAD 相等，仅 EOL 提示，不混入提交。

Gameplay 已独立只读确认共享判据、异常顺序和后部 surrogate 优先行为，无静态阻断。此项仅提供内部判定；公开 TryMeasureTerminalReceiptJsonBase64 由其在组合树实现并回归。0B 口径是已构造冻结结果的稳定 Try 判定，未声称整个冷进程首次执行或原抛异常 API 零分配，也未把本次结果算作完整 Host 新协议验收。
