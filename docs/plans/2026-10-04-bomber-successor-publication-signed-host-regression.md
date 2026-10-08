# Bomber 旧观察分页退役的真实签名 Host 回归 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在真实 BoundAdmissionVerifier、WebSocket、CoreCLR、Native 与未改的 Server008861 下，验证不完整旧观察 census 经合法 transfer 退役后，正常 fresh controlled 准入的新生命能够再次 Prepare/消费死亡；完整14与完整16各执行同一测试一次。

**Architecture:** 所有新增行为只存在于新 Server 测试树的 fixture 与一个 Rust 集成测试。fixture 用既有 GAS、Prepare/Create/Restore/Ready/consume API 驱动正常 gameplay，并只读现有 credit 与 AdmissionPlans metadata。原 Host 独占所有 Native cursor ACK、真实 transport WrittenFence 与 PublicationReconciled；证据读取器只读取真实 socket 原字节，不发送 ACK、不替代 Client replica。

**Tech Stack:** Rust1.98/test-harness、C#14/net10.0、已安装 .NET10.0.11 CoreCLR、正式完整14/16 SDK/Native/HostEntry、原 ECS声明生成器、Node内建crypto/fs。

## Global Constraints

- 新树唯一落点：`C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement`，branch `codex/101-successor-publication-host`，HEAD `008861074a2d3c9da1b0407325ede6f851704fd5`。
- 此轮只有一个实际 Host 用例，当前仅 PREPARE_ONLY。Root 源码审查与完整16消费身份接受后才准执行；不启动公开/浏览器服务。
- Host生产文件零改；不使用 RuntimeOfflineDeath7、ServerOfflineDeath3、Engine DRAFT、0247 capture诊断或任何假Runtime。
- Runtime Native 第一阶段来源/修复已经独立接受：纯520ffe + `WorldManager.Successor.cs` 唯一成功 transfer previous-epoch cancel，commit `da24b0d6a401adbcb2c1cbcda8464fcac6287d66`。第一阶段真实Native RED/GREEN不等于本Host测试已跑。
- `CreatesPerPack=0`、WorldChange物理帧65536、原 successor publication16MiB/4096、原parts Host64条/8,388,608字节与20Hz保持；不缩玩家、删除体素或扩额度。
- 两个 Census 声明逐字复制现有 Runtime 普通fixture，payload为 `new string('x',1024)`、Scope.Room、256个实体。生成器正常注册；不复制/手改registry或生成DLL。
- 每拍执行原 `DsHost.run_tick`；原 Runtime完整Drain/Native publication/cursor ACK/Host writer fence不拦截、不减少、不手工补齐。
- C1/C2/C3三张不同expiry签票均由同一个真实test issuer签发、原BoundAdmissionVerifier验证，account/room相同；实际peer close1001后建立新socket，不直接改connection/binding/Observer。
- 两套资格使用分别的新完整305文件只读复制、新strict lock副本、新短NuGet缓存、独立ArtifactsPath与Cargo target。不覆盖旧14/16或任何RED/GREEN文件，不替换单DLL。
- `initial` cursor frame SHA ACK、WrittenFence、PublicationReconciled是Host内部原账；successor census credit是另一账。只读观察两者，不能拿一方确认替另一方结债。
- 私有Trace最多256条；Census ID最多256、credit/index遍历最多既有4096；socket evidence最多4096帧/8MiB，每实际物理帧≤65536。身份字段u64输出decimal string；不输出credential/signature/账号密码或原reservation token。
- 新声明/测试/私有脚本尚未编译。C#或Rust行政失败必须单独保留，不能算行为RED。

---

## 已准备的确切文件及接口

相对路径均相对于上述唯一新Server树；文件正文已经写好供Root逐行审查。

