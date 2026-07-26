#include "World/ExitDoor.h"

#include "Darkroom.h"
#include "Player/DarkroomCharacter.h"
#include "Core/DarkroomGameMode.h"

#include "Components/StaticMeshComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/StaticMesh.h"

AExitDoor::AExitDoor()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Mesh->SetCollisionResponseToAllChannels(ECR_Block);

	// Заглушка размером с дверь: 20 x 110 x 210 см. Пивот у пола, чтобы дверь
	// ставилась на уровень заподлицо, а не наполовину в нём.
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMesh(
		TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeMesh.Succeeded())
	{
		Mesh->SetStaticMesh(CubeMesh.Object);
		Mesh->SetRelativeScale3D(FVector(0.2f, 1.1f, 2.1f));
	}
}

int32 AExitDoor::GetRemainingFragments() const
{
	const ADarkroomGameMode* GameMode = GetWorld()->GetAuthGameMode<ADarkroomGameMode>();
	return GameMode ? GameMode->GetRemainingFragments() : -1;
}

bool AExitDoor::CanInteract_Implementation(ADarkroomCharacter* Interactor) const
{
	// Дверь остаётся интерактивной и запертой: игрок должен получить внятный
	// ответ "нужно ещё N", а не молчание.
	return Interactor && Interactor->IsAlive();
}

FText AExitDoor::GetInteractionPrompt_Implementation(ADarkroomCharacter* Interactor) const
{
	const int32 Remaining = GetRemainingFragments();

	if (Remaining <= 0)
	{
		return NSLOCTEXT("Darkroom", "ExitDoorOpen", "Выйти");
	}

	return FText::Format(
		NSLOCTEXT("Darkroom", "ExitDoorLocked", "Заперто. Осталось фрагментов: {0}"),
		FText::AsNumber(Remaining));
}

void AExitDoor::Interact_Implementation(ADarkroomCharacter* Interactor)
{
	ADarkroomGameMode* GameMode = GetWorld()->GetAuthGameMode<ADarkroomGameMode>();
	if (!GameMode)
	{
		UE_LOG(LogDarkroom, Warning, TEXT("ExitDoor used but GameMode is not ADarkroomGameMode"));
		return;
	}

	if (GameMode->GetRemainingFragments() > 0)
	{
		// Дёрганье запертой двери шумит — это осознанная цена за проверку выхода.
		if (Interactor)
		{
			Interactor->EmitNoise(ENoiseLevel::Loud);
		}

		OnLockedRattleBP();
		return;
	}

	OnDoorOpenedBP();
	GameMode->FinishGame(EGameOutcome::Escaped);
}
