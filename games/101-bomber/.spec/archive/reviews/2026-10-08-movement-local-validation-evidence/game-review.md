# 独立审查收据：本地验证报告 F1 / F7

- 日期：2026-10-08。
- 审查者：`/root/game_review`。
- 结论：**PASS — 所审范围内没有必须修正项。**
- 被审文件：`games/101-bomber/.spec/archive/reviews/2026-10-08-movement-code-review-local-validation.md`。
- 最终文件 SHA256：`36ef36cfd29f64c49483c93973e5e3c4faa7b3518d99a6039dbabb5b8ed1fa12`。
- 源码基线：Game `984f30e16c901c4705fb7eb2e9a22d5dbe73a747`。只读比较确认本次涉及的 `Gameplay`、`Client/Presentation/src`、`Client/UI/Spectator` 与 `f14bd502e9807d58890b4e9490d041bdab65ce05` 没有提交间差异。

## 范围

本次独审范围为报告 F1、F7，以及与其有关的证据分级、本地验证与最终验收边界。没有重新审查 F2–F6 的私有仓生产路径，也没有给 Engine 全部 Native 改动、发布包、CI、部署或移动手感作通过认定。

审阅了报告正文，并对照固定基线的实际 Game 源码和已有归档消费实验收据；没有修改被审报告或生产代码，没有运行新测试、实验、构建或浏览器。

## 核对结论

1. **F1 生产与消费缺口的陈述及行号成立。** `MoveAbility.cs` 58–77 的 Facing/位置写入，与 ViewRuntime 1300–1315 的 Model XZ 读取、Doll 343–357 的显示位移求 yaw、ViewRuntime 1351–1355 的镜头方向取值一致。报告没有把“只接 quaternion 消费”当作完整修复。
2. **复活旧 yaw 段的条件足够限定。** `replica-adapter.ts` 161–172 保持 participant 对应显示 ID；ViewRuntime 607–620 在相同 animal 时复用 Doll，1053–1054 只执行 teleport/drop；Doll 237–245 不重置 yaw，288–315 的 drop/resetParts 将原 yaw 写回 root。报告使用“可能保留”，要求同 match、同 participant、同外观、复活后不输入，并要求核对真实新旧 Life 与 Doll 复用，未把静态链写成已完成网页复现。
3. **下一局边界表述正确。** `game-view.mjs` 79–91 在 match identity 变化时 dispose/rebuild view；报告明确不把同局复活的旧 yaw 推广成正式页面下一局必然残留。
4. **F7 的位置/步态与时钟分歧成立。** Feed 133–140 的冻结分支保留旧 viewNow；index 109 显式覆盖 owner pose；ViewRuntime 460–465 得到 dt=0；Doll 在 dt 门之外写 XZ，并在 378–403 根据位移推进步态。报告正确区分 `fx.frozen` 的玩法冻结和 Feed 的 hitstop。
5. **对象别名与镜头措辞正确。** 冻结 sample 是新的外层浅拷贝，替换其 localPose 不会持续改写 `feed.last.localPose`。CameraRig 97–98 的基础跟随平滑使用表现 dt，而 100–110 的 overview/震动依旧可按真实时间推进；报告要求记录跟随中心而非仅观察 camera.position，没有把整个相机写成完全静止。
6. **已有实验和待执行验证没有混淆。** 归档 `root-01/receipt.json` 明确是实际方法加合成 pose 的隔离实验，exit 1、3 RED / 1 control PASS；`consumer-probe.json` 中两组身体偏角约为 46.65° / 25.07°、rotationReads=0。报告明确使用合成采样间隔、引用旧收据、没有重新运行；33 项 Node 与未运行的 TS/Vitest 也保持区分。
7. **退出边界正确。** 报告仍记移动手感 FAIL，未给组合根因发生率、Game35 实际客户端字节、真实浏览器结果或 Owner 门作无证据通过认定。新增本地配方均标未执行。

## 最终版本核对

首次完整读取的报告 SHA256 为 `0d40f9c69d72ce088961ad93ed4f98a4a02d84043c87361d48151cf83d401ace`。随后作者仅把尾部“源码链接”标题改为“审查记录”，增加证据目录链接及“新增本地验证配方尚未执行”说明；本次读回最终尾部并核验整文件 SHA256 为本收据开头的 `36ef36cfd29f64c49483c93973e5e3c4faa7b3518d99a6039dbabb5b8ed1fa12`。该附加说明未改变 F1/F7 结论，且与审阅范围和执行限制一致。

此 PASS 只对应以上报告字节与审查范围。
