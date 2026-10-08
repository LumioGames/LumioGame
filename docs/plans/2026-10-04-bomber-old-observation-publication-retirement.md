# 旧观察基线正常分页退休回归 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking. 本次唯一紧密关联任务由已获 Root 授权的 `/root/reentry_trace` 实施，Root 作非作者计划及结果审查；不再分派另一个源码作者。

**Goal:** 在真实 Native、原准入与默认分页额度下，验证未完成的观察基线被合法 transfer 取代后是否阻止同一新生命的下一次死亡准备，并保留实际返回码与分操作债务证据。

**Architecture:** 使用 Runtime replication 原 `SuccessorBindingTests` partial 内的 `Harness`、`HostedAdmissionFixture` 和原 GAS successor scenario。C1 正常死亡、Create/Restore 后真实 Disconnect；在无连接观察者时创建现有 Room 数据实体；C2 正常 reattach、Ready/grant/transfer、完整新基线 drain；C3 通过真实 Native 初始快照 cursor ACK/settle 准入同一新生命，再实际 lethal/Prepare。私有反射只读取已有 publication credit，不写字段、不减少 drain、不伪造 ACK。

**Tech Stack:** C# 14、.NET 10/xUnit v3 Microsoft.Testing.Platform、Runtime520、正式 complete-release-14 Native、正式 Engine523c 源码依赖图。

## Global Constraints

- 新树：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement`；branch `codex/101-successor-publication-retirement`；基准 `520ffe482e1c48fb6e48187925eecec986cdb9c8`。原五个健康案、Offline7/DRAFT 和现有诊断树不改。
- 当前仅一个新测试文件和私有执行证据。所有 Runtime/Engine/Server/Game 生产源码、公共契约、pins、生成输入与额度不改；不 commit、不 stage、不发包。
- `CreatesPerPack=0`、`SubscriptionOptions.MaxWorldChangeBytes=65536`、successor publication `16777216` bytes、reservation/result `4096` 均使用原默认值。
- 使用原 `AdmissionCensusEntity` 的 Room1024字符字段，创建256个数据实体；没有增加 player/Bot，没有第二个玩法 World。创建时无连接观察者，避免向已完成 census 的旧观察者一次性发布超帧。
- 每一拍调用 `TakeSectionSubscriptionDeltas()`、正常 `WorldManager.Tick()`、一次完整 `DrainOutbox()`；普通 WorldChange 每帧真实编码并断言 `1..65536` bytes。初准入由原夹具读取全部 immutable frames、逐帧 SHA ACK、真实 settlement。
- Native 固定为 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-14/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`，SHA `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`。不使用 complete15 新 Native，不编译 Native，不更换单 DLL。
- Engine 依赖根 `C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure`，HEAD `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0`。新 ArtifactsPath/NuGet cache，不改旧 frozen graph。
- 重构建等待 Root 的 `OFF_WINDOW_FINISHED`；收到后仍需 Root 接受本计划。当前 Runtime 夹具不含 Rust 签名 socket、writer fence 的真实传输，不称端到端 Host/浏览器验收。

---

## 证据起点与可证边界

实际 current PSS 在 World266335 看到 consumed reservation 对应 controlled epoch62；唯一遗留 `reattach` credit request18 对应旧观察 epoch61，217047 bytes，ResultDrained/GameConsumed/WelcomeDrained=true，PublicationComplete/Drained/BaselineDrained/Abandoned=false，ClosedTick=null。快照不是 death13560 时刻，也没有完整 association/commitFact，不直接证明其历史拒码。

源码 `ActivateDeferredSuccessors` 成功 transfer 令旧 participant Observer=false，并将62设为控制代际；旧61 future census 不再投影。原 Cancel helper 仅取消传入代际，后续 Disconnect 和 route reconcile 只见当前62。原 Prepare 复用 consumed slot 要求 `!HasSuccessorCredits(token)`。本测试只验证这条可正常到达的假说；若正确前置后通过，保留 PASS 并停止，不为了获得 RED 丢 drain 或 ACK。

## Task 1: 唯一正常分页实际 Native 回归

**Files:**

