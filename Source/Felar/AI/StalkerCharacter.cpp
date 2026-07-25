#include "AI/StalkerCharacter.h"

#include "Felar.h"
#include "AI/StalkerAIController.h"
#include "Player/FelarCharacter.h"

#include "Components/CapsuleComponent.h"
#include "Components/SphereComponent.h"
#include "GameFramework/CharacterMovementComponent.h"

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
	AFelarCharacter* Player = Cast<AFelarCharacter>(OtherActor);
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
