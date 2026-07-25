#include "Player/FearComponent.h"

#include "Felar.h"

UFearComponent::UFearComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PrePhysics;
}

void UFearComponent::BeginPlay()
{
	Super::BeginPlay();

	ScheduleNextGasp();
	BroadcastFearIfChanged();
}

void UFearComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	// Вид существа пугает даже на свету, поэтому этот прирост считается всегда.
	float Delta = bStalkerVisible ? StalkerVisibleFearPerSecond : 0.f;
	Delta += bInLight ? -LightRecoveryPerSecond : DarknessFearPerSecond;

	Fear = FMath::Clamp(Fear + Delta * DeltaTime, 0.f, 100.f);

	UpdatePanicState();
	TickGasp(DeltaTime);
	BroadcastFearIfChanged();

	if (Fear >= 100.f)
	{
		UE_LOG(LogFelar, Log, TEXT("Fear: breakdown - stalker gets exact player position"));
		Fear = FMath::Clamp(BreakdownResetTo, 0.f, 100.f);
		UpdatePanicState();
		BroadcastFearIfChanged();
		OnFearBreakdown.Broadcast();
		ScheduleNextGasp();
	}
}

void UFearComponent::SetInLight(bool bNewInLight)
{
	bInLight = bNewInLight;
}

void UFearComponent::SetStalkerVisible(bool bVisible)
{
	bStalkerVisible = bVisible;
}

void UFearComponent::AddFear(float Amount)
{
	if (Amount <= 0.f)
	{
		return;
	}

	Fear = FMath::Clamp(Fear + Amount, 0.f, 100.f);
	UpdatePanicState();
	BroadcastFearIfChanged();
}

void UFearComponent::RelieveFear(float Amount)
{
	if (Amount <= 0.f)
	{
		return;
	}

	Fear = FMath::Clamp(Fear - Amount, 0.f, 100.f);
	UpdatePanicState();
	BroadcastFearIfChanged();
}

void UFearComponent::UpdatePanicState()
{
	// Гистерезис: входим в панику по PanicThreshold, выходим по PanicReleaseThreshold.
	// Без этого на границе состояние переключалось бы каждый кадр.
	const bool bShouldPanic = bInPanic ? (Fear > PanicReleaseThreshold) : (Fear >= PanicThreshold);

	if (bShouldPanic == bInPanic)
	{
		return;
	}

	bInPanic = bShouldPanic;

	if (bInPanic)
	{
		ScheduleNextGasp();
	}

	OnPanicStateChanged.Broadcast(bInPanic);
}

void UFearComponent::TickGasp(float DeltaTime)
{
	if (!bInPanic)
	{
		return;
	}

	GaspTimer -= DeltaTime;
	if (GaspTimer > 0.f)
	{
		return;
	}

	OnInvoluntaryGasp.Broadcast();
	ScheduleNextGasp();
}

void UFearComponent::ScheduleNextGasp()
{
	const float MaxInterval = FMath::Max(MinGaspInterval, MaxGaspInterval);
	GaspTimer = FMath::FRandRange(MinGaspInterval, MaxInterval);
}

void UFearComponent::BroadcastFearIfChanged()
{
	if (FMath::Abs(Fear - LastBroadcastFear) < 1.f)
	{
		return;
	}

	LastBroadcastFear = Fear;
	OnFearChanged.Broadcast(GetFearPercent());
}
