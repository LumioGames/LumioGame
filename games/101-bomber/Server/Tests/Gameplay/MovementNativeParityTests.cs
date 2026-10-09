using System;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class MovementNativeParityTests
{
    [Fact]
    public void AllTenFrozenBoardsReadBackEveryGroundAndObstacleCellFromProductionNative()
    {
        var fixture = Lumio.Bomber.Tests.MovementNativeParityFixture.Load();
        foreach (var scenario in fixture.Cases)
        {
            using WorldManager manager = BomberTestWorld.Start(withMap: false);
            var config = BomberConfigBinding.For(manager.World);
            Assert.Equal(checked((uint)fixture.ConfigRequirements.TickRateHz), config.Game.TickRateHz);
            Assert.Equal(fixture.ConfigRequirements.WaterSpeedPermille, config.Movement.WaterSpeedPermille);
            Assert.Equal(500, config.Movement.CornerAssistMilli);
            Assert.Equal(250, config.Movement.RepeatAssistMilli);
            Assert.Equal(6u, config.Movement.TurnBufferTicks);
            var sections = Lumio.Bomber.Tests.MovementNativeParityFixture.AuthorAndReadback(
                NativeWorldVoxelResources.Require(manager).Voxel, scenario.Map);
            Assert.Equal(4, sections.Length);
            Console.WriteLine(JsonSerializer.Serialize(new {
                scenario = scenario.Id, manager.WorldIncarnation, worldTick = manager.World.Tick,
                readbackCells = scenario.Map.Size * scenario.Map.Size * 2,
                sections = sections.Select(section => new {
                    key = $"{section.Key.X}:{section.Key.Y}:{section.Key.Z}",
                    section.Revision, section.Encoding, section.Sha256
                })
            }));
        }
        using Process process = Process.GetCurrentProcess();
        string nativeName = System.IO.Path.GetFileName(Lumio.Bomber.Tests.EngineRelease.NativeLibrary);
        string actual = Assert.Single(process.Modules.Cast<ProcessModule>(),
            module => module.ModuleName == nativeName).FileName;
        Lumio.Bomber.Tests.EngineRelease.ValidateNative(actual);
        Console.WriteLine(JsonSerializer.Serialize(new { selectedNative = actual,
            buildInfo = Lumio.Bomber.Tests.EngineRelease.NativeBuildInfo() }));
    }
}
