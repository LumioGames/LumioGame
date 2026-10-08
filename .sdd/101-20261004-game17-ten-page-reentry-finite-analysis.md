# Game17 / complete16 ten actual page reentries — finite readonly analysis

结论仅为十轮真实页面关闭后新建页面的准入与呈现链成立：121/122→123/124→125/126→127/128→129/130→131/132→133/134→135/136→137/138→139/140→141/142。不是刷新，也不是整个浏览器进程退出重开验收；后者当前UNPROVEN。

只读输入是Root指定的`reentry-01.json`至`reentry-10.json`及20张对应JPEG，未读服务日志、quiet、包/PDB或其他窗口。Root原件未改。新分析 `C:/Work/LumioGames/LumioGame/.run/live17-reentry-analysis-01/reentry-analysis-01.json` SHA256 `f04bca6df22a94e492fc1a106019bc83200265c8efb4184b99c585b93f763475`，脚本一次actualNodeExit0，含全部30原件路径/长度/hash、逐页原始单调时刻与完整身份。

每轮oldTabs与前轮newTabs连续，旧/新ID互不重合，每页timeOrigin也与其旧页不同。20个新页面均有独立`/api/player/launch`200、正式SuccessorAuthorization/Welcome收头、初始快照收头、Self及world可见、active与至少一次真实完成的game draw callback。截图后Probe均active/presentation.active、roster8、faultCount0，两端participant0f/11始终不同且world1相同。没有解码/保存认证凭据，不以HUD序号识别人，也没有仅用20个8人count替代前述流程证据。

| 轮次 | 新页A/B | A negotiating→active ms | B negotiating→active ms | 首Welcome epoch A/B |
|---|---|---:|---:|---|
| 1 | 123/124 | 701.2 | 401.1 | 27/30 |
| 2 | 125/126 | 972.4 | 693.3 | 32/34 |
| 3 | 127/128 | 723.7 | 639.6 | 33/37 |
| 4 | 129/130 | 694.4 | 763.0 | 34/38 |
| 5 | 131/132 | 744.9 | 963.8 | 35/39 |
| 6 | 133/134 | 837.9 | 743.8 | 37/42 |
| 7 | 135/136 | 822.3 | 712.7 | 39/43 |
| 8 | 137/138 | 1102.0 | 602.4 | 44/48 |
| 9 | 139/140 | 753.0 | 798.3 | 47/49 |
| 10 | 141/142 | 738.7 | 926.1 | 48/50 |

A平均809.05ms、中位744.9ms、范围694.4–1102.0ms；B平均724.41ms、中位712.7ms、范围401.1–963.8ms。epoch为真实Welcome字段，未用sessionGeneration1替代。

分阶段原始时间全部在派生JSON中。有限平均值为：starting→wasm-ready A508.75/B441.37ms；WebSocket open→Welcome A43.28/B38.32ms；Welcome→首Self观察A736.09/B662.00ms；Welcome→首world观察A735.67/B661.67ms；active→首真实game draw callback完成A680.98/B715.69ms。最后一项是CPU侧绘制回调完成，不是GPU呈现/首物理像素时间。页面选择/Root操作的等待仍与系统阶段分开，未将selecting阶段或closedAt→截图探针间平均8158.6ms、范围6581–10735ms叫negotiating。

18个首快照为2片WorldChangePart，各自transferId1、真实generation和index0/1收头齐全；另外2个为直接WorldChange（第1轮B、第6轮A的初始观察态）。分片头的全部收齐不是payload解码、Client已应用ACK或Native恢复完成事件。页面实际出现Self/world/active使流程后续已有呈现事实；精确DS执行准入时刻与Native恢复完成时刻在这些浏览器原件里没有事件，均明确UNPROVEN，不用JS收包时刻补造。Native voxel-world-create累计次数有实际记录，但不当作单次恢复计时。

输入资格与首屏成功独立：截图后第1轮A、第2轮B、第7轮A/B均为合法participant观察Self/AwaitingRespawn/inputclosed、characterName null。第5轮B在after探针关闭输入，截图后已新生命30c/Protected/inputopen；第10轮A同样由观察Self0f/authorityTick0变为391/Protected、authority13683/inputopen。第1/2轮after暂存presentation.closed或Tick0，也按原字节保留，稍后的截图探针已active/真实非零authority。没有声称每轮每人始终立即能操作或把观察态0修成worldclock。

20张截图均核验原始长度/SHA256和JPEG边界；独立目视第1A、第2B、第7A、第10A。第1A/第7A真实terrain及HUD可见，观察态生命/炸弹UI为0，不能叫可玩画面；第2B有死亡提示和其他玩家/炸弹；第10A有当前生命HUD及场上炸弹。其余16张只做hash绑定，未声称全量目视。动态CPU draw记录与截图共同证明新页首屏，不拿旧Running画面代替。

Root记录的closedAt及old/new页面链是本批实际页面关闭证据；这些JSON没有单独的旧页消失inventory，也没有整个浏览器进程退出、重新启动和新进程身份。因此本批有限结论不覆盖用户原始“关闭浏览器后重新打开”全过程，不能用它声称该更强场景已闭合。连续移动、输入ACK和卡顿性能也不在此窗口验收。Engine保持完整16，17仅普通UI消费版本。
