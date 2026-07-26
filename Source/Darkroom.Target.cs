using UnrealBuildTool;

public class DarkroomTarget : TargetRules
{
	public DarkroomTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("Darkroom");
	}
}
