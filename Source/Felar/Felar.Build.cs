using UnrealBuildTool;

public class Felar : ModuleRules
{
	public Felar(ReadOnlyTargetRules Target) : base(Target)
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

		// Позволяет писать #include "Player/FelarCharacter.h" вместо относительных
		// путей вида "../../Player/FelarCharacter.h".
		PublicIncludePaths.Add(ModuleDirectory);
	}
}