- Create: `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/modules/replication/tests/Lumio.GameRuntime.Replication.Tests/SuccessorPublicationRetirementTests.cs`
- Read/reuse unchanged: `modules/replication/tests/Lumio.GameRuntime.Replication.Tests/HostedAdmissionFixture.cs`、`SuccessorBindingTests.cs`；`modules/gas/tests/fixtures/successor/SuccessorScenario.cs`、`AdmissionCensusEntity.cs`、`AdmissionCensusPayload.cs`。
- Private execution files: new `.run/old-observation-publication-retirement-01/` 的逐 attempt source/input/raw/result、normal artifacts/bin/Fixtures、独立 NuGet cache、最终封件；只由新树生成。
- Modify production: none.

**Interfaces:**

- `new Harness(correlatedAdmission: true)`：真实 Native 装配、初始准入 Acquire/Reserve/Enqueue，原 cursor ACK/settle 已完成；`Harness.Limits` 保持原 reducer 限制。
- `SuccessorScenario.Stage`：5 actual lethal；1 Prepare+Destroy；2 actual Create；3 actual Restore；4 实际 RestorationWitness+RequestTransfer；6 actual TryConsumeTransferResult+Game current-life 更新。
- `ReattachObservationConnectionMessage(ulong requestId, SuccessorReservationToken reservation, NetEntityId expectedAttachmentId, ulong expectedAttachmentGeneration, string connection, string accountId, string roomId, WireProfile profile, string mode)`：通过原队列，不调用 private commit。
- `TransferSuccessorConnectionMessage(SuccessorTransferRequest request, string connection, string accountId, string roomId, WireProfile profile)`：只使用原真实 Ready 请求，完整原 guard。
- `HostedAdmissionFixture.Acquire(connection, account, profile, request, action="admit", grantBytes=16777216)`→真实 plan；`Reserve(plan)`；`Enqueue(plan)`；`DrainFrames(plan)`→原逐 SHA ACK；`Settle(plan)`→实际原债务 reconciliation。
- 新 `RetirementStep` 一拍完整 drain，并记录固定 stage、实际 Tick、ID/代际、真实码、帧长度和创建数、既有 typed debt flags，不输出 account/票据/任意正文。
- 新 `ReadRetirementCredits`：只读原 bounded dictionary，按真实完整 reservation token 筛选，输出 request/op/epoch、bytes 和10个已存在 flag/closedTick字段，不改业务状态，不调用模拟 API。

- [x] **Step 1: 读取所属入口、规范，建立纯520新树，编写唯一测试。** 完整实际代码附在文末；原 private fixture 在同一 normal partial class 可复用，不跨工程粘贴 private fixture。
- [ ] **Step 2: Root 审本计划；等待 OFF_WINDOW_FINISHED。** 在这两个条件前不运行 build/test。测试不会增加对 live DS 的 API 调用或任何 PSS。
- [ ] **Step 3: 正常窄构建，保存失败原件。** 用下面明确命令，私有 runner 记录开始/结束、原始应用退出、命令、Native/sidecar/源哈希。编译、analyzer、Content 缺失、参数错误都标行政失败，不算 behavior RED；不得降 warning 级别。

```powershell
$env:LUMIO_TEST_NATIVE = 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-14/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll'
$env:LUMIO_ENGINE_NATIVE_PATH = $env:LUMIO_TEST_NATIVE
$env:LUMIO_ENGINE_ROOT = 'C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure'
$env:DOTNET_ROOT = 'C:/Users/g923/.dotnet'
$env:MSBUILDDISABLENODEREUSE = '1'
Set-Location -LiteralPath 'C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement'
dotnet build modules/replication/tests/Lumio.GameRuntime.Replication.Tests/Lumio.GameRuntime.Replication.Tests.csproj -c Release -m:1 -nodeReuse:false -p:UseSharedCompilation=false -p:LumioArchRoot=C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure -p:ArtifactsPath=C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/.run/old-observation-publication-retirement-01/artifacts -p:RestorePackagesPath=C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/.run/old-observation-publication-retirement-01/nuget -p:RestoreLockedMode=true --nologo
```

预期 build raw0/0warning；新 output 内必须包含 normal csproj 的 `Fixtures/catalog-world.json`、`.capture` 及其余 Content，PE/PDB 绑定原 production520和当前新测试，而非只复制 DLL/PDB 的不可运行 frozen 子集。

- [ ] **Step 4: 仅运行这一正常 case。** 不跑 mass suite，不删相邻测试，不改变测试发现。

