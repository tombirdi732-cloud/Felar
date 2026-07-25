#include "World/HidingSpot.h"

#include "Felar.h"
#include "Player/FelarCharacter.h"
#include "Player/FearComponent.h"

#include "Components/StaticMeshComponent.h"
#include "Components/SceneComponent.h"

AHidingSpot::AHidingSpot()
{
	// Тик нужен только пока внутри кто-то сидит — включается в Interact.
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Mesh->SetCollisionResponseToAllChannels(ECR_Block);

	HidePoint = CreateDefaultSubobject<USceneComponent>(TEXT("HidePoint"));
	HidePoint->SetupAttachment(Mesh);
	HidePoint->SetRelativeLocation(FVector(0.f, 0.f, 20.f));

	ExitPoint = CreateDefaultSubobject<USceneComponent>(TEXT("ExitPoint"));
	ExitPoint->SetupAttachment(Mesh);
	ExitPoint->SetRelativeLocation(FVector(120.f, 0.f, 20.f));
}

void AHidingSpot::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!IsValid(Occupant))
	{
		// Игрок исчез, не пройдя через LeaveHidingSpot (например, погиб) —
		// освобождаем место, иначе шкаф останется занят навсегда.
		Occupant = nullptr;
		SetActorTickEnabled(false);
		OnOccupiedChangedBP(false);
		return;
	}

	if (UFearComponent* Fear = Occupant->GetFear())
	{
		Fear->RelieveFear(FearReliefPerSecond * DeltaTime);
	}
}

bool AHidingSpot::CanInteract_Implementation(AFelarCharacter* Interactor) const
{
	return !IsOccupied() && Interactor && Interactor->IsAlive();
}

FText AHidingSpot::GetInteractionPrompt_Implementation(AFelarCharacter* Interactor) const
{
	return IsOccupied()
		? NSLOCTEXT("Felar", "HidingSpotOccupied", "Занято")
		: NSLOCTEXT("Felar", "HidingSpotEnter", "Спрятаться");
}

void AHidingSpot::Interact_Implementation(AFelarCharacter* Interactor)
{
	if (!Interactor || IsOccupied())
	{
		return;
	}

	Occupant = Interactor;

	// Порядок принципиален: EnterHidingSpot выключает коллизию, и только после
	// этого капсулу можно ставить внутрь меша шкафа. В обратном порядке движок
	// на следующем кадре вытолкнет игрока из геометрии наружу.
	Interactor->EnterHidingSpot(this);
	Interactor->SetActorLocation(HidePoint->GetComponentLocation(), false, nullptr, ETeleportType::TeleportPhysics);

	SetActorTickEnabled(true);
	OnOccupiedChangedBP(true);
}

void AHidingSpot::NotifyPlayerLeft(AFelarCharacter* Player)
{
	if (Occupant != Player)
	{
		return;
	}

	// Вызывается из LeaveHidingSpot до включения коллизии — телепорт безопасен.
	// ExitPoint всё равно обязан стоять снаружи меша, иначе после включения
	// коллизии игрок окажется замурован в шкафу.
	Player->SetActorLocation(ExitPoint->GetComponentLocation(), false, nullptr, ETeleportType::TeleportPhysics);

	Occupant = nullptr;
	SetActorTickEnabled(false);
	OnOccupiedChangedBP(false);
}
