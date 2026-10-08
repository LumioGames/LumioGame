# 101 选定客户端配置独审输入

只读审查；不构建、不声明生成、不改源码。Client/Game当前共享生成窗口归Root协调，实际浏览器归Root独占。

审查精确源码：`games/101-bomber/.run/browser-selected-config/resume-20261003/freeze-01/source/`；清单14文件，`manifest.json` SHA256 `9ab7009dba323510e7241f15bff1fc8270c35e95d95355eb6628a2b014bdf735`。逐文件SHA须匹配，任何后续变更另立freeze。Root-owned launcher/seeded-config只读reference hashes列在同manifest，不属于本次实施改动。

要求：正式player与spectator读取本次选定C export原bytes；仅C侧文件；启动后固定；Runtime正式loader校验manifest/fingerprint/typed tables；一个不可变snapshot供选角、表现和每个Client World；取得launch前完成配置；失败与关闭零准入、无embedded回落；成功后重连保持同配置。不能用表值镜像、原型模拟或本地权威规则替代。

源码路径覆盖：HTTP carrier/Player host、BomberClientConfig、SpectatorDump/PresentationDump/ReplicaHost、WASM Program与csproj、main.js、BrowserSessionOwner/SelectedConfigTests及对应Node测试。当前正式Program必需ConfigureConfig，既有不传configuration的embedded测试入口保留，不据此判生产回落。

可复核实际证据：

- 旧 `browser-selected-config/host-red01`→green6/6；main-red01→green53/53；native-selected01 5/5；native-full01缺server DLL为52/53、full02修输入后53/53；publish01 exit0。
- 本轮 `resume-20261003/js-review02` 59/59/0fail/0skip/exit0；`native-full05.json/.xml/.log/.exit` 53/53/0fail/0skip/not-run0/exit0，真实06 Native/DLL SHA列在JSON。本轮错误参数和漏Native输入失败03/04完整保留，不能计通过。
- `config-http01.json` HTTP200、no-store、29文件逐一与官方seed101/skills-off选定C导出原bytes相同，无server文件，重复包哈希不变；seed101两端manifest SHA记录其中。
- 实際Platform18085已换06官方imageId精确匹配manifest，healthz实际JSON ok；实际player06 7Bot准入、安全URL在交回report。浏览器状态/截图/网络/console待Root取证补入，源码审查不得代替实机验收。

提交裁决为spec/quality，各finding给精确路径和理由，并明确本次批准范围。全角色视觉/音效/响应式、整局和下一局、M2/全特殊弹/稳定性/最终产品验收不在这份配置源码通过的替代范围。不要批准尚未独审Server successor源或重包。
