# 完整14真实浏览器冻结证据独审

裁决：`ACCEPT_FROZEN_FACTS_PARTIAL_BROWSER_EXPERIENCE_NOT_FINAL_ACCEPTANCE`。本次可接受115份冻结原件的完整性、十次真实关闭旧页并创建新页、合法NULL观察者首屏绘制及双端共同炸弹事实。不能据这些原件宣布持续移动、不卡顿、全流程可玩重进或正式交付已通过。

独审者为非本轮浏览器操作者；只读取冻结copy和既有源资格，不操作浏览器、服务、输入，不构建，不写生产、测试、pins或ledger。全部新证据位于父仓 `.run/live14-experience-independent-review-01`。`analysis.json`保留完整时刻、实体ID、逐cycle观察和统计；`freeze-verification.json`保留115项重新计算的哈希与大小。

## 输入完整性与身份

- 冻结清单SHA256：`33fd3d57babdff609974f24289ac582f419e5e046917e511c50dc04cf5e4370b`。
- 115份copy、129,320,781 bytes，逐项真实字节数及SHA256均与清单吻合。mutable日志只是所捕获的不可变前缀；不把它们宣称为已经停止的完整日志。
- 冻结完整14 manifest实际SHA256：`65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9`；V16模块`11fa0f860f8e008c7c83558b5e5bd9a62374b406631d012b580a1f2f4613fa0d`；ledger`8d72fdf3885ac679d7f5804fd9517fb63dc4cab317918f665b1a6923053305c4`。冻结官方CLI raw exit为0。发行/消费的深入身份资格见既有完整14与消费者独审；本报告不替代该资格。
- 该CLI实际为bootstrap-audit，supportedInventoryConsistent=true/diagnosticCount=0，但freezeEligible=false；B135/F/P/T/release-decision/successor-binding/tag仍pending。独审首seal错误断言freezeEligible=true导致行政失败；原`seal.mjs`、`seal-01-invalid.log`及raw1保留，未动原件或生成接受结果。新seal-02按实际flags记录，不把行政失败计为体验失败。
- 实际DS前缀中的room为`room-bomber-v16-local`，浏览器真实world为`0000000000000001`。A完整participant为`0000000000000001000000000000000f`，B为`00000000000000010000000000000011`，两者不同；初次A61/B62及十次新A页均保留相应participant与同world。六份Bot准入日志分别显示真实进程handshake/ticket接受；未以SERVING或HUD人数作为体验通过条件。

## 初次进入：保留阶段与人工等待边界

下表均为各页`performance.now()`的实际毫秒；A timeOrigin=`1791086812645.6`，B=`1791086813087.3`。

| 事件 | A61 | B62 |
| --- | ---: | ---: |
| starting | 142.8 | 150.2 |
| wasm-ready | 703.8 | 652.3 |
| selecting | 1076.6 | 890.4 |
| `/api/player/launch` fetch start→end，HTTP200 | 9512.1→9618.9 | 9346.3→9434.3 |
| negotiating | 10002.8 | 9825.2 |
| 实际WS created→opened | 10014.7→10024.4 | 9835.4→9843.6 |
| 首Welcome received，epoch1 | 10067.3 | 9878.9 |
| 首Native world观察 | 10687.1 | 10546.7 |
| 首Self/participant读取 | 10687.4 | 10547.0 |
| 后续C# selectCharacter命令accepted | 10689.0 | 10548.1 |
| active | 10691.8 | 10550.3 |
| 首completed draw的完成at | 11141.3 | 10961.8 |

starting→wasm-ready为561.0/502.1ms；真正negotiating→active为689.0/725.1ms；Welcome→Self读取620.1/668.1ms；active→首completed draw完成449.5/411.5ms。launch fetch自身为106.8/88.0ms。

selecting→launch fetch长达8435.5/8455.9ms，包含Root实际选角与工具操作等待。原件没有单独的Start click时刻；C# selectCharacter是准入完成后提交的实际角色命令，不能冒充开始点击。因此不能把页面总约10.7/10.6s全部归系统协商，也不能只用约0.7s协商段替代页面从加载到可见的实际总时间。初始WorldChange/Part头没有被V8正确记录，分片次数与每一分片时刻仍未证明。

## 十次真实关闭与新页

每次`real-close.json`的实际inventory只保留B62，旧A页ID确实不存在；after原件的A页ID不同且拥有新的WS/Welcome、Native world/Self、active阶段、实际completed draw（drawCalls>0），而非刷新旧页或复用旧Running截图。

