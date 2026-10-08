# Bomber 浏览器类型化权威捕获诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在完全保留正式 Runtime 类型化权威更新的条件下，测出捕获、字段接收、额度计账与写回的实际成本；只交付有界、默认关闭的私有诊断候选及证据，不交付性能修法。

**Architecture:** 从正式 Runtime `520ffe482e1c48fb6e48187925eecec986cdb9c8` 建新隔离树。默认关闭路径只增加一次静态开关分支，原方法正文保留为 Core；只有开关精确为 `1` 且命中第 64 次刷新时进入受测副本。探针不进入 World、Snapshot、协议或 Gameplay，测量方法与原方法去除诊断后的逐字相等是独立审核门。

**Tech Stack:** C# 14；Runtime `net10.0;netstandard2.1`；实际 .NET 10 浏览器 WASM；官方完整14 Native/WASM 与 SDK；BCL Stopwatch；现有 GAS typed prediction；Node 私有证据核验；xUnit/MTP 现有测试。

## Global Constraints

- 当前仅本计划和私有只读证据获得写权限。Root 阅读本计划、批准精确三个 Runtime 源后才能实施；不自行提交或启动现场。
- 新树固定 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeAuthorityCaptureDiagnostic`，分支 `codex/101-authority-capture-diagnostic`，起点精确 `520ffe482e1c48fb6e48187925eecec986cdb9c8`。现有 Runtime11Composition、Client14Composition、完整14及共享 Game 均不写。
- 生产源码只准两个既有文件和一个新探针。私有 fixture/test/script 位于父 Game `.run/browser-authority-capture-diagnostic-01/`，不入生产源码提交集；不改 Runtime 项目、公共 helper、生成物、GAS、ABI、Client、Game、pins 或 ledger。
- `LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG` 仅精确 `1` 开启，缺失、`0`、`true`、空白和带空格的 `1` 全部关闭。不得将浏览器页面上游 launcher 的环境继承当成 WASM 已开启的证据。
- 默认关闭热路：一次 `Enabled` 分支、一层 Core 方法调用；不读 TLS、不读时钟、不分配计时器/数组/委托、不写日志。开关第一次类型初始化读取环境属于冷路径，单独记载。
- 开启后每64次 `RefreshTypedAuthority` 采1次，最多64个采样窗口；每窗口固定8桶，最多两行日志，总计最多128行。窗口额度按当前程序集实例计，线程状态仅属于当前调用线程；不新增跨线程 World 访问。
- 不增减任何 World/预测输入，不跳过 `_inputs` 为空时的权威刷新，不放宽128MiB托管预测预算、64MiB Native预算、512记录或256访问上限，不减少8人/6Bot、体素或20Hz模拟频率。
- 探针只接收已有局部值的计数/额度字节参数；无额外 Native、Runtime 查询、字段值读取、实体枚举、配置读取、事件 payload、票据、连接字符串或身份日志。
- Probe 的时钟、格式化、Console 失败不能替换原执行结果或异常对象；只捕获探针自己的异常。生产 delegate 与原额度检查不 catch、不吞、不重排。
- 所有基准必须保存原始计时和实际输入身份。旧09 inclusive 计时只作历史线索，不能改标为当前14或新候选时间。Results/FinalCircle 与 Running 分开，禁止宣称旧13 Running 对新14 FinalCircle已有改善。
- Heavy build 先通知 Root/Reentry，真实 Running quiet 窗口时全停。此计划没有启动服务、浏览器或改变现有现场的步骤。

---

## 已核实入口及证据限度

实际 ordinary14 路径为 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/candidate14-build-01/browser-publish/wwwroot`。`main.js` SHA256 `3844b096b3200ce8031d33ffdc837cd1d00f377e7b60e1f046213d054d650a99`，现有代码仅 `await dotnet.create()`。实际 `_framework/dotnet.9zlumltchl.js` SHA256 `3b1b7283d50e308ee4f78584651060df0482f6190efdcf975d44d584916a5bde` 支持以下既有 builder API：

```js
withEnvironmentVariable(e,t){
  try{const o={};return o[e]=t,ve(ze,{environmentVariables:o}),this}
  catch(e){throw Xe(1,e),e}
}
```

这个 actual 文件的 `/*json-start*/.../*json-end*/` 内嵌配置只有 `mainAssemblyName/resources/debugLevel/globalizationMode/runtimeConfig`，没有 `environmentVariables`。publish 根 `Lumio.Bomber.Client.Spectator.runtimeconfig.json` SHA256 `9bde69bd45f1f301a7564814e0dc33a2bbc3ae3d665255bbb386433fd41b8031` 同样没有诊断环境配置；其 `System.Diagnostics.Metrics.Meter.IsSupported` 与 EventSource 均为 false，不能把 Metrics/Activity 当作当前可用浏览器测时通道。

只在 **新私有** measured bundle 中启用，正式835文件不动：

```js
const { getAssemblyExports, getConfig, runMain, setModuleImports } = await dotnet
  .withEnvironmentVariable("LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG", "1")
  .create();
```

关闭对照保留原 `await dotnet.create()`；另做精确 `0` 对照。不得用 query 参数、产品 UI、协议字段或 C# JSExport 新增这个开关。私人 generator 必须核 anchor 恰好1次、只改该调用；反拼后等于新的 ordinary 诊断消费 main。环境只能在创建 .NET Runtime 前设置，不能在第一次 Refresh 后设置。

