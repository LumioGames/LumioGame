# Public Aura GAS Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking. 当前 Root 指定不 spawn，按 Inline Fallback；Root 独占 heavy，先获得实际 RED 再授权生产。

**Goal:** 使真实已选火焰熊的公开 GAS 主动技能入口提交一次 10111，由真实 Applied 开始保护/CD/一次施放记录，并保留已有连续暴露、死亡和 paired restore 规则。

**Architecture:** 消费 official06 的 AbilityComponent.Activate、finite-ta Effect、phase9 结果与既有 Fire reducer。只接通 Game producer，既有 10111 codec/声明、六身份关联、10110事实、Native容量和预算不改；最爱留火有独立预留/区域发布门，本轮普通 Aura 接通不能宣布最爱留火完成。

**Tech Stack:** C#14/net10.0，真实 WorldManager.Tick、NativeVoxelWorld/HFSM、生成 Reader、xunit.v3/Microsoft Testing Platform。

## Global Constraints

- 依据 design§7.3/8.4、ADR0046/0047/0048、`.sdd/101-20261003-fire-v14-plan.md`。持续5.5秒/CD16秒；伤害连续满1秒减2点，均从有效配置/SDK Tick换算取值，禁止墙钟或硬编码20Hz。
- 公开绑定要求 character118004、active skill4/level1/ActiveBound；施放者自身不受 Aura 火伤，砖格排除，覆盖随 LogicTransform 移动，不写地形/引爆炸弹/毁掉落物。真实 Applied 才结束保护、开始CD并恰好记一次 cast/stat。
- 只新增 `games/101-bomber/Server/Tests/Gameplay/BomberPublicAuraProductionTests.cs`。原 Fire/Aura26和Native correlation13测试、所有生产/声明/生成物保持原字节。先行源码不等于已执行 RED。
- 真实 Scene 布置角色初次 Warmup绑定和位置可以正当设置；实际选角与施放走公开 Activate。禁止测试写 AuraOutcome/handle/projection、直接 Apply10111 或调用 SubmitAura 代替公开入口。结果 hook 仅复制借用窗的真实值，Dispose恢复原 observer，不注入回执、不重放业务。
- 活动局 paired checkpoint 是专门耦合恢复测试，不授予任意存档重启产品功能。完整身份保留 World/Instance/Generation/Type/Target/Source 与 Participant/Life/generation/Match/chain。

### Task 1: 先行公开入口 RED

**Files:** Create: `games/101-bomber/Server/Tests/Gameplay/BomberPublicAuraProductionTests.cs`；实现代码在该文件，不散入旧类。Root 私有取证沿用 `.run/v14-native-production-20261003` runner/frozen official06。

**Interfaces:** 现有 `BomberTerrainProductionTests.Scene(... controlled:true,persistence:...)`、`Scene.TickControlled()`、公开 `AbilityComponent.Activate<TAbility,TInput>(in input, sequence)`、`BomberTestWorld.RestorePaired(checkpoint)`。仅观测 `GasWorldContext.ObserveEffectResults` 借用窗；真实 Result.Source/Target/Handle/Kind/Outcome/AppliedTick必须对齐公开请求关联。

- [ ] 新类覆盖：真实选角绑定与CanActivate；公开Activate接受后无提前CD/保护/cast副作用；真实Initial Applied10111及payload来源；真实CD/duration及唯一cast；重复sequence及独立pending请求无副作用；砖格/不写地形；连续满秒才10110、脉冲完整来源；公开MoveAbility移动使旧覆盖消失；caster真实10101致死清除Aura/停止后续脉冲；公开施放的paired restore更换WorldId、保持allocation/generation/lifetime/CD/cast、正常到期。
- [ ] Root fresh build后执行新类（实际测试工程默认包含新文件，不改csproj）：`dotnet C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/artifacts/bin/Lumio.Bomber.Gameplay.Tests/release/Lumio.Bomber.Gameplay.Tests.dll --filter-class '*BomberPublicAuraProductionTests' --minimum-expected-tests 1`，采用Root当前official06/Native环境和fresh build身份。此argv与现有真实GREEN runner入口一致。expected当前在 `active_skill_unavailable` 处真实FAIL，不猜执行数量；保留child exit/count/source/testDLL/GameDLL/Native identity。若实际API或fixture报错先修fixture，不能当业务RED。
- [ ] 非作者核 test/RED 后，Root才决定授权以下生产补丁；不提交、不GEN、不heavy，由Root串行调度。

### Task 2: 最小普通 Aura producer（仅实际 RED 后实施）

**Files:** Modify `Gameplay/Abilities/UseActiveSkillAbility.cs`、`Gameplay/Abilities/UseActiveSkillAbility.Server.cs`；Modify `Gameplay/BomberFiniteAura.Server.cs` 添加 producer，既有Matches/Consume保持。无需新声明、public contract、Native槽、budget或生成修改。

**Interfaces:** producer `internal static void SubmitAura(World world, NetEntityId life, BomberSkillState skill, SkillLevelsRow level, int x, int z)`。其关联字段服务既有 `MatchesAuraRequest`/`CanSettle` 和 `BomberFireReducer`；结果与调用者源均为同一真实Life。

- [ ] CanActivate pending检查包含Aura，并允许4，其余 existing binding/freeze/config/phase/CD验证保留：

