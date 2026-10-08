# 101 浏览器同步、移动与正式预测接缝：只读调查

日期：2026-10-04（Asia/Shanghai）。调查者 browser_perf_trace；只读源码、历史报告和运行日志。没有修改生产源码、生成物、source pins、服务配置、DLL，也没有启动/关闭浏览器或重启服务。Root 独占 main.js 的性能测量与修复。

## 已观察证据与边界

- 真实 live-02 的 DS 提交日志是 `games/101-bomber/.run/browser-experience-repair-01/live-02/ds-boot-1/2026-10-03_000.log`。`lumio-ds.log` 是启动/检查点输出，不能用它测 tick。
- 首次只读采样 2064 个连续 tick：1→2064，23:54:27.725485→23:56:10.914062+08:00；有效 19.992523 Hz，间隔平均50.018699ms，p50 47.201ms，p95 63.048ms，p99 64.103ms，最小5.656ms，最大150.279ms，>100ms为1次。窗口含 frames6=945、frames7=831、frames8=174；它是混合接入窗口，不能扩大成八人整局稳定性通过。
- Root 独立实测并交回：A 的 `session_drain` Active 窗口2秒内24～29 ticks，即12～14.5Hz；drained40～42，约20Hz，queue0。Root的原浏览器证据仍应绑定该数据；本报告不把转述当成本代理的浏览器测量。
- Root后续同八人Running基线：A/B Tick mean36.7/37.4ms，周期98.9/100.5ms，socket gaps50.1ms，rAF21.8/21.9ms；原始文件 `games/101-bomber/.run/browser-experience-repair-01/baseline-A.json`、`baseline-B.json` 已保存。该测量把“工作时间再加50ms”的现象具体化，尚不证明scheduler修后通过。
- main.js:690 的 pump 是 Tick→SessionState→WorldHandle→MapDimensions→DumpPositions→PlayerState→PresentationState→terrain读取/adapter→feed.push，全部完成后再延迟1000/tickRateHz。源码可证明周期包含额外工作；究竟哪段占30ms以上，需要 Root 的实际分段时长，不能只根据源码归因。
- Presentation/src/index.ts:104 起已有独立 requestAnimationFrame，只推进表现。PresentationFeed 每次只留前/后一帧，按固定50ms插值；跳过多于一个权威 tick 仍只用50ms完成这段位移，之后驻留到下一快照。源码符合“低于20Hz的数据更新会形成动/停节奏”的机制，但修复验收必须看实时位移和画面。
- GameView每次update读两张19×19体素层；ReplicaTerrain的previous只是派生渲染缓存，不是第二地形真值。两次读取都经正式C# ReadBox，返回cells对象、JSON、再转TypedArray；每次重新读、比较、构造对象，未按Section revision跳读。PresentationDump每次也带全部不可变配置、表、journal，需测长度与序列化成本。禁止以关闭体素或减少实体绕过。

## 实际完整包07与源码身份

完整包07 manifest版本为0.0.5-main.0e2fc74；Runtime=d8ae3da3793d5d95785606be319668a4318af85a，Client=a6071a2a28c3cfda78400254654d6da1fef25b92。后续预测调查用以下已核对HEAD的拥有者：

- `C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity`
- `C:/Work/LumioGames/LumioClient-101-successor-correlation`

前期 `LumioClient-101-composition` / `Runtime-101-admission-effect-projection` 仅用于找文件；不作为最终包07行为的唯一依据。Platform旧gameReleaseId和当前产品身份仍不同，本报告没有闭合发布身份。

本次只读引用的12个Game文件及字节hash封存于父仓 `.run/browser-prediction-design-01/source-manifest.json`。该manifest是调查来源证明，不是source review pins或交付资格门。

## 已证明的 Game 预测断点

