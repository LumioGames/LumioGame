---
name: prototype-migration-client-audit
description: 101最新原型与正式代码的客户端与Bot迁移审计——核对源码、默认可达和真实证据时查。
metadata:
  type: review
  status: 实施中
---

> 本文固定于2026-10-07审计切点。完整交付归[R-00798](https://lumiogamesengine.workflow.games/requirements/01a0e1a5-5ac1-785e-b552-81217b7d7be7)。后续修复、独审及新运行资格见[总表](2026-10-07-prototype-migration-audit.md)；下述历史计数不自动升级为当前验收。

# 101 完整迁移只读审计：Client / Bot / 输入 / HUD / Audio / Results

审计时间：2026-10-07 22:2x–22:3x +08。正式工作区 `C:/Work/LumioGames/LumioGame`，正式 HEAD `7bacb8ac7e3caf63a35ea69e62fc7a275390540e`。原型事实源是 `git show/git grep af385a9cd0f261317e97240a7e55accdda8d01d5:<path>`，没有用大量脏改的本地 prototype 当作最新事实。下文正式路径除另注明外均以 `games/101-bomber/` 为根，行号来自审计时源码。本报告只写审计材料；没有改生产源码、重生成、跑套件、提交、重派任务或操作浏览器/服务。

已依次阅读 `.spec/AGENTS.md`、`.spec/knowledge/README.md`、repository-architecture，以及 design、ADR0044/47/48、2026-09-28-prototype-convergence、2026-10-02-delivery-progress 最新尾段。实际 M1 原型与正式 M2 目标分别记账：原型三槽/三级/组合/麻痹/小水塘溺水，均不得因“原型已有”恢复到 M2。

## 裁决摘要

1. **正式拾取码已改变，表现枚举尚未跟随**：正式 `BomberTypes.cs:10` 和 `Gameplay/Tables/tables/pickup_kinds.txt:18/20` 为 Kick=6、Frenzy=7；正式表现 `Client/Presentation/src/contract/components.ts:68` 仍为 Frenzy=6。adapter 直接 cast，所以 Kick 可被误认狂暴，真正7无法进入已创建的狂暴渲染批次。这是实质消费缺口。
2. **基础心数与属性硬上限混用**：正式属性初始6、硬上限16（半心点），`PresentationDump.cs:209` 将 Maximum=16投到原型语义的 `maxHealthPoints`。TS该字段代表基础6，`maxHealthCeiling`又加帽子/金心增量，得到26点/13心；圈毒提示也按16作基准，偏离设计6基准。玩家自己的 `maximumHealth/goldenHeartCount` 复制已有，不能用它掩盖全局基础字段错误。
3. **补给/狂暴服务器账已经存在，正式复制到表现断开**：WorldRuntime的两项Supply匹配ID及Participant的FrenzyUntilTick均为Room Sync，但C# DTO/adapter没有投影它们；`supply_announced/supply_opened`也没有事件映射。现有横幅、光柱、补给喷泉、红光、加速音乐因此不形成正式默认链路。
4. Bot并非原型价值表的完整迁移：四行为、分层阵容、真人追击限制、基础技能决策已有；观察模型没有箱级/动态最大心数/金心/狂暴/补给/特殊槽等信息，拾取统一18分（血包且血<6给40），无法作新价值判断。
5. Runtime Model已经批准，**Client宿主接线正在独立writer中**；移动链及Game32拥有的文件必须保留互斥。第一轮可独立推进表现枚举/心数投影（纯TS方案）与Bot观察/价值切片，不能把旧Scene31称为修复现场或迁移验收。

## 状态口径

主状态严格使用用户六名：**已验收、已有但未验收、部分实现、缺失、默认未启用、已被新设计取代**。源码实现、默认可达、真实证据各自独立判断。这里没有任何项目能因本次只读审计升级为“已验收”；未识别到新的端到端证据就写未验收，历史unit/Native/旧现场不顶替。

## 逐项事实与缺口

| 项 | 远程原型实际行为（af385a9） | 正式M2目标 | 正式源码 / 复制链 / 默认可达 | 主状态与缺口 | 新真实验收应留证 |
|---|---|---|---|---|---|
| Kick6 / Frenzy7 | `prototype/src/contract/components.ts:68` Frenzy6；技能糖kick在M1三槽体系。该原型没有M2独立Kick6拾取码 | ADR0048独立被动资格Kick6，Frenzy7，互不当特殊槽或帽数 | `BomberTypes.cs:10`及源表已分配；表现枚举仍Frenzy6；`replica-adapter.ts:235–240`直接cast；`view/world/pickups.ts:64/112`只创建Frenzy6批；HUD两Record缺Kick | **部分实现**：正式码已有，客户端误码。Kick发行/消费本身仍有休眠边界；不能因本片修正声称开启Kick玩法 | 捕获真实kind6/7的C# JSON→adapter→HUD/几何/声音，证明6显示踢弹且不红光、不狂暴音乐；7显示狂暴；unknown码明确拒绝；重连baseline不重播 |
| 帽子/金心/动态心数/Boss心条 | 原型 `config.ts:46/526/533` 基础6，帽+最多2心，金心最多3心，封顶16；`view/runtime.ts:1309/1660`体型/心条 | design§2/12与ADR0039同口径，当前生命真实最大心数和金心只消费复制事实 | `Gameplay/BomberGrowth.cs:8–14` 6+2*min(2,hats/4)+2*min(3,gold)；`PresentationDump.cs:41/209`玩家最大值/金心已有、基础DTO却填16；`replica-adapter.ts:178`映射玩家值；`hud/index.ts:198/204/443`动态显示代码已有 | **部分实现**：成长表现已有，基础与硬上限投影错误。新真实默认成长/Boss链未验收 | 真实0/4/8帽与0–3金心轨迹：3–8心、半心、死亡回落、AOI晚到、后继生命；DOM最多8心，Boss≥6心体型/心条；对比真实Health base/current/max |
| 圈毒提示/中毒状态 | `prototype/config.ts:543–547`按基础6等比ceil；hud/final-circle消费本人动态max；毒糖旧等级M1中毒节拍 | ADR0047固定直击1心+4秒两跳各半心，不叠加续期；圈毒仍按动态max/基础6 | `PresentationDump.cs:209`和`replica-config.ts:22–28`把16原样保留；`hud/final-circle.ts:78–96`按该值等比；toxinUntilTick在DTO/adapter已有，毒提示读取表 | **部分实现**：圈毒数值提示可能低估（例如段伤2，max16按16显示2点，设计按6应ceil(32/6)=6点）。旧毒等级/麻痹说明属**已被新设计取代** | 捕获真实阶段基础伤、最大6/12/16、复制毒状态/清毒，并对照本Tick实际扣点与HUD心/秒；首跳40/80只是20Hz候选，其他频率按SDK配置；不以JS计时证明规则 |
| 中央补给预告/开启/光柱/喷泉 | `prototype/sim/supply.ts:9/68`公开Supply事件及逐件PickupSpawned；原型hud-brain:548/554，audio:320/323，view:1697/1710 | 23/27每局50秒预告60秒开启一次，19关闭；正式复制权威状态，晚到基线可显示且不回放历史爆发 | `BomberCentralSupply.Server.cs:219–228/255/264`已有journal事件；`BomberWorldRuntime.cs:50–51`两匹配IDRoom Sync；`PresentationDump`完全未枚举runtime supply；`replica-types/adapter/events`无supply字段/事件；`hud-brain.ts:706`和`view/runtime.ts:1702/1716`等待match.supply | **默认未启用**：默认game.txt:6 centralSupply=false；**部分实现**复制缺口，即使切m2-room也不能凭现有前端看见补给全链 | 23/27真实50/60秒，11件来源守恒、延期物化与下一局一次发行；19零补给；初次baseline不播过期横幅，状态光柱正确；journal去重/重连；每件落点与中心喷泉来源对应 |
| 狂暴红光/音乐/拾取/弹状态 | 原型view:1325/1357消费PlayerView.frenzyUntilTick，audio:483–492加速音乐 | ADR0048同完整Life自免/跨生命并发≤6/5Tick间隔/6秒/标准1.2秒弹；仅同当前Life视觉激活 | `BomberParticipantState.cs:40–44`FrenzyLife、Until Room Sync，Generation/Promises服务器私有；DTO participant:56–61没带FrenzyLife/Until；adapter.player没frenzyUntilTick；type枚举7断开；game默认frenzy=true但唯一补给来源关闭 | **部分实现**，来源随默认补给为**默认未启用**；已有红光/音乐程序不等于正式可达 | 真实Participant/Life关联复制：拾取、6秒到期、死亡后新Life无旧红光、跨生命尚在场旧弹；1.2秒标准弹、六并发/五Tick及来源不变由Gameplay证据负责；表现只读 |
| 三级箱/金箱命中/掉物 | 原型sim/chest:145–189资源箱tier/hitBy；view/runtime:542/1720分级外观/剩余命中标签；强力宝箱事件与喷泉已有 | ADR0048金箱两独立族，穿透首次停、第二真实开箱再继续；只在真实提交后发行；来源/命中表现必须可辨认 | `PresentationDump.cs:88–94/144–166`从Engine绑定读取箱坐标，不伪造LogicTransform；adapter:220–225 ResourceBoxes有tier/hits；replica-terrain:39–42映射资源箱体素；`replica-events.ts:94–98`只处理resourceTier0，crate_opened未映射；PickupSpawned也没映射 | **部分实现**：箱tier/血数复制及外观已有，资源箱命中/开箱/发行来源富表现不完整；默认旧图不顶替23/27验收 | 原生真实箱首次/第二族、same族、被拒回执、穿透后继；C# binding→tier/hits→开箱动画→每件新拾取来源；baseline/同Tick帧/体素晚到不误开箱、不重复喷泉 |
| 五角色/技能/单特殊槽/最爱 | 原型五选一、flyKick主动、旧三槽/三级/组合；`prototype/src/bots`没有flyKick新增分支，ADR0044明确Bot待补 | ADR0047六形态等权、固定无级技能、袋鼠最爱穿透CD3/4；一特殊槽+绑定角色技 | DTOskills已有；`replica-config.ts:35/60–93`生成配置驱动，支持代码1/2/3/4/5/7，但只激活enabled且有来源；现默认catalog fixture/assert实际只有Freeze/Pierce/Toxin（test:65–80）；`present/skill-hud.ts`已两chip，但类型/内部slot/level保留旧兼容；favorite显示helpers已有 | **部分实现**：五角表现与过滤已有，六形态仍未全部开启；旧三槽/合成/麻痹为**已被新设计取代**，不能移植 | 五角真实入场、合法技能、配表与CD、Flag关闭、fav拾取/换槽/死亡与successor，能力失败不制造cast音乐/横幅；Remote/Fire/Split不能靠复制旧proto开启 |
| 死亡/Boss倒台/喷泉 | 原型PlayerDied+前一快照max推Boss，死亡掉物droppedBy推喷泉；hud-brain:697、view:627/716 | design§3.1 Boss倒台全场、完整来源/生命，掉物真实财富转移；不得猜不存在的事件事实 | `BomberEffectBusiness.Server.cs:104–123`damage/death/boss_downjournal；`replica-events.ts:77–78`映射death，却没有boss_down；`hud-brain.ts:691–703`依赖before受害者max；`view/runtime.ts:697–720`按复制droppedBy推死亡喷泉；同Tick跨AOI/跳帧可能缺before生命 | **部分实现**：普通死亡/帽散落/Boss推断路径已有；明示权威boss_down事件没消费，来源喷泉不能全靠旧before成功 | 同Tick成长到Boss后死亡、AOI新出现后死亡、多受害生命/同Participant后继、晚到/重复journal：Boss横幅和喷泉一次，受害最大心数/来源来自该发生事实；普通死亡不误升Boss |
| 连锁/命中/连杀/他人横幅 | 原型hud/kill-juice八秒连杀，任何人三杀以上与3/5/8 streak播横幅，audio专杀音与duck；view定帧本地 | ADR0043/44相同，双杀只feed，他人三杀以上带名；只表现，不暂停服务/他人 | `replica-events.ts:65–78`bomb/damage/death已有；`present/kill-juice.ts`/`hud/hud-brain.ts`/audio连杀路径已有；journal128条有界/cursor baseline不重播；同人life更新可能先于旧death消费需真链验证 | **已有但未验收**：主表现实现已有；与新12/23、事件身份/cadence未经新验收 | 真实两链8秒边界、三杀/四杀/暴走/不死3/5/8、别人事件横幅，baseline无回放、重连不重播、kill feed上限，定帧只有本机表现且不改simulation/input计数 |
| 领奖台/高光/结算/下一局 | 原型10秒台+6秒结算、人人卡、personal best本地；表phase流转下一局 | design§13真人/Bot持久结果、人人卡、自动下一局/可换角；身份跨life/match稳定 | `PresentationDump.cs:177–200`读取durableResults与统计；adapter:265–298 authoritative stats/result；`hud/stats-tracker.ts:230/256–268`使用复制统计；`hud/index.ts:501–506`台/表倒计时；results-view:170/181人人卡；game-view:37–51每match重建adapter/view | **已有但未验收**：相当完整源码；旧现场看见台/表不等于新完整迁移下一局验收；本地best不应被当账号持久化交付 | 12/23整局到台/人人高光/结果排序/下一局至少连续10轮，体素restore/参与身份/successor，早出局/末tick全灭/唯一存活/timeup/同rank，换角下一局生效；离开重进结果durable |
| 本机跟随/V俯瞰/出局旁观/纯观察者 | 原型默认本机跟随，出局选帽王/最近；`prototype/view/logic/spectate.ts`选择函数已有 | ADR0044局部默认；只读观察者无self时明确选择真实跟随对象，HUD和音频一致 | adapter.localPlayerId没有self返回0；`view/runtime.ts:1407–1412`因!local return，仅本机被淘汰才chooseSpectateTarget；`audio/index.ts:141`无本机回落地图中心；`game-view.mjs:59–65`固定使用localId，没有观察target | **部分实现**：玩家跟随/出局跟随已有，纯观察者跟随**缺失**。画面/声音以图中心回落不能当明确目标 | Player/Observer两角色真实入场与重连；observer选帽王/最近、目标死亡/退出/换life、目标缺位明确空态；V切换、pan/距离以显示监听目标；没有赋Self或发送输入 |
| 分层距离音效/水面 | 原型audio index/mixing四总线、4格满14格外静音、低通/最多4爆炸/仅本人脚步；水蓝池/泡沫/水花 | ADR0044对应产品表现；输入/权威效果仍来自复制 | 正式audio/index.ts:139–149空间/总线，boom cap:86–90，专杀音与duck已有；view水材质/粒子已有。supply/frenzy/资源箱未投影的声音仍无法触发，observer监听错位如上 | **已有但未验收**，新增事件接线部分实现。不是本次修改源码的独立艺术定调 | 两窗口同局真实本机/远处/观战listener录音或WebAudio证据；4/6/14格、爆炸多声聚合、总线duck；关闭声音/恢复不重播；真实水速/冰桥变更与水花一致 |
| 正常玩家入口/合法输入/拾取 | 原型local-host/keyboard发送LocalSim输入，只是M1 NON-CONTRACT | 正式平台launch→Session→生成GAS；玩家/Bot只读自己的复制视图；输入不旁路/不篡改Tick | `main.js:629–630`正常same-origin平台launch；`main.js:879–883`ready/初选/UI门；player-controls:16–40立即首按+50msheld、blur/hidden清理；`SpectatorReplicaHost.cs:154–200`方向/phase校验、活self→Ability Activate，下一ownerTick由Session发送；BotScenario:42–90同步门、生成能力名/输入发行 | **已有但未验收**：正常入口源已实现、Scene31也在实际使用；移动连续预测/Model尚在修复，不可声明“手感已验收”。原型TS模拟入口属**已被新设计取代** | 新完整包独立Scene的两窗口正常玩家：登录/初选→move/bomb/skill/pickup→死亡/successor→下一局/重进；对照Server command facts、input数/额度，键释放无Move0伪输入；禁止注入旧现场 |
| Bot分层/真人限制/按时进圈 | 原型rookie/normal/hard阵容及真人限追；危险图/圈路线/摊牌较丰富 | ADR0043/44三层阵容，12/23 D前3≥50%且KD≥1；E unique survivor≥85%、平均≤4m、1×1；16/27和8/19独立回归 | `Client/Bots/BomberPlayScenario.cs:98–121`按生成表BotLineup策略，`Brain.cs:217–226`真人追击限；观察来自BotWorldView与Room字段身份核验（Observation:16–28/145起）；基础circle urgent逃离/预警路径已有 | **已有但未验收**：策略框架已有，没有新的D/E100种子真实C#整局证据；旧TS acceptance不顶替 | 每客户端自己的replica、真实GAS输入、至少100种子D/E，每角/难度/地图矩阵、原始统计和逐Tick回放；不能脚本移动到圈或放宽断言 |
| Bot新箱级/金心/狂暴/补给/特弹价值 | 原型behaviors:246–251金心/狂暴分值，353/359弱者/狂暴威胁，664/684补给守点/狂暴逃离；skills判断现有三槽pickup是否可用 | 正式消费M2已开启内容，重复/上限/Flag拒绝、特殊槽替换/最爱、动态HP、狂暴标准弹与威胁；不从服务端字典读真值 | `Decision/BomberBotObservation.cs:8–13/29–59`缺max/gold/frenzy/chest/supply/bombSlot，Pickup只有Cell/Kind，Bomb没有Kind/SourceLife；Observation:47/79–80完全没投箱和补给，Actor只有health/hats；Brain:193统一kind，257 flyKick仅扫FacingRay，无法排除滑动弹/严格邻或隔空一格 | **部分实现**：旧价值选择；新箱级/金心/狂暴/补给/特殊槽决策大部**缺失**。FrenzyBypass只是摊牌策略名，不是狂暴状态接线 | 从真实client replica捕获再输入Brain：满金心/已有kick/同种特弹/技能关闭不追不可取物、伤血动态max与满血有毒血包、gold box需独立族；补给预告待点/一次开启，狂暴威胁逃离/自身有界标准弹；飞踢静止目标/空格/无目标与CD |

## 移动修复仍由已有writer推进：只读状态与互斥

- Runtime Task1最终`ef2f56740b5d80743b4f278a0ea3d46962746cb3`与Model`214a08f132500c09e9f14b38e129a354a5f405df`已分别通过独审。Model report/review记录owner Native26/26、clock23/23、ECS634/634，GAS998/999 raw2（旧StructuralScratch12706/12070仍失败）。这些是Runtime独立收据，**并不证明Client/Game/browser已验收**。
- Client工作树 `C:/Work/LumioGames/.101-restore-01/LumioClient17PredictionStep` HEAD仍`c361151828b9b512bd6ab3826692c4bbbf288814`，22:30只读status为7 tracked、3 untracked，包括两driver、ClientSession/Successor、PredictionClock和Native测试。22:32–22:33又写出presentation RED build日志，因此是活跃工作，不能重派或清理。
- root在22:31观测的pwsh26860→dotnet25148→10824→testhost26276→tests26992是原worker的测试链。本子审计22:30精确路径匹配未看到它，不能用那个瞬时快照推断worker已死。后续日志新增确认仍推进；全程只读。
- 最新读到 `green-native-clock.log` 实际是2总/1过/1失败/0跳过，raw1；FrozenPump expected1/actual2。名称含green不是验收通过。没有`task-2-client-report.md`或Client提交，不重跑套件、不修改旧断言。
- Game工作树 `C:/Work/LumioGames/.101-restore-01/LumioGame32RuntimeMovement` 22:33 clean，HEAD`6e0aa35525645df0cbeba16e1dafd38d81806413`；Task4待Client最终API后才实施。它将拥有PlayerEntity两端拆分/生成、SpectatorReplicaHost、host/Program、JsonContracts/Context、PresentationDump、main.js、game-view.mjs、Presentation/index.ts、present/feed.ts、view/runtime.ts。**本轮非移动切片排除这些文件**；无需重派Task4。
- Scene31 restart03仍是旧complete29/Game31：审计22:30 launcher node PID8264、DS10344、6个Bot进程；进程启动19:23，DS路径在`.run/browser-experience-scene31-source-preparation-01/files-only-01/complete29-runtime-copy`，不是214a08f1消费者。账本checkpoint93明确Client/new complete/Game/new Scene/前台手感待完成。未打开、关闭、注入或操作现场。具体进程命令中的ticket没有写入本报告。
- Client brief仍要求same generation-relative单调钟、owner pump发布前锚点与render独立presentation API。Game按当前50ms pump/输入两timer错相0/10/25/45ms、jitter、停键、blocked、ACK burst/纠偏/TP取证；不能把pump改RAF偷偷缩短OwnerTick timeout。实际120Hz显示不可得时必须区分受控调度与真实显示。遵守现有writer方案，不重写Model数学。

## 建议第一轮独立切片

### C1：表现码与基础心数投影（最先，纯TS，避免Task4文件）

独立最小brief见 `client-first-slice-brief.md`。在正式`Client/Presentation`把Kick6/Frenzy7拆清、补全HUD/鞋形几何与批次；从**现有C#已输出的attributes rows**消费HealthPoints.initial=6/maximum=16，使TS `config.maxHealthPoints`恢复基础语义，严格验证源表而非硬编码6。必须覆盖真实DTO旧标量16与属性初值6的组合，同时玩家row.maximumHealth=16仍显示8心，毒圈基准6。本轮不触碰PresentationDump或C# DTO，可以和Task4互斥文件并行；源C#同名字段歧义仍未修，后续窄DTO字段命名清理交到Task4完成后的下一片。RED证明当前错误、GREEN证明正式JSON/config rows→consumer数值/外观；不触碰协议/生成码/额度/时间。

### B1：Bot观察与价值（与C1、移动互斥文件）

只改 `Client/Bots/Decision/BomberBotObservation.cs`、`BomberBotBrain.cs`、`BomberPlayObservation.cs`、必要scenario决策消费与Bot Tests/ReadTests。读取已经复制的MaximumHealth/GoldenHeartCount、Participant.FrenzyLife/Until、WorldRuntime Supply matching IDs、拾取SkillId/Level、BombKind/滑动与来源、Engine绑定资源箱tier/hits；没有该位置/字段就保留Known=false，不从服务器拿信息补齐。基于正式开启内容加入可拾取性和表值规则，禁用形态不追，不自动解锁Dormant能力。分开覆盖价值和危险；flyKick静止与邻/隔空一格按正式合法目标判断。实现前先确定真正需要的生成表参数，不把原型tactics常量抄成正式真值。现实D/E数据另作整局门，fixture只能证明消费决策。

### C2：补给/狂暴发生事实与复制表现（依赖移动Task4完成，先设计不重叠编辑）

需改PresentationDump/JsonContracts/Context/replica-types/adapter/events以及窄HUD/Audio规则投影。从existing Room Sync与完整Life关联投影；补给基线状态与发生事件分开，初次观察不播旧爆发；Frenzy只有对应当前Life才赋PlayerView.frenzyUntilTick。消费supply事件及boss_down权威最大心数；PickupSpawned/箱开源投影必须来自实际发行事实，若正式journal缺source字段先交Gameplay上游，不在UI推造真值。此片与Task4同文件，**不能同时间派writer**。

### C3：观察者明确跟随/监听（依赖移动Task4完成）

为没有self的Observer定义可见跟随target，而不是改Self或制造玩家；同一target用于camera/HUD/audio。选择帽王→沿用活目标→最近可见存活体；不合法则空态。涉及view/runtime、Presentation/index与audio callback表面，暂不并行写。

## 验收边界

本次发现可执行缺口与已有writer事实，只读审计没有新的运行验收；所有首轮切片必须先有身份绑定的RED/GREEN、focused regressions与必要构建，再独审，再新完整包/新Game源资格/新Scene。12/23、16/27、8/19、五角色、技能Flag、下一局、逐Tick回放与30分钟稳定性仍要分别保留。旧Scene31、原型TS测试、Runtime数学/Native轨迹、配表与编译成功都不能转写“迁移已验收/冻结”。