当前实际调用为 `ClientSession.PublishAuthorityGroup → RuntimeJointPrediction.PublishAuthorityGroup → GasJointPrediction.ApplyAuthority/RebuildSelective → WorldManager.RefreshJointAuthority → RefreshTypedAuthority`。正式520中的方法名是 `RefreshTypedAuthority` 和 `World.CopyCapturedFields`，不存在 `ApplyTypedAuthorityFields`；本计划使用真实名称。

`IGeneratedComponent.CaptureSync` 已经用 `IPredictionFieldWriter` 传类型值，正式 GEN `CapturePersist` 遇此 marker 直接返回；不是整帧 JSON 或反射字段枚举。`field_sink` 必须明确包含 `IndexOf/Substring/TryGetSyncField`、writer 和容器快照，不能称为“纯筛选成本”。`write_dispatch` 包含 `FieldId` 获取、容器 `BoxedValue` 分支和真实 `generated.WriteField`，不是纯 GEN 方法体时间。

现有真实 C#→官方 WASM query harness `.run/wasm-v2-output-header-candidate-green-01` 只验证 Native query ABI；其托管调用运行在 CoreCLR，不能证明 BrowserWASM 的 Runtime 捕获成本。旧09 census 2588 fields/128 components/17 records 不等于当前 schema16 的实际计数。

## 文件映射与职责

| 写集 | 精确路径（相对新 Runtime 树） | 职责 |
|---|---|---|
| 修改1 | `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs` | 原 `RefreshTypedAuthority` 正文原字节移动为 Core；添加一分支 wrapper、受测副本及受测字段接收器；原 `AuthorityFields` 不改。 |
| 修改2 | `modules/ecs/src/Lumio.GameRuntime.Ecs/World/World.cs` | 原 `CopyCapturedFields` 不改，只添加 measured 副本。其它入口仍调用原方法。 |
| 新增3 | `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/AuthorityCaptureCostProbe.cs` | 唯一有界诊断状态、固定桶、采样、计时、数值日志和异常隔离。 |
| 私有测试 | `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-diagnostic-01/probe-fixture/{ProbeFixture.csproj,Program.cs}` | 直接链接新 probe，独立新进程验证 off/on、采样/cap、线程和异常。不得引用 fake World 或伪造 Native。 |
| 私有实验 | `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-diagnostic-01/runtime-fixture/{CaptureFixture.cs,NativeProgram.cs,WasmProgram.cs}` | 相同 Runtime 八实体夹具分别在实际桌面 Native 和实际 .NET BrowserWASM 执行。不是实际八人 Game 性能验收。 |
| 私有证据 | 同目录 `before/after/inverse/logs/raw/seal-01/` | 原始源码、精确diff、原反拼、退出码、PDB/SDK/Native绑定、原始时序和审核包。 |

基准原文件 raw SHA256：JointPrediction `b4f7d80000fb1234e2a5b037d0dbe6f40200d0e9f63deb8228faf4b0c7812375`；World `17e259003940305493824a56cd924b91d7b09d95767fe1c16dba19e7a0930fc3`。实施时先再核 actual HEAD/clean/raw hashes并保存原 bytes；CRLF/LF分别记，inverse 用原读入换行，不以换行归一掩盖其它差异。

## 固定桶与成本口径

| 桶 | 测量区间 | 可累积的同层片段 | 包含关系 |
|---|---|---|---|
| `refresh` | 整个受测 Core 工作，含原 finally 和尾部Project/Index | 每采样窗口恰好1次 | 包含下面所有实际发生的片段及探针热路开销；不含最终日志输出 |
| `structure` | 原Project(0)/allocator、detach、attach/adopt、CopyObserverProjection | 各互不重叠片段 | 包含局部ECS工作，不能当Native时间 |
| `generated_capture` | 一组件 CaptureSync+CapturePersist | 同组件/跨组件段 | 包含 `field_sink`，其中含嵌套 accounting |
| `field_sink` | MeasuredAuthorityFields.WritePredictionField 完整原体 | 每 marker 字段调用 | 包含真实 writer/container snapshot 和Reserve回调；不是pure metadata耗时 |
| `accounting` | 原ReserveScratch/ReleaseScratch调用，包括constructor256 | 每独立调用 | 常嵌套在 field_sink；本版不收bytes、不声称实际托管分配量 |
| `copy_fields` | World.CopyCapturedFieldsMeasured 完整原体 | 每组件copy | 包含write_dispatch |
| `write_dispatch` | 原每字段value分支与WriteField | 每字段尝试 | 包含FieldId、BoxedValue、GEN与SetSilent/AssignFromRemote |
| `finalize` | 原finally恢复标记/读cutoff及尾部Project/Index | 正常与异常路径段 | 未返回时也如实计成功到达的片段，不改异常 |

8桶是 inclusive。`capture+sink+accounting`、`copy+write`不能相加；也不能把所有桶相加称总时间。`structure/capture/copy/finalize`仍不是完整无缝 partition：fields ctor/dispose、foreach、registry查找、scope与时钟开销在外层；未测部分不能通过净相减归给Native或其它引擎。

`clock_calls` 是 probe 自己的 GetTimestamp 次数；`clock_pair_ticks` 测的是相邻两个 Stopwatch 读之间的间隔，不是准确总时钟成本。`bookkeeping_ticks_partial` 只记下方代码明确包住的入口/退出区间，不包含所有探针调用/构造/格式化。第一行之后第二行给本窗口第一行的format/write成本；**第二行自身的format/Console成本未测**。外层客户端 Tick 仍包含全部 probe 工作，禁止从它净减任何这些 partial 数值声称得到了“纯引擎耗时”。

---

### Task 1: 固定探针契约与正常私有回归

