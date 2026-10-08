# v14 Effect reducer 启动修复 — 独立 spec / quality 审查

2026-10-03，fresh 非作者 reviewer，只读审查。**Spec 与声明预算 PASS；启动修复证据 PASS；完整 quality 暂不 PASS：两项新语义路径缺少真实回归。未发现已证实的生产代码逻辑缺陷。** 下述 finding 是本 delta 的验证缺口，不把推测写成已发生的 bug。

范围严格限定 effect-review-02 的四份 before/after：Fire reducer、Settlement reducer、Outcome MaxWrites、Config private EffectLimits。没有审查其他 Supply 写域，没有运行 .NET/Rust/Native、改源码/生成物/旧冻结或打包。已读父仓与 101 的 core/nav、测试规范、作者报告最新尾部及前次 budget 独立审查。

## Findings

### [P2] Target-first 新拒绝边界和合法历史缺少实际结算回归

位置：[BomberSettlementReducer.Server.cs:39](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberSettlementReducer.Server.cs:39)。同一 Bomb 出现两个与当前非default result.Target 相等的 DamageFacts.Target 时，新实现即使最后候选的 Handle 不匹配也强制 `claimOwner=default`，使真实 Claim 在 status 写入之前拒绝。原实现只按完整 Handle+Target 挑行；这是明确的新内部拒绝语义，不能由启动费用诊断证明。

当前成功证据只运行原 `BomberEffectIntegrationTests` 的 8 项，没有一项构造两个 nondefault fact Target 并实际走到这个 Claim 分支。`DuplicateBombFamilyReservationNeverProducesASecondFact` 在 producer reservation 阶段挡掉第二行，无法覆盖 reducer 歧义拒绝；原 HitLives-only snapshot fixture 也不具备两个已填写的 DamageFacts.Target / admitted result。代码静态上应拒绝，但没有真实执行证据。

应补一个窄 Native regression matrix：通过实际 Apply/WorldManager.Tick 取得 result/association 后构造歧义，分别让最后候选 full Handle 匹配/不匹配，确认真实 `effect_access_violation` 且目标行 status 未被 SetAt；对照唯一 Target 正常结算。再用真实 retained settled row 与后续新 admission 证明同 Instance、不同 Generation 的合法复用继续正确定位，并证明 Target 身体已销毁时仍能结算真实 Rejected association、不依赖 live Target。不要只手工调用 Reduce/构造 EffectResult，不扩大 hydrate 规则或以原 HitLives-only fixture 替代这些证据。

### [P2] Fire participant-first 重排没有当前候选的真实 10110 / owner 负控证据

位置：[BomberFireReducer.Server.cs:20](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireReducer.Server.cs:20)。Fire 从 result 外层改为 Participant 外层，并在扫描全结果后只 Claim/SetAt 一次；这影响真实 10110 的事实归属和一次性消费路径。当前 8 项成功测试完全没有 10110 火焰生产/结算动作，diag05 创建的是未启动 shell 并调用官方 validator，也不执行 Claim。

现有 `BomberFireExposureReviewTests` 包含 actual pulse/lethal/paired restore 可复用为正向，但此次成功 filter 没有运行它。其 exposure hydration 负控不等同于 reducer 的错误 owner/完整 fact 负控。应在当前固定程序身份下运行实际 10110 正向，包括多 Participant、空/unrelated result、真实致死与 restore；另以真实 admission/association 保留正确 owner，在 reducer前制造另一个 Participant 的完整匹配候选或改写被捕获的 immutable fact，确认 Claim 拒绝且错误 owner status 不会落 1/2。同时用当前实际 10111 回归确认 Aura 仍按 Initial/expiry 逐结果执行。不要为了测试伪造 receipt/result/claim capability。

以上两项补齐可关闭本候选的 quality 缺口；不要求为了本报告运行完整产品 tour。但完整 Native producer、16人业务与整局验收仍各自需要后续证据。

## Spec 与代码核对

