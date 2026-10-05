namespace System.Runtime.CompilerServices;

/// <summary>
/// netstandard2.1 has no ModuleInitializerAttribute. Spectator wasm compiles
/// this assembly as ns2.1 so NativeLoader stays out of the browser graph.
/// </summary>
[System.AttributeUsage(System.AttributeTargets.Method, Inherited = false)]
internal sealed class ModuleInitializerAttribute : System.Attribute
{
}
