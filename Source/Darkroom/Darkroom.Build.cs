using UnrealBuildTool;

public class Darkroom : ModuleRules
{
	public Darkroom(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"AIModule",
			"GameplayTasks",
			"NavigationSystem",
			"UMG"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore"
		});

		// Позволяет писать #include "Player/DarkroomCharacter.h" вместо относительных
		// путей вида "../../Player/DarkroomCharacter.h".
		PublicIncludePaths.Add(ModuleDirectory);
	}
}