| 路径 | 责任 | 当前状态 |
| --- | --- | --- |
| `Tests/tests/successor_publication_retirement_real_clr.rs` | 唯一新真实签名Host测试及有界原socket证据读取器 | NEW，未编译 |
| `Tests/fixtures/successor_runtime/AdmissionCensusEntity.cs` | 原Runtime Room实体声明，逐字copy | NEW，未生成 |
| `Tests/fixtures/successor_runtime/AdmissionCensusPayload.cs` | 原Runtime1024字符Scope.Room字段，逐字copy | NEW，未生成 |
| `Tests/fixtures/successor_runtime/SuccessorPublicationRetirementScenario.cs` | 新mode的fixture gameplay步骤与现有账簿只读Trace | NEW，未编译 |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | 只增加下面5行mode dispatch；其余普通mode不变 | 5+/0- |

```csharp
if (scenario.PreparedReentryMode == "publication-retirement")
{
    SuccessorPublicationRetirementScenario.Execute(world, scenario);
    return;
}
```

普通 `SuccessorScenarioSystem` 的自动+64 deadline不能用于本回归，因为那会让十余页旧census在transfer前自然结束。专用mode沿用正常Gameplay policy：第一次Prepare前 `EligibleTick=world.Tick`，完整原初准入已退休后才写；其后不变更已捕获的eligibility。步骤只执行一次，后续等待拍仍照常Tick/drain，不hold World。`consume`按现有Game更新CurrentLife/LastLife/LifeGeneration/NextLifeGeneration/IntentGeneration，结果必须真实Applied。

新Rust文件只 `include!("successor_real_clr.rs")` 复用其真实 `signed_successor_runtime`/profile/imports。它没有include带crate inner-attribute的prepared测试文件，避免不合法宏上下文；close1001/new-socket、Host构造、PostOffice、Budget cleanup沿原 `prepared_browser_reentry_real_clr.rs` 路径实现同等调用，不改旧文件。

私有行政文件均在 `.run/signed-host-retirement-01`：

- `prepare-qualification.mjs`：仅参数14或16；校验已审核manifest、全部305源字节，再逐文件复制完整包，不读取额外故障日志。原完整目录不变，独立copy仅供新进程消费。
- `run-qualification.ps1`：校验HEAD/精确source-proposal；新cache、locked fixture正常build；实际环境全部指向所选完整包复制；再执行唯一ignored+exact测试。
- `source-proposal.json`：当前5测试源码与私有脚本hash、原生产/复用输入hash和原Scenario逐字inverse，供Root审查，不是通过报告。

### 正式包身份

| 输入 | manifest路径 | 当前确切SHA256 |
| --- | --- | --- |
| baseline14 | `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-14/manifest.json` | `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9` |
| candidate16 | `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-16/manifest.json` | `da03566c44135860eabdc65b628c8502064e0ee7417f2df17daf50dbb2d17954` |

两包SDK都名为 `0.0.5-main.523c3d3`，**包名相同不等于字节相同**。prepare逐次读真实archive/元数据计算SHA512并通过原 `createLockCopies` 对外部图校验；14/16独立feed/cache/locked副本，不复用同版本旧缓存。完整16默认CLR/whole305资格由Root/Perf独立报告接受后才执行本计划。

## Task 1: 审查当前唯一测试与正常前置

**Files:** 上述5测试源 + `.run/signed-host-retirement-01/source-proposal.json`。

**Interfaces:**

- `DsHost::new_with_configs_with_failure(...)` / `run_tick("room")` / `shutdown(Duration)`：原生产Host与原Native timer。
- `RoomClient::connect_authenticated_offering(uri,ticket,Some(profile))` / `close_first(Some(1001),"tab closed")` / `try_recv_text()`：真实网络；`try_recv_text`只返回原raw，不重组或发GameplayACK。
- `WorldManager.PrepareSuccessor(participant,oldLife,generation,out token)`、`CreateSuccessor(token,typeof(PlayerEntity),out order)`、`TryReadSuccessorRestoration(71,participant,out witness)`、`RequestSuccessorTransfer(token,created,witness,out request)`、`TryConsumeSuccessorTransferResult(token,out applied)`：原Runtime事务/原授权请求，不手造result/grant。
- `Effects.Apply<EliminateLifeEffect,...>` / `Effects.Apply<RestoreLifeEffect,...>`：实际Native GAS与原generated reducers。
- `WorldManager.AdmissionPlans`现有对象 `_entries`/`HasRetainedObligations`、`_successorPublicationCredits`：仅Get/枚举；没有Set、Cancel、Drain或Process调用。两次TryRead方法是fixture已有类型的managed只读查询；本probe不执行Host/Native查询，不声称整个fixture零查询。

