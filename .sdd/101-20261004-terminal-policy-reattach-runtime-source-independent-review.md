# Current-policy terminal reattach：有限非作者源码复审

裁决：**ACCEPT_EXACT_TWO_PRODUCTION_SOURCE_FOR_FINITE_TEST_QUALIFICATION_COMPLETE_PACKAGE_BROWSER_PENDING**。本次只读复审未发现源码级阻断缺陷；不代表实际签名 Host、完整包或浏览器体验通过。

精确作者树：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeTerminalPolicyReattachRepair`。

- `WorldManager.Successor.cs`：`6b2dcf671b3b0de9d8e24124ddc3e8ccb83f62660fdc8821b903d1295e3ca6d0`。
- `WorldManager.SuccessorEligibility.cs`：`cd9d8339050009270045f7be009e06f527ddf5e11ea434e61aae1d7763845ec0`。

独立检查器实际 raw0/48 项通过。删除三条调用接缝和新增 helper 后，两份完整原始文件逐字节恢复；`SuccessorProjection` 全文件未改，既有当前归属、终局归属、未来资格校验保持原样。

## 范围与校验

新增路径只接纳：原捕获 Eligible=false、已提交并断开的初始 revision1 Observing reservation；完整世界 incarnation/effect world、存活 participant、已销毁旧 life、真实 Destroy 历史、精确 retained entry、完整 Observing attachment、无 controlled life、Observer 断开状态及当前 epoch 必须匹配。Consumed/proof retirement/cleanup/order/created/witness/request/grant 均拒绝。当前 typed policy 仍经原 `TryCurrentSuccessorPolicy` 读取和核验，当前 life/currentLife/lastLife、participant 与声明访问资格保持原守卫；Match 或 intent 必须变化，next generation 必须递增。旧 Applied/Unknown credit 必须完整清偿，额度预留门不变。

原已匹配当前资格、已匹配终局资格以及原 eligible=true 路径均先返回原行为。该 helper 不增加 Life、Ready、restoration、grant 或 Controlled 授权，不扩账户/房间/协议权限。后续 generation/revision 的政策变化仍由原 supersede 路径负责；这不是任意观察者自动更新政策的通用出口。

规划在 reserve 前完成；eligibility 赋值位于 publication reserve 和原 mutation sentinel 之后、原 route commit 之前。赋值后的原 route/observer/welcome 委托若抛错仍走原 fail-stop 与 Unknown/CommittedPublicationFailed 封存，不能声称原操作具有 rollback 保证，但未增加按普通成功继续的路径。

## Host 与客户端边界

真实 Server owner/transition builder 仍要求新 socket、pending admission、身份/room/profile、请求相关、当前 attachment、epoch、世界、原历史、freshness 和 owner facts 一致。reattach 的 result 初始 revision1 与更新后的 owner facts revision2 可以共存：result/facts revision 等值检查只属于 transfer；授权中的 eligibility revision 来自实际 facts。Client14 的 `SuccessorAdmission.TryReceiveSuccessorAuthorization` 首次无 current 时仅限定 sequence1 和 initial/reattach，不要求 revision1，因而该 fresh reattach revision2 不被首次准入门拒绝。以上均为源码事实，不替代当前 Rust held batch 的实测。

## 测试资格限度

v2 negative 源保留十二个负向变体，只将两处“所有 Welcome/WorldChange 必须空”的断言改为针对新 c2/新 epoch 不得发布，避免把 ObserverConnected=true 变体的旧 c1 合法投影误计；完整逆变换证明其余测试字节不变。本次未读取未封存的 v2 当前运行结果，未声称十三项通过。旧两 Native target GREEN 与 current93454 PSS 的事实由各自封件限定；源码比对只支持同 Runtime 出口分支推论，不能断言真实 Rust gate 已被修复。

复审未运行 build/test/Native/target/live log/browser，不写生产。后续必须提供真实 Native guard 资格、完整新包消费以及 fresh signed reattach 的 Host/浏览器回归。

