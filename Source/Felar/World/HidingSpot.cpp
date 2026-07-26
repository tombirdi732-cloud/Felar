#include "World/HidingSpot.h"

#include "Felar.h"
#include "Player/FelarCharacter.h"
#include "Player/FearComponent.h"

#include "Components/StaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/StaticMesh.h"

AHidingSpot::AHidingSpot()
{
	// Тик нужен только пока внутри кто-то сидит — включается в Interact.
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Root);
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Mesh->SetCollisionResponseToAllChannels(ECR_Block);

	// Заглушка размером со шкаф: 80 x 120 x 220 см, низом на полу.
	// Меняется на свою модель в любой момент, но играть можно сразу.
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMesh(
		TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeMesh.Succeeded())
	{
		Mesh->SetStaticMesh(CubeMesh.Object);
		Mesh->SetRelativeScale3D(FVector(0.8f, 1.2f, 2.2f));
		Mesh->SetRelativeLocation(FVector(0.f, 0.f, 110.f));
	}

	// Z = 90: капсула игрока имеет полувысоту 88, поэтому в нуле она уходила бы
	// наполовину под пол.
	HidePoint = CreateDefaultSubobject<USceneComponent>(TEXT("HidePoint"));
	HidePoint->SetupAttachment(Root);
	HidePoint->SetRelativeLocation(FVector(0.f, 0.f, 90.f));

	// Заведомо снаружи меша: внутри игрок оказался бы замурован после
	// включения коллизии на выходе.
	ExitPoint = CreateDefaultSubobject<USceneComponent>(TEXT("ExitPoint"));
	ExitPoint->SetupAttachment(Root);
	ExitPoint->SetRelativeLocation(FVector(110.f, 0.f, 90.f));
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
