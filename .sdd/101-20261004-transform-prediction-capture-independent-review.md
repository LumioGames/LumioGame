---
name: 101-transform-prediction-capture-independent-review
description: 非作者审查 LogicTransform 预测捕获 guard、真实容量 RED 与相关回归；发布候选组合前查
metadata:
  type: report
  status: 已独立审查
---

# LogicTransform 预测捕获独立审查

裁决：接受精确两文件候选进入官方完整包构建。此裁决只证明代码及封存验证证据；真实八人浏览器收益、移动同步和关闭重进验收仍开放。

审查者为 Root，生产与测试作者为 reentry_trace。工作树 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeTransformCapture` 的 HEAD 为正式基准 `d8ae3da3793d5d95785606be319668a4318af85a`。作者交审报告 SHA256 为 `13ed6591d57e1d38815c1f95a6fc18cdac2669f4d4b2c3265fd3c4ec84e08445`，seal manifest 为 `de61cbf9f45b81db83d81bd1dbe7b64b69ef37d589d9c24057e7d753bbb2dfa4`。

## 代码与行为边界

逐行检查两文件完整 diff，并读取实际 CaptureSync/Persist、SyncFieldCloneWriter、typed/legacy authority refresh、prediction clone、undo、identity remap 与 admission snapshot 调用链。

- `LogicTransform.cs` SHA256 `0cd63226ee6a67a13d797a2f2f0bbd888ce575ffbe74e938fac3399ce32d21e5`：仅在 CapturePersist 增加既有 IPredictionFieldWriter marker guard。四个同步字段仍由未改动 CaptureSync 完整提供。普通 snapshot writer 没有该 marker，持久化字段和格式不变。Admission 两处本来只调用 CaptureSync，不受此 guard 影响。
- `TransformComponentTests.cs` SHA256 `faddfd833a3727aeb2b1bc928a3068221be4fbed9ce2b5b4c9a193307a2763c2`：三场景使用现有真实 WorldManager/Native-bound harness；保留旋转层级、覆盖及未确认输入、teleport、普通姿态持久化和默认额度下完整捕获。没有新 World 驱动器或玩法状态。
- 同键第二次写入确实继续追加 List 并收取字段及 scalar scratch 费用。原 RED 的失败栈位于 CapturePersist 的第二次 WriteString，而非 setup/首次 CaptureSync。容量公式来自实际 Sync writer charge 与既有 scratch lease，默认 1MiB 不变；三轮成功之后短期费用回到原值。

没有发现需修改的代码问题。性能主热点涵盖全部 ECS，Transform 四个冗余条目只占当前观测字段条目的一小部分，不能将整个 capture 时间或卡顿归因于这一行。

## 证据核对

Root 独立读取原 TRX、原 exit、构建日志和封存 source，并重新核对37个原始证据文件的 SHA256。验证文件：`games/101-bomber/.run/transform-capture-independent-review-01/verification.json`，SHA256 `b39d6067e781b16eb831cec4fa0ee2146640234737277599ddd40ec391642ca4`。验证脚本原 exit0，未再构建或修改作者工作树。

| 运行 | 原始结果 |
|---|---|
| baseline-01 | 11/11 PASS、0 skip、exit0 |
| red-01 | 1/1 FAIL、0 skip、exit2；第二次捕获触发 prediction-capture-capacity |
| green-01 | 12/12 PASS、0 skip、exit0 |
| gas-green-01 | exit5，筛选非法，NOT_RUN；保留失败原件 |
| gas-green-02 | 44/44 PASS、0 skip、exit0；包括真实 Native reparent/teleport/预算拒绝恢复 |
| netstandard-green-01 | production 浏览器目标构建 exit0，原日志0 warning/error |

测试 Native DLL、同目录 sidecar 与官方完整09 manifest hash均匹配作者封存；Native为实际 `030046d7563efd8cfe01e127bd719470eaba06ef81c7f808b640d97efea78ba8`，并未替换现场或正式包 DLL。RED 测试与 GREEN 一致，RED LogicTransform 与正式 d8 blob 一致。

48个生成文件只有 CRLF 字节副作用：Root 按每个文件实际当前字节与 git d8 blob重新核对，规范化后全部逐字一致。保留原字节及证据，不恢复、不暂存。工作树实际文本 diff 恰好为上述两文件，diff --check exit0。

后续只允许显式提交这两文件，构建使用新干净冻结工作树。当前终局停提交是另外一条已复现链路，不能由这个候选宣称解决；官方完整包消费和最终浏览器体验复测仍必须完成。