**Interfaces:** `AuthorityCaptureCostProbe.Enabled` 为冷初始化只读bool；`TryBeginGroup()` 返回值型 `Scope`，`Scope.Sampled` 明确本次是否采样；`Measure(Phase)` 返回值型Scope；`Entity()`/`Component(bool)`仅累加现有局部计数。没有委托、World引用或public产品接口。

- [ ] 保存原始3文件写集准入证据，确认新树不存在、基准index空、HEAD520ffe且clean，再建新树；不执行reset/clean：

```powershell
git -C C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition rev-parse HEAD
git -C C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition status --porcelain=v1
git -C C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition worktree add -b codex/101-authority-capture-diagnostic C:/Work/LumioGames/.101-pack07/LumioGameRuntimeAuthorityCaptureDiagnostic 520ffe482e1c48fb6e48187925eecec986cdb9c8
```

期待前两项为准确HEAD与空status。既定目录或分支已存在时只读核身份，另建带序号新目录和分支并记录，不覆盖任何原证据。

- [ ] 先写正常私有测试。`ProbeFixture.csproj` 如下，不降analyzers、不加 Runtime test-only接口：

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable><ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>14.0</LangVersion><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Program.cs" />
    <Compile Include="C:/Work/LumioGames/.101-pack07/LumioGameRuntimeAuthorityCaptureDiagnostic/modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/AuthorityCaptureCostProbe.cs" />
  </ItemGroup>
</Project>
```

`Program.cs` 完整测试体如下；这是采样/异常资格，不是Native性能证据：

```csharp
using System;
using System.IO;
using Lumio.GameRuntime.Ecs;

string mode = args.Length == 1 ? args[0] : throw new InvalidOperationException("one fixture mode required");
void Require(bool value, string name) { if (!value) throw new InvalidOperationException(name); }
var original = Console.Out;
var output = new StringWriter(System.Globalization.CultureInfo.InvariantCulture);
Console.SetOut(output);
try
{
    int sampled = 0;
    for (int i = 1; i <= 8192; i++)
    {
        using var group = AuthorityCaptureCostProbe.TryBeginGroup();
        if (group.Sampled)
        {
            sampled++;
            Require(i == sampled * 64, "sample_period");
            using var child = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.FieldSink);
            AuthorityCaptureCostProbe.Entity();
            AuthorityCaptureCostProbe.Component(transform: false);
        }
    }
    int expected = mode == "on" ? 64 : 0;
    Require(sampled == expected, "sample_cap_or_default_off");
    string[] lines = output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries);
    Require(lines.Length == expected * 2, "output_cap");
    foreach (string line in lines)
    {
        Require(line.Length <= 2048, "bounded_line");
        Require(line.StartsWith("LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG_V1 ", StringComparison.Ordinal), "fixed_header");
    }
}
finally { Console.SetOut(original); }
Console.WriteLine("PROBE_FIXTURE_PASS " + mode);
```

还须在 **新独立进程** 运行异常用例：`Console.SetOut(new ThrowingWriter())` 后在第64个group内部抛同一个 `InvalidOperationException primary`，`catch(Exception caught)` 必须 `ReferenceEquals(primary,caught)`；writer完整定义为 `sealed class ThrowingWriter : TextWriter { public override System.Text.Encoding Encoding => System.Text.Encoding.UTF8; public override void WriteLine(string? text) => throw new IOException("fixture_sink_failure"); }`。相同用例先把正文异常取消，group Dispose 仍必须正常返回；输出错误仅增加probe fault，不能造成Runtime故障。这些异常用例放新的私有 `Program-Exceptions.cs`，项目Compile选择其代替Program，不改probe加注入入口。

- [ ] 首先编译缺probe的RED：期待CS2001（源码不存在），记录为探针新增接口RED，不是Gameplay行为RED。然后按下方完整代码增加probe，再以正常 `dotnet build ... -c Release -p:ArtifactsPath=.../artifacts` 编译。运行off/on/0/true/space1各新进程，原始stdout/stderr/工具退出码与dotnet退出码分别保存；期待五项pass，只有on64窗128行。

- [ ] 新探针完整候选代码如下。只使用8固定数组/计数；Env读取和状态分配均不在off热路。窄 `CA1031` 抑制只限probe自身异常隔离，不改项目NoWarn。

```csharp
using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text;
using System.Threading;

namespace Lumio.GameRuntime.Ecs;

internal static class AuthorityCaptureCostProbe
{
    internal enum Phase { Refresh, Structure, GeneratedCapture, FieldSink, Accounting, CopyFields, WriteDispatch, Finalize }
    internal static readonly bool Enabled = ReadEnabled();
    [ThreadStatic] private static Window? _thread;
    private static int _claimed;

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Private optional diagnostics never replace application failures.")]
    private static bool ReadEnabled()
    {
        try { return string.Equals(Environment.GetEnvironmentVariable("LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG"), "1", StringComparison.Ordinal); }
        catch (Exception) { return false; }
    }

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Private optional diagnostics never replace application failures.")]
    internal static Scope TryBeginGroup()
    {
        if (!Enabled) return default;
        try
        {
            Window state = _thread ??= new Window();
            if (state.Active || state.Stopped) return default;
            state.Group++;
            if ((state.Group & 63UL) != 0) return default;
            int prior;
            do
            {
                prior = Volatile.Read(ref _claimed);
                if (prior >= 64) { state.Stopped = true; return default; }
            }
            while (Interlocked.CompareExchange(ref _claimed, prior + 1, prior) != prior);
            state.Reset();
            state.Number = prior + 1;
            state.Active = true;
            return Begin(state, Phase.Refresh, group: true);
        }
        catch (Exception) { if (_thread is Window failed) { failed.Active = false; failed.Stopped = true; } return default; }
    }

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Private optional diagnostics never replace application failures.")]
    internal static Scope Measure(Phase phase)
    {
        try { return _thread is { Active: true } state ? Begin(state, phase, group: false) : default; }
        catch (Exception) { if (_thread is Window failed) failed.Faults++; return default; }
    }