```powershell
dotnet C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/.run/old-observation-publication-retirement-01/artifacts/bin/Lumio.GameRuntime.Replication.Tests/release/Lumio.GameRuntime.Replication.Tests.dll --filter-method '*SuccessfulTransferRetiresIncompletePreviousObservationPublicationBeforeNextDeath*' --minimum-expected-tests 1
```

允许判定：

1. 真 RED 必须先证明：真实 C1 initial ACK/settle；实际 health0/Destroy/Create/Restoration；C2 Welcome+真实编码旧 census 已发布但未完；Ready/grant/transfer Applied；新 controlled census 全256实体实际发送并自己的 transfer credit 已释放；真实 C3 Native initial ACK/settle；在线真实 lethal 后 Prepare 首码。若仅前置失败，先修夹具行政原因，原件保留，不能当本根因 RED。
2. 怀疑分支预期最早码 `successor_reservation_invalid`，同 token 只剩旧 `reattach` epoch credit 的 flags 与 current 快照同型；实际以 raw 为准。最终语义断言 `Assert.Null(Scenario.Error)`，不把错误码强写为预期通过。
3. 若正确前置后 PASS，冻结通过原件、说明假说未复现并停，生产零改。

- [ ] **Step 5: 冻结来源和结果供 Root 非作者审查。** 保存 raw exit/result/log、正常全运行闭包及 Content、DLL/PDB checksum、纯520生产相等、原严格依赖锁和生成副作用实际清单，不 restore/覆盖生成文件。新 schema/Native/public contract未改。取得真实 RED 后另由 Root 批准唯一 owning production 修复；本计划不授权修生产或 commit。

## 后续任务界线

只有 Root 第二阶段批准，才以相同默认分页/实际 Ready 时序构建真实 Rust signed socket Host case。不能将本 Runtime Native/provider case命名或报告成 signed Host，通过也不代替两个真实浏览器/八人/十次关闭重进验收。最小生产候选仅供后续审查：成功 transfer 完整原 guard 和 activation publication reserve 后，按真实 `previous.ConnectionGeneration` 交给既有 cancel/drain 归属，不移除 Prepare guard，不造 censusComplete/fence/ACK、不取消新 epoch credit；当前未实施。

## 已授权并完成的第二步：唯一成功 activation 补行

原计划版本与新test完整源码在 `.run/old-observation-publication-retirement-01/reviewed-plan-before-minimal-fix.md`、`red02-frozen/plan.md` 原样保留。上节“当前未实施”描述原计划审查时点；本节记录 Root 读取合法 Native RED 并收到非作者认可后新增的明确授权，不追写旧 frozen 计划。

- [x] RED02 正常build0/0warning，唯一实际case raw2/1FAIL/0skip，前置全部到达末尾actual `successor_reservation_invalid`。
- [x] 原正常140闭包及13实际输入先冻结，生产只新增 `CancelSuccessorPublication(entry, previous.ConnectionGeneration);` 于旧Observerfalse之后、准确previous epoch退休处。整个旧文件完整锚定逆移除等原18013 hash，未改helper/guard/额度/Host/public语义。
- [x] 同一test dd469正常GREEN03 build0/0warning、test0/1PASS/0skip，新epoch credit一直保留到全256census真实完成。
- [x] 原有限13 guards＋5 healthy，全部实际PASS/0skip；私有healthy两源正常额外Compile输入不属于候选提交。
- [x] stop source/build/test，最终候选仅WorldManager.Successor.cs3470＋新testdd469；author report与final352 seal交Root/Schema独审。不自行commit/stage/package。

完整结果：`C:/Work/LumioGames/LumioGame/.sdd/101-20261004-old-observation-publication-retirement-author-report.md`。精确14 Native、行政build01和原RED永久保留，原38生成行尾副作用不恢复。Rust signed Host 第二阶段只允许准备独立计划，尚未构建或修改生产。

## 实际唯一测试完整源码

