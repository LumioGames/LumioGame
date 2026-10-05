# Game17 UI / complete16 actual finite functional observations

仅只读Root指定03–06功能原件；未读quiet、包/PDB、旧现场或活日志，没有浏览器/输入/服务操作。14个JSON原件路径、长度和SHA256保存在新派生结果中；源原件未改。输出为 `C:/Work/LumioGames/LumioGame/.run/live17-functional-analysis-01/functional-analysis-01.json`，SHA256 `44b5625d4eb6aa9d8c6a3cc7a3990355dd981c38c522996efa947a9ee51d311d`；脚本一次actualNodeExit0。

私人页121/122观察到独立participant `0000000000000001000000000000000f` / `00000000000000010000000000000011`，共同world `0000000000000001`，Running/match1。V9单调阶段negotiating→active为A952.0ms、B901.3ms。最初Self为合法participant观察态、authorityTick0/inputclosed，随后新生命进入可输入态；这些0与换绑没有被补造为worldclock。所有指定cuts的faultCount为0。该事实不是单凭HUD8人作准入判定，也不替代整个服务身份验收。

各端保留下来的真实export accepted共27次、InputCommand实发27次。A实发attachment epochs为12/14/20/22；B为14/16/18/20。按真实wire Welcome epoch、socket和sequence匹配后，有A26/B25次后续直接WorldChange收头带不小于该发包sequence的appliedInputSequence。它们仅为received header；不主张客户端已应用ACK，也不从sessionGeneration1推导attachment epoch。未匹配的3项保留UNPROVEN，没有以跨代后续包补足。

双向短按位移的最清晰共同证据来自round0：

- A生命 `0000000000000001000000000000017f`，固定x3.5，z5.5→5.32499981→5.14999962→5.5。实际Up/Down输入前后，两端均观察到同3个位置及两种z变化方向。
- B生命 `00000000000000010000000000000158`，固定x1.5，z17.5→17.3250008→17.1500015→17.5，两端也均看到同3个位置及两种方向。
- round1 B新生命 `00000000000000010000000000000198` 与round2 A新生命 `0000000000000001000000000000019c` 同样分别在各自固定x下看到z往返；每个窗口双方都看到相同3个位置。round2 B198也再次往返。

round1 A仍17f时，两端仅保留(3.5,5.5)这一位置，after已变participant0f/AwaitingRespawn/inputclosed，随后生命19c恢复可输入。这个窗口保留为受阻或未证实步进加死亡换绑，不计为移动通过；没有把不同生命的出生位置当输入跳变。before/after跨度是多次权威快照，不能将稀疏记录归因到唯一命令。全程仅真实离散keydown/up，不宣称held-key或连续15秒步行验收。

共同完整真人炸弹身份如下，均来自实际dumpPositions/replicaState字段，双方至少一次看到：

| Bomb完整ID | Owner完整participantID | SourceLife完整ID |
|---|---|---|
| `00000000000000010000000000000130` | `0000000000000001000000000000000f` | `00000000000000010000000000000114` |
| `0000000000000001000000000000018b` | `0000000000000001000000000000000f` | `0000000000000001000000000000017f` |
| `00000000000000010000000000000192` | `00000000000000010000000000000011` | `00000000000000010000000000000158` |
| `000000000000000100000000000001a4` | `00000000000000010000000000000011` | `00000000000000010000000000000198` |
| `000000000000000100000000000001ae` | `0000000000000001000000000000000f` | `0000000000000001000000000000019c` |

没有推断SourceGeneration、ordinal身份或缺失字段。B05生命125上的Space虽有实际accepted/export与send记录，本次没有该生命的双端共同炸弹证据；不将每个accepted调用都当作成功生成炸弹，也不从稀疏尾部宣称产品失败。双方成功共弹已有round0/round1的实际完整身份。

导出appliedInputSequence只按同生命保留观测推进：A ed0→4、1140→6、17f0→9、19c0→7；B fd0→4、1250→4、1580→5、1980→10。跨生命观察态的0重置原样保留。这些是实际export值变化，不是已资格化Client-applied ACK耗时，更不是服务端实际执行clock。

本报告只闭合本批双向离散位移与双方真人炸弹观察事实；首次ordinary119/120关闭历史、十次后续重进、连续按键、卡顿及静默性能由Root的其他实际窗口另行验收，不在此报告合并或推定通过。完整引擎保持16，17仅UI消费版本。
