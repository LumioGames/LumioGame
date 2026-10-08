# 宝箱真实事件链独立审查

状态：本切片通过；完整浏览器视觉、音效与整局仍未验收。

范围为作者冻结的地形事务、事件目录、复制表现适配及五个测试文件。Root读生产路径，复核成功原批回执前不发开启；独立命中族只记一次；原回执拒绝不提前发奖励或增加拆块；源炸弹、Life/generation、chain保持原来源。三个资源tier与决赛强箱分别记录，表现强箱反馈只消费tier0，资源箱仍走已有地形差分反馈，不额外合成一次BrickDestroyed。

冻结`.run/chest-journal/freeze-01/manifest.json`的8项中7项当前SHA完全相同。事件目录第8项由Root有意修订：新增`ResourceCrateOpened`独立规范载荷以消除与`ChestOpened`共享canonical类型的问题；完整事件目录60项，44 Typed、14 Derived、2 Excluded，保留每类型唯一canonical断言。此修订不冒充原冻结字节，实际SHA见`root-independent-source-audit.json`。

独立执行当前cdab实际DLL：`BomberChestJournalTests` **6/6，0失败、0跳过，exit0**。覆盖真实ClientReplica接收逐字journal、强箱三次独立命中、原批拒绝/后续成功、木铁金tier。证据Game`.run/statistics-production/cdab-chest-independent-01.{log,json}`。Root同cut事件专项7/7及全量720/720也通过，未增加宽松映射或删除断言。

作者真实journal→表现/音频分发1/1、Terrain31、Circle20与完整表现667的历史证据保留。本审查不把这些夹具等同实际浏览器听感，最终正式Platform/DS/浏览器仍是交付门。
