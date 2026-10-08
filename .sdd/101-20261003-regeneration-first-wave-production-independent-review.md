# Regeneration first-wave producer 独立审查

2026-10-03，registry_bounds_review，非Regen生产作者。只读核现行五源、物理前后像、计划、原RED、新build03/四例GREEN、公开SDK代码与规则；只新增本报告及相邻proof JSON。未写任何生产/测试/声明/生成/配置/index，未build/test/GEN/Native。

**Verdict：HOLD / 一处P2须修复。** 受限soft whole-group主路径及四例执行成立，但成功结算新增逐格Native读取违反本仓批读规则。除此未发现已证实的阻断业务缺陷；恢复、Unknown/拒绝、全面发行与容量后续证据仍不能由四例绿色推定。

## P2：成功整组校验逐格读Native，没有复用本帧照片

准确源：`games/101-bomber/Gameplay/BomberRegeneration.Server.cs:293–298`，SHA `86130bedf68d0646f9d7e56f32c11e6fe9c217f5704b4df79258a3acc272707f`。`ValidatePending(applied:true)`每次执行 `adapter.Read(new[] { (address.Section, address.Offset) })`。实际调用者是 `BomberTerrainTransactions.Server.cs:99–105`（候选SHA `0299df358538b25e378f32f4c713a9227b40640856454485639a64469af008af`）的整个pending cohort循环。一次4/8-cell成功Original会在该循环发起4/8个单地址Gameplay调用；不只是一个未被调用的辅助方法。

规则依据 `docs/specs/bomber/stage0-kernel-contract.md:241`：“帧初一次批量读覆盖两层，pin就绪才运行；帧内只用照片与有界工作集，不逐格往返、不读未提交写。” 这里读的是先前真实已提交结果，并没有读未提交写；违反的是逐格往返和照片复用。当前Terrain.Begin有receipt section分组与revision guards，**没有**Native整组材料照片。`BomberTerrainRead.For`遇pending transaction返回null，故不能假称这段能直接复用已有照片。

最小方案：唯一Terrain consumer在matching Original的完整receipt/整组shape/provenance校验之后，取得一次当前Tick两层Native批量照片，再用纯索引逐行验证所有cell、revision与binding；照片存入既有tick-local TerrainRead cache，Accept/Clear后同帧其他玩法复用它。若需要增加窄内部settlement读取入口，仅唯一consumer能在这种合法已提交结果上下文调用；普通For的pending gate不放开。不能把逐格调用搬进另一个helper循环，也不能以单组批读后再同帧全图重复读冒称一帧一次。全批检查必须仍先于任何债务释放/activation。未修改源码；Root决定测试/修正/重跑窗口。

## 候选与执行身份

实际publication freeze位置是 **`games/101-bomber/.run/regeneration-first-wave-production-source-01/manifest.json`**，SHA `6ccf91dfeba82a0020abf2e85ea1e4d3e77425bfd006345dc972513f535ef778`；不是根`.run`下同名目录。作者报告SHA `d49f1dbea23fc304b4f004887525c38b72892d48bb6f1200f4841432d1bff217`。计划 `3203667ec1274db9bc57caa249567299eeb452cb6e39c2111f2766d831f638b8`；原非作者四例独审 `5042a60bbf3cb7a6e8b001210bea82554932faf688de30ad46063bb6e941823d`。新源的revision02私有副本逐字匹配physical after；四旧源before/after完整hash与manifest均一致，逐diff仅以下授权领域：

| 文件 | Before SHA256 | Regen candidate SHA256 |
|---|---|---|
| BomberRegeneration.Server.cs | absent | `86130bedf68d0646f9d7e56f32c11e6fe9c217f5704b4df79258a3acc272707f` |
| BombSystem.Server.cs | `542af1c6a65bb93a91b8f836387814878ed3b5ef5502b3007dd904fdfbe68382` | `20fdbe00683bdf040edac2171a70be7b629bdd1fc6bb288f31110a160a693c3b` |
| BomberTerrainTransactions.Server.cs | `46cafe153ba20e83f2e4d9c2698f72149a078aebaf00218bceb7142582754b85` | `0299df358538b25e378f32f4c713a9227b40640856454485639a64469af008af` |
| BomberWorldRuntime.Server.cs | `7fde39b62f811b9dd8042ef8cd3fe2f41d7633b5c52f667b7947f65f7ceb36e3` | `838b2f80485977a8bd6fcd2d918b38b3b16daedc10fe9be426307d521aa415ad` |
| BomberRoundTransition.Server.cs | `e9a18ec95df73a0b669348692465f821a05324163a4ad3dcf00577dbc0732ce5` | `7603a51e10b3f7ebef30d68a3f8a6ce4a95f8c3c91821ae03597a30055cea4ad` |

