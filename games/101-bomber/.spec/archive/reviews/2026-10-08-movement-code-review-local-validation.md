# 101「帽王乱斗」移动代码 Review 与本地验证报告

日期：2026-10-08。当前分工：**Agent 只审代码、找问题和提供验证方案；用户在本地验证。** 本轮未启动游戏或浏览器，未修改生产代码，未运行新的行为测试。以下区分代码事实、此前局部实验和待执行反例；移动手感验收仍为 **FAIL**。

## 结论与优先顺序

目前最值得先验证的是 **输入成批执行 → 本地移动样本不均匀 → 前探回收/新目标跳变 → Doll 将显示位移当朝向** 这条组合链。各段都有源码依据，但尚未证明它们在同一段 Game35 运行中以何种频率同时出现。应先定位第一层异常，不直接把某一项定为唯一根因。

| 编号 | 优先级 | 问题 | 证据状态 |
| --- | --- | --- | --- |
| F1 | P1 | Model quaternion 未用于角色朝向，玩法 Facing 也未写入 Logic rotation | 代码缺口明确；此前真实消费方法局部实验已复现转偏 |
| F2 | P1 | 独立输入/pump 可把两条 Move 放在同一 Tick，真实 GAS 冷却拒绝后一条 | 普通生产分支已闭合；实际定时器批次分布待本地测量 |
| F3 | P1 | 三角形前探在 h 后反向收回，速度由 +v 变成 −v | 算法明确如此；真实触发次数待测 |
| F4 | P1 | 普通新目标也可能造成位置跳变；不只是真实权威纠偏有此风险 | 本轮补充源码推导；已有测试明确允许立即跳到新目标 |
| F5 | P1 | 迟到的同 ordinal 发布可能立即丢掉尚在显示的尾部 | 组件路径明确；普通 Client 下的触发条件需严格限定 |
| F6 | P1 | 同次 pump 内首次完成已过期，资格判断仍可能使用 pump 起点 | 时钟来源明确；提供未执行的 Native 反例配方 |
| F7 | P2 | hitstop 时本地位置继续刷新，镜头跟随和其他表现时间冻结 | 默认设置下可达的代码路径；未动态验证 |

这里 P1/P2 表示本地验证与修复优先级，不表示已测得发生率。**建议先做 F1、F2，再联合看 F3/F4；F5/F6 用确定性夹具验证，F7 单独触发验证。**

## 审查版本与已有证据

| 仓库 | 本轮核验 main |
| --- | --- |
| LumioGame | `984f30e16c901c4705fb7eb2e9a22d5dbe73a747` |
| LumioGameRuntime | `f69e2c9445fd5cf39b005c0857308cd96da1f04d` |
| LumioClient | `5b7ef6101bef5250a66fc4813e75d0038da990e8` |
| LumioGameEngine | `dc4044de7b224220aeeb7298b59ac09d59507130` |

Game 本轮涉及的生产文件与此前 `f14bd502`、b07 消费接线相同。Runtime 和 Client 未较前次 Review 变更。Engine 从4bf到dc的差异为 Native 警告清理、错误常量映射及相应测试，未修改本次所用 movement/GAS/ECS 文档；这不是对其全部 Native 改动的行为验收。

