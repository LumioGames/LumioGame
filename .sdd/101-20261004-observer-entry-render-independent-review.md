# 观察者首屏渲染：非作者精确审核

裁决：**ACCEPT_EXACT_ONE_LINE_OBSERVER_READONLY_RENDER_CANDIDATE_AND_THREE_TESTS_REAL_BROWSER_REGRESSION_PENDING**。允许迁入本次精确一行候选和三案正常测试；尚未证明候选浏览器首屏、十次重进或完整体验通过。作者为 Root，审核者为 browser_perf_trace；审核没有修改作者源码、Game生产源、pins或服务。

独立结果 `C:/Work/LumioGames/LumioGame/.run/observer-entry-independent-review-01/attempt-04/result.json`，SHA256 `a5ddf232d8eb027ccc0fa2946b5752d71af09ee33b81af9546384e75856f7b8f`。59项实际 hash/source/原始数据和复跑检查通过，使用正式13不可变 web 输入，没有 Native 重构建。

作者 seal SHA256 `fb1715254789d96041033f363f6f6ab383491ab3ac3d153c0bd1ce1e13b57dec`；候选 main SHA256 `3844b096b3200ce8031d33ffdc837cd1d00f377e7b60e1f046213d054d650a99`，tests SHA256 `a085e6f3c341104dade81fdd404ed650bb6d5d51a7e208699cb341c6a45a8551`。作者全部12份封件与原来源逐byte/hash匹配。

## 实际原因与精确差异

原条件是 `GAME_VIEW && csharp.presentationState && !initialSelectionPending`，新条件仅删除最后的 pending 条件。把这一删除逆置后，整个 main 的36921原字节完全相同；当前共享 main 仍等于该 before。原 main.test 的全部字节保留为前缀，只有三案及其私有VM夹具追加；RED/GREEN测试来源逐字相等。

`commitInitialSelection`、character confirmation、`sendPlayerCommand`、playerInput ready和presentation的`inputReady`逐字未改。合法 observing Self无character、inputEnabled/inputOpen=false时，commit不发送选择，也不清 pending；输入仍拒绝。新渲染路径只是原 `PresentationState`→`PresentationDump.Dump(World, AuthorityTick)`→gameView.update；没有新Gameplay执行或世界。game-view 对缺match/config仍原样返回；自身选择窗口仍要求Self在真实player数组与适用phase，未因participant Self授予控制。原捕获错误和initial character window关闭错误路径也未改。

新三案实际执行原 main sourceVM的 applyDump、commit和command函数。AwaitingRespawn及Eliminated观察案验证绘制接缝接到真实replica形状、pending仍true、按钮disabled、没有角色发送、bomb拒绝；Warmup案验证原初始角色intent仍发送一次，但pending和Gameplay输入仍受角色确认保护。它们证明实际源码接缝，不冒称完整renderer或Native测试。

独立复制同源测试后实际复跑：旧源码 **59 PASS / 3 FAIL / 0 skip，raw1**，失败均为frame调用0而非1；候选 **62 PASS / 0 FAIL / 0 skip，raw0**。原59案包含旧输入/角色选择/异常和泵调度回归，原断言未移改。原作者日志59+3→62也逐份保存并核验。

## 真实浏览器闭环及限制

原真实inventory记录关闭A54后只剩B55，再新A56。A56 negotiating→active `1037.8999999761581ms`，Self与participant均完整ID `0000000000000001000000000000000f`，FinalCircle/Eliminated、无character、inputEnabled/inputOpen=false。world为`0000000000000001`，80个实际pose样本与权威Tick继续推进至25698、fault0；presentation调用bucket未创建（instrumentation按调用懒创建）、presentations为空、actualRenderCount0。截图A全空，B55仍绘制。没有用HUD玩家序号/count、旧Running或协议generation合成值替代身份、世界与渲染证据。

这证明候选修复针对实际空画面的阻断条件；候选还没有在真实新页上执行，后续必须真实关闭/新页并验证首个有效presentation和截图，持续保持观察态无输入。原完整13及本轮私有候选不能当成已经带修复的正式浏览器验收。

审核器自身三次行政尝试原件保留在 independent-review-01：01写错原条件的conjunct顺序；02误以为零调用bucket一定存在；03误以为Node默认是TAP而实际为spec reporter（其实际旧测试已59+3）。均未作候选拒绝或通过裁决。04核准确原条件、实际懒bucket和显式TAP后完成全部检查，未改作者任何字节。