1. `Gameplay/Abilities/MoveAbility.Client.cs:7` 的 ExecuteMovement是空实现。共享MoveAbility.Execute只写Facing，再调用空hook。`PredictionKind.LogicPredict`只是声明意图：实际07 Runtime的AbilityTypeAttribute.cs:16～40明确此值不参与Runtime dispatch，实际执行取决于Host是否挂GAS driver和所编译的client body。因此声明不能证明移动预测可用。
2. BrowserHost实际已挂RuntimeJointPrediction。ClientSession在baseline完成、authority pending清零后AttachJointPredictionIfReady，并在DrainReplicaOutbound用Manager.EnqueueLocalInput；Runtime GAS原输入顺序执行client ability。没有理由新增网络输入mapping、JS玩法世界或第二预测器。
3. SpectatorReplicaHost.World（:99）返回Replica.Manager.World。Tick结束后它是ConfirmedWorld；PlayerState、DumpPositions和PresentationDump都读这份世界的LogicTransform。GAS执行时暂选predicted world，finally恢复原World。于是即使填上client移动body，现有画面仍只看confirmed位姿。
4. 实际07 Manager已有公开PredictedWorld、PredictionPublished。joint publication关闭时PredictedWorld=null、PredictionPublished=false；成功PreparedPresentation.Publish才置true并开启。Host必须只读这个完成结果；不能在authority apply与重放之间导出候选。
5. 原PlayerEntity只声明LogicTransform，没有ModelTransform。实际07 ModelTransform已有PushSample/UpdatePresentation，且同身份、同tick但不同TimeSeconds可以接收；包07 Client生产树未找到这些方法的实际调用。组件存在不能证明双Transform浏览器闭环已接通。

## 可实现的最小接缝与必须保留的约束

### A. Game拥有共享移动求解，GAS拥有预测

将当前Server移动求解保留为同一算法，抽出双方编译的求解body；Server-only的Pickup排除回收hook仍留Server侧。Client body调用同一算法，唯一位置写口仍是MoveAbility.WritePosition→RegisterTransformController→BeginWrite。不用副本位置字段、JS积分、手调规则或把服务器状态改成可由网络客户端写入。

不能直接把Server.cs改名共享，原因如下：

- TerrainRead有Server pending事务、再生/冰桥/Favorite专用观察入口；这些不属于client预测。共享求解只需要正式两层collision读取。
- HostVoxelWorldAdapter.Read已会在driver挂接时转到GasJointPrediction.Read。VoxelGameplayBinding.Resolve能在已准入的正式predicted world执行中找到manager-owned adapter。这是现有支持的碰撞/Native读轨迹接缝，不需要新Engine API。
- Client每次预测输入必须真正通过该接缝读碰撞，Pending/Unavailable不能当空气。不可复用Server的“同world.Tick只读一次”缓存：多条输入或authority修正在同一个tick发生时，缓存会绕过真实Native依赖读取与cutoff。Server原tick缓存可以保持。
- Danger辅助读取炸弹的真实复制字段，尚需确认输入所需AOI完整性；可共享同一求解辅助，不能引入JS危险图玩法状态。当前ConditionalWeakTable scratch只保留调用内派生临时数据，但共享前需通过预测状态/生成审查。

### B. 移动必要状态必须有owner权威基准

当前InputMemoryMatchId、PendingTurnDirection/UntilTick、LastMoveDirection/Tick、LastAssistTick、AssistToleranceMilli均为`Scope.None, Authority.Server`。客户端字段虽编译存在，owner初始/纠正快照拿不到值。纯直线能凭零默认“看似成功”，转角、重复辅助、重连和覆盖后重放会缺基准。

最小正确变化是给移动所需现有字段增加owner同步，保持字段身份、Persist和Server网络写权限；不要另建PredictionLocal位置/移动历史。PendingPlace和BombButton字段不是本次移动依赖，范围需独审。此为Game产品schema/visibility变化，必须经官方生成、旧schema记录与新产品身份/独审闭包；不能随手更新schema15 pins或声称无需发布治理。引擎movement.md M7/fieldBoundaries要求必要运动状态与位姿同一基准。

### C. 同一原角色的Model消费完整结果

给原PlayerEntity的client声明挂现有Runtime ModelTransform，并由Host把完成的GAS self位姿样本喂给该原角色Model。远端样本取完整authority结果；身份、lifeGeneration、teleportSequence分别校验，不跨重生/换代插值。Host用有限、单调presentation time驱动UpdatePresentation；不能把这个时间用于Ability或Tick。逻辑碰撞、输入、放弹仍读LogicTransform，Model不进入authority/persist/hash。

这是现有API可实现的接线，但还不能宣称movement.md全套纠偏已实现：实际ModelTransform当前线性插值/有限外推，没有完整普通纠偏误差衰减接口；真实持续输入纠正体验需单独证明。若需要改变Runtime模型纠偏能力，则由Runtime拥有者修复，再官方完整包消费。

