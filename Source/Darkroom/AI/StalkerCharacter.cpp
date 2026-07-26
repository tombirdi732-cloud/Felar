#include "AI/StalkerCharacter.h"

#include "Darkroom.h"
#include "AI/StalkerAIController.h"
#include "Player/DarkroomCharacter.h"

#include "Components/CapsuleComponent.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/StaticMesh.h"

AStalkerCharacter::AStalkerCharacter()
{
	PrimaryActorTick.bCanEverTick = false;

	GetCapsuleComponent()->InitCapsuleSize(42.f, 96.f);

	AIControllerClass = AStalkerAIController::StaticClass();
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;

	CatchSphere = CreateDefaultSubobject<USphereComponent>(TEXT("CatchSphere"));
	CatchSphere->SetupAttachment(GetCapsuleComponent());
	CatchSphere->SetSphereRadius(110.f);
	CatchSphere->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	CatchSphere->SetCollisionResponseToAllChannels(ECR_Ignore);
	CatchSphere->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);

	// Видимое тело-заглушка: без него существо — невидимая капсула, и понять,
	// работает ли ИИ, невозможно. Коллизии нет, чтобы не мешать капсуле.
	PlaceholderMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PlaceholderMesh"));
	PlaceholderMesh->SetupAttachment(GetCapsuleComponent());
	PlaceholderMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderMesh(
		TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (CylinderMesh.Succeeded())
	{
		PlaceholderMesh->SetStaticMesh(CylinderMesh.Object);
		// Под капсулу 42 x 96: диаметр 84 см, высота 192 см.
		PlaceholderMesh->SetRelativeScale3D(FVector(0.84f, 0.84f, 1.92f));
	}

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->MaxWalkSpeed = PatrolSpeed;
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.f, 360.f, 0.f);
	// Небольшое торможение делает движение менее "роботизированным".
	Movement->BrakingDecelerationWalking = 1200.f;
	bUseControllerRotationYaw = false;
}

void AStalkerCharacter::BeginPlay()
{
	Super::BeginPlay();

	CatchSphere->OnComponentBeginOverlap.AddDynamic(this, &AStalkerCharacter::HandleCatchOverlap);
	ApplyStateMovement(CurrentState);
}

void AStalkerCharacter::ApplyStateMovement(EStalkerState State)
{
	float Speed = PatrolSpeed;

	switch (State)
	{
	case EStalkerState::Patrol:			Speed = PatrolSpeed;		break;
	case EStalkerState::Investigate:	Speed = InvestigateSpeed;	break;
	case EStalkerState::Chase:			Speed = ChaseSpeed;			break;
	case EStalkerState::Search:			Speed = SearchSpeed;		break;
	}

	GetCharacterMovement()->MaxWalkSpeed = Speed;
}

void AStalkerCharacter::NotifyStateChanged(EStalkerState OldState, EStalkerState NewState)
{
	CurrentState = NewState;
	ApplyStateMovement(NewState);

	OnStateChanged.Broadcast(OldState, NewState);
	OnStateChangedBP(OldState, NewState);
}

void AStalkerCharacter::HandleCatchOverlap(
	UPrimitiveComponent* OverlappedComponent,
	AActor* OtherActor,
	UPrimitiveComponent* OtherComp,
	int32 OtherBodyIndex,
	bool bFromSweep,
	const FHitResult& SweepResult)
{
	ADarkroomCharacter* Player = Cast<ADarkroomCharacter>(OtherActor);
	if (!Player || !Player->IsAlive())
	{
		return;
	}

	// Спрятавшийся игрок отключает коллизию, так что сюда он попасть не должен;
	// проверка оставлена на случай, если существо окажется внутри укрытия.
	if (Player->IsHiding())
	{
		return;
	}

	Player->OnCaught(this);
}
