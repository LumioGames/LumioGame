# 后继发布容量候选独立源码审查

结论：对 freeze-01 两源文件的窄范围 spec 与质量审查未发现阻断问题；支持进入同一最终测试源码严格 RED/GREEN 和完整发布物复验。此结论不是 Runtime 全量、Game Remote 或产品整局验收。

审查人承担 Game 木桶实现，未实现本 Runtime 修复。本次仅只读 owning worktree `C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity`，未改 Runtime、未编译、未重跑测试。独立性范围仅这两个源文件。

## 精确输入

- base/HEAD `23356eafc365c753b6e8d9987fd069815ff067ce`。
- freeze manifest SHA256 `8aa100ad4c635adb2d4d6818e99d9bb5553375ee5b82a20c2dfec13b2f82d0eb`。
- patch SHA256 `69d101cfbb0f40eb404eb6c3cbf4a0f577137be6cff3363fa5804b5c96339808`。
- `modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.Successor.cs` SHA256 `18013d7e0ff369d1de55b054da4768f275292e317cd52dc1539297dadd21dca0`。
- `modules/replication/tests/Lumio.GameRuntime.Replication.Tests/SuccessorPublicationGrowthTests.cs` SHA256 `334a53c1ec9bdfce29049617d33e06088f0bc6a97bd976c85a47c40f397bcd57`。

上面manifest、patch和工作区两源SHA均现场核对一致。读取 freeze0e `engine/wire/successor-binding-v1.json` 的 publication/credit/activation/retention条款、生产调用与结算链、正反测试和调查报告。

## 判定依据

`ActivateDeferredSuccessors` 保持原 authentication、eligibility、连接与epoch检查，在 `SetSuccessorObserver`、adapter route、attachment/generation变更前调用新 `TryReserveSuccessorActivationPublication`。新函数要求 exact `SuccessorCreditKey(token,request,transfer)`且尚无terminal，按既有aggregate `limit - debt + ownCredit.Bytes`检查实际当前baseline，只补正向增长并同时增加该credit和aggregate debt，没有新增上限、放宽已有frame/logical限制或绕过真实restore。

超限仍走原 `FinishSuccessorTransfer`→`PublishSuccessorResult`：保持NotApplied/Backpressure/successor_capacity，退回未用publication bytes而保留terminal credit。成功保留补足后的原credit，沿既有 `ReleaseDrainedSuccessorCredits` 需要真实result drain及Game消费/实际publication drain才释放；新代码没有提前释放或以ack替代事实。差额算术在已验证有限额度内，不引入更大累计值；baseline测量不可用的long.MaxValue仍被既有额度拒绝。

测试通过真实 HostedAdmissionFixture、Native与生产请求/GAS死亡/恢复/授权路径。反射只读取measurement诊断，不驱动authority。正向改变一个既有int值从0到int.MaxValue，保留Applied、控制后继、epoch3、实际create census与最终Game消费后两debt归零断言。负向真实创建70个既有census实体超过200000预算，验证旧view/epoch保留、后继Observer未控制、publication未提交、terminal到Game消费才释放。未发现test-only生产入口或断言删除。

## 证据边界与继续项

调查报告记载最小9byte增长RED1fail、GREEN1pass、超预算1pass、相关155pass，均0skip；这些是被审报告的既有实跑结果，本审查未复跑。

后续同源码严格对照已只读核对：`.run/successor-capacity/strict-final-01.json` SHA256 `d712235c74c7deab5f4aa5a57c9a0db6d60589c9c5a5c5754d88876038d8ab6c`、实际 RED/GREEN日志及netstandard日志。最终完整测试源码两次均`334a53c1…`；base生产`b2ff2bba…`得到155中154pass/1目标fail，候选生产`18013d7e…`得到155/155、0skip；真实增长仍143085→143094（9bytes）。候选最终Test/Ecs DLL与原freeze一致；严格恢复采用明确no-incremental，原一次增量复用RED DLL的失败仍保留。受影响Ecs netstandard2.1编译0warnings/errors。此补充关闭此前待协调的同test-source与第二TFM证据边界，不改变原两源源码审查判定；没有由本审查者额外编译/复跑。

完整Runtime suite/format、新完整官方包、Game Remote13与Server真CLR恢复转移未由此审查覆盖。没有公共契约或Owner16槽裁决。

无 actionable inline findings。后续修改任一冻结源文件需重新冻结并重新审查。
