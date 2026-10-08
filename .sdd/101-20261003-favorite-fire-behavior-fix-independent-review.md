# Favorite Fire rev04 同一审查者复审

**结论：三项局部源码修复已核实；完整包生产放行仍为 NOT_APPROVED。** F1的48写入声明问题仅在当前360结果窗口内修正；F2真实到期ordinal和F3目录断言已关闭。当前共享reducer context还有源级确定的总额超限，正式GEN/启动与全部新运行时测试均未执行，不能把局部修复称为可运行Favorite或完整行为验收。

原审查 `.sdd/101-20261003-favorite-fire-behavior-independent-review.md` 及其F1/F2/F3裁决原文保留不改，哈希仍为 `d7d0404609ce48c1e9353f2f34e3b205cf918caed8db3f0db553fcab1d040a9c`。本文是后续闭环记录，不抹去rev03缺陷或未运行状态。rev04 manifest实际SHA-256为 `6a63a5d641ecbec72d95be4e99bdbd1f36b1e0de1c81e6d9e21dd6067a0ab35f`，修复报告为 `cccdd872977bb5993b53a4899ff0960c6532ce6a1cccf80c2f461d3ce023c547`，均独立核对相符。规范与完整原包调用链审查沿用原报告；本轮证明28候选逐字节不变，并完整复核4项实际修改。

| 原 finding | 修复验证与当前状态 |
|---|---|
| F1/P1：ResultCount循环720结构写入超过声明48 | 新 `BomberFireZoneLifetimeReducer.Server.cs.draft:12` 声明720。正式Runtime对CURRENT ResultRecords360取每迭代最多2写，720正确；原Fire1816仍对应该窗口。**局部声明问题关闭；全context及启动未关闭。** 不适用于未来400/456/704结果窗口，不授予配置扩容。 |
| F2/P1：Region/Aura外层nonzero挡住实际自然Expired0 | 两个外层guard已去除ordinal条件。Region第31行Initial限定nonzero，第44行Terminal/Expired限定0；Aura第60行Initial nonzero、第75行Terminal0、第78行Control nonzero。类型、完整world/instance/generation句柄、目标/source、AppliedTick和确切endpoint均保留。Region Terminal仍要求当前Outcome3与持久UntilTick；Aura仍要求Outcome0或2。**源级关闭，真实到期测试UNRUN。** |
| F3/P2：新增目录62却断言60 | catalog保留46 Typed、14 Derived、2 Excluded；总数断言现在62。完整旧目录、类型唯一性与新增两行精确映射检查保留，没有删用例。**源级关闭，原目录测试UNRUN。** |

F2还正确修复了同一到期路径中的易变投影问题：既有ConsumeAura在ProcessorPlan读实际row时，只有`row.EndTick > world.Tick`才保留Until，因此在EndTick会先把AuraUntilTick投影设0，然后phase9才发Terminal。rev04的Aura Terminal改比较 `cooldownFromTick + auraDurationTicks`，并仍要求 `r.AppliedTick == cooldownFromTick`，不会被已清0的投影挡住，也没有从缺行推断expiry。Region UntilTick是Initial Applied后的持久原endpoint，不受该投影清理影响。正式Runtime `FiniteEffectSettlement.cs:94` 产生Expired ordinal0，Initial admission与Control生成非零ordinal，该分支划分符合实际生产来源。

两条原followup测试加强了真实result观察：whole110保留全部原ordinal/source/释放/统计断言，追加110个真实Initial、110个完整handle/source/target/AppliedTick关联的Expired0，以及实际parent10111在start+110的Expired0；first20 Tick expiry追加真实Terminal0/完整原区间检查，再跑正常业务Tick确认Native7002。原17个Fact和1个四行Theory身份、InlineData与其余断言保留。新增观察不伪造结果、不手调提交相；所有测试仍UNRUN。保留e85首region Fact未改。

## 当前生产放行阻塞

