# Game15 默认关闭诊断 + V9 + 可聚焦 presentation 私有层

作者写入已经停止。此封件只准备用于 Root 的真实对照测量，没有启动 listener 或操作浏览器，也不宣称体验通过。

从已封存 Game15 ordinary 835 件逐字复制得到新的 `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-off-v9-focus-01/off-v9-focus-wwwroot`。使用既有独审 V9 generator `c152cb0331a9596924bd7996ef1ebf531f08197746a4a6cbb41cf31aa63b0fc3`，main 为 `ce9968cebcc11f52d399dac482b26e360cc476e39c1243fb39e67a6b480cd60f`，无 Runtime 环境开启 anchor。唯一 HTML 变更是既有 `<div id="presentation" hidden>` 增加 `tabindex="0"`，保留原 hidden 逻辑；index SHA256 `8e9157d92d3710bbefda1b9964654630b9d90a48dc19765989bd0c5112267b44`。其余 833 文件全相同，main 与 index 全文件反向还原 ordinary 字节相等。该层没有调用、注入或修改玩法输入或状态；Root 可使用真实键盘操作聚焦 presentation。

新 Aux `start-off-v9-focus.mjs`（SHA256 `a7072a8bd9eded2eeca889b99e0985af19a9ef4bbe92a7ae696237f45104e7a2`）仅对原已审 Aux 做六组明确替换，完整逆变换逐字相等。Aux 使用独立 18110、真实 freshPOST 委托至 18106，原 Origin/player、DS18318、room 与准入事实校验不变；不签发自身票据。18110 free 核查未找到 listener，脚本没有被启动。

封件：`C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-off-v9-focus-01/seal-01/manifest.json`，SHA256 `470962f139461605d0de1cf93379bc662517cab61e7aa3f68ccc45169e321c34`；结果 `213eaa020ec92d795df26f911ca45caa8d7a4c8b1853ee612a3984eafd8b9a09`。835 inventory SHA256 `76fd66293c4fe95f79e30a43aef9216a9f55abab0beebd5886a3e765f19cc9a4`。原 prepare01 的私有逆拼 checker 错猜 String.raw 边界导致 raw1，保留 INVALID 行政记录；没有将其当产品失败。NEW finish02 只机械修 checker 并完成有限元数据，没有覆盖 bundle。

Schema 非作者已完成有限独审：result `6c742dc77fc396294cfba34a550d83da948ff7f86b253d8c36f8a83a4639c2c8`，报告 `C:/Work/LumioGames/LumioGame/.sdd/101-20261004-game15-default-off-v9-focus-layer-independent-review.md`（SHA256 `9a80bef020ce8efbf7fbf2cbc71451b5367a259169a46e288810c4f207f78b14`），裁决 `ACCEPT_PRIVATE_GAME15_DEFAULT_OFF_V9_FOCUS_LAYER_AND_AUX_PREPARATION_ONLY`。这不是包、普通产品发行或实际浏览器对照结果的重复审核。