当前BombSystem额外变为 `22076471966d5510a4f40766b6dd0c22e1a272bc4a8b4f4e51c2c886811bcc9e`。独立diff候选20fd→当前只删除Protected解锁条件中的`&& player.ProtectedUntilTick.Value != 0`；这是Root随后独立Aura保护P2修复，**不计作Regen作者delta**，RegenHook及其余物理字节保留。其余四个现源仍匹配表中候选。当前共享DLL路径已被后续build04替换，不能把当前DLL冒认为build03原件。

实际07 build03 `games/101-bomber/.run/v14-fullpack07-native-20261003/build-03`：raw `.exit`=0、真实log0 warnings/0 errors、370源码两端/sourceChanges0。JSON SHA `80cd846be61b125b400bf19ae015c0707c5abf2a32d5a5f6e73e851827c0be13`，log `8e2e1483edb0d4f1bd68defab1ee06b675f7f2a0294980e3bcda0c88a2939727`。

实际 `regeneration-first-wave-green-candidate-01`：**4 total / 4 succeeded / 0 failed / 0 skipped / raw child0**，13.757秒；`.exit`与JSON均0。log SHA `e3e178c3d447e96cdab80d1d621acb5bb1a98aedb13d5cfae2e2e01b0ec264c2`，JSON `e2e3904347672d6e0e7aea34dd5b1e7ceff5f61ff43c7d1d5a1ab0ebecd902e8`。370源码两端/sourceChanges0；五个candidate均精确匹配两端hash，原test SHA `1430ca00bfdf3c792b97e5ca5a89d570ccc000be4cfa6a26d9d3403400ca4b1f` 未变。argv：

```text
dotnet C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-fullpack07-native-20261003/artifacts/bin/Lumio.Bomber.Gameplay.Tests/release/Lumio.Bomber.Gameplay.Tests.dll --filter-class *BomberRegenerationProductionTests --minimum-expected-tests 4
```

原06 RED仍保留：4 total/3 failed/1 passed/0 skip/raw2，先前全部正控失败在第一次新增0。新GREEN的停止用例已经到达真正Running的105秒后开新orbit及112秒后不增长断言；不再被first-wave前置阻断。其首/间隔8秒意味着105秒本身不是发行slot，严格`now<stop`等号语义另由源码静态核验，不能冒称运行了一个恰好105秒到期的发行slot。

07 GREEN记录officialManifest `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`。执行Tests DLL=`8961a57a0a036457e678e11b84344a933212ffaa2804726557e0e1d4c00a7d53`，Gameplay=`3300423dbde83c84546a47b94f782bac0fef5421f26181250ac7758135637d0d`；Ecs=`aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`，Gas=`09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`，Native=`c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`，build-info=`f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`。最后四项复hash仍一致；当前前两DLL已不同，在proof披露，不替代历史记录。

## 主路径、规则记忆与所有权审查