Game导出已完成的Model pose供Three渲染，authority DTO仍保留权威tick、确认sequence、技能/事件/生命字段；仅表现位姿消费Model。现有feed对同authority tick只替快照而不重启时间，而预测可能在authority tick不变时更新，必须让渲染直接读取新Model sample/pose或者为已发布姿态另设有界展示样本身份；不能把预测tick冒充authorityTick。远端authority插值与本地Model不能再串两次普通位置插值。

### D. 实现先后与所有权

Root先把可测的pump调度/序列化瓶颈闭合；本设计不是本轮源写授权。Game共享求解、owner必要状态和Host Model接线可以独立新红测后实施。ClientSession、Runtime GAS、Native依赖/发布/预算协议不改。任何实测引擎故障在原拥有者修，不从Game放宽预算、绕过pending或复制DLL。

## 最小真实失败测试与回归路径

所有以下均为待执行，不是PASS证据。

1. 在`Client/UI/Spectator/tests/PlayerInputTests.cs`旁新增真实Native + WebSocket接线测试：正式baseline/两层section/participant/self→Host.SendMove→owner Tick发送。断言confirmed位置/tick不变，正式GAS已发布self位置在下一authority到达前移动；空client实现和未消费预测结果分别产生明确RED。原TypedInputsProduceConsecutiveServerCommandsWithoutLocalSimulation的confirmed不变断言应原样保留，不靠删断言开绿。
2. 测原Server求解与client GAS实际结果：直线、硬墙、转角、双方向fallback、水速、自己炸弹离开/他弹阻挡、危险辅助；基于真实Native底图和真实配表，不用手写碰撞替身。需要转角/重复辅助的非零owner初始memory，防止默认零fixture漏检。
3. 在Runtime既有driver与Native下验证两个未确认move、后续authority纠正墙/水/技能冻结、第一输入拒绝、确认覆盖后剩余输入重放；断言完整发布结果、confirmed权威不被预测改写、原sequence不重发、不读取中间candidate。对Pending/Unavailable保留等待，不能穿墙。
4. Native资源/发布失败测试：相同authority tick上的新预测位置能进入Model；关闭publication时不导出candidate，故障维持原有效Model或明确不可用，不假装回滚成功。角色死亡/重生/同room下一局/connectionGeneration变化不复用旧样本。
5. `Client/Presentation/src/present/__tests__/feed.test.ts`与`view/__tests__/logic.test.ts`验证localModel单次消费、remoteauthority插值和teleport差异；纯展示单测不能替代Native移动。
6. 最终必须完整官方包 + 6真实Bot + 2独立真实玩家同房，双向走/转角/放弹同步，并按要求关闭重开≥10次。分开记录按键→正式输入准入→sent sequence→authority confirmed→published Model→首个屏幕响应；同时测rAF长帧/ownerTick/authority tick/position delta。不得只用刷新或旧Running截图。

## 分段测量建议（由Root的页面观测执行）

每次pump保存起点间隔、Tick耗时、session JSON、WorldHandle、MapDimensions、DumpPositions、PlayerState、PresentationState、两层ReadBox、adapter.project、structuredClone/feed.push；独立rAF保存间隔和长帧。WS记录接收时间/长度/类别/authority tick/覆盖sequence，不保留凭据。客户端authority观测与服务器提交只在各自单调时钟计算窗口，不减跨进程wall-clock伪造输入延迟。

若Tick本身重，而dump/voxel小：定位正式ClientSession各组authority apply/Runtime Tick/Native prediction。若dump/config/ReadBox重：保持世界和体素，减少重复派生投影/不可变配置传输。若rAF在tick长任务期间停：保证pump预算/调度不把每次工作再串50ms；不能只增加rAF而继续积压owner Tick。

## 当前结论

真实DS在已采样混合接入窗口基本20Hz。Root已实测浏览器owner pump只有12～14.5Hz，与源码周期结构一致。Game逻辑移动预测与完整结果表现接线均存在独立缺口，空hook不是单纯把循环改快即可闭合的功能。首入/重进根因由Root/其他只读调查负责；本报告没有宣布这些问题已修复。