四个冻结 after hash 全部重新计算匹配；四个 before 全部匹配。before 精确对应 build03 sourceSha256AtStart，包括重构保存的 Config before SHA `a193bc749ff53509d9bfecbbe63be13f04c2621f0505ff49578f269e89a55331`；after 精确对应 build10、diag05、startup-integration-green-02 的四源身份，非数值等价推断。

effect-review-02 manifest SHA `94cedcef4389056b4028ae3015a0b228dba5371188480f7029c94eb24ec10bbd`；patch SHA `f97abe9b980f308c7c2bee7059da8a61b19310ed330d02217c175fabec5445ad`，实际匹配。after：Fire `e349302fed8f2c2a1fa0f4975851d640d943cb40269125398e6e1d2009018511`；Settlement `e3eb5e0238dc120da819ed1baea1c44317064920f6942953a24b03698b6de172`；Outcome `835653fcd7f543bf498506edfdd1379103141809c154453e9339a63bb0076fbd`；Config `5c4766732c035e91196115b6ed3574f3bbad6f9321bc426d5d25f850081e6c25`。

Fire 缓存完整 Handle.World/Instance/Generation、Target、Source，检查 Type10110，全扫描实际 ResultCount，不用结果位置冒充 fact row；只对本 owner cap-1 row 执行一次真实 Claim/SetAt。Aura 分支及每结果语义与 before 保持。Participant 顺序改变只涉及互不相同的 status row；Outcome 依赖 Fire 完成后读取，不见合法业务结果的顺序差异。

官方 effect-lifecycle 规定每 admitted request 一条 Initial，instant 不另发 Terminal，terminal instance 只能以递增 generation 复用。Runtime `SettleOne` Applied/Reject 各单一分支，`Complete` 附原 slip.Fact 并生成一次 Initial；因此正常 10110 full handle 不会产生多个可供选择的合法结果。Fire 选择最后匹配结果不会折叠合法周期结果，因为10110是instant；异常重复结果不能作为本报告的正常输入假设。

Settlement 唯一 Target 后仍核对 DamageFacts full Handle、HitHandle full Handle、HitLives full Target、HitParticipant/facts.Participant、HitLifeGeneration/facts.Generation，再执行真实 Claim。Target-first 没有读取 Target livebody，不把 destroyed ID 当无法比较，也没有只比较 Instance。合法 producer `ReserveDamage` 从同一个实际 player 的单值 Participant/完整身体生成 Target，`TryReserveHit` 对 Participant 去重，保留 ContactApplied；合法 retained历史可同 Instance 不同 Generation，不应按 Instance 去重。现候选保留 Generation，静态上没有这种错误。

实际 `EffectOperationClaim.Capture` 先比较 association.Row/Owner/Index，然后 `ValidateResult`；default owner 不可能等于已admitted实际 Bomb owner，故 duplicate 分支静态上会抛既有 access error，先于 SetAt。正常 Claim 继续校验 full Handle/Type/Target/Source/AppliedTick/Ordinal/Tick/Kind/Outcome、完整 row keys、pending status与immutable certificate；SetAt 再校验实际 storage/owner generation和全部被捕获列。错误 owner、伪造属性归属、改 fact amount/ready 不因预筛选更轻而取得写权。

新增拒绝仅发生在结算；DamageFacts OnHydrate 仍只检查列数，Bomb.ValidateStorage 去重 HitParticipants、没有新增 Target/HitLives 去重。原 HitLives-only restore 支持不受此 delta 改写。不能声称坏 snapshot 在 hydrate 已被拒绝。发生歧义时也不能宣称整轮事务回滚：前面其他合法 owner 的 F 写可能已完成，Runtime existing Run 仅 finally 释放 storage；当前世界按既有 failure语义故障。

Outcome 唯一源变化是 MaxWrites215→423，业务 body不变；423 对应官方结构分配而非16人真实玩法 worst case证明。Config只供既有私有生成metadata，不改变公开 budgets/作者规则/1M per-program上限或 settlement 权限。

## 预算与官方生成

