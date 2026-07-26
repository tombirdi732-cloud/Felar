#include "Player/FlashlightComponent.h"

#include "Darkroom.h"
#include "Components/SpotLightComponent.h"

UFlashlightComponent::UFlashlightComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	// Тикаем только пока фонарь горит — см. SetLightOn.
	PrimaryComponentTick.bStartWithTickEnabled = false;
}

void UFlashlightComponent::BeginPlay()
{
	Super::BeginPlay();

	Battery = FMath::Clamp(Battery, 0.f, MaxBattery);

	// Если владелец не вызвал SetLightComponent вручную, ищем первый спотлайт сами.
	if (!Light)
	{
		if (const AActor* OwnerActor = GetOwner())
		{
			Light = OwnerActor->FindComponentByClass<USpotLightComponent>();
		}
	}

	ApplyLightState();
	BroadcastBatteryIfChanged();
}

void UFlashlightComponent::SetLightComponent(USpotLightComponent* InLight)
{
	Light = InLight;
	ApplyLightState();
}

void UFlashlightComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (!bIsOn)
	{
		return;
	}

	Battery = FMath::Max(0.f, Battery - DrainPerSecond * DeltaTime);
	BroadcastBatteryIfChanged();

	if (Battery <= 0.f)
	{
		UE_LOG(LogDarkroom, Log, TEXT("Flashlight: battery depleted"));
		SetLightOn(false);
		OnBatteryDepleted.Broadcast();
		return;
	}

	// Яркость плавно падает вместе с зарядом — игрок видит, что время уходит,
	// без единой цифры на экране.
	ApplyLightState();
}

void UFlashlightComponent::ToggleLight()
{
	SetLightOn(!bIsOn);
}

void UFlashlightComponent::SetLightOn(bool bNewOn)
{
	// Включить пустой фонарь нельзя, выключить — всегда можно.
	if (bNewOn && Battery <= 0.f)
	{
		return;
	}

	if (bIsOn == bNewOn)
	{
		return;
	}

	bIsOn = bNewOn;
	SetComponentTickEnabled(bIsOn);
	ApplyLightState();

	OnFlashlightToggled.Broadcast(bIsOn);
}

void UFlashlightComponent::AddBattery(float Amount)
{
	if (Amount <= 0.f)
	{
		return;
	}

	Battery = FMath::Min(MaxBattery, Battery + Amount);
	ApplyLightState();
	BroadcastBatteryIfChanged();
}

void UFlashlightComponent::ApplyLightState()
{
	if (!Light)
	{
		return;
	}

	Light->SetVisibility(bIsOn);

	if (bIsOn)
	{
		const float Charge = FMath::Clamp(Battery / FMath::Max(MaxBattery, KINDA_SMALL_NUMBER), 0.f, 1.f);
		const float Fraction = FMath::Lerp(MinIntensityFraction, 1.f, Charge);
		Light->SetIntensity(LightIntensity * Fraction);
	}
}

void UFlashlightComponent::BroadcastBatteryIfChanged()
{
	// Порог в 1% вместо покадровой рассылки: UI всё равно не покажет разницу,
	// а делегат перестаёт дёргаться 60 раз в секунду.
	if (FMath::Abs(Battery - LastBroadcastBattery) < 1.f && Battery > 0.f)
	{
		return;
	}

	LastBroadcastBattery = Battery;
	OnBatteryChanged.Broadcast(GetBatteryPercent());
}