| 次序 | 真实close旧页→新页 | negotiating→active(ms) | after A authority / presentation | 后续同页checkpoint |
| --- | --- | ---: | --- | --- |
| 1 | 61→63 | 564.5 | 9148 / active | 9148 / active |
| 2 | 63→64 | 512.1 | 9204 / active | 10139 / active |
| 3 | 64→65 | 475.1 | 10206 / active，NULL观察Self | 新Welcome38转life后0 / closed |
| 4 | 65→66 | 1026.6 | 10351 / active | 10366 / active |
| 5 | 66→67 | 869.1 | 0 / closed | 11572 / active |
| 6 | 67→68 | 681.6 | 0 / closed | 11668 / active |
| 7 | 68→69 | 662.8 | 11772 / active | 13163 / active |
| 8 | 69→70 | 742.5 | 13227 / active | 13238 / active |
| 9 | 70→71 | 462.1 | 0 / closed，观察Self→life切换 | 13393 / active |
| 10 | 71→72 | 892.4 | 13494 / active | quiet-start15660 / active |

N1第一次after捕获曾用已关闭的61句柄失败：这是清单明确保存的行政采样失败，不能算成功证据，也不能算游戏准入失败。独审接受的是真实新63的`recovered-stale-capture`，其fresh Welcome/身份/绘制事实完整；因为采样在约49.6s才恢复且绘制600尾cap，最初首绘制的具体时刻已不在原件中，不能反推为38.3s首屏。

N3初始Self等于完整participant0f、characterName=null、inputEnabled=false/inputOpen=false、lifePhase=AwaitingRespawn，仍真实完成两次绘制，并在10206时得到active presentation。独立查看`reentry-03-after-new-page-A.jpg`：真实地形/HUD/roster可见。因此此前NULL观察者因为`initialSelectionPending`而全空的特定首屏接缝有实际GREEN；此结论不授予观察者输入，也不要求伪造角色。

N3后续、N5/N6/N9的立即cut中有新Welcome/生命重绑与authority0/presentation.closed采样。N5/N9截图仍有实际地形/角色/炸弹绘制，不能把一个manager状态直接称为实际空白；也不能把之前一次成功绘制称为此后每帧都正常。N5/N6/N9后续同页恢复active的checkpoint存在，N3在下一次关闭前仍处于新life的0/closed。原件不足以测出每次重绑停顿的完整持续时间，故十次均“准入及至少一次真实首屏”可接受，十次持续流畅、全部即时可玩未闭合。

B62始终未关闭。个别cut的B authority0同样处于生命切换，不能据该单点认定DS暂停；DS实际commit前缀持续推进，之后B及A authority继续增加。不可从HUD固定八行或ordinalPlayer名推出身份/生存人数。

## 双方共同炸弹及真实输入/序列观察

08-space-cut3及4独立保留两端相同完整实体，而不是仅计数或截图颜色。

| 完整Bomb ID | 完整owner participant | 完整sourceLife ID | 同位置 |
| --- | --- | --- | --- |
| `000000000000000100000000000001b2` | `0000000000000001000000000000000f` | `000000000000000100000000000001a8` | (3.5,15.5) |
| `000000000000000100000000000001b3` | `00000000000000010000000000000011` | `000000000000000100000000000001a7` | (13.5,5.5) |

源life恰为各自当时真实Self，owner恰为各自participant；A、B两端actual dumpPositions均包含两颗完整ID/owner/sourceLife、相同坐标。SourceGeneration没有实际字段，保持UNPROVEN，不由ID、Welcome epoch或ordinal推断。

A实际button press/release accepted为252459.4/252462.6，发出seq1/2为252609.1/252609.3，正式attachment epoch27、observedSelf=sourceLife1a8；B accepted为252081.2/252086.2，发出252184.5/252184.8，epoch25、Self=sourceLife1a7。两端在原有C# playerState export中读取到AppliedInputSequence≥2，Self未变，且读取时最近真实Welcome仍匹配27/25。这支持真实输入进入后续权威projection/序列确认。

send→首次上述export观察的上界为A243.1/242.9ms、B235.7/235.4ms。它们是**发送至采样看到已应用序列**，包含取样延迟；不是精确wire ACK延迟，也不是唯一单按键端到端延迟。press/release近邻两命令不被强制归因到单batch。DS operation-result按time/gen/seq的候选保存在analysis中，但探针未给connection ID，未宣称唯一route绑定。07的等待超时不构成共同弹PASS，cut3/4是独立实际成功证据。

