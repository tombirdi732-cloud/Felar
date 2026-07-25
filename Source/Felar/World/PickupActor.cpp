#include "World/PickupActor.h"

#include "Felar.h"
#include "Player/FelarCharacter.h"
#include "Player/FearComponent.h"
#include "Player/FlashlightComponent.h"
#include "Core/FelarGameMode.h"

#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"

APickupActor::APickupActor()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	// Луч взаимодействия идёт по каналу Visibility — меш обязан его блокировать.
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Mesh->SetCollisionResponseToAllChannels(ECR_Ignore);
	Mesh->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Mesh);
	Glow->SetIntensity(600.f);
	Glow->SetAttenuationRadius(180.f);
	Glow->SetCastShadows(false);
}

void APickupActor::BeginPlay()
{
	Super::BeginPlay();

	BaseGlowIntensity = Glow->Intensity;
}

FText APickupActor::GetInteractionPrompt_Implementation(AFelarCharacter* Interactor) const
{
	return PickupPrompt;
}

void APickupActor::OnFocusChanged_Implementation(bool bFocused)
{
	Glow->SetIntensity(bFocused ? BaseGlowIntensity * FocusGlowMultiplier : BaseGlowIntensity);
}

void APickupActor::Interact_Implementation(AFelarCharacter* Interactor)
{
	if (!Interactor)
	{
		return;
	}

	if (UFearComponent* Fear = Interactor->GetFear())
	{
		Fear->RelieveFear(FearRelief);
	}

	OnCollected(Interactor);
	OnCollectedBP(Interactor);

	Destroy();
}

void APickupActor::OnCollected(AFelarCharacter* Collector)
{
	// Базовый класс сам по себе ничего не делает — вся суть в наследниках.
}

// --- Фрагмент ---

AFragmentPickup::AFragmentPickup()
{
	PickupPrompt = NSLOCTEXT("Felar", "PickupFragment", "Забрать фрагмент");
	FearRelief = 12.f;
	Glow->SetLightColor(FLinearColor(0.4f, 0.8f, 1.f));
}

void AFragmentPickup::OnCollected(AFelarCharacter* Collector)
{
	if (AFelarGameMode* GameMode = GetWorld()->GetAuthGameMode<AFelarGameMode>())
	{
		GameMode->AddFragment();
	}
	else
	{
		UE_LOG(LogFelar, Warning, TEXT("Fragment collected but GameMode is not AFelarGameMode"));
	}
}

// --- Батарея ---

ABatteryPickup::ABatteryPickup()
{
	PickupPrompt = NSLOCTEXT("Felar", "PickupBattery", "Взять батарею");
	FearRelief = 5.f;
	Glow->SetLightColor(FLinearColor(1.f, 0.85f, 0.4f));
}

void ABatteryPickup::OnCollected(AFelarCharacter* Collector)
{
	if (UFlashlightComponent* Flashlight = Collector->GetFlashlight())
	{
		Flashlight->AddBattery(ChargeAmount);
	}
}
