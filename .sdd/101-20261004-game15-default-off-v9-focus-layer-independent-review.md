# Game15 default-off / V9 / focus 私有层有限独审

裁决：`ACCEPT_PRIVATE_GAME15_DEFAULT_OFF_V9_FOCUS_LAYER_AND_AUX_PREPARATION_ONLY`。没有未闭合 P1/P2 源码问题。本次只核新层的文件字节、完整逆变换、辅助入口与有限 guard；没有再次解析 PE/PDB/SDK，没有编译、Native、监听查询、启动服务、POST 请求或浏览器操作。

作者冻结 manifest：`C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-off-v9-focus-01/seal-01/manifest.json`，SHA256 `470962f139461605d0de1cf93379bc662517cab61e7aa3f68ccc45169e321c34`。18 件冻结文件的长度、哈希以及声明的当前原文件均独立核为相同。独审结果：`C:/Work/LumioGames/LumioGame/.run/off-v9-focus-independent-review-01/result.json`，SHA256 `6c742dc77fc396294cfba34a550d83da948ff7f86b253d8c36f8a83a4639c2c8`。

新 `off-v9-focus-wwwroot` 的真实相对路径集合为 835 项，inventory 835 项唯一、没有缺项或额外项。只有 `main.js`、`index.html` 有变化；其余 833 项与已审 Game15 ordinary 当前文件逐字相同。已有 Game15 WebCIL/SDK 资格通过这些完全相同的字节继承，本审查不重新宣称其元数据或源码/PDB 资格。

`main.js` SHA256 `ce9968cebcc11f52d399dac482b26e360cc476e39c1243fb39e67a6b480cd60f`：独立取已接受 V9 generator `c152cb0331a9596924bd7996ef1ebf531f08197746a4a6cbb41cf31aa63b0fc3` 的完整 String.raw 前缀，核为逐字相同；脱去前缀并逆还原 bindExports、setStatus、engineInvoke 的三个唯一 seam 后，完整 ordinary body 与 `3844b096b3200ce8031d33ffdc837cd1d00f377e7b60e1f046213d054d650a99` 相同。没有 Runtime diagnostic 名称或 withEnvironmentVariable anchor。V9 包装的其余语义沿用此前有限资格，不在本次新增改变。

`index.html` SHA256 `8e9157d92d3710bbefda1b9964654630b9d90a48dc19765989bd0c5112267b44`：唯一变化是 `<div id="presentation" hidden>` 加 `tabindex="0"`，完整逆还原后与 ordinary `083bd48a3c1973f7005dc1974817268ace04fd9de4c33178051b3a7a384a4213` 逐字相同。这允许已显示元素被聚焦，但不证明真实焦点操作成功或键盘输入已被玩法接受。

辅助入口 `start-off-v9-focus.mjs` SHA256 `a7072a8bd9eded2eeca889b99e0985af19a9ef4bbe92a7ae696237f45104e7a2` 的六个唯一替换完整逆拼后，等于原 on/V9 auxiliary `302f8a09dadd0b07d95405a31df7cc1dd4243aaf6f9c9d0036cb6e3c53239d04`。替换仅切换层 guard、返回 layer、18110 空闲检查、目录/端口及测量 main 身份字段。仍从实际 `http://127.0.0.1:18106` 发 fresh POST，保留原 requireAuxLaunchFacts、room `room-bomber-v16-private-capture15-18090`、DS `ws://127.0.0.1:18318/` 约束和 `experience:UNPROVEN`；没有直接生成准入票据、旧 ticket 重用、Gameplay 修改或配额变化。

`layer-file-check.mjs` SHA256 `d15aa0ef79be5244aeb94d53a8e338d3a3991daa4a676229e17abb396f705457` 保留精确 layer-manifest/profile 哈希、835 每项当前文件/ordinary 哈希、main/index 逆变换以及 Runtime enable anchor 缺失检查。独立执行的只有纯数组空闲端口函数：已占 18110 的 number/string 两个负例均拒绝；其他旧端口数组允许。没有执行真实监听枚举或 verifyOffFocusLayer/aux 启动函数。

作者 prepare01 把 String.raw 当 JSON 解析的失败被完整保存；finish02 只是纠正该私有 checker 的机械读取。它是行政验证错误，不是产品行为 RED。本审查直接核实际冻结的原/后字节，没有使用该失败输出补证通过。

准入仅允许 Root 后续启动这个私有 auxiliary 并采真实对照。源没有诊断 enable anchor，不等于已经观察到浏览器默认 off；仍须实际检查 console 无诊断行。V9 观察开销继续存在，旧 on18107 及其他现场不变。没有普通未测量页面最终体验、性能改善、连续输入、GPU FPS、重进十次或八人对局验收。本次提及的 `08:11:50` 六 Bot 当前进程补件位于先前 39 件冻结窗之外，不回填或追认那个窗口每一时刻。
