using System;
using System.Collections.Generic;
using Xunit.v3;

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>
/// 标记「经 <see cref="ServerWorldBoot.Boot"/> 启动服务端世界、因而需要 liblumio_engine_native」的用例，
/// 产出 xunit trait <c>RequiresEngineNative=true</c>。
/// <para>
/// 这只是一个标记，不是跳过：本地有 native 时照常执行，没有 native 照旧以 <c>LUMIO_ENGINE_NATIVE_MISSING</c> 失败。
/// 公开仓 CI 造不出 native（ADR-080；Owner 2026-09-23 不扩大 <c>LUMIO_CI_PAT</c>），所以 CI 的 <c>dotnet test</c>
/// 以 <c>--filter-not-trait RequiresEngineNative=true</c> 排除带标记的用例。
/// </para>
/// <para>
/// 带标记的集合必须与架构仓 <c>.spec/knowledge/standards/development-verification.md</c>
/// 「真 Native 覆盖豁免登记册」的 LumioGame 行逐条相等（ADR-114）；<c>eng/native-exemption-guard.mjs</c> 在 CI 里对账，
/// 多标、漏标、登记册多一行或少一行都红。给一条用例加或去标记，必须与登记册同批改。
/// 解除卡 R-00712（前置 R-00519 SDK 公开包）落地后，本标记、CI 过滤与守卫一并删除。
/// </para>
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
internal sealed class RequiresEngineNativeAttribute : Attribute, ITraitAttribute
{
    /// <summary>trait 名；CI 过滤与守卫按 <c>RequiresEngineNative=true</c> 取用。</summary>
    internal const string TraitName = "RequiresEngineNative";

    /// <summary>trait 值。</summary>
    internal const string TraitValue = "true";

    /// <inheritdoc />
    public IReadOnlyCollection<KeyValuePair<string, string>> GetTraits() =>
        [new KeyValuePair<string, string>(TraitName, TraitValue)];
}
