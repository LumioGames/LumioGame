# Old14 CLR读取器容量行政纠正

原唯一实际取证由Root执行，`C:/Work/LumioGames/LumioGame/.run/live14-current-clr-root-collect-01/run-result.json`记raw20，07:24:09.6385831Z→07:24:12.0537061Z，未产生currentJSON；日志只有COLLECTION_REFUSED:BudgetException。不能把它称为游戏RED或12秒timeout。

原读取器的 `_successors` 数组最大长度设1024是作者准备错误。正式523c架构源 `engine/wire/generated/SuccessorBindingContract.g.cs:21` 的MaxReservationsPerWorld=4096；对应successor-binding-v1.json:38同4096。我又对旧DS实际加载Ecs SHAab5da26d1329e2e7671a1ad4c01a85bcf28a4ccee7b58e9e53cc149382b393e9做离线反编译，字段初始化确为SuccessorReservation[4096]，而不是基于configured有效记录数裁剪这个数组。读取器一旦到此数组必然以1024拒绝；原日志没有stage投影，故不额外声称它证明了所有更早guard通过。

Root授权NEW tool02唯一把该数组读取上限1024改4096。没有改变Game/Runtime/Native额度、守卫、数组内容或输出上限，没有增加诊断字段/日志/stage、API/fixture或Heap遍历。tool02从原seal-01/source逐byte复制；只有CaptureReader.cs一处替换，whole-source inverse完全还原174d...；其余九文件完全相同，包括三源码、csproj/props/targets/config/guard/正常lock。原tool01、artifacts02、seal-01与actual失败均未覆盖。

tool02 CaptureReader SHA562b9e5a7446c84eda61f3cdc7237d3b5bf7c379829bc623da0c980d5b44b026；其余源和guard继承原封件。新正常tool02-build01 raw0/zero warning/error，5.83秒；该实际DLL --plan/--self-test两项均0，未获取target/执行snapshot。正常工具仅引用已装ClrMD全managed依赖图，私有artifacts-tool02/cache，不安装组件、不编译Native或Game。

NEW seal-02绑定四C#真实PDB/PE和全部正常工具输出，source停止写入，裁决仍仅PREPARED_ADMIN_CORRECTION_PENDING_ROOT_REVIEW。Root接受后自己执行唯一新collect；本作者不执行。PSS/DAC无硬取消、12秒检查式deadline、64KiB有限typed输出、零Game/Native API、当前snapshot不能冒充death13560历史证据等边界完全沿用原已审源。
