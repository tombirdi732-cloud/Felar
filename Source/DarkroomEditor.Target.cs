using UnrealBuildTool;

public class DarkroomEditorTarget : TargetRules
{
	public DarkroomEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("Darkroom");
	}
}