- [x] **Step 1: 保持原Server生产与复用夹具逐字。** 新源码只列上述5项；原 `Engine/src/{owner.rs,successor.rs,clr.rs}`、`Engine/src/owner/admission/lifecycle.rs`、`Tests/tests/{prepared_browser_reentry_real_clr.rs,successor_real_clr.rs}`、原Life/Subsystem/AdmissionDeclaration/creation.json保留。
- [x] **Step 2: 形成实际有界时序。** 新测试函数为 `signed_observation_paging_transfer_and_next_controlled_death_retires_previous_publication`；完整正文在新Rust源。顺序如下，不能删任何等待/确认：

  1. 原NativeWorld warmup→真实签票C1初始准入；fixture只读观察实际AdmissionPlan entry先存在，再由原ACK/PublicationReconciled完成后消失。只收到WC不足。
  2. 正常GAS lethal→Prepare/Destroy→Create→Restore。每命令之后再跑一个正常Tick，读前一实际commit/drain后的witness/oldbody状态；Trace位于ProcessorPlan，明确一拍观测边界。
  3. C1实际close1001，原Host连续五拍处理关闭；只有participant Observer真正false后才能在原CommandBuffer创建256 Room1024实体。
  4. 真实新签票C2观察reattach；收到真实auth/Welcome和自然首逻辑WC，记录1..255 Room fullIDs及未complete、未abandoned的精确旧reattach credit。没有停止drain。
  5. 立即真实Ready，原Native witness/当前epoch必须匹配，Host自行授权grant/Runtime实际transfer。transfer那一刻旧代集合仍1..255，否则是前置不成立，不造RED。
  6. 实际Game消费Applied结果；新控制代全部256ID census正常送完且当前transfer credit消失后才close C2。旧代是否仍存在仅只读记录，不在测试中清理。
  7. 第三张新签票C3普通controlled readmission；Welcome必须同一新life/gen+1；真实frozen initial全256ID/parts完整，实际AdmissionPlan再次由存在→原确认/fence/settlement后退休，不用首WC替代。
  8. 新life在线GAS lethal→Prepare；唯一最终语义断言要求error null、真实body销毁、原observe授权送达，再持续12拍推进。baseline若真正命中 `successor_reservation_invalid`，保留未销毁body与exact旧credit flags。

- [ ] **Step 3: Root完成源码资格审查后准执行。** 此处没有编译/测试/PASS声明。若新scope/reflection/前置需要修正，先留当前proposal原件，新proposal只修行政/fixture问题，不能改变drain/ACK/额度来求RED。

## Task 2: 只一个用例的两套完整消费

**Files:** 两个现有私有完整脚本；输出各自 `.run/signed-host-retirement-01/qualification-{14,16}`。

**Produces:** 独立normal fixture图、fresh SDK selection/strict lock、inputs.json、build.log/exit、test.log/exit、socket.json、fixture-phases.jsonl与Host诊断。每label只执行一个exact测试，包含的原ignored测试均被filter，不冒称已执行。

- [ ] **Step 1: 建立原14资格，尚未准执行。**

```powershell
Set-Location -LiteralPath 'C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement'
node .run/signed-host-retirement-01/prepare-qualification.mjs 14
pwsh -NoProfile -File .run/signed-host-retirement-01/run-qualification.ps1 -Release 14
```

prepare成功必须全部305payload hash匹配；build实际0/0warning。预期因果结果只接受最后 `RETIREMENT_SEMANTIC_FAILURE` 且实际code=`successor_reservation_invalid`；Cargo应用101只是失败退出，不能单独算行为RED。任何 `PRECONDITION`、编译、fixtureTrace容量、未见真实初准入/parts、旧census已完整、Host earlier hold或其它code都另列实际结果，不能删drain/fake ACK/改额度。

- [ ] **Step 2: 完整16独立同源资格。**