```csharp
if (state.BubbleOutcome.Value != 0 || state.AuraOutcome.Value != 0)
{ failureCode = "active_skill_pending"; return false; }
// existing configuration and level validation remain before this whitelist
if (skill.Id is not (2u or 3u or 4u or 13u))
{ failureCode = "active_skill_unavailable"; return false; }
```

- [ ] ValidateAuthoritative普通Aura检查DurationMs/CooldownMs非0。在最爱trail未有真实capacity/ownership/发布证明前，持火焰槽的favorite路径保持 `active_skill_unavailable`，失败在CD/保护/位移/请求之前；不能默默当普通Aura施放并吞掉最爱效果：

```csharp
else if (skillId == 4u)
{
    var skill = world.Get<BomberSkillState>(playerId);
    if (level.DurationMs == 0 || level.CooldownMs == 0 ||
        !BomberSpecialBombResolver.TryResolveSlot(BomberConfigBinding.For(world), skill, out int kind) ||
        kind == (int)BomberBombKind.ReservedFire)
        failureCode = "active_skill_unavailable";
}
```

- [ ] ExecuteAuthoritative在Bubble分支之前仅加如下分支，避免skill4落进SubmitBubble：

```csharp
else if (state.ActiveSkillId.Value == 4u)
{
    BomberFiniteSkills.SubmitAura(world, playerId, state, level, fromX, fromZ);
    return;
}
```

- [ ] 添加以下producer；完整 checked 值与参数先算，拒绝无永久chain/CD/保护副作用，仅成功admission写私有关联，真正Applied由原reducer/consumer产生：

```csharp
internal static void SubmitAura(World world, NetEntityId life, BomberSkillState skill,
    SkillLevelsRow level, int x, int z)
{
    if (skill.AuraOutcome.Value != 0) return;
    var player = world.Get<BomberPlayerState>(life);
    var participant = world.Get<BomberParticipantState>(player.Participant.Value);
    var runtime = world.Single<BomberWorldRuntime>();
    uint hz = BomberConfigBinding.For(world).Game.TickRateHz;
    ulong duration = Ticks.FromMilliseconds(level.DurationMs, hz);
    ulong cooldown = Ticks.FromMilliseconds(level.CooldownMs, hz);
    _ = checked(world.Tick + duration);
    _ = checked(world.Tick + cooldown);
    ulong chain = checked(runtime.NextChainId.Value + 1);
    var p = new BomberFireAuraEffect.Parameters { Duration = duration, Fx = "bomber.fire-aura",
        Participant = participant.Entity, Life = life, Generation = player.LifeGeneration.Value,
        MatchId = participant.MatchId.Value, Favorite = false, ChainId = chain };
    EffectHandleResult admitted = Effects.Apply<BomberFireAuraEffect, BomberFireAuraEffect.Parameters>(world, life, in p, life);
    if (!admitted.Succeeded) return;
    runtime.NextChainId.Value = chain;
    skill.AuraEffectWorld.Value = admitted.Handle.WorldId.Value;
    skill.AuraEffectInstance.Value = admitted.Handle.InstanceId.Value;
    skill.AuraEffectGeneration.Value = admitted.Handle.Generation;
    skill.AuraDurationTicks.Value = duration;
    skill.AuraCooldownTicks.Value = cooldown;
    skill.AuraChainId.Value = chain;
    skill.AuraFavorite.Value = false;
    skill.AuraCastX.Value = x;
    skill.AuraCastZ.Value = z;
    skill.AuraOutcome.Value = 1;
}
```

- [ ] Root同new-test-source执行GREEN，再回归原Fire/Aura26、Native13等已批准相关门及独审；旧 `SkillAuthorityTests.InvalidPassiveUnknownUnavailableAndUnbackedBlinkCannotCommit` 仍明确把4期望为unavailable，需Root在实际RED与生产授权后审定该历史期望的窄更新，不能隐蔽放松旧断言。本先行任务不改它。

### Task 3: Favorite trail — 独立后续 TDD，当前未实现

**Files/ownership:** 后续仅Game owning `BomberFiniteAura.Server.cs`、`BomberWorldRuntime.FireTrailPromises` 的typed codec/现有FireZoneState和唯一terrain writer；先核实际有效槽ID和现有声明，不凭本文生成新字段或修改包。

- [ ] 先新增真实RED：favorite公开施放在CD/保护之前预留durationTicks最坏未来区域数；16个cast-owner饱和、真实结构提交未知、paired cut、原Life死亡、新Life不继承、1000ms到期；已接受未知区域不可超时丢弃，重复pending不能双花。真实来源含Aura handle/Participant/Life/generation/Match/chain。
- [ ] 所有favorite最坏预算和记录身份经独审后，才解除Task2的favorite guard，真实Applied才消费预留并每Tick至多发布一个排除砖格的3×3有限覆盖；future取消与unknown submitted保留区分，墙在caster死后留至原期限。不将持续暴露或普通AuraGREEN当成trail发行证据。
- [ ] Root完成真实结构/Native/冰桥melt/有界驻留/paired restore及最坏人数证据后独审。当前public普通Aura计划与先行test不关闭Favorite、public bomb producer、整局、平衡或正式新pack。