独立读取 fresh05 实际 plan，由现有只读 budget helper 重新计算：fact non-status去重72、fact最大value16；reducer physical field union99、value16；max scratch22576。row为damage24/cap16、fire26/cap1、health25/cap1。四声明之和 writes7999/indexed7576/bytes382260/work4M；Config字段128、scratch65536仍覆盖实际需求。

| program | declared writes/indexed/bytes/work/scratch | diag05 structural writes/indexed/bytes/work |
| --- | --- | --- |
| Fire | 1816/1816/87168/1000000/10256 | 1816/16/63936/538305 |
| Health | 2160/2160/103680/1000000/6432 | 2160/360/70920/549722 |
| Settlement | 3600/3600/172800/1000000/17928 | 1800/360/63360/918364 |
| Outcome | 423/0/18612/1000000/22576 | 423/0/14993/635274 |

官方 `EffectLimits.Validate` 还要求 world bytes ≥ `writes*(ReducerWriteFixedBytes+maxValue) + indexed*(ReducerIndexedWriteFixedBytes-ReducerWriteFixedBytes)`。此处 `7999*(28+16)+7576*(32-28)=382260` 精确成立。不能用较低的structural indexed736或最低执行路径替代声明 indexed7576；本配置按声明完整预留。structural writes合计6199、work2641665不替代FreezeCore要求的全部声明和。

fresh05双端 plan SHA `8a43a3088a757267aca85ce29deef58544e23aa9daeb4d9c3c5db3f6268dbe62`。独立复核两侧 proof 各56文件（不计gen.hash）物理hash、official生成记录hash全部匹配：112/112、drift0。程序metadata相对fresh04，Fire/Health/Outcome完整image保持；Settlement33绑定的完整身份/权限集合保持而局部token顺序可变。schema保持 `5ca0f1e5bcfe651ed57ced6d292cdaf24a9319ab3bafc2e02e35f34a8e1efc3f`；未手改生成限额。旧v14 freeze不作为新业务成功证据。

## 执行证据与限制

build10、diag05、startup-integration-green-02 的 log hash、raw .exit、JSON exitCode 均独立匹配；三个run四个managed程序集记录一致且当前物理hash匹配。Game DLL `7b850bbf9979b328f685d1769ec86aa2ee0774e3630fd82301b0addaa01fe50d`、Test DLL `fae681d39a68bcc40996f5745d1eec792075f0fa6285833ed2fa7b2c9e985b8d`；Runtime Ecs/Gas仍官方06 identity。输出 Native `runtimes/win-x64/native/lumio_engine_native.dll` 实测 SHA `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed`，EngineRelease module initializer绑定该路径。

- build10：child0，0 warnings / 0 errors，log SHA `734c7bbcc2e109578340d8468ee304bcb86b0e3f16641efc6246d0c7bdac7384`。
- diag05：1/1 pass、0skip、child0，log SHA `7ec038184ebd5c1efae93577f0a539328674e3af1ddd104d2f0801fe5a976b09`。official-plan-validation文件SHA `1f133e57facfea5eed868177b35666f95c417e4201f07d76f0c0a6470ffdbaf8`，四项validationError/structuralError均null；诊断源码明确为unstarted World shell，不是Native producer验收。
- startup-integration-green-02：8/8 pass、0skip、child0，log SHA `ad5ae95a068507442655e98c172e90bcc5af1899e82653c57cccec2b4f9508da`；filter仅原 BomberEffectIntegrationTests。该class源码build03→build10 hash保持 `02a1b2b2102f31303bc77d343f41ab59b62492c0976f581290fa9454eeaca4a9`。
- 原startup-budget-red-02与文件名green-01两次8/8失败、child2和log hash均仍可核验；diag-red01、02、03、04均1/1失败、child2，日志与记录hash匹配。没有覆盖旧RED或把名称green当成功。

本报告关闭静态预算、完整身份保留与现有8项启动恢复的审查问题。上述两项finding补齐之前不裁定新reducer业务质量完全通过。16人真实业务、完整Fire/Aura/其他Native producer、正式配置准入、完整suite、新发布组合及产品整局仍未验收；Goal101仍未完成。
