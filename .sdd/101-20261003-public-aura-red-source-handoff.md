# Public Aura 先行测试源码交回

2026-10-03。作者 registry_bounds_review；Root独占 heavy。本轮读 Root/101 core/nav/architecture/code-style/testing、design§7.3/8.4、ADR0046/0047/0048、fire-v14-plan、实际 Fire/Aura producer/reducer/既有 Scene、公开 GAS API及结果窗。使用 writing-plans 技能，按 Root 指定落 `.sdd`；未动生产、声明、预算、生成物、旧测试或 index/refs，未 build/test/GEN/Native运行。

## 唯一源码写域和停写身份

- 新文件 `games/101-bomber/Server/Tests/Gameplay/BomberPublicAuraProductionTests.cs`：**7 Facts / 7候选cases**，SHA256 `715a00a12eee29464b3e7dc01fc57948621bcd4c828d6c958fa5025d07c79f58`。
- 计划 `.sdd/101-20261003-public-aura-producer-plan.md`：SHA256 `4ca0cad21d97408b824c2424a0477a1db50557c3d50b0df5a299a5b27514373d`。已先写计划再新建测试。公开普通 Aura 的最小生产代码在计划内，**未实施、未获本轮生产写授权**。
- 私有 baseline `.run/public-aura-producer-red-preparation-01/before.json` SHA256 `defa995a06f32d9974101292779412b1dbd806817293ec126008a7fbb07acc9c`；proof.json SHA256 `61a6ec94353fd5f0713ce2fc38aae9763f6a09ba26faefcb5eac6f8288146716`。本轮已停写新类，Root可fresh build纳入。

7项覆盖为：初次Warmup公开选角绑定118004→CanActivate→AbilityComponent.Activate；actual Initial/Applied10111后CD/保护和一次cast/stat；同sequence及不同pending请求无额外副作用；满有效1秒才10110且26列完整事实；Native砖格排除/原块与revision不变；公开MoveAbility移动把实际Aura带离旧覆盖并覆盖新位置；caster真正三份10101伤害致死后Aura消失/无后续目标燃烧；真实公开施放的paired checkpoint保持allocation/generation/生效期限/来源/CD/唯一cast、更换WorldId且不重施放。

## 夹具和观测边界

Scene是既有真实Native、official06 SDK及controlled admission/transfer driver。新类只把初次Warmup选角槽设置为unbound，再由真实 `SelectCharacterAbility.Activate` 填绑定；不是完整进房UI证据。位置初值、砖格是明确场景布置；移动用公开 `MoveAbility.Activate`。死亡用既有真实ECS bomb夹具→Tick→真实10101结果，不手设生命死亡/健康结算。

所有Aura实际施放只走public UseActiveSkillAbility；新类无 `Effects.Apply`，无 `SubmitAura`/StageAura，无AuraOutcome/handle/投影赋值。只读 observer 在原借用窗内复制实际 EffectResult 值；每个 `using` 的Dispose在断言失败时恢复原observer，无first-chance handler、不注入或替换结果。不以projection独自判Applied，同时核实际Finite row、payload完整Participant/Life/generation/Match/chain，以及Result的完整Handle/Type/Target/Source/AppliedTick/Tick/Kind/Outcome/ordinal。

## 核验和限制

写前253个既有 nongenerated Gameplay/Gameplay-test文件逐字hash，交回时252相等；唯一并行漂移为 `BomberFrenzyProductionTests.cs`，原SHA `7ef4bfc5bfe6e91ad29f2068f33cad35cbb6cfe28546b75438987809bfd4d041`，本作者未写，已向Root披露。不把并行改动误称新类造成，也不称全source drift0。

旧 AuraNative SHA `308ff37594182965b3ba61256052bdca0577e9e2d75210cc41dded6fe9610ba4`、AuraProductionFix SHA `d531d8b2aa289c38655d40e902646a7d9ea2391b6d0c942dc7722253bdff1d7d`、原Native13 SHA `c320d14323216f4c56e14c64b16175418cc0447740ffc0fb7a0abf905090cd1f` 均未漂移；其余旧测试在baseline/proof中逐项可追溯。新增文件 `git diff --no-index --check` 实际raw child **1**，空原件对新增文件的no-index差异模式，log仅有LF→CRLF Git提示，无whitespace error；不虚写child0。语义/类型接口静态核对，未称编译通过。

当前公开白名单2/3/13拒skill4，且server else走SubmitBubble。预计在CanActivate `active_skill_unavailable` 处失败，但**7个测试尚未编译/执行，没有真实RED计数或新DLL身份**。Root应fresh build和实际过滤执行，先区别fixture/compiler错误与业务失败，非作者复核后再授权生产。旧 SkillAuthorityTests仍期望4 unavailable，启用后需要窄审定该历史期望更新，本轮不改旧测试。

Favorite火焰槽留火1秒是明确后续TDD：预算/未来区域预留/未知实际结构提交/死亡取消与submitted保留/paired cut须真实证明后才放开。普通Aura通过不关闭Favorite、public bomb、Supply17、Native全部、整局、正式新pack或平衡。既有Fire/Aura26与Native13证据只保留原运行范围，本交回没有扩大它们。

## build17 编译阻断与唯一 namespace 修正

Root实际build17 raw `.exit`1 = JSON exitCode1，编译失败，不是业务RED。实际log SHA `e95aba1a08545dd3d49eb69a943eede8d877c67d22b4d87d05d5366af7995ef0`，JSON SHA `4bee4c9332d265a502f35b7988f76cdf28720183468734406887aa4889f5fdf1`。本类真实7个独立CS0103位置（98:93、121:22、122:22、233:130、281:109、364:113、366:22；log汇总重复打印），均为EffectResultKind/Outcome缺namespace。其他文件错误由对应owner处理，不在本作者写域。

本作者遗漏了命名空间引用。先核 Engine0e `engine/wire/generated/EffectLifecycleContract.g.cs` namespace确为 `Lumio.Wire`，枚举定义在370/435，再依Root窄授权仅增加 **`using Lumio.Wire;`** 一行。当前新类SHA **`10dbffd421d67cbf1b989a19605ad4e2972bace6521bab4d9d64f2667237cbd5`**；旧715a…9f58原件仍保存。机械撤回该一行精确恢复旧全部字节，7cases/全部断言/payload/调用/夹具/观测均未改变。

前后物理原件 `.run/public-aura-namespace-fix-01/before.cs` / after.cs；proof.json SHA `2b03eb0f42543184575d3d251291bfcfadd550d9e39f820c957062510a9461c4`，含真实build17身份与mechanicalReverseEqualsBefore。已停写交Rootbuild18；本作者没有构建/运行/GEN，也未宣称修正后已编译或已真实RED。