**[P1，F1 context补充] 加入新720程序后，当前共享总额仍不允许启动。** 这与未来Favorite扩容无关。当前四个声明的MaxWrites分别为Settlement3600、Outcome423、Health2160、Fire1816，合计7999，正好等于当前 `BomberConfigBinding.cs:151` 的共享ReducerWrites7999。新Region再加720后总额8719，超过7999。正式 `EffectReducerPlan.cs:111` 累加每个program.MaxWrites，并在第121行检查共享上限。因此720不能单独作为当前完整world startup通过的依据。

另一个独立维度也有确定超限：exact07官方 `EffectReducerLowering.cs:283` 给每个生成program声明MaxWork1000000；当前4个program合计4000000恰好等于共享ReducerWorkUnits，注册第5个后5000000超过当前4000000。正式 `EffectReducerPlan.cs:112/122` 累加并检查该声明总额。虽然实际body可能消耗更少，现有binding检查的是声明总额，不能用实际稀疏命中折扣。输入源码和算术见 `.run/favorite-fire-behavior-fix-independent-review-01/review-evidence.json`。此处是源级确认，没有冒称已跑官方GEN或真实启动失败。

Root已将Game-owned reducer优化、完整生产者pending/context证明与实际生成诊断划为独立工作；以上共享写入/工作量问题必须一起进入该门。这里不改配置、不要求自动扩容、也不建议提高公共单program上限。完整字段/work/scratch/bytes、fact预算、Native kind7快照及880 ECS/world/order/residence/bytes仍要正式诊断，不能以720的单维度计算代替。

当前LiveRows24硬守卫仍拒绝Favorite，rev04没有配置改动。历史192 live/264 pending/704 results仍不是可启用候选。Root转交的独立作者证明指出，即使Control0，live192及至少16个同时initial也要求结果窗口≥400，旧Settlement结构work `2551×400+4=1020404` 已超过公共单program1000000；保留56controls则至少456。该证明不是本审查者运行的证据，但与“只调配置不能启用”的结论一致，须由独立Game body优化及正式GEN继续解决。不可假称已有完整生产者证书或原105项通过可覆盖新留火。

## 文件保护与执行证据

轻量Node文件审计实际通过：24/24当前生产before与保存before fence、32/32候选hash、32/32完整正反patch（含8个create/delete）、4/4 rev03→04正反patch、92/92原rev03文件保留、6/6原输入fence以及3/3报告/manifest锚。32候选中仅声明的4个变化，28个完全不变。唯一被替换的旧测试断言为总数60→62，与实际新增行精确相符；未删除Fact/Theory/InlineData或其他旧断言。审查记录见 `fence-and-inverse-audit.json`。

e85原region Fact与rev04副本逐字节一致，SHA-256仍为 `e85a764c375124f7acd15e6cf5e37fd45eb2863ec4c58efcf52545c28ce4c3aa`。当前包07 manifest与原Runtime源码身份延续原审查锁定；Root提供的build42/Game61ffd/Tests a64e31/385源码、两个冻结旧五类1/1/raw0及3688文件未变属于旧世界/恢复取证上下文，本审查者未执行，也不能覆盖rev04任何新增行为。

审查者只写自己的 `.run/favorite-fire-behavior-fix-independent-review-01/` 与本报告。生产、测试、工具、schema、生成目录、Runtime与原审查报告写入均为0；.NET、GEN、Native、配置CLI、formatter、stage、commit和运行时测试均为0。剩余正式门维持原报告全清单：公开紧容量准入与副作用、8人整施放饱和、受支持Unknown/reentry、CLR UTF8/snapshot边界、paired恢复、全部真实自然/控制生命周期、source death/继承、共享pulse/Ice Original与重复/Unknown/Fuse返还、Results及原全回归。不得因source closure放宽任何验收。

最终状态：**rev04局部修复可交下一步Game优化与官方诊断；完整world startup、启用Favorite及正式行为交付均未放行。** STOP，释放并行槽。
