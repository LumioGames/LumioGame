# 私有完整13 Runner / Platform Profile 独立审查

裁决：`ACCEPT_PRIVATE13_RUNNER_PROFILE_SOURCE_AND_FILE_PREFLIGHT_ONLY_STARTUP_BROWSER_PENDING`。独立实际脚本2023项检查通过，进程退出0。本审查没有启动准备脚本、Runner、Platform、DS、浏览器，也没有构建或改生产源、正式包、pins。作者是Root；审查者虽是完整13包作者，但没有编写本次Root的Runner/Profile。

证据：`C:/Work/LumioGames/LumioGame/.run/local13-runner-independent-review-01/`。`result.json` SHA256 `45943d30acca23dac20f95f5e31f6b55c922bdc1cb33a5a1f994900db597e92c`，含19份实际输入的路径、长度、hash及边界；`checks.json`保存逐项检查。环境文件仅读取hash，不展示或保存其正文。代码提取只执行真实Runner的只读前置检查及创建options，去除imports与末尾`runLauncher`调用，未执行真实账号或网络操作。

审查精确Runner `run-measured13-v7-browser-01.mjs` SHA256 `debcfd0ed4fcc2d7bdbbbc001e649e65dbb8f5e907519e4f4113d764d7d13ec9`。相对已审12-v6-02，整文件仅四类变化：新profile、origin18087、V7观测身份及measurement路径、运行用完整包副本。反向整字节验证通过。`start-local-platform13.ps1`整字节仅新profile、13名称和18087变化，原配额240/12/240/60与启动检查/控制顺序保留。此脚本默认仅preflight；仅显式`-Start`才启动指定新project，检查新project不能存在旧容器，原三个服务及PG实例均属于新project。loopback override只有127.0.0.1:18087→8080。其他服务不在操作目标内。

实际正式13manifest SHA256 `9a3289d2720efacee59e6f762b49771a6729fde53a9a5033e8fd9c016b1ff2c5`，Platform image digest `sha256:bc95985d1f80e34109f1d62dc9e0acfb3604085631f3613b4149abed992f76ed`。Profile记录与其精确相等，且不同于18086旧12记录。官方compose逐字等于正式13。新project为`bomber-schema16-local13-18087`，签名allocation字段与旧profile逐字段相同，WsUrl仍为`ws://127.0.0.1:18316/`；环境文件逐字同旧profile，seed仅精确bundle URL变化，不重写其余SQL。

实际ordinary835、mounted835、measured835全部逐hash读取，membership均准确。inventory SHA256 `85de53a2a5fb56149d555f30f60a4cca860eab451af67d4061cf50150aba542b`；V7 generator `bb09e3329c314a2e62a252fb5911104aaa47d9545d1ac007012abb3c41becb15`，measured main `5c860ca3766de431e38aeaf4cb62d1c3bae645c3a9fed93153d3c4c4d17ae475`；所有其余834文件逐字与ordinary对应。运行副本完整305payload加原manifest共306文件，每项与正式13manifest及原文件实读相等，没有单DLL替换。

DS配置整对象只允许三个既有路径转绝对路径和transport固定loopback18316；其余字段完全相同，registry assembly实读hash等于当前Game消费结果。真实Runner将runtime副本交现有`prepareEngine`，该入口仍执行副本内官方`verify-release.mjs --root <副本> --rid <rid>`，保持完整包拒绝语义。副本使运行时异常日志留在副本，不写回不可变正式13包。

实际前置guard负控拒绝了manifest、原Native、DS端口/监听地址、inventory、measured main/额外成员、观测schema/originalMain/generator/measuredMain、缺失或复用evidence目录。外部flags不能覆盖2Human+6Bot、origin、startPlatform=false或runtimeRelease。六次真实wrapper函数调用用合成冻结response验证同一对象原样返回；不是六次实际签名launch。原endpoint helper拒绝旧9110、错误18317、正确端口错误route及缺失endpoint；现有DS_READY resolver接受18316、拒绝18317。没有改写launch response、校验、票据或协议。

准备脚本保留首次`01-image-mismatch`源。新脚本在首次mkdir前校验manifest、835 inventory及输出目录不存在，写文件均`wx`；其余实际生成物已逐hash核验。本次不重新运行它，不声称独立重现作者所报首次退出。

尚待Root实际startup前核新18087/18316，以及18101是否空闲，核本地image真实Id与manifest相符、新project/数据库首次启动和实际签名launch。此裁决只接受私有源与当前文件身份，不能替代完整包消费资格、浏览器移动/放弹/十次重进或性能验收，也不代表公网Publishing/发行身份闭合。