    private static Scope Begin(Window state, Phase phase, bool group)
    {
        long before = Stamp(state);
        long started = Stamp(state);
        state.BookkeepingTicksPartial += started - before;
        return new Scope(state, phase, started, group);
    }

    private static long Stamp(Window state)
    {
        long first = Stopwatch.GetTimestamp();
        long second = Stopwatch.GetTimestamp();
        state.ClockCalls += 2;
        state.ClockPairTicks += second - first;
        return second;
    }

    internal static void Entity() { if (_thread is { Active: true } state) state.Entities++; }
    internal static void Component(bool transform)
    {
        if (_thread is not { Active: true } state) return;
        state.Components++;
        if (transform) state.Transforms++;
    }

    internal readonly struct Scope : IDisposable
    {
        private readonly Window? _state;
        private readonly Phase _phase;
        private readonly long _started;
        private readonly bool _group;
        internal Scope(Window state, Phase phase, long started, bool group)
        { _state = state; _phase = phase; _started = started; _group = group; }
        internal bool Sampled => _state is not null;

        [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Private optional diagnostics never replace application failures.")]
        public void Dispose()
        {
            if (_state is not Window state || !state.Active) return;
            try
            {
                long ended = Stamp(state);
                int index = (int)_phase;
                long elapsed = ended - _started;
                if (elapsed < 0) { state.Faults++; elapsed = 0; }
                state.Counts[index]++;
                state.Totals[index] += elapsed;
                state.Maxima[index] = Math.Max(state.Maxima[index], elapsed);
                state.BookkeepingTicksPartial += Stamp(state) - ended;
            }
            catch (Exception) { state.Faults++; }
            finally
            {
                if (_group) { state.Active = false; Report(state); }
            }
        }
    }

    internal sealed class Window
    {
        internal readonly long[] Counts = new long[8];
        internal readonly long[] Totals = new long[8];
        internal readonly long[] Maxima = new long[8];
        internal ulong Group;
        internal bool Active, Stopped;
        internal int Number;
        internal long Entities, Components, Transforms, Faults, ClockCalls, ClockPairTicks, BookkeepingTicksPartial;
        internal void Reset()
        {
            Array.Clear(Counts, 0, 8); Array.Clear(Totals, 0, 8); Array.Clear(Maxima, 0, 8);
            Entities = Components = Transforms = Faults = ClockCalls = ClockPairTicks = BookkeepingTicksPartial = 0;
        }
    }

    private static string Name(int i) => i switch
    {
        0 => "refresh", 1 => "structure", 2 => "generated_capture", 3 => "field_sink",
        4 => "accounting", 5 => "copy_fields", 6 => "write_dispatch", 7 => "finalize",
        _ => "invalid",
    };

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Private optional diagnostics never replace application failures.")]
    private static void Report(Window state)
    {
        try
        {
            long formatStart = Stopwatch.GetTimestamp();
            var line = new StringBuilder(1024);
            line.Append("LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG_V1 window=").Append(state.Number)
                .Append(" group=").Append(state.Group).Append(" frequency=").Append(Stopwatch.Frequency)
                .Append(" inclusive=1 entities=").Append(state.Entities).Append(" components=").Append(state.Components)
                .Append(" transforms=").Append(state.Transforms).Append(" clock_calls=").Append(state.ClockCalls)
                .Append(" clock_pair_ticks=").Append(state.ClockPairTicks)
                .Append(" bookkeeping_ticks_partial=").Append(state.BookkeepingTicksPartial).Append(" faults=").Append(state.Faults);
            for (int i = 0; i < 8; i++)
                line.Append(' ').Append(Name(i)).Append('=')
                    .Append(state.Counts[i]).Append('/').Append(state.Totals[i]).Append('/').Append(state.Maxima[i]);
            string text = line.ToString();
            if (text.Length > 2048) { state.Faults++; return; }
            long formatEnd = Stopwatch.GetTimestamp();
            Console.WriteLine(text);
            long writeEnd = Stopwatch.GetTimestamp();
            string costs = string.Format(CultureInfo.InvariantCulture,
                "LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG_V1 cost_window={0} format_ticks={1} first_line_write_ticks={2} cost_line_excluded=1 report_clock_calls=3",
                state.Number, formatEnd - formatStart, writeEnd - formatEnd);
            if (costs.Length <= 2048) Console.WriteLine(costs);
        }
        catch (Exception) { state.Faults++; }
    }
}
```

Scope构造函数与Window均assembly-internal，不扩public接口。任何编译/analyzer失败先保留原日志，不通过改Runtime总NoWarn或关闭analyzers获得通过。

### Task 2: 三源插桩与原正文反拼门

**Files:** 上述精确3个Runtime源。**Produces:** off Core逐字不变，on measured去除允许增量后完整正文等于原Core，World原方法逐字不变。

- [ ] 将原私有 `RefreshTypedAuthority` 仅改名为 `RefreshTypedAuthorityCore`，其正文原 bytes 不动。在原位置前添加这个完整wrapper：

```csharp
private void RefreshTypedAuthority(World predicted)
{
    if (!AuthorityCaptureCostProbe.Enabled)
    {
        RefreshTypedAuthorityCore(predicted);
        return;
    }
    using AuthorityCaptureCostProbe.Scope group = AuthorityCaptureCostProbe.TryBeginGroup();
    if (!group.Sampled)
    {
        RefreshTypedAuthorityCore(predicted);
        return;
    }
    RefreshTypedAuthorityMeasured(predicted);
}
```

- [ ] 受测方法完整工作体如下，原代码所有查询/赋值/预算/控制路径保留。`structureScratch` 的原声明位置与生命周期不移入较短using块。

```csharp
private void RefreshTypedAuthorityMeasured(World predicted)
{
    PredictionStateLayers state = predicted.PredictionState!;
    ulong previousCutoff = predicted.PredictionReadCutoff;
    predicted.PredictionReadCutoff = 0;
    predicted.ApplyingRemote = true;
    try
    {
        using (AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Structure))
        {
            state.Project(0);
            predicted.ApplyPredictionAllocatorAuthority(World);
        }
        using var structureScratch = state.ReserveScratch(checked(256 + predicted.PredictionAuthorityIds.Count * 64L));
        using (AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Structure))
        {
            foreach (NetEntityId id in new List<NetEntityId>(predicted.PredictionAuthorityIds))
                if (!World.IsLive(id))
                {
                    predicted.Detach(id);
                    predicted.PredictionAuthorityIds.Remove(id);
                }
        }
        foreach (NetEntityId id in World.CreationOrder)
        {
            EntityRecord? source = World.Record(id);
            if (source is null) continue;
            AuthorityCaptureCostProbe.Entity();
            EntityRecord target;
            using (AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Structure))
            {
                target = predicted.Record(id) ?? predicted.AdoptRemappedAuthority(id) ?? predicted.Attach(id, source.EntityType,
                    predicted.RentComponents(source.EntityType), bind: true);
                predicted.PredictionAuthorityIds.Add(id);
            }
            for (int c = 0; c < source.Components.Length; c++)
            {
                AuthorityCaptureCostProbe.Component(source.Components[c] is LogicTransform);
                IGeneratedComponent? generated = EcsRegistry.Generated(source.Components[c]);
                if (generated is not null)
                {
                    using var fields = new MeasuredAuthorityFields(state, source.Components[c] as IGeneratedSyncMetadata);
                    using (AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.GeneratedCapture))
                    {
                        generated.CaptureSync(fields);
                        generated.CapturePersist(fields);
                    }
                    World.CopyCapturedFieldsMeasured(target.Components[c], fields.Writer.Fields);
                }
                if (source.Components[c] is ObserverComponent observer && target.Components[c] is ObserverComponent copy)
                {
                    using var observerScope = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Structure);
                    predicted.CopyObserverProjection(observer, copy);
                }
            }
        }
        predicted.Tick = World.Tick;
        predicted.ResolvePendingTransformParents();
        predicted.CopyTerminatedIdsFrom(World);
    }
    finally
    {
        using var finalize = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Finalize);
        predicted.ApplyingRemote = false;
        predicted.PredictionReadCutoff = previousCutoff;
    }
    using (AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Finalize))
    {
        state.Project(previousCutoff);
        predicted.RebuildAccountIndex();
    }
}
```

`structureScratch` declaration的额度表达式不改，也不为测它添加包住其Dispose的短作用域；其分配/释放暂为外层未单列成本。`predicted.Tick/ResolveParents/TerminatedIds`同样暂在outer，不伪称finalize涵盖整段。

- [ ] `MeasuredAuthorityFields` 复制原全部接口/字段/构造顺序，只包原Reserve/Release与marker方法。完整正文：

```csharp
private sealed class MeasuredAuthorityFields : IPersistWriter, IContainerFieldWriter, IPredictionFieldWriter, IDisposable
{
    private readonly List<PredictionStateLayers.ScratchCharge> _scratch = new();
    private readonly PredictionStateLayers _state;
    private int _released;
    private readonly IGeneratedSyncMetadata? _metadata;
    internal readonly SyncFieldCloneWriter Writer;
    internal MeasuredAuthorityFields(PredictionStateLayers state, IGeneratedSyncMetadata? metadata)
    {
        _metadata = metadata;
        _state = state;
        using (AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Accounting))
        {
            state.ReserveScratch(256, _scratch);
        }
        Writer = new(ReserveFieldScratch);
    }
    private void ReserveFieldScratch(long bytes)
    {
        using var accounting = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Accounting);
        _state.ReserveScratch(checked(bytes + 64), _scratch);
    }
    public void Dispose()
    {
        using var accounting = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.Accounting);
        _state.ReleaseScratch(_scratch, ref _released);
    }
    public void WriteString(string id, string? value) => Writer.WriteString(id, value);
    public void WriteUInt64(string id, ulong value) => Writer.WriteUInt64(id, value);
    public void WriteBoolean(string id, bool value) => Writer.WriteBoolean(id, value);
    public void WriteInt32(string id, int value) => Writer.WriteInt32(id, value);
    public void WriteNetEntityId(string id, NetEntityId value) => Writer.WriteNetEntityId(id, value);
    public void WriteContainer(string id, object value) => Writer.WriteContainer(id, value);
    public void WritePredictionField(string id, object? value)
    {
        using var sink = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.FieldSink);
        int dot = id.IndexOf('.');
        string field = dot < 0 ? id : id.Substring(dot + 1);
        if (value is ISyncContainer || (_metadata?.TryGetSyncField(field, out _) ?? false))
            Writer.WritePredictionField(id, value);
    }
}
```

原 `AuthorityFields` 保留，避免关闭路径每字段条件分支。没有收集bytes计数的生产代码，因此最终报告不得声称已统计实际bytes或分配量；此版只计accounting调用数与耗时。

- [ ] 在World原方法之后新增这个完整副本，原方法一字不改：

```csharp
internal static void CopyCapturedFieldsMeasured(Component dest, IReadOnlyList<SyncFieldCloneWriter.CapturedSyncField> fields)
{
    using var copy = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.CopyFields);
    IGeneratedComponent? generated = EcsRegistry.Generated(dest);
    if (generated is null) return;
    for (int i = 0; i < fields.Count; i++)
    {
        SyncFieldCloneWriter.CapturedSyncField field = fields[i];
        object? value = field.Value;
        using var write = AuthorityCaptureCostProbe.Measure(AuthorityCaptureCostProbe.Phase.WriteDispatch);
        if (value is ISyncContainer container)
            generated.WriteField(field.FieldId, container.BoxedValue, silent: true);
        else
            generated.WriteField(field.FieldId, value, silent: true);
    }
}
```

- [ ] 运行私有Node inverse gate。脚本只使用已封before文件与after文件；按完整方法文本切出wrapper/measured/nested measured/newcopy，先保存它们，删除新增块、把Core名称改回，剩余完整两个文件必须与before `Buffer.equals`。另将 measured 中新增using/计数去除、`MeasuredAuthorityFields`和`CopyCapturedFieldsMeasured`改原名、`EntityRecord target; ... target=`反拼为原声明，完整body须逐字等于原body。受测Nested类删除Scopes、还原原两条表达式体，去掉Measured名前缀后等于原完整类。新World副本删除两个Scope并改回原名称后等于原方法。不能仅比较Rust/C#tokens或忽略所有空白。

脚本必须对比原始完整表达式序列，尤其保留：`ReserveScratch(checked(256 + ...))`、`checked(bytes + 64)`、`value is ISyncContainer || metadata` 短路、Container/Scalar调用顺序、结构scratch生命周期、finally两个恢复写、尾部Project与Index。若反拼失败先保存失败结果，不通过泛化剥掉控制语句来“修”审核工具。

- [ ] 通知Root重编译开始，再对新 Runtime Ecs 原项目双TFM正常build，指定原正式Engine根、全新ArtifactsPath/NuGet/lock目录，关闭所有ALC/版本绕过；保留GEN/lock副作用不restore。运行现有 `GasJointPredictionTests` 相关正常类一次以及下一任务实际Native子例；新风险/失败才扩大。全部源码、inverse、测试日志、实际退出/PDB封新seal，停作者写，等待非作者；当前不stage/commit。

### Task 3: 实际CLR Native与BrowserWASM的同payload功能/成本对照

**Interfaces:** fixture只用现有 `LumioEngine.Start`、`CreateWorld`、`WorldManager.Enqueue/Tick/EnqueueLocalInput`、`VoxelGameplayBinding.Resolve`、真实 `OpenPrediction`、`GasJointPrediction.ApplyAuthority`。普通Default ALC。不得用`.run/wasm-v2...`单格query证明此任务已执行。

- [ ] 第一层实际Native资格原样执行现有 `RealNativeCompetingAuthorityReplaysPlacementAndUpdatesPhysicsTogether` 与 `RealNativeUnavailableInputUndoesItsCostAndKeepsEarlierPrediction`，on/off新进程各一次，设actual完整14Native路径，必须0skip、真实资源关闭。`LUMIO_VOXEL_PREDICTION_TEST_PATH` 仅那些明确使用test-support的其它case才需，不能把未提供该独立image的skip算通过。

```powershell
$env:LUMIO_ENGINE_NATIVE_PATH = 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-14/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll'
$env:LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG = '0'
dotnet test --project C:/Work/LumioGames/.101-pack07/LumioGameRuntimeAuthorityCaptureDiagnostic/modules/gas/tests/Lumio.GameRuntime.Gas.Tests/Lumio.GameRuntime.Gas.Tests.csproj -c Release --filter-method '*RealNativeCompetingAuthorityReplaysPlacementAndUpdatesPhysicsTogether*'
$env:LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG = '1'
dotnet test --project C:/Work/LumioGames/.101-pack07/LumioGameRuntimeAuthorityCaptureDiagnostic/modules/gas/tests/Lumio.GameRuntime.Gas.Tests/Lumio.GameRuntime.Gas.Tests.csproj -c Release --filter-method '*RealNativeCompetingAuthorityReplaysPlacementAndUpdatesPhysicsTogether*'
```

具体MTP filter语法先以当前runner help确认；若给出0tests/unknownarg，记录INVALID并改新的运行label，不把上面预定命令当已完成。公开原测试不改assertions，不借fake ContractSession绕过Native。

- [ ] 为同payload对照在私有fixture写下面共用完整body。其Registry为明确Runtime测试夹具，不是Game八人/fakeDS，不宣称产品入场通过。八个真实ECS实体、原typed builtin capture、真实nativeprediction + queued input路径必须成立。两端fixture各使用同一文件，编译进CoreCLR与独立BrowserWASM App，不改共享Host/JSExport。

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Ecs.Annotations;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Wire;

internal static class CaptureFixture
{
    internal static string Run(LumioEngine engine, byte[] catalog, bool queued)
    {
        var registry = new Registry();
        using WorldManager manager = engine.CreateWorld(new WorldCreationOptions(registry)
        {
            InstanceId = 41, Catalog = catalog, TickRate = 20,
            IngressBudget = new WorldIngressBudget(256, 1_048_576, 256, 1_048_576,
                predictionCapacity: 512, predictionMaxBytes: 128L << 20),
        });
        var ids = Enumerable.Range(2, 8).Select(i => new NetEntityId(41, (ulong)i)).ToArray();
        var creates = ids.Select(id => new CreateRecord("capturePlayer", id,
            new[] { new FieldValue(nameof(AttributeComponent), "healthBase", 10L) })).ToArray();
        manager.Enqueue(new WelcomeMessage(41, ids[0], 1, "capture-fixture"));
        manager.Enqueue(new WorldChangeMessage(1, 0, creates, Array.Empty<FieldChange>(),
            Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
        manager.Tick();
        HostVoxelWorldAdapter adapter = VoxelGameplayBinding.Resolve(manager)
            ?? throw new InvalidOperationException("real_voxel_resources_required");
        int opened = adapter.Abi.OpenPrediction(adapter.Handle,
            new VoxelPredictionConfig(64UL << 20, 512, 4096, 4096, 4096, 64, 4096, 1024, 256),
            out IVoxelPredictionSession? session);
        if (opened != 0 || session is null) throw new InvalidOperationException("real_prediction_open_failed:" + opened);
        using var gas = new GasJointPrediction(manager, session, "capture-fixture", 1, adapter);
        using IncrementalHash payloads = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        ulong last = 0, covered = 0;
        for (ulong group = 1; group <= 256; group++)
        {
            if (queued && (group % 16) == 1)
            {
                last++;
                var input = new InputCommandMessage(last, "capture-cost", ids[0],
                    ReadOnlyMemory<byte>.Empty, "capture-fixture", 1);
                payloads.AppendData(WireCodec.EncodePack(input, WireProfile.SuccessorBindingPartsV1));
                manager.EnqueueLocalInput("capture-fixture", last, input);
            }
            if (queued && (group % 16) == 8) covered = last;
            FieldChange[] fields = ids.Select(id => new FieldChange(id,
                nameof(AttributeComponent), "healthBase", (object)(10L + (long)(group % 5)), ChangeReason.Sync)).ToArray();
            var authority = new WorldChangeMessage(group + 1, covered, Array.Empty<CreateRecord>(),
                fields, Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>());
            payloads.AppendData(WireCodec.EncodePack(authority, WireProfile.SuccessorBindingPartsV1));
            gas.ApplyAuthority(() => { manager.Enqueue(authority); manager.Tick(); });
            long expected = 10L + (long)(group % 5);
            if (manager.World.Get<AttributeComponent>(ids[0]).GetBaseValue("Health") != expected)
                throw new InvalidOperationException("confirmed_authority_not_updated");
            long predicted = manager.PredictedWorld!.Get<AttributeComponent>(ids[0]).GetBaseValue("Health");
            if (predicted != expected - gas.OutstandingCount)
                throw new InvalidOperationException("typed_prediction_payload_changed");
        }
        if (session.Stats(out VoxelPredictionStats stats) != 0) throw new InvalidOperationException("native_stats_failed");
        string output = JsonSerializer.Serialize(new
        {
            queued, groups = 256, entities = ids.Length,
            inputPayloadSha256 = Convert.ToHexString(payloads.GetHashAndReset()).ToLowerInvariant(),
            tick = manager.World.Tick.ToString(System.Globalization.CultureInfo.InvariantCulture),
            confirmed = ids.Select(id => manager.World.Get<AttributeComponent>(id).GetBaseValue("Health")).ToArray(),
            predicted = ids.Select(id => manager.PredictedWorld!.Get<AttributeComponent>(id).GetBaseValue("Health")).ToArray(),
            outstanding = gas.OutstandingCount,
            nativeRecords = stats.RecordsOccupied,
        });
        gas.Dispose();
        if (gas.RetainedBytes != 0) throw new InvalidOperationException("prediction_not_closed");
        return output;
    }
    private sealed class Player { }
    private sealed class WorldEntity { }
    private sealed class Registry : EcsRegistry
    {
        public override RegistrySide Side => RegistrySide.Client;
        public override Type WorldEntityType => typeof(WorldEntity);
        public override ulong DeclaredTickRateHz => 20;
        public override IReadOnlyList<FieldAttributeDeclaration> AttributeDeclarations => Array.Empty<FieldAttributeDeclaration>();
        public override void CreateWorldServices(World world) => _ = new GasWorldContext(world);
        public override Component[] CreateComponents(Type type) => type == typeof(Player)
            ? new Component[] { new AttributeComponent(), new ObserverComponent(), new LogicTransform() }
            : new Component[] { new WorldSaveComponent() };
        public override string WireName(Type type) => type == typeof(Player) ? "capturePlayer" : "captureWorld";
        public override bool TryResolveEntityType(string name, out Type type)
        { type = name == "capturePlayer" ? typeof(Player) : typeof(WorldEntity); return name is "capturePlayer" or "captureWorld"; }
        public override bool IsEntityType(Type concrete, Type query) => concrete == query;
        public override bool TryApplyMappedInput(World world, InputCommandMessage input)
        {
            if (input.MappingId != "capture-cost") return false;
            AttributeComponent attribute = world.Get<AttributeComponent>(input.Sender);
            attribute.SetBaseValue("Health", attribute.GetBaseValue("Health") - 1);
            return true;
        }
    }
}
```