- 单Hook在现有player/successor/bomb/inventory之后、Terrain.End之前；不移VoxelCommit，不新增Tick或结果consumer。Legacy phase0+empty InitialResourcePlan合法，completed phase3合法，1/2与冲突frame/pending仍拒绝。动态TryLand先更新真实Protected Life位置，再到Regen；尚未落地Dormant仍在受保护静态anchor，spawn-clear占ordinary frame时不能发行。
- initial/remaining census来源是FinalCircle的真实Native两层读和真实Wood/Iron/Gold binding，并非seed模板或新shadow terrain。initial只初始化一次；stop=真实match deadline−final duration−lead，以SDK Tick换算。absolute first=StartTick+FirstTrigger、每slot checked加interval；过去slot推进到第一非过去slot，先持久消费机会再判断busy/capacity，不追补；有submitted debt立即hold。105秒私有配置与245秒生产默认区别保留。
- target为checked floor(initial×permille/1000)，available deficit按完整4分组，组数≤当前max2；NativeSlots按四条24-byte writes/组及96+65 metadata推算，Ingress C60时当前上限仍2组8条，不把C60当60组。共享/未消费结果/receipt bytes最终仍由真实adapter统一拒绝，私有粗预算不伪称全部Native credit预留。
- Safe用本帧真实ground/obstacle，enabled walkable非air非water、Native sparse bindings、实际live Protected/Vulnerable Life及live所有Bomb transforms、pickup/queued destination和same-tick placement reservations；每镜像成员都验，Manhattan<3排除、=3保留，中心/access/static spawn安全格保留。原生chest/barrel/bridge依赖Native obstacle/binding，未另存cell地图truth。
- canonical x/z低于中心、固定四镜像顺序，whole-wave keys唯一；确定性seed+logical tick+schemaepoch私有stream、无放回。共享slot先分类再发行：barrel当前不发行并按ADR允许进入普通roll；box1/6中签在本slice无all-four credit则消耗选择而不发行，**没有box→soft回退**；soft ring最大输出>1不发行，不以概率折扣掩盖输出容量。新增soft最坏4-output信用与live/held/queued/death/supply/Terrain和实际Native既有soft/chest未来奖励一起checked比较。
- Promise≤4 rows absolute/当前config≤2、每row正好4 cells，UTF8≤16384在读/写均执行；空值只用empty string。解析先bounded JSON，再RequireFields拒非array/object、null cell、missing/unknown/duplicate fields、非四项与越界总rows；数值由typed deserializer约束。独立ASCII同字段compact形状算出single worst row530 bytes，4rows=2125、canonical transaction65；这只是字节证明，不是伪造有效Game row或Native成功。
- 每row共享完整Match/Wave/Block/Transaction/Submitted；cell pin coords、非零revision、连续唯一generation，tail=highest-issued fence且>initial1。canonical事务精确world/match/sequence三hex块，sequence正数且不越allocator，完整提交时间/stop/nextslot关联，整批kind3-only与所有ownerless来源/reward/tier/circle/causal列均核。新match初始化counter取实际live chest/barrel、1与保留counter最大值，不将接受过的旧资源强行要求等于当前counter。
- 选定所有义务先Save，再Queue；End先Stage其exact transaction/submitted、RecordPending及details，再调用真正TryStageWrite。已提交/Unknown/调用异常保留原债务，Advance不更新revision/re-stage/超时删除；已知Staging Rejected或consumer已知Aborted清此exact软事务，不创造或误退休ECS handle。没有resource birth，故无伪造unpublished实体清理。
- Terrain.Begin保留matching transaction、submitted<now、Operation/BatchTransactionId null、Status0/Applied/Original/TokenConsumed、原回执bytes/count、exact distinct section/revision advance全部原guard。逐行完整tuple及Native poststate全部验后才Accept清一次债务；kind3不落destruction计数/奖励/raycontinuation。Duplicate/Unknown不能进入Accept；旧不匹配transaction不作用于当前wave。P2修复必须保留这一整组先验顺序。
- Terrain.Validate和WorldRuntime hydration都接all-row验证，既有active paired恢复门未删除；round Prepare有Pending gate，next-match Reset拒债务且counter不清零。正式M2/six-shape/disabled块等既有生产准入guard没有改变。`max_mirror_orbits=0`在当前正first/interval配置下合法不发行；scheduler消费机会不等于发行。

## FirstTrigger零值与尚未关闭的边界

schema first_trigger_ms minimum0；既有ObjectBudgetCalculator只拒interval0，没有为first0给统一业务语义。新Validate第309行明确拒first0。独查base regeneration.txt及六个m2-map/m2-room overlays，全first8000；测试源码没有first0 override，因此没有已知checked-in配置回归。此次已授权明确8秒slice，可保留并披露这一consumer限制，不能声称schema0自动被禁用或改写公共机器合同。今后支持零值/关闭源overlay时须定义并在真正admission处验证；若要确保schema合法overlay一致，应增加真实first0配置门测试，而非仅假定首次Tick强拒等同compile拒绝。

恢复/Unknown/拒绝/codec破坏/target等号/shared output/busy opportunity/round债务当前只是静态校验路径，不是这四例的执行范围。尤其unsubmitted restored path仅重新验Eligible/FitsTarget/Safe，没有重新调用FutureOutputCreditUsage/NativeSlots；目前没有实际自然可捕获且能resume的该cut证据。要宣称该恢复cut的信用仍安全，须证既有持有信用会阻止其他producer使用，或在首次Queue前重验完整当前共享信用；不把尚未运行的恢复形态强称通过。本轮不借伪造成功receipt证明它。

resource-chest actual四birth/Native full handles/GEN storage预算仍未实现；barrel闭；ring soft maximum>1暂不发行。私有Current19/8测试GREEN不证明全部products/rings/distribution，不证明23/27/16人与整局长稳。所有完整发行量/寿命/并发/UTF8/structural credit仍须后续预算与真实Native TDD；不得提高旧max、放开M2或删除既有断言来闭门。

独立proof：`.sdd/101-20261003-regeneration-first-wave-production-independent-review-proof.json`，SHA `8cb692d1ca4d8cda89c9a99e2fb62481534f9be02fac1696a7f40dcaaf95fdf1`，记录每源物理before/after/current与GREENstart/end、DLL记录与当前差异、实际argv/count/raw和ASCII字节范围。源码写STOP。P2修复后的fresh身份与运行须独立增补；本报告不称完整Regen、Native全部或Game已通过。
