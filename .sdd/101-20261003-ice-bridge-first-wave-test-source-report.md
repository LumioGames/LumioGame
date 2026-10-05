# IceBridge 第一波测试源码与计划交回

2026-10-03，capacity_schema。授权仅新独立测试类、计划/证据文档；生产、旧测试、声明/生成/配置/index、Runtime/Engine、build/test/GEN/format/Native和提交均未修改或执行。新测试在Root狭域修正后已STOP并冻结。

## 身份与三处修正

- 当前新类：`C:/Work/LumioGames/LumioGame/games/101-bomber/Server/Tests/Gameplay/BomberIceBridgeProductionTests.cs`。
- 源SHA256=`92eba733105e66e3c2b2a6f1bb1b075f4d45dd12e59e5165cc9a8e43c7263a08`。
- 7 Facts +2 Theories各2 InlineData =**11 cases**，过滤类`*BomberIceBridgeProductionTests`，后续minimum11。
- 原完整725f前像保留于根 `.run/ice-bridge-first-wave-test-source-01/before.cs`，SHA256=`725f7faa51c975d196379e032fc829333d827a0484d24dc9be03a017da8bc037`。当前after.cs字节等同当前源码。Root complete07 build01首个实际结果为rawchild1/0warnings/1error、sourceDrift0，仅BindCandidate CA1859；它是编译前置失败，**不算业务RED**。

三处授权delta：

1. `BindCandidate`和转发`Withhold`的返回类型表达实际`AdapterBinding`，解决CA1859，不改变回执/绑定行为。
2. 退役前保存桥fullID/gen/token以及炸弹fullID/SourceLife/gen/Owner。退役后的检查不再读取已detach组件；仍要求实际Native water、binding null、World.IsLive(oldFullID)=false，活原Life普通库存0→1，狂暴ordinary库存不动/真实未发布promise0/无该owner liveFrenzy，Original重送不增加库存/事件，successor不得得到旧Life返还。真实`bomb_extinguished`必须恰好一次且fullentity/Life/Participant/gen均相同。原组件Phase/CapacityReturned在detach后不可读，不声称从残存内存证明它；Root明确授权以实际可观察原生生命周期发生及退款证据替代。接受前仍检查真实Fuse和ordinary CapacityReturned=false，真实event不存在时测试明确失败，未forge。
3. replacement测试在实际Fire melt、Original、旧桥退役之后，保存真实Fire完整ID并按真实配置Danger+fireBomb_lv1 duration的有界Tick窗口等待World.IsLive=false，再施放新的真实Freeze。避免合法仍Burn的旧Fire压制新桥造成fixture假失败；不手写phase/deadline、不延长桥或跳过旧Original保护。旧桥fullgen/token在detach前保存，新桥必须gen更大/token不同，旧真实Original重送仍不得融化/退役/续期它。

## 第一波11项与证据边界

完整列表见计划 `C:/Work/LumioGames/LumioGame/docs/plans/2026-10-03-bomber-ice-bridge-first-wave.md` Task1表。覆盖实际Freeze→Native1031/fullbinding/source persistent debt/固定8秒、重复不续期、普通/Freeze危险不融化、实际Fire原子water+clear与Original后退役、两种同Tick顺序融化胜、Original迟到/重送下stationary/Remote/Frenzy全部Fuse一次熄灭/退款、真实successor不收旧Remote库存、旧代数Original不能改替代桥、普通水负控。

当前生产缺失时静态预计8失败/3负控通过；**未执行，不声明实际RED**。先Freeze缺失会阻断后段refund/expiry/restore断言，不能将测试源码存在当成这些分支已跑。Root需要fresh同source构建、实际原始日志/JSON/raw child/DLL与Native身份，再独立确认第一失败是Native仍water而非前置。

Scene是真实官方Native、Legacy19/8且ice.enabled=false；仅沿既有Remote test模式通过真实authoringCLI私有启用Remote，未解除M2或formal producer guard。真实冻结源kind在EntityOrder发布前是fixture输入，后续Blast/HFSM/Tick/Native全真实；不声称公开特殊弹放置资格已验收。多occupant用公开CanPlace/Activate真实发布标准/Remote/Frenzy，再用实际LogicTransform构造同cell几何；不声称真实移动/踢弹或堆叠放置通过。真实Original来自实际CaptureResultCheckpoint并恢复到fresh adapter，没有QueryTransaction或假回执代替。Token/桥/源tuple JSON属性是计划提出的未来producer持久编码合同，目前没有生产helper实现。

当前11没有覆盖retained FireZone、Danger/Burn occupant、60记录/64KiB worst case、Rejected/Aborted/Unknown birth/全部paired恢复/round cleanup/三图与长稳。这些在计划Task2–5列明，必须继续真正TDD，不能靠11候选替代。Native支持一次atomicwater+bindingclear，ECS退役须在Original后普通Commands.Destroy并持久保留信用至真实退休，不能冒称同Native调用自动销毁。

本报告写完后源码仍STOP。Root独占所有重窗口；后续生产仅在实际业务RED和Root独立授权后开始。
