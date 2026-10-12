using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

/// <summary>First-life projection; fresh admission yields on bot due cuts so pending seat pairs cannot collide.</summary>
[AdmissionCreation(101, 101, "Admission/player.creation.json")]
public sealed class BomberAdmissionCreationDeclaration { }