前次 [PR51](https://github.com/LumioGames/LumioGame/pull/51) 已保存独审和原始收据：真实 ViewRuntime/Doll/Camera 方法加合成 pose 的局部实验为3项目标RED、1项对照PASS；三份 Node 消费/输入测试为33/33 PASS。另一个 TS/Vitest owner-pose 测试未运行，不计入33项。**本报告引用这些旧收据，没有重新运行它们。** Game35 仍按交接记录使用 Client17，不能把已合入 Client18 当作本地页面实际字节。

## F1：朝向生产与消费两端均未接完整

**代码位置：** Game [MoveAbility.cs][G-Move] 58–77；[ViewRuntime][G-View] 1299–1317、1347、1351–1360；[Doll][G-Doll] 342–357、459–460。

MoveAbility 更新玩法 Facing，但 Transform 写入只改位置。完整 Model quaternion 虽经桥接到网页，ViewRuntime 只取 XZ；Doll 用本次显示位置减上次显示位置计算方向，再据此转身体。镜头前视方向也来自 Doll。这样，一次位置校正就能被解释为“转身往回走”，并与技能实际使用的 Facing 不一致。

此前局部方法实验向固定朝向的 Model 序列注入一次0.01格回拉，在60/120Hz**合成采样间隔**下得到约46.65°/25.07°身体偏角，rotation读取0次。它证明消费边界的因果，不是 Game35 的真实帧率或回拉统计。[实验数据](2026-10-08-movement-postmerge/root-01/consumer-probe.json)

**本地验证：** 同时记录已接纳输入、玩法 Facing、实际 Logic rotation、发布的 Model rotation、Doll root yaw、镜头目标方向。至少覆盖：

| 场景 | 应检查的玩法与表现关系 |
| --- | --- |
| 直线持续 W，注入或捕获一次位置回拉 | Facing 不变时，身体不应因回拉反向；先确认当前 Logic quaternion 是否已表达 Facing |
| 主方向受阻、完全无位移 | 已接纳的非停步 primary 仍按设计更新 Facing；位置写入未发生也不能漏朝向 |
| 主方向受阻、使用垂直候补滑动 | Facing 仍为 primary，不能用实际滑动方向代替 |
| 玩法冰冻、松键停止 | 冰冻拒绝输入时朝向保持；停步不凭剩余表现位移改朝向 |
| 初生、同一生命的新局、后继生命/复活、TP | 校验设计要求的朝向与正确实体身份；不要把旧生命周期姿态带进新生命 |

初生还要看 `Gameplay/Admission/player.creation.json` 的 Facing/Transform 初始化；现存生命新局看 `BombSystem.Server.cs`，后继生命看 `BomberSuccessorLifecycle.Server.cs`。仅在共享 WritePosition 内加 rotation 会漏掉受阻零位移，还可能误改调用同一函数的炸弹/掉落物。

还有一个无需先制造回拉的本地场景：**同一对局、同一participant、同一角色外观，死亡前朝向不是Down，复活后不输入。** adapter按participant维持表现id，ViewRuntime可复用Doll；重生只调用teleport/drop，而Doll.teleport清位置/速度记忆却不清yaw，resetParts仍可能写回旧yaw。新生命Facing虽为Down，身体可能保留旧生命朝向。验证要同时记录新旧life/entity和复用的Doll；不能扩写为下一局必然残留，因为Game wrapper会按matchId重建view。依据为 `replica-adapter.ts` 161–172、ViewRuntime607–620/1053–1054与Doll237–245/288–315。

**建议修复方向：** 沿已有已接纳 GAS/Facing 决策写 Logic rotation，再消费 Model quaternion；不另造 held-key 朝向真值。先补生产者，再补消费者及镜头方向。单独切换 Doll 读取当前 quaternion 并不足以完成修复。

## F2：同批 Move 的第二条确实可能被生产冷却拒绝

**代码位置：** Game [player-controls][G-Input] 3–36 的独立50ms interval；[main.js][G-Main] 729–760 的独立 deadline pump；Client [Session][C-Session] 398–402、1336–1387；Runtime [GAS 激活][R-Ability] 536–538、584–595。

Session 每次 pump 先推进本地时钟，再排空命令。多条命令可获得相同 execution tick。第一条成功的 Move 将该实体/类型的 cooldown 写为 T+1；后一条同T输入会在真正执行 MoveAbility 前被拒绝。

本轮进一步核实了预测重建：临时 Project(0) 只投影 raw 值，不删除前一条的 survivor layer；第二条执行前按自己的序号重新投影，前一条 cooldown 仍可见。**每条 Enqueue 都 Rebuild，并不意味着每条都获得一份新移动资格。** 依据为 [Selective][R-Selective] 25–39、300–355、483–505 与 [PredictionStateLayers][R-Layers] 491–518、566–585。

限定为同 driver、同实体、同类型、同 execution tick，第一条成功，且其贡献未因 authority、affected replay、等待、coverage 或生命周期改变而失效的普通分支。Game LastMoveTick 只是转向记忆；Client fixture 的 MovementLastTick 是额外测试 guard，都不能充当上述生产冷却的依据。

**本地最小配方：** 在现有 Client `PredictionClockTests` / [PredictionClockFixture][C-Fixture] 中把 input-only、pump-only、render-only 事件分开；不要在每个输入时间点自动 Pump。两组均先在`.005`执行一次Move+Pump预热，再使用同样四个输入：

| 组 | 仅入队的时间（秒） | Pump 时间（秒） | 预热后每泵输入数 |
| --- | --- | --- | --- |
| 对照 | .055、.105、.155、.205 | .056、.106、.156、.206 | 1、1、1、1 |
| 相位扰动 | 同上 | .054、.106、.154、.206 | 0、2、0、2 |

这是假定明确20Hz fixture的人工时间表，未在浏览器测得。记录完整 AbilityActivateResult，确认后一条是否 `RejectedStep==2`，且未进入能力 CanActivate/Execute；不要只看 generic ability_rejected 文案。还要记录 ordinal、execution tick、cooldown、input sequence 与 replay attempt，不能把重放次数当用户输入数。

在无障碍、无新authority的该夹具中，预热后位移按源码可能约为`.4m`对`.2m`；**数值是未执行推导**。应证明拒绝发生在 fixture 自有 guard 之前，或在测试仓中用不带该guard的能力交叉验证。真实 Game 可复用 `MovementPredictionPublicationTests.RunActualPrediction`：同一次 Host.Tick 前 SendMove 两次，确认真实 TypeId1；不要在两次发送间调用会自动 Pump 的等待工具。

**判定与修复方向：** 同批冷却拒绝成立后，还须对照同seq在DS上的实际准入/执行，才能解释速度差或回拉。建议协调持续输入采样与本地步边界，保留 TurnPressed 和输入变化顺序；不要删除 GAS 冷却、合并掉不同方向指令或降低频率来掩盖问题。

## F3：三角形回收仍会主动向后移动

**代码位置：** [ModelTransform.Owner][R-Owner] 90–100。设原准入时间为τ，h为该结果的StepSeconds，e=t−τ，v为有效样本速度。零残差、目标不变时：

`advance = v × min(e, 2h−e)`，适用`0 ≤ e < 2h`。

因此0到h速度为+v，h到2h为−v；h处发生速度折角。以现有组件夹具h=.05s、v=2m/s、τ=.10、target=.20为例：

| 时刻 | .150 | .157 | .175 | .200 |
| --- | ---: | ---: | ---: | ---: |
| 源码计算 Model X | .300 | .286 | .250 | .200 |

**本地验证：** 复用 `OwnerExpiryContinuityTests.Pair()`，正常公开更新/读取上述时刻，记录每帧有符号位移和速度；再加入准时下一输入与晚7ms下一输入对照。它验证算法行为；真实页面还要确认这个区间是否有rAF采样、是否被下一publication遮住。

**建议：** 将持续同向移动时的可见回拉和速度尖峰加入验收。不要只用“不同Hz共同时间点一致”“位置曲线连续”或“回拉次数减少”判通过；它们都可能允许两组同样不顺滑。停止、受阻、失联的有界回归需要单独定义，不能把所有必要位置校正一律禁止。

## F4：普通新目标也可能跳，且已有测试把它作为正确结果

**代码位置：** [ModelTransform.Owner][R-Owner] 37–68；[OwnerExpiryContinuityTests][R-Expiry] 100–115。只有真实非零纠偏走残差接续分支；普通输入改目标不会自动保存旧可见前探。

**本轮新增推导：** 假定残差为零、普通相邻ordinal、执行及时、每步同向前进`v·h`。旧样本与新样本的准入间隔为δ，且`0≤δ≤2h`。在新结果刚发布、其前探年龄为0时，位置会有`v·|δ−h|`的向前断点。δ=h才恰好连续；等长同向步在该条件下不会在发布瞬间倒退，但δ>h时此前可能已进入F3的倒退区间。不能把所有错相都叫“向后跳”。

另一个更直接的反例：h=.05，旧目标`.20`、旧速度2m/s，在`.150`显示`.30`；相邻新输入因减速或贴墙只把Logic推进到`.24`，同一时刻发布后Model可直接变`.24`，即回跳`.06m`。Logic本身只前进，没有权威纠偏。以上均为源码计算，未执行。

**本地验证：** 在已有组件类中保留生产Model，分别给下一步`.30/.24/.20`以及垂直转向目标；在同一个单调时刻先读旧Model，再发布、Update并读新Model，记录目标变化、Model变化、publication身份。另测δ=.04/.05/.057/.075的等长步组。不要读Accept内部尚未Update的中间值。

已有 `FreshInputDuringWithdrawalPublishesItsActualTargetImmediately` 正是断言立即等于新target；“新受阻输入”的Native测试也允许回到target。这些测试通过不证明接续平滑。后续若修改表现规则，需要审查这些期望本身，而不只是新增更多共同时间点测试。

**建议：** 为正常新目标、真实纠偏、受阻/停步分别制定接续规则。评估连续性时同时看方向、速度、误差和收敛时间；不能为了保持视觉位置而无限悬停在逻辑目标前方或穿墙。

## F5：同 ordinal 迟到发布会把已有尾部清掉，但不能泛化成每次0/2输入都会触发

**代码位置：** [ModelTransform.Owner][R-Owner] 50–64。较新同ordinal结果保留原AdmissionTime，先把速度清零；若此时已过原h，就不再赋回速度。原本尚在h到2h显示的尾因此可以立即消失。

**组件配方：** Pair中target=.20，Update(.175)得Model≈.25；给同ordinal2、更高publication sequence、HasNormalInput=true、target仍.20的结果，再Update(.175)，检查Model是否变成.20。这是已有尾突然丢失，不是首次过期输入重新获准前探。该配方未在本轮执行。

重要限定：正常Client pump会先按当前时间推进ordinal，不能把`.175`的新输入强行仍分配到ordinal2后，就宣称复现了真实客户端。更可信的跨泵入口是**原先已准入、保存旧ordinal的等待/重试记录，后来才完成**；还需证明它确实触发normal publication、此前已有尾、结果目标没有移动，且公开读取前未被更新结果覆盖。单纯同槽的及时重复输入不满足“已过h”的条件。

`HasNormalInput`不等于移动成功：正常返回的GAS业务拒绝仍可使输入标记Executed，因而产生目标不变的normal publication。现有Native `RealNativeOwnerExpirySameSlotLateReplacementCannotRenewEligibility` 的moving分支，第二次同Tick移动可被冷却拒绝；其断言替换后Model=Target，未断言替换前后的连续性。**不要因输入名叫clock-move就假定它又前进了.1m。**

**建议：** 区分从未获得资格的晚完成结果与已有有效轨迹的后续发布；不改原准入时间、不续租。先证明真实Client发布形状，再决定同槽接续策略。

## F6：用 pump 起点判断首次完成是否过期，可能误授前探资格

**代码位置：** [Client Session][C-Session] 242–243、398–402；[PredictionClock][C-Clock] 75–105；Runtime [Owner][R-Owner] 60–64。

pump开始采一次时间并更新presentation，后面才执行输入。若输入首次完成时实际已过原h，Model接受结果时仍可能使用旧的pump起点。下一次公开读取虽更新时间，却不重新撤销已赋予的速度。

**本地确定性配方：** 用现有Client Native fixture的Time/QueueMove/Pump/Registry.BeforeInput，不用sleep：

1. `.05`执行第一条Move，确认target≈.10、零纠偏残差。
2. `.10`仅入队第二条；设置一次性BeforeInput回调，在该输入执行期间把注入宿主时间改为`.157`，再Pump。避免回调被旧输入replay多次触发。
3. 确认第二条成功、target≈.20、ordinal2、session正常，且没有authority/data-wait/fault。保存pump取样`.10`与注入完成时间`.157`。
4. 不再Pump或入队，分别在`.157/.160`公开Update+Read；确认publication、input、target不变。
5. 按“真正过期才首次完成不得获得新前探”的既有规则，检查Model与target应重合且没有新尾。目前源码推导可能分别多出`.086/.080m`，形成`.006m`回退；**未运行，不能当测量值**。配`.149`及时完成对照与明确晚于边界的`.151`组。

只有**首次结果完成时**已经过h才符合此候选。单看整个pump耗时超过h不够：如果GAS早已完成、耗时都在后续JSON/渲染准备，不能归因本项。注入时钟跳变也不等于真实测得57ms WASM耗时。

**建议：** 保留原准入时间，使资格判断获得正确的完成时间事实；不能把AdmissionTime改成完成时间来延长租期，也不在Gameplay/Runtime另读一套墙钟。

## F7：hitstop 的位置、步态和镜头时间不一致

**代码位置：** Game [index.ts][G-Index] 61、103–116；[feed.ts][G-Feed] 137–139；[ViewRuntime][G-View] 460–463、518；[Doll][G-Doll] 344–350、379、459。

默认shake非零时，本地击杀或相应连锁事件可请求hitstop。feed保留旧snapshot/viewNow，但index每帧仍把新owner Model赋给localPose。ViewRuntime算出dt=0，Doll仍写新XZ，并可按位移推进walkPhase；镜头跟随平滑的dt为0，其他快照位置也冻结。因此可以出现本人滑动、镜头跟随中心停住、解除冻结再追赶。

这不是“浅拷贝导致last每帧被改坏”：冻结分支返回新的外层sample，真正问题是之后显式覆盖fresh localPose。也不能把Doll的玩法冰冻fx.frozen与hitstop混为一谈。

**本地验证：** 用实际feed/view组成，持续提供单调owner pose，触发一次70ms hitstop；分别记录sample.frozen/viewNow/realNow、localPose、Doll位置与walkPhase、镜头跟随中心。不要仅看最终camera.position，因为震屏仍可能按realDt改变画面。再做不触发hitstop的同输入对照，并保留默认真实击杀/连锁触发的验证。

**建议：** 统一所选表现冻结策略，保持GAS/Logic/输入继续正常推进。不要冻结World，或靠关闭特效把问题当作修复；本项也不能解释没有hitstop事件的持续W卡顿。

## 本地记录与判定方法

建议每项先在独立小用例中验证，再做真实前台A/B对照。记录实际Game/Runtime/Client/Engine SHA、DLL/WebCIL/Native或manifest哈希、构建模式和页面身份；不要把Client17页面与Client18源码混比。

已有 [OwnerPresentationDto][G-DTO] 已输出sessionGeneration、entity、connectionGeneration、publicationSequence、localStepOrdinal、executionTick、inputSequence、cause、target和model；64位身份保持原字符串。还需在原有边界记录：

- keydown/up、held回调与入队时间；焦点、activeElement、visibility、inputReady/inputOpen。
- pump开始/结束；实际GAS执行与publication完成时刻；完整准入结果、cooldown和replay身份。
- 实际本地Logic pose；Owner Model、前探、纠偏残差；同seq的DS结果/ACK/权威pose。
- rAF间隔、Doll实际位置/yaw、镜头跟随中心和long task/GC/WASM耗时。

**Model−target是前探与残差的合量，不能直接把它命名为“纠偏残差”。** 要区分F3和真实纠偏，需在Runtime已有状态/发布边界分别记录，不建立影子模拟。

对保持同一方向u的无障碍区间，逐帧计算`dᵢ=(Pᵢ−Pᵢ₋₁)·u`、`vᵢ=dᵢ/Δt`；统计负位移次数/累计距离/最大单次回拉，也保留正向速度尖峰、停滞帧和角度变化。按正常publication、authority correction、TP、hitstop、受阻、失焦分别标事件，不用平均FPS掩盖尖峰。

| 第一处异常 | 优先检查 |
| --- | --- |
| 按键存在但未入队 | 焦点、UI阻塞、inputOpen/initial selection；不要直接归因预测 |
| 已入队但本地Move未执行 | F2的GAS阶段与同Tick冷却；区分业务拒绝、等待和重放 |
| Logic单调，Model退步或跳变 | F3–F6，按publication/准入/完成时间分类 |
| Model/玩法朝向稳定，Doll转偏 | F1的消费链 |
| 只在hitstop时本人和镜头不同步 | F7 |
| 本人、Bot、远端和rAF同时停顿 | 保留整页/整机耗时线索，不能仅由源码认定CPU/IO/杀毒根因 |

真实A/B均记录可见性；后台页rAF节流不当作预测低频。保持既有玩家/Bot/体素配置，比较相同负载。A完全不能动、DS死亡链fatal、七进程同步停顿等尚未由本报告定案。

## 修复顺序与验收边界

1. F1先把Facing→Logic rotation→Model→Doll/镜头链补完整，覆盖零位移与生命周期。
2. F2用精确时间表和真实GAS结果确认本地输入节奏，再协调采样/pump；不删除冷却或吞业务拒绝。
3. 联合F3/F4检查直行的回拉、正向跳变和速度；明确停步/受阻的有界收敛规则，再修表现接续。
4. F5/F6补真实Native/Client边界反例，保留首轮失败；F7用有意触发的独立场景验证。

源码Review完成、夹具PASS、构建合入与用户手感通过分别记账。本报告不批准公共契约改变、ADR142、18085或生产schema，也不要求启动热更/重新打包。本轮交付到**代码问题与本地验证报告**为止；实际验证结果由用户后续回传。

## 审查记录

本报告的分范围独立审查与文档校验收据保存在[审查记录目录](2026-10-08-movement-local-validation-evidence/)。正文源码链接均固定到本次审查的提交；新增本地验证配方尚未执行。

[G-Move]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Gameplay/Abilities/MoveAbility.cs
[G-View]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Client/Presentation/src/view/runtime.ts
[G-Doll]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Client/Presentation/src/view/world/dolls.ts
[G-Input]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Client/UI/Spectator/player-controls.mjs
[G-Main]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Client/UI/Spectator/main.js
[G-Index]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Client/Presentation/src/index.ts
[G-Feed]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Client/Presentation/src/present/feed.ts
[G-DTO]: https://github.com/LumioGames/LumioGame/blob/984f30e16c901c4705fb7eb2e9a22d5dbe73a747/games/101-bomber/Client/UI/Spectator/SpectatorJsonContracts.cs
[C-Session]: https://github.com/LumioGames/LumioClient/blob/5b7ef6101bef5250a66fc4813e75d0038da990e8/Client/Gameplay/Session/src/Internal/ClientSession.cs
[C-Clock]: https://github.com/LumioGames/LumioClient/blob/5b7ef6101bef5250a66fc4813e75d0038da990e8/Client/Gameplay/Session/src/Internal/ClientSession.PredictionClock.cs
[C-Fixture]: https://github.com/LumioGames/LumioClient/blob/5b7ef6101bef5250a66fc4813e75d0038da990e8/Client/Gameplay/Session/tests/Support/PredictionClockFixture.cs
[R-Owner]: https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/ecs/src/Lumio.GameRuntime.Ecs/ModelTransform.Owner.cs
[R-Expiry]: https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/OwnerExpiryContinuityTests.cs
[R-Ability]: https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/gas/src/Lumio.GameRuntime.Gas/Ecs/AbilityComponent.cs
[R-Selective]: https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.Selective.cs
[R-Layers]: https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/PredictionStateLayers.cs


## 归档前 main 更新：PR52 的开关与统计还需这样验证

归档前重新读回 [PR52](https://github.com/LumioGames/LumioGame/pull/52) 已合入 Game main `40556477683e46a9e248812119fb3e6bd76c07c1`，新增移动埋点和可选 pump 输入驱动。前文 F1–F7 的主体与固定源码链接保留，本节补充审查新 Game 差异；默认仍为 interval，不能把新开关当成默认已修复。PR52 的 Mac 计时/Runtime 实验数字仅见其账本陈述，本轮未重跑，也未批准其未合入的 Runtime 插值候选。本报告 F1–F7 与 PR52 交接中的 F1–F4 是各自编号，不能按编号互换。

### A1：pump 对照同时改变了方向边沿与命令顺序

**代码事实：** [player-controls.mjs][G52-Input] 22–56 只有一个 `tapDirection` 和一个 `turnPending`。下一泵优先从当前 held 取方向，随后清掉 latch。两个最小待本地验证场景：

- 持续按 W；两泵之间按下再松开 D。latch 虽记录 D，下一泵因 W 仍 held 而发布 `(W,0,turn=true)`，随后 D 被清掉。两次均已松开的不同短按，也只保留最后一个方向。
- 同一泵前先方向 keydown，再按 Shift 或开始放弹。Move 延到 pump，技能/bomb begin 仍在事件处理时立即发布，调用顺序可能从“Move→技能/放弹”变成“技能/放弹→Move”。需在实际 GAS 顺序与 Facing/落点上检查后果，不能只看发送次数。

依据还包括 player-controls 66–73、105–112、[main.js][G52-Main] 740–746、930–937。这是源码可确定的请求形状变化，**没有运行新的输入实验**。`input=pump` 对照已不只是消除两个定时器的相位差；评估它时必须包含短按、W+D切换及方向后立即施法/放弹。不能只拿持续 W 的更平整曲线批准其完整输入语义。

### A2：现有 trace 是起点，三个统计口径不能直接用于定案

新 [recorder][G52-Trace] 与 [analyzer][G52-Analyze] 可复用，但要明确它们实际记录了什么：

| 字段或处理 | 实际含义与限制 | 本地判定还缺什么 |
| --- | --- | --- |
| `admission.movesPerHeldPump` | 按时间归到 pump 的、返回 true 的 JS Move 请求数。C# 请求发布阶段的 Activate 成功，不等于随后预测执行成功或 DS 确认 | 同 seq 的实际 drain/admission、GAS完整结果、execution tick、attempt/replay；不能由“2”断言走了两步或第二条被拒 |
| `publications.executionTickAdvance` | 相邻 rAF 观测到的 publication 的 tick 差。一个同步 pump 内的中间发布、长帧期间多个 pump 都可能未被采到 | Session step-before/after 与逐次执行/发布事件；差值>1不能独自证明跳过模拟tick |
| held、回拉、朝向、停步和耗时汇总 | 未按 session/entity/visibility/方向分段；held只是 accepted请求间隔≤150ms，未用keyup/方向/cause划边界；hidden仅计数 | 身份、明确按键边沿、可见性和事件分段；一次>150ms的主线程停顿可能被误分成“停步”，合法转向/TP/重生也可能混入回拉统计 |

精确来源为 main 879–899/930–933、[SpectatorReplicaHost][G52-Host] 160–165/196–207、recorder 21–37、analyzer 37–84/87–154。公开 DTO 原有身份字段没有被这版 recorder 完整保留下来。对 F7，`debugLocal` 记录的是最终 `camera.position`，仍不能代替前文要求的基础跟随中心。

**现有工具的本地使用方式：** 先确认页面实际包含 PR52 的字节。在原有开发入口上，基线加 `trace=movement`，输入对照再加 `input=pump`；这两个开关只在 loopback 或开发桥下启用。用 `__lumioMovementTrace.export()` 导出原始数据，再运行 `node games/101-bomber/Tools/movement-trace-analyze.mjs <trace.json>`。此处是给用户的操作步骤，本轮没有执行。

先分别截取同一 session/生命、始终 visible、无TP/复活、明确单方向的短段；起停、转向、贴墙、hitstop另存独立段。保留原始事件，分析摘要只能帮助定位，F2/F5/F6的结论仍以真正 Session/GAS 边界为准。完整补审见[输入开关审查](2026-10-08-movement-local-validation-evidence/pr52-input-review.md)和[统计口径审查](2026-10-08-movement-local-validation-evidence/pr52-trace-review.md)。

归档在最新 main 上只追加本报告、审查收据和 checkpoint115，保留 PR52 的源码与 checkpoint114；本轮没有修改生产或重新部署页面。

[G52-Input]: https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/player-controls.mjs
[G52-Main]: https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/main.js
[G52-Trace]: https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/movement-trace.mjs
[G52-Analyze]: https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Tools/movement-trace-analyze.mjs
[G52-Host]: https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/SpectatorReplicaHost.cs
