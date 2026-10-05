---
name: bomber-tour
description: 炸弹人启动与取证——查八 Bot 准入、整局十四步、回放和旁观证据时使用。
metadata:
  type: doc
  status: 实施中
---

# 启动与验收导览

一条命令的目标是 Platform → DS → 八个真实 C# Bot → 结算 → 自动下一局。当前第一轮骨架尚未完成整局；缺失的步骤保持 BLOCKED_ENV 或 FAIL。实现与证据归 [R-00798](https://lumiogamesengine.workflow.games/requirements/01a0e1a5-5ac1-785e-b552-81217b7d7be7)，不能把本页目标当成执行记录。

## 从仓根准备，在游戏目录运行 .NET

```powershell
git submodule update --init --depth 1 games/101-bomber/Engine
Set-Location games/101-bomber
dotnet build LumioBomber.slnx
dotnet test LumioBomber.slnx --no-build -- --minimum-expected-tests 1
node Tools/launcher.mjs --bots 8 --seed 101
```

若仍在仓根，Node 启动器也支持公开入口：

```powershell
node games/101-bomber/Tools/launcher.mjs --bots 8 --seed 101
```

发布物以 Engine/manifest.json 为准；SDK、DS、Native、Bot及浏览器零件必须同一完整发布布局。DS固定为 runtime+voxel，Bot显式携带体素/预测预算。需要 .NET、Node、Docker，以及 Sample 同用的 LumioConfig 配表作者工具。缺项要点名，不以离线规则替身补通过。Bot凭据由Platform签发，日志与证据不得包含票据/密码。

## 十四步证据合同

以下为 Bomber 整局的步骤目标；第一轮目前只能以真实启动日志证明已执行的前置步骤。Sample 的聊天、挖矿和存档重启不属于这条路径。

| 步骤 | 行为 | 必须具备的证据 |
|---|---|---|
| 01 | 源表编译与双端投影核验 | 配表manifest、Reader零差异；选择同名profile |
| 02 | Platform账号登录和准入票 | 八个独立账号及脱敏的精确发布/房间绑定 |
| 03 | 启动DS | DS_READY的world profile、房间和endpoint |
| 04 | 八Bot进房 | 每个实例真实准入、scope激活；每Bot证据都存在 |
| 05 | Restore正式底图 | DS首次底图Restore，底图hash与逐格作者证据相符 |
| 06 | 本局加入 | 复制Self/Player身份、本局MatchId和开局状态 |
| 07 | 放弹 | Bot观察到归属正确的炸弹，DS记录真实放弹与库存 |
| 08 | 引信/爆炸 | 同一BombId只引爆一次，四臂来自权威状态 |
| 09 | 连锁 | 同链同Tick处理与对应炸弹/破坏记录 |
| 10 | 伤害 | 真实Effect结果、目标、来源、剩余血量与结算Tick |
| 11 | 重生 | 常规阶段真实死亡、次帧结构动作与按表重生/保护 |
| 12 | 决赛圈 | 触发、预告/生效、圈毒与淘汰记录 |
| 13 | 结算 | EndTick、结束原因、排名/统计与Bot的复制观察一致 |
| 14 | 自动下一局 | 结算后同房间的新MatchId、重新初始化与八Bot重新入局 |

每步输出 step=NN status=PASS/FAIL/BLOCKED_ENV。存在DS日志不等于Bot已观察；仅有Bot正常退出也不证明规则成功。result.ndjson 必须完整闭合，错误、缺文件、截断及互相矛盾的记录均不能通过。scenario自身必须实际执行对应断言，不能因为失败列表为空就替一个不存在的断言判绿。

第一轮的准入scenario只证明其命名范围，不得用它替代完整局scenario。真实无scenario准入可证明步骤04；后续未实现保持阻塞，不把整次运行标PASS。

## 独立验收门

十四步是单局启动路径。拾取竞争、强化守恒、同弹单次、地图和所有规则仍按 [矩阵](../../../../../docs/specs/bomber/stage0-test-matrix.md) 逐行验证，不由随机Bot碰巧触发来替代。

确定性使用同种子、同配表/底图及同输入流的两次权威回放，逐Tick比较非空完整StateHash和事件。输入流来自引擎输入边界记录；不能拿两次受墙钟网络调度影响的Bot运行当同输入，也不能缩为最终哈希或容差比较。

稳定性为八Bot连续30分钟；skills-on/off各完整一局；真实浏览器旁观一整局并留截图/录屏。浏览器只读引擎复制，GameSource适配表现层，不引入prototype/src/sim。浏览器可玩和预测属于Client上游。

## 证据落点

每次运行使用新的integration或.run子目录，保留release来源、配表/profile/hash、底图hash、种子、DS日志、各Bot结果、输入流、逐Tick哈希、结算与指标。清理本次进程和临时凭据，证据不含密钥。

前三轮不看不等CI。第四轮在合入后的main完成本地所有门，才workflow_dispatch bomber-101.yml；本地/CI任一失败均修复经PR合入后重测，不改成假绿。
