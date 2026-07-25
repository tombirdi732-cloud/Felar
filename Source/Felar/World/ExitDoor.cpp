#include "World/ExitDoor.h"

#include "Felar.h"
#include "Player/FelarCharacter.h"
#include "Core/FelarGameMode.h"

#include "Components/StaticMeshComponent.h"

AExitDoor::AExitDoor()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Mesh->SetCollisionResponseToAllChannels(ECR_Block);
}

int32 AExitDoor::GetRemainingFragments() const
{
	const AFelarGameMode* GameMode = GetWorld()->GetAuthGameMode<AFelarGameMode>();
	return GameMode ? GameMode->GetRemainingFragments() : -1;
}

bool AExitDoor::CanInteract_Implementation(AFelarCharacter* Interactor) const
{
	// Дверь остаётся интерактивной и запертой: игрок должен получить внятный
	// ответ "нужно ещё N", а не молчание.
	return Interactor && Interactor->IsAlive();
}

FText AExitDoor::GetInteractionPrompt_Implementation(AFelarCharacter* Interactor) const
{
	const int32 Remaining = GetRemainingFragments();

	if (Remaining <= 0)
	{
		return NSLOCTEXT("Felar", "ExitDoorOpen", "Выйти");
	}

	return FText::Format(
		NSLOCTEXT("Felar", "ExitDoorLocked", "Заперто. Осталось фрагментов: {0}"),
		FText::AsNumber(Remaining));
}

void AExitDoor::Interact_Implementation(AFelarCharacter* Interactor)
{
	AFelarGameMode* GameMode = GetWorld()->GetAuthGameMode<AFelarGameMode>();
	if (!GameMode)
	{
		UE_LOG(LogFelar, Warning, TEXT("ExitDoor used but GameMode is not AFelarGameMode"));
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