```powershell
Set-Location -LiteralPath 'C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement'
node .run/signed-host-retirement-01/prepare-qualification.mjs 16
pwsh -NoProfile -File .run/signed-host-retirement-01/run-qualification.ps1 -Release 16
```

实际Cargo0/1PASS/0ignored才是本用例GREEN；仍逐前置核C1原cursor/nativeACK、C2自然partial、真实transfer、新census full256、C3完整native initial/真实fence/settlement与第二死亡，不能由退出0替代证据。两个selectedNative SHA分别从完整包manifest归属校验；SDK/package/CLR/PDB/refs必须与各自选择一致，不把旧14 Native身份写到16。

实际cargo唯一命令（两个label只有完整provider输入不同）：

```powershell
cargo test -p lumio-server-tests --features test-harness --test successor_publication_retirement_real_clr signed_observation_paging_transfer_and_next_controlled_death_retires_previous_publication -- --ignored --exact --nocapture --test-threads=1
```

- [ ] **Step 3: 失败留新attempt，禁止覆盖。** 当前脚本拒绝已有qualification/build.log。行政失败若需要重试，先复制修改新script/output label并把旧raw/source/props/cache留原处；不重跑当前Runtime19案，不扩大Host矩阵。

## Task 3: 有限封件与非作者判定

**Inputs:** 两实际同源Host资格的原raw/manifest/source fence和正常fixture闭包；已有第一阶段作者958daa/非作者a2e88报告只作先前来源，不作本阶段通过证据。

- [ ] **Step 1: 核全部normal source/GEN与包身份。** 两Fixture由各自正常SDK generator产生，不手改。复制实际normal runnable bin/Content及必要PDB绑定，hash记录新声明/新GeneratedRegistry/新增GEN、原普通生成变化原因；不一概stage、不restore任何CRLF副作用。
- [ ] **Step 2: 核因果与准确时序。** 保存完整socket原strings/parts metadata与decoded exact logical SHA；256ID集合按exact fullID计算，u64不经过JS Number。Trace只读在ProcessorPlan，前拍的ResultDrained/PublicationDrained后续样本定界；socket不带drainID，明确同drain未知。
- [ ] **Step 3: 非作者有限审查后交Root。** 列两套whole输入/默认额度/全部前置/实际首code/原应用exit和测试数、完整Fixture生产scope；由Root决定是否把测试提交及继续真实浏览器十次回归，不自行提交/合包/部署。

## 证据能与不能说明什么

- 原Runtime正常初始service：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/modules/ecs/src/Lumio.GameRuntime.Ecs/World/AdmissionPlanService.cs` 的 Read/Acknowledge164附近与 `AdmissionPlanService.Debt.cs` 的 PublicationReconciled42–50、TryRetireEntry140附近；entry消失需原publication settlement与snapshot release，不由fixture发起。
- 原Host：`C:/Work/LumioGames/.101-pack07/LumioServerSuccessorPublicationRetirement/Engine/src/admission_attempt/publication.rs` 617–657冻结真实cursor SHA ACK、878附近PublicationReconciled；`Engine/src/owner/admission/lifecycle.rs` 664–725由原publication.poll推进、仅Released后退休。测试没有创建任何ACK/Fence/Reconciliation DTO，也没有替换这些生产body。
- 真实Parts证据读取器只保留实际raw，验证实际generation/连续index/metadata/长度/base64/SHA/UTF8和complete WC，统计actual fullIDs；它不向Host发送消息、不认证remote、不执行Client replica或Gameplay、不能把arrival称applied ACK。
- 本计划只验证一个合法Host lifecycle cause及一行Runtime修复。真实8人页面同步、持续输入、rAF/长帧与十次关闭重进属于Root另行真实浏览器验收；Host1PASS不能关闭体验门。
- 旧live14当前PSS只说明CURRENT旧credit，未记录death13560原Prepare返回码。该限制不因新Host复现而被改写。

## 当前交付状态

PREPARE_ONLY：新tree/5测试源/2私有脚本已准备，所有Server/Runtime生产零新改动；新Host testcase/normal generator/build/pair尚未执行。Root可逐行读当前完整源，当前不请求人类“是否继续”。