这里使用实际 `FieldChange(NetEntityId,string,string,object?,ChangeReason)` 与 `VoxelPredictionStats.RecordsOccupied` 签名。Native CreateWorld的world-entity初始化须先用当前完整SDK资格构建验证；任何构造/编译/fixture拒绝保存为INVALID_FIXTURE，不是捕获RED。修正只能私有fixture机械API，不改Runtime业务或公开guard；出现新语义需求先交Root，不用不真实helper“造绿”。框架Attribute builtin提供实际typed fields；此夹具没有当前Game128组件等负载，因此仅证明诊断on/off不改变相同payload结果/真实资源生命周期。

- [ ] CoreCLR入口使用正式 `LumioEngine.Start(actualNativePath, budget)`，BrowserWASM入口使用正式 `LumioEngine.Start(new EngineWasmPlatform(new EngineWasmTransport(Invoke), budget, ...))`，KernelConfig逐字复用正式Browser Program256MiB/65536handles/1024queued/64running/1024completion/4096mailbox/64contexts。两个入口均先读同一ordinary14 official-catalog.json，`Run(engine,catalog,false)`和`true`分别在新process/新page执行；不从bot目录复制DLL，不自定义ALC忽略版本。

BrowserWASM fixture是 **NEW独立私有App**，保留正式dotnet boot环境API和官方Engine wasmModule真实bridge。使用当前已接受transport bridge加载官方14WASM（SHA `668197d048c8c76fe7030c3907b5ec84acd5d05e330b41227258d7c9bd43dee6`），其 `Invoke` 直接delegate一次，不重写packet。不得把C#CoreCLR→NodeWASM桥结果标为托管BrowserWASM。fixtureAPI返回上述结果字符串，另独立Console收probe数值行；真Browser执行由Root指定新私有host/页，不加入产品入口。

