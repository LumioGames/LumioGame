# 本地14 runner/profile 独立复审

裁决：`ACCEPT_PRIVATE14_RUNNER_PROFILE_FILES_AND_ACTUAL_IMAGE_ONLY_STARTUP_BROWSER_PENDING`。1168项检查/raw0。Root可继续其原启动前置核查，复审没有调用preparer、runner、Platform、DS、browser或修改任何服务。

精确runner SHA `fc94e908283aa3b12c069dadcfe2a0e348d097118135c4099b08cb860901b209`，starter SHA `42f18cd333f730382b091429417cb829a37288fe5603e53971788433d83616ff`。新runner从已审13完整文本只替换profile、origin、V8 schema、generator SHA、measured main SHA五处，原imports、login委托、input options、DS_READY及全部guards逐byte不变。starter完整文本只替换profile/13→14标签/18087→18088端口，保留原 `$Start`显式启动门、compose原额度、loopback/project/官方测试profile判定；本复审没有传 `$Start`。

实际新profile `.run/platform-release-binding-01/local-test-profile-18088-14-01`，独立project `bomber-schema16-local14-18088`、loopback18088、DS18316。旧13签名六tuple及其余启动fields深比较全同；`expectedLauncherArgument`准确指向18088，旧13继承18086 metadata未继续传播。环境原byte相等，只记录hash未保存/显示信任材料。SQL只替换bundle URL，其余seed字节原样。official14 compose与完整14包逐byte一致，唯一overlay为127.0.0.1:18088:8080。真实Docker只读image inspect Id `sha256:fab3933b5a4f4c931097f787a451c1f3d73813ad44c8e0dddec44044cc3943b0` 与完整14manifest一致，未控制容器或旧端口服务。

ordinary/mounted/measured都为835文件，逐项源SHA、挂载SHA/bytes、V8除main外的SHA相同；ordinary main `3844b096b3200ce8031d33ffdc837cd1d00f377e7b60e1f046213d054d650a99`，V8 measured main `c79e0a7addfb32c53dde76da6f4f4c780e758b0c46537cc75ce506761c9bc168`，已独审的generator `45dc55f432d91d0764ac772e4a8912a96af074938cc61a7fbb4709572e1aa812`。独立runtime copy精确305 payload+manifest306磁盘文件，与正式14manifest逐SHA一致；正式不可变包未写入。全DS配置仅真实路径解析和固定loopback/port，Game registry实际SHA一致，world/voxel/预算/限额等整个配置深比较未变。

在实际runner原guard body上执行只读VM接缝，没有调用runLauncher：caller不能降低2Human+6Bot人数、改变平台/包或启动Platform。坏DS port、旧V7schema、错误measured SHA均拒绝；DS_READY wrong endpoint仍拒绝。六次synthetic immutable launch response委托均同对象返回、delegate一次，wrong response endpoint拒绝；这些是纯接缝测试，不是网络准入或实际签名票据验收。preparer在第一次mkdir之前已校验旧output不存在、来源manifest/835/V8身份，仍用wx保存新封件。

剩余启动条件明确：Root自行封存并停止旧13场景，检查18088/18101/18316监听状态，运行原完整compose render/新project无旧容器数据库判据以及当前官方schema CLI。复审只查询了实际image ID，没有代替这几项。真实2人房间、输入ACK/共同炸弹、性能提升、十次关闭新页及Publishing资格仍未由本报告确认。

证据 `.run/local14-runner-independent-review-01/review.mjs`、`result.json`、`image-readonly.json`。result SHA `312836e2e1d10a599dff3ee0577d582d9147b548b72de7c728da305ac430491e`，逐文件与source/preparation/identity SHA均记录，未打印认证内容。
