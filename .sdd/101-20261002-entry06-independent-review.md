# Entry06 窄独立审查

结论：所审四文件未发现阻止合入的源码问题；64项独立JS/WASM测试通过，零失败/跳过。实际浏览器重试延迟仍未通过，因此本报告不批准正式入口整体验收。

审查范围为 game-entry-review-06/manifest.json（SHA256 972325522255ea1be763335ebdb16fdedb3b255ccbc4aaa44b7c8677a568ea83）的四文件：main.js、main.test.mjs、spectator.css、host csproj。已逐一验证工作区与冻结source的SHA相同。阅读entry04→当前的启动取消/清理、entry05→当前的隐藏画布读取差异，以及相关完整函数。

- retry按钮在failed/closed/superseded显示，active/selecting状态由既有页面控制；刷新中取消launch与catalog实际fetch。
- attempt在等待旧Close前捕获，完成后再次比较；Boot与Close在同一个实际Session串行，Close失败保留可重试所有权，旧请求不能重启已取消会话。
- 正式GameView不再绘制CSS隐藏的旧canvas，仍更新positions/selfId；正式场景仍从同一Replica世界读取地形，不减少可见表现。
- 实际MSBuild求值：Debug Optimize=false/HotReload=true；Release Optimize=true/HotReload=false。两者AOT和Trim均false。该构建修复未改变Warmup或输入规则。

独立证据：games/101-bomber/.run/resume8-root-integration/entry06-independent-02.log/.exit（64/64, exit0），entry06-mode-Debug.json与entry06-mode-Release.json（各exit0）。首次independent-01因候选根漏selection目录而缺manifest，59通过/1文件失败；失败保留，第二次指定实际发布物选择根后完整执行。

尚未闭合：未装饰实际浏览器重试在作者Release测试中firstInput到Tick63，晚于Warmup。私有诊断host单次成功仅作定位资料；仍需修上游Client/Runtime首次权威应用与预测耗时，再对正式统一发布物实际重跑。
