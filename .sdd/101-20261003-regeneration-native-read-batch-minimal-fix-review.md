# Regen P2 三域最小修改建议

2026-10-03，registry_bounds_review。只读生产分析；我是第五读照片测试草稿作者，不独审自己的测试。本轮未写compiled source、未heavy。P2执行RED仍待Root的fresh build05与真实五例结果。

核验三域：TerrainRead SHA `23fa0155ee3eff1843e6a844833be2ed30c4ed71ec290fc8265d47523e89bafa`；TerrainTransactions `0299df358538b25e378f32f4c713a9227b40640856454485639a64469af008af`；Regeneration `86130bedf68d0646f9d7e56f32c11e6fe9c217f5704b4df79258a3acc272707f`。以下为Root实现建议，不是已修复或已验证的生产候选。

## 现有先验已经覆盖整批tuple

Terrain.Begin第59行调用`Validate(world)`。其545–568依次校验Regen整批durable wave、detail列形状，并对所有Regenerate行执行`ValidatePending(applied:false)`；这个检查覆盖完整ownerless tuple、transaction/submitted/match、各cell地址、expected/old/new、generation、source/reward/circle列。随后消费某result时，第65–70行匹配唯一transaction、operation/batch为空、submitted早于当前Tick并运行runtime完整列验证；第82–95行检查真实Status0/Applied/Original/TokenConsumed、原bytes/count、exact section集合及每个expected revision的严格推进。

因此保留这条调用顺序即可在第96行之后合法取得结算照片，无需把整组校验移到逐行Applied之后。全tuple校验和receipt校验之间目前没有更改durable wave/pending的代码；未来不能重排这两个阶段。Initialize/其他kind继续原分支，不应因为此修复开始绕pending gate读取。

## 最小接口与调用位置

1. `BomberTerrainRead`保持`For(World)`原pending拒绝语义。抽取现有For的map bounds/服务查找部分供窄内部结算入口复用，两个入口最终调用同一个私有`Read(currentTick,currentAdapter,map)`。cache继续只有当前adapter、当前Tick与Native派生两层cells；不添加持久shadow地形。普通For在pending未Clear时仍返回null，即便cache已经填好。
2. 窄入口可命名`ForCommittedRegeneration(World world, string transaction, VoxelMutationOutcome outcome)`，只从Terrain.Begin调用。入口应守卫：当前Resolve adapter有效，唯一pending transaction等于传入transaction，pending非空/全部kind3、submitted<now、当前match一致，且outcome为真实Status0/Applied/Original/TokenConsumed、有原bytes/sections；它的前置条件明确为上述整批tuple与完整receipt校验已完成。不能新增`allowPending`布尔开关给任意caller。
3. Terrain.Begin在第95行全部section校验结束之后，且只在该cohort为Regenerate时调用一次窄入口，把所得完整两层照片保存在此result局部变量。null/未ready照片不得Accept/Clear；保持当前严格失败方式，不以缺pin模拟激活。后续Applied循环将同一个照片传给Regen，不能在循环体取得照片或临时复制一格数组。
4. `Regeneration.ValidatePending`保留原false路径和所有tuple guards。可增加可空`VoxelCellQuery[]` Applied照片参数，同时保留显式applied语义；applied=true而照片缺失/长度不是checked(width*depth*2)须失败。按checked `area + z*width + x`取obstacle格，验证HasBlockId、Ready/Unchanged、BlockId==row.Block、SectionRevision>cell.Revision。删除旧`adapter.Read(new[]{oneAddress})`，不能另用`Read(section,offset)`替代。
5. 全部Applied行通过后才继续现Accept/Clear。清pending之后的FinalCircle、Successor、Players、Bombs、Regen等现普通For调用得到同adapter+Tick cache，没有第二次全图读取。Native commit仍在帧末，本帧写入不写回该照片。cache只跨本Tick存在，不被作为下Tick/native truth。

入口守卫不等于伪造`VoxelMutationOutcome`的能力证明；唯一生产调用者仍必须在精确现消费位置传真实DrainResults对象。无需新增公开合同、receipt字段或Native槽。函数可internal，但应保持仅这个调用点；只靠参数名“committed”不能代替上述校验顺序。

## Applied纯索引与binding守卫的精确边界

`VoxelCellQuery`只有HasBlockId/Presence/BlockId/SectionRevision，**没有sparse binding**。原Applied的`adapter.BindingGet(address.Section,address.Offset) is null`是独立真实Native未绑定检查，不能删除，也不能以softBrick material或pending ownerless宣称binding为空。

本P2最小方案是材料及revision完全改为照片纯索引，保留原BindingGet检查不动；第五例仅统计真实material Read请求，不能把它冒称全部Native API无单格调用。如果Root要求Applied阶段连binding也纯索引，则应在已验证settlement入口按distinct Section一次读取完整真binding表（公开`Host.TryReadSectionBindings`），核Ready/完整表/section revision与照片一致，逐cell查该本次派生表；那是额外绑定批读范围，需要明确fixture与语义审查，不能偷偷把BindingGet删掉来满足计数。SDK此入口每次真读，Gameplay只能持有本Tick派生结果，不建立第二个可写binding真值。

## 待候选独审与执行关闭

Root实际RED后可实现上述三域；我可独审Root生产候选，不能同时作为第五测试的独立审查人。候选检查应逐diff确认原tuple/receipt/match/revision/bytes/token/Unknown/Reject/cleanup guards仍在、仅matching Original获得照片、无global pending gate开放、all-cell验证先于Accept/Clear、普通For复用cache。

五例GREEN证明实际首波4/8-cell消费Tick没有多余material请求，不证明Unknown/故障恢复/Authority全链路/全部Regen生产。上一独审披露的unsubmitted恢复credit重验缺口、资源箱/barrel/multi-output发行范围与M2关闭保持，不能因P2修复而一起关闭。源码停写。