```csharp
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Gas.SuccessorFixture;
using Lumio.Wire;
using Xunit;

namespace Lumio.GameRuntime.Replication.Tests;

public sealed partial class SuccessorBindingTests
{
    [Fact]
    public void SuccessfulTransferRetiresIncompletePreviousObservationPublicationBeforeNextDeath()
    {
        using var h = new Harness(correlatedAdmission: true);
        Assert.Equal(0, h.Manager.CreatesPerPack);
        Assert.False(h.AdmissionHost!.Debt.HasRetainedObligations);
        RetirementStep(h, "first-lethal", 5);
        WorldDrainResponse first = RetirementStep(h, "first-observe", 1);
        SuccessorResult observation = Assert.Single(first.SuccessorResults);
        Assert.Equal(SuccessorCommitFact.Applied, observation.CommitFact);
        Assert.Equal("observe", observation.Operation);
        Assert.False(h.World.IsLive(h.Scenario.OldLife));
        RetirementStep(h, "actual-create", 2);
        RetirementStep(h, "actual-restore", 3);
        Assert.True(h.Manager.TryReadSuccessorRestoration(71, h.Scenario.Participant, out var witness));
        Assert.NotEqual(0UL, witness.EffectInstanceId);

        h.Manager.Enqueue(new DisconnectConnectionMessage("c1"));
        RetirementStep(h, "first-real-disconnect");
        Assert.False(h.World.Get<ObserverComponent>(h.Scenario.Participant).Connected);
        Assert.False(h.Binding.TryResolveObservationAttachment("c1", out _, out _));
        var roomOrders = new List<EntityOrder>();
        for (int i = 0; i < 256; i++) roomOrders.Add(h.World.Commands.Create<AdmissionCensusEntity>());
        WorldDrainResponse roomCreated = RetirementStep(h, "room-payload-created-with-no-connected-observer");
        Assert.Empty(roomCreated.OfType<WorldChangeMessage>());
        var roomIds = roomOrders.Select(order => order.AssignedId).ToHashSet();
        Assert.Equal(256, roomIds.Count);
        Assert.All(roomIds, id => Assert.Equal(1024, h.World.Get<AdmissionCensusPayload>(id).Value.Value.Length));

        ObservationAttachment previous = observation.NewAttachment!.Value;
        h.Manager.Enqueue(new ReattachObservationConnectionMessage(9007199254740994UL,
            h.Scenario.Reservation, previous.ViewEntityId, previous.ConnectionGeneration,
            "c2", "account", "room", h.Profile, "reconnect"));
        WorldDrainResponse reattached = RetirementStep(h, "reattach-first-natural-page");
        SuccessorResult reattach = Assert.Single(reattached.SuccessorResults);
        Assert.Equal(SuccessorCommitFact.Applied, reattach.CommitFact);
        Assert.Equal("reattach", reattach.Operation);
        ObservationAttachment oldObservation = reattach.NewAttachment!.Value;
        WelcomeMessage observingWelcome = Assert.Single(reattached.OfType<WelcomeMessage>());
        Assert.Equal(oldObservation.ViewEntityId, observingWelcome.Self);
        Assert.Equal(oldObservation.ConnectionGeneration, observingWelcome.ConnectionGeneration);
        var oldCreates = reattached.OfType<WorldChangeMessage>().SelectMany(frame => frame.Creates)
            .Select(create => create.NetEntityId).Where(roomIds.Contains).ToHashSet();
        Assert.InRange(oldCreates.Count, 1, roomIds.Count - 1);

        WorldDrainResponse ready = RetirementStep(h, "actual-ready-second-natural-page", 4);
        SuccessorTransferRequest request = Assert.Single(ready.SuccessorRequests);
        Assert.Equal(witness, request.Restoration);
        Assert.Equal(oldObservation.ViewEntityId, request.ExpectedAttachmentId);
        Assert.Equal(oldObservation.ConnectionGeneration, request.ExpectedAttachmentGeneration);
        oldCreates.UnionWith(ready.OfType<WorldChangeMessage>().SelectMany(frame => frame.Creates)
            .Select(create => create.NetEntityId).Where(roomIds.Contains));
        Assert.InRange(oldCreates.Count, 1, roomIds.Count - 1);
        RetirementCredit before = Assert.Single(ReadRetirementCredits(h.Manager, h.Scenario.Reservation),
            credit => credit.RequestId == reattach.RequestId && credit.Operation == "reattach");
        Assert.True(before.ResultDrained);
        Assert.True(before.GameConsumed);
        Assert.True(before.WelcomeDrained);
        Assert.False(before.PublicationComplete);
        Assert.False(before.PublicationDrained);
        Assert.False(before.BaselineDrained);
        Assert.False(before.PublicationAbandoned);
        Assert.Null(before.BaselineClosedTick);
        Assert.True(h.World.Tick >= h.Participant.EligibleTick.Value);

        h.Manager.Enqueue(new TransferSuccessorConnectionMessage(request, "c2", "account", "room", h.Profile));
        WorldDrainResponse transferDrain = RetirementStep(h, "actual-transfer-before-old-census-completes");
        SuccessorResult transfer = Assert.Single(transferDrain.SuccessorResults);
        Assert.Equal(SuccessorCommitFact.Applied, transfer.CommitFact);
        Assert.Equal("transfer", transfer.Operation);
        NetEntityId next = transfer.NewBinding!.Value.NetEntityId;
        WelcomeMessage transferredWelcome = Assert.Single(transferDrain.OfType<WelcomeMessage>());
        Assert.Equal(next, transferredWelcome.Self);
        Assert.Equal(oldObservation.ConnectionGeneration + 1, transferredWelcome.ConnectionGeneration);
        Assert.Equal(oldObservation, transfer.PreviousAttachment);
        var newCreates = transferDrain.OfType<WorldChangeMessage>().SelectMany(frame => frame.Creates)
            .Select(create => create.NetEntityId).Where(roomIds.Contains).ToHashSet();
        WorldDrainResponse consumed = RetirementStep(h, "actual-game-consume", 6);
        newCreates.UnionWith(consumed.OfType<WorldChangeMessage>().SelectMany(frame => frame.Creates)
            .Select(create => create.NetEntityId).Where(roomIds.Contains));
        Assert.Equal(next, h.Participant.CurrentLife.Value);
        h.Participant.LastLife.Value = next;
        for (int i = 0; i < 32 && ReadRetirementCredits(h.Manager, h.Scenario.Reservation)
            .Any(credit => credit.Operation == "transfer" && credit.RequestId == transfer.RequestId); i++)
        {
            WorldDrainResponse page = RetirementStep(h, "new-controlled-census-page");
            newCreates.UnionWith(page.OfType<WorldChangeMessage>().SelectMany(frame => frame.Creates)
                .Select(create => create.NetEntityId).Where(roomIds.Contains));
        }
        Assert.Equal(roomIds.Count, newCreates.Count);
        Assert.DoesNotContain(ReadRetirementCredits(h.Manager, h.Scenario.Reservation),
            credit => credit.Operation == "transfer" && credit.RequestId == transfer.RequestId);

        h.Manager.Enqueue(new DisconnectConnectionMessage("c2"));
        RetirementStep(h, "new-controlled-real-disconnect");
        Assert.False(h.World.Get<ObserverComponent>(next).Connected);
        HostedAdmissionFixture host = h.AdmissionHost!;
        SuccessorAdmissionPlanResult acquired = host.Acquire("c3", "account", h.Profile, 9007199254740995UL);
        Assert.Equal("Acquired", acquired.Status);
        SuccessorAdmissionPlan plan = acquired.Plan!.Value;
        host.Reserve(plan);
        host.Enqueue(plan);
        WorldDrainResponse admitted = RetirementStep(h, "fresh-controlled-admission");
        InitialOwnerProjection initial = Assert.Single(admitted.SuccessorAdmissions);
        Assert.Equal(next.ToHex(), initial.Attachment.ControlledLife);
        List<WorldMessage> frozenFrames = host.DrainFrames(plan);
        WelcomeMessage freshWelcome = Assert.Single(frozenFrames.OfType<WelcomeMessage>());
        Assert.Equal(next, freshWelcome.Self);
        host.Settle(plan);
        Assert.False(host.Debt.HasRetainedObligations);
        Assert.True(h.Binding.TryResolveConnectionState("c3", out NetEntityId controlled, out ulong epoch));
        Assert.Equal(next, controlled);
        Assert.Equal(freshWelcome.ConnectionGeneration, epoch);

        h.Scenario.OldLife = next;
        h.Participant.NextLifeGeneration.Value = checked(h.Participant.LifeGeneration.Value + 1);
        h.Participant.IntentGeneration.Value = checked(h.Participant.IntentGeneration.Value + 1);
        RetirementStep(h, "second-real-lethal", 5);
        Assert.Equal(0, h.World.Get<AttributeComponent>(next).GetCurrentValue("Health"));
        WorldDrainResponse secondDeath = RetirementStep(h, "second-death-prepare", 1, allowPrepareError: true);
        Assert.Null(h.Scenario.Error);
        Assert.False(h.World.IsLive(next));
        SuccessorResult secondObservation = Assert.Single(secondDeath.SuccessorResults);
        Assert.Equal(SuccessorCommitFact.Applied, secondObservation.CommitFact);
        Assert.Equal("observe", secondObservation.Operation);
        Assert.Equal(epoch + 1, secondObservation.NewAttachment!.Value.ConnectionGeneration);
    }

    private static WorldDrainResponse RetirementStep(Harness h, string stage, int scenarioStage = 0, bool allowPrepareError = false)
    {
        h.Manager.TakeSectionSubscriptionDeltas();
        h.Scenario.Stage = scenarioStage;
        h.Manager.Tick();
        WorldDrainResponse drain = h.Manager.DrainOutbox();
        var changes = drain.OfType<WorldChangeMessage>().Select(frame => new
        {
            observer = frame.ObserverId.ToHex(),
            frame.Tick,
            creates = frame.Creates.Count,
            bytes = WireCodec.EncodePack(frame, h.Profile).Length
        }).ToArray();
        Assert.All(changes, change => Assert.InRange(change.bytes, 1, 65536));
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            stage,
            tick = h.World.Tick,
            error = h.Scenario.Error,
            participant = h.Scenario.Participant.ToHex(),
            oldLife = h.Scenario.OldLife.ToHex(),
            currentLife = h.Participant.CurrentLife.Value.ToHex(),
            lastLife = h.Participant.LastLife.Value.ToHex(),
            lifeGeneration = h.Participant.LifeGeneration.Value,
            changes,
            requests = drain.SuccessorRequests.Select(request => new
            {
                request.RequestId,
                request.ExpectedAttachmentGeneration,
                request.EligibleTick,
                request.EligibilityRevision,
                request.Restoration
            }),
            results = drain.SuccessorResults.Select(result => new
            {
                result.RequestId,
                result.Operation,
                result.CommitFact,
                result.Code,
                generation = result.NewAttachment?.ConnectionGeneration
            }),
            credits = ReadRetirementCredits(h.Manager, h.Scenario.Reservation),
            h.Manager.PendingSuccessorResultCredits,
            h.Manager.PendingSuccessorPublicationBytes,
            h.Manager.PendingSuccessorReservationBytes
        }));
        if (!allowPrepareError) Assert.Null(h.Scenario.Error);
        return drain;
    }

    // The public API deliberately reports aggregate debt. This test reads the
    // existing per-operation records to distinguish the superseded census from
    // the new controlled census; it never edits, drains or retires those records.
    private static List<RetirementCredit> ReadRetirementCredits(WorldManager manager, SuccessorReservationToken token)
    {
        var dictionary = (IDictionary)typeof(WorldManager).GetField("_successorPublicationCredits",
            BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(manager)!;
        Assert.InRange(dictionary.Count, 0, 4096);
        var records = new List<RetirementCredit>();
        foreach (DictionaryEntry pair in dictionary)
        {
            if (RetirementValue<SuccessorReservationToken>(pair.Key, "Token") != token) continue;
            object value = pair.Value!;
            SuccessorResult? result = RetirementValue<SuccessorResult?>(value, "Result");
            records.Add(new(RetirementValue<ulong>(pair.Key, "RequestId"), RetirementValue<string>(pair.Key, "Operation"),
                result?.NewAttachment?.ConnectionGeneration, RetirementValue<long>(value, "Bytes"),
                RetirementValue<bool>(value, "ResultDrained"), RetirementValue<bool>(value, "GameConsumed"),
                RetirementValue<bool>(value, "PublicationComplete"), RetirementValue<bool>(value, "PublicationDrained"),
                RetirementValue<bool>(value, "WelcomeDrained"), RetirementValue<bool>(value, "BaselineDrained"),
                RetirementValue<bool>(value, "PublicationAbandoned"), RetirementValue<ulong?>(value, "BaselineClosedTick")));
        }
        return records;
    }

    private static T RetirementValue<T>(object source, string name)
    {
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        Type type = source.GetType();
        PropertyInfo? property = type.GetProperty(name, flags);
        return (T)(property is not null ? property.GetValue(source) : type.GetField(name, flags)!.GetValue(source))!;
    }

    private sealed record RetirementCredit(ulong RequestId, string Operation, ulong? Generation, long Bytes,
        bool ResultDrained, bool GameConsumed, bool PublicationComplete, bool PublicationDrained,
        bool WelcomeDrained, bool BaselineDrained, bool PublicationAbandoned, ulong? BaselineClosedTick);
}
```