- [ ] 对四种运行（CoreCLR off/on；BrowserWASM off/on）独立保存managed PE/PDB/完整closure、actualNative/WASM BuildId/ABI/hash、catalog及所有原input encoded bytes摘要、结果原JSON、每组实际挂钟/外层Tick。每对off/on的`inputPayloadSha256`/256 groups/confirmed/predicted/outstanding/nativeRecords/tick/cleanup必须完全等；跨平台先比较合法字段结果，不混平台时钟频率。on日志应约每64Refresh一窗，`ApplyAuthority`之外入队触发的Refresh也如实计，不用fixture loop次数假定实际group数。

- [ ] 第二层真实8人当前Game性能只能经非作者接受后官方完整私有诊断发行消费。新完整输入仅Runtimeroot/ref改私有候选，另外7个正式14源固定；不得加online readmission源码，不复用替换旧DLL。新Game消费22WebCIL/PDB/835、Runtime两个PDB源checksum/newprobe实际编入与完整305身份由另一agent核验。诊断 ordinary 和private measured off/on各自新目录，正式14原835保持。

Root安排的新Running八人现场：6真Bots+2真Human固定、Room/World/attachment/fullSelf按actual身份、真实相同阶段/负载；quiet无输入与真实持续move/ACK覆盖各≥15秒，实时收完整样本并冻结前缀。因为不同活局不能保证实际相同payload，**现场on/off只是配对阶段的观测，不冒充前面的exact-payload实验**。没有Running窗口则此层NOT_RUN，不用现Results数据代替。线上断开/下一生命修法属另任务，本计划不夹带。

