#include "World/SafeLightZone.h"

#include "Player/DarkroomCharacter.h"

#include "Components/BoxComponent.h"

ASafeLightZone::ASafeLightZone()
{
	PrimaryActorTick.bCanEverTick = false;

	Volume = CreateDefaultSubobject<UBoxComponent>(TEXT("Volume"));
	SetRootComponent(Volume);
	Volume->SetBoxExtent(FVector(300.f, 300.f, 200.f));
	Volume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Volume->SetCollisionResponseToAllChannels(ECR_Ignore);
	Volume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
}

void ASafeLightZone::BeginPlay()
{
	Super::BeginPlay();

	Volume->OnComponentBeginOverlap.AddDynamic(this, &ASafeLightZone::HandleBeginOverlap);
	Volume->OnComponentEndOverlap.AddDynamic(this, &ASafeLightZone::HandleEndOverlap);
}

void ASafeLightZone::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	// Зону могут удалить, пока игрок внутри (стриминг уровня, скрипт) — счётчик
	// освещённых зон нужно вернуть, иначе игрок навсегда останется "на свету".
	TArray<AActor*> Overlapping;
	Volume->GetOverlappingActors(Overlapping, ADarkroomCharacter::StaticClass());

	for (AActor* Actor : Overlapping)
	{
		if (ADarkroomCharacter* Player = Cast<ADarkroomCharacter>(Actor))
		{
			Player->AddLitZone(-1);
		}
	}

	Super::EndPlay(EndPlayReason);
}

void ASafeLightZone::HandleBeginOverlap(
	UPrimitiveComponent* OverlappedComponent,
	AActor* OtherActor,
	UPrimitiveComponent* OtherComp,
	int32 OtherBodyIndex,
	bool bFromSweep,
	const FHitResult& SweepResult)
{
	if (ADarkroomCharacter* Player = Cast<ADarkroomCharacter>(OtherActor))
	{
		Player->AddLitZone(1);
	}
}

void ASafeLightZone::HandleEndOverlap(
	UPrimitiveComponent* OverlappedComponent,
	AActor* OtherActor,
	UPrimitiveComponent* OtherComp,
	int32 OtherBodyIndex)
{
	if (ADarkroomCharacter* Player = Cast<ADarkroomCharacter>(OtherActor))
	{
		Player->AddLitZone(-1);
	}
}