## 位移证据缺口

05→06不能验收新输入后同生命位移：A两cut的sample.at都为145203、authority3263、Self完整f0、pose(17.5,9.5)，整段还是旧DOM导出；B06仅在145138.3刚记录sendMove accepted，sample145146.3尚未出现新send，Self完整f4与pose(11.5,7.5)未变。两body在05内已从默认创建坐标跳至这些位置，变化早于本轮新输入，不能归新按键。

08-before保存之后真实发出A145566.3的gen17/seq1/Self完整f0，以及B145244.9的gen13/seq1/Self完整f4。07/08的80条pose尾已不含这两life，不能再配到post-send同生命pose。故这些指定cut可证明accepted→send，不能证明双向位移、连续按住行走或确认输入后的平滑性。短按turnPressed=true在实际Server solver中也能推进位置，不因该bool否定移动；本次拒绝验收的原因是实际因果序列缺证据。不存在为了测试让输入通过或手注客户端状态的操作。

## quiet09→10性能及剩余长帧

quiet共同实际epoch窗口为`1791087577708.8→1791087640637.2`，约62.9284s。两端均FinalCircle；A固定life3a2/AwaitingRespawn，B由life448/Vulnerable转participant11/Eliminated。不能和旧完整13 Running不同负载场景比较后宣称优化改善。

600尾cap使最后Tick大约30s、绘制约11s被保留；因此精确共同、完整可保留Tick及CPU绘制窗取`1791087629506.5→1791087640608.1`，11.1016s，而不是把尾均值冒称整个63s均值。

| 同11.1016s窗口 | A72 | B62 |
| --- | ---: | ---: |
| Tick实际行数 / 频率 | 221 / 19.907Hz | 222 / 19.997Hz |
| Tick mean / p95 / max(ms) | 10.985 / 22.4 / 33.1 | 11.299 / 14.6 / 20.4 |
| Tick start gap mean / p95 / max(ms) | 49.995 / 58.1 / 61.5 | 50.001 / 56.5 / 63.0 |
| 每Tick Native调用mean | 32.018 | 32.018 |
| Native wrapper调用体mean(ms) | 0.163 | 0.199 |
| completed draw次数 / 频率 | 592 / 53.326Hz | 594 / 53.506Hz |
| completed draw体 mean / p95 / max(ms) | 1.291 / 2.0 / 2.5 | 1.281 / 1.8 / 2.5 |
| draw-start gap mean / p95 / max(ms) | 18.757 / 39.5 / 55.1 | 18.706 / 35.7 / 45.9 |

DS实际commit在整个quiet窗1258行，从15664推进16921，间隔mean49.998/p9564/max71ms，约20.0006Hz。Quiet UI累计completedDraw增3333/3299，longTask累计增8次/495ms与11次/1358ms。longTask80条尾不是总数；这里使用单独累计计数差，仅代表累计采样端点范围，不能给每个早期longTask精确归因。

整个冻结采样（非不截断全session）仍见A重绑outerTick1350.7ms：591个Native调用、25次HFSM、522次clock，Native wrapper调用体合计12.3ms；B初始outerTick965.7ms：31HFSM、899clock、992调用，调用体9.1ms。实际非Native剩余层无法通过相减就归属某组件，因为outer包含C#/JS/观测与调度，wrapper计时排除自身bookkeeping。Native call数能提示一次外Tick内多个replay步骤，但本报告未作新根因裁决。

两端可见性原件保持visible，projectionFaults及faultCount均0。期末DOM677074/751719 bytes，serialization所统计仅JSON stringify部分（A mean3.814ms，B600尾mean4.872ms），不覆盖整个observer开销，未净减。CPU completedRender不能称GPU显示FPS。V8没有WorldChange/Part头是已实证成员顺序定位缺陷；实际socket收帧、C#authority与DScommit均持续，故不将漏头归协议或ACK故障。

## 保留未闭合项

本次不批准持续移动/不卡顿的体验结论；不批准每次life重绑持续无中断；不批准精确单input端到端ACK延迟、WorldChange/Part应用时序或SourceGeneration；不覆盖既有长时间离线fatal、跨局长期稳定性及其他正式交付缺口。后续V9新测量必须另立证据，不能回填或修改这115份V8原件。