### Task 4: 独审封件、撤回与数据判定

- [ ] 封 `seal-01/manifest.json`：3源码before/after原bytes、完整精确diff、所有inverse结果、私有测试source原sha、环境off/on/source准入、build/run真实退出、每项0skip、Runtime/PDB/Native/WASM身份、raw时序；诊断时钟与Console成本分项说明。任何INVALID保留，不覆盖标签。
- [ ] 作者停止生产源写。Root/非作者审核完整源码，明确 `ACCEPT_PRIVATE_DIAGNOSTIC_ONLY` 或REFUSE；不称解决卡顿、完整发布、产品可玩或正式性能验收。只有Root显式批准才允许3file whitelist commit与官方诊断完整包。
- [ ] 结束后的撤回不对整仓restore：在新树对本任务自己新增wrapper/Measured副本/probe做精确inverse补丁，原两文件须 raw `Buffer.equals(before)`，新增probe只在确认确为本任务自有文件且封件已保存后删除。任何后续他人修改导致before匹配失败，停止逆写并报告，不覆盖。正式14与共享Game无诊断字节，从未需要撤回。
- [ ] 性能结果只解释实际样本区间。优先核当前typed field counts/每桶calls/outergroupmean/p95/max、sampled周期与真实DS20Hz；列与旧09相同命名但不同source的区别。`generated_capture`高说明捕获大桶，不能自动归给container/Substring/Native；`write_dispatch`高也不证明可跳过未变化字段。任何候选性能修法另立最小TDD/所属仓审核，不在本计划实施。

## 计划自审与当前状态

- 此计划只描述Runtime捕获私有诊断，未夹带Server重进、GameOutcome、Gameplay移动、UI observer、trace capacity或quota变更。
- 三生产文件、真实方法名、wrapper/Core与measured去诊断完整inverse、off/on开启方式、采样/cap、异常隔离、成本口径、同payload资格与真正Running数据限度均已定义。
- 上文代码为等待审核的候选计划，不是已编译/测试/发包代码。当前全部Runtime/Client/Game生产和测试源码0写，0构建、0服务/浏览器操作；环境API仅从实际14bootstrap源码静态实读。
- 两次bootstrap行政读取把无marker的minified模板/带`/*json-start*/`对象直接JSON.parse失败，仅影响只读检查脚本；最终按实际两个comment boundary解析成功。未对任何文件改字节，未给失败运行qualification。
- 后续执行使用subagent-driven-development；当前4槽已占用，Root分配非作者独审，作者不可自审自身候选。先发本计划绝对路径/sha及3文件map给Root，等待明确源码准入，不自动执行skill的通用handoff。
