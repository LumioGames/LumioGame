# V8 observer / measured14 独立复审

裁决：`ACCEPT_EXACT_V8_PRIVATE_OBSERVER_AND_MEASURED14_835_BYTES_BROWSER_PENDING`。仅接受精确私有观测脚本和生成副本身份；本审查未操作浏览器、服务或输入，也没有测量性能提升或确认联机体验验收。

Root 是 V8 作者，本报告由完整14包作者对新的观测候选作非作者审查。实际871项检查全部通过，7个原头投影测试通过、0skip、raw0，新 measured main 语法检查 raw0。原 V7 generator SHA `bb09e3329c314a2e62a252fb5911104aaa47d9545d1ac007012abb3c41becb15`，V8 SHA `45dc55f432d91d0764ac772e4a8912a96af074938cc61a7fbb4709572e1aa812`，独立反转作者10项替换后整份文本逐字等于 V7。内嵌函数与 helper 实际 `toString()` 全等，helper SHA `7380d0dbd1e28ed0856b5055fac8a24c3653d9fca8987fa6ba69d58e68fffe95`。

实际 ordinary14 来源为 `games/101-bomber/.run/browser-experience-repair-01/candidate14-build-01/browser-publish/wwwroot`，main SHA `3844b096b3200ce8031d33ffdc837cd1d00f377e7b60e1f046213d054d650a99`。NEW 输出为 `games/101-bomber/.run/browser-experience-repair-01/measured14-v8-wwwroot`，main SHA `c79e0a7addfb32c53dde76da6f4f4c780e758b0c46537cc75ce506761c9bc168`。两端835个文件路径全等；834个非main文件逐byte全等。main精确等于观测前缀加三个既有导出/状态/Native函数包装接缝，移除前缀并反转三处后逐byte等于 ordinary14 main。副本独立 identity 记录 generator/helper/源main/测量main，未写正式发布或正式14包。

在生成的完整观测前缀上执行小VM接缝：Native函数一次委托、同对象返回、同异常对象传播，`createVoxelPresentation` 附属性保留；原 WebSocket.send 一次接收同原始字符串，原结果与异常保留。incoming原事件对象继续交给应用监听器。真实Welcome超JS安全整数仍保存十进制字符串，WorldChange ACK/parts头不保留payload；ArrayBuffer与view按2048字节截断，Blob类输入明确计入 unsupportedData。setup未额外调用C#导出，调用后原result逐字保留，session counter 单独记为 `sessionGeneration`，不会覆盖原权威 `connectionGeneration`。新增 wire/welcomes 队列上限600/160并纳入原1MiB预算裁剪。实际VM序列显示 observer计数与耗时为正，序列化DOM低于1MiB。

资格限制：该正则是诊断头投影，不是严格envelope或任意恶意JSON的顶层校验。规范Serializer的creates/payload边界前字段可观测，重排/嵌套/转义异常字段没有新协议判定资格。string截断为2048个UTF-16 code units，二进制为2048 bytes；这一区别如实保留。received wire 关联最近一次收到的Welcome，不证明Client接受或应用该ACK，parts payload不解码。wire计时仅记录新增头投影，不能据此净减全部observer开销。Native包装计时、CPU绘制和诊断序列化保持各自口径；正式未观测页对照、真实移动、端到端ACK和十次重进均仍需要现场证据。

独立证据：`.run/browser-experience-observer-v8-independent-review-01/review.mjs`、`result.json`、`publish-manifest.json`、`helper-seven-tests.log/result.json`、`generate-measured14.log/result.json`、`measured-main-syntax.log/result.json`。result SHA `37ac6923b6dac62d43daa952716a6627aa01e90b3f2f6651be18a4d57500ac36`。所有834不变文件及835逐项源/目标SHA在 manifest 中，原脚本/helper/测试及普通publish均未修改。
