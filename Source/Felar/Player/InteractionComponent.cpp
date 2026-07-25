#include "Player/InteractionComponent.h"

#include "Felar.h"
#include "Player/FelarCharacter.h"
#include "World/FelarInteractable.h"
#include "Engine/World.h"

UInteractionComponent::UInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UInteractionComponent::BeginPlay()
{
	Super::BeginPlay();

	OwnerCharacter = Cast<AFelarCharacter>(GetOwner());
	if (!OwnerCharacter)
	{
		UE_LOG(LogFelar, Warning, TEXT("InteractionComponent expects AFelarCharacter as owner, got %s"),
			*GetNameSafe(GetOwner()));
		SetComponentTickEnabled(false);
	}
}

void UInteractionComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	// Снимаем подсветку с последней цели, иначе объект останется подсвеченным
	// после смерти игрока или смены уровня.
	SetFocusedActor(nullptr);

	Super::EndPlay(EndPlayReason);
}

void UInteractionComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	TimeSinceTrace += DeltaTime;
	if (TimeSinceTrace < TraceInterval)
	{
		return;
	}

	TimeSinceTrace = 0.f;
	UpdateFocus();
}

bool UInteractionComponent::GetViewPoint(FVector& OutLocation, FVector& OutDirection) const
{
	if (!OwnerCharacter)
	{
		return false;
	}

	FRotator ViewRotation;
	// GetActorEyesViewPoint учитывает и контроллер игрока, и камеру персонажа —
	// работает одинаково и в игре, и когда персонажем управляет ИИ.
	OwnerCharacter->GetActorEyesViewPoint(OutLocation, ViewRotation);
	OutDirection = ViewRotation.Vector();

	return true;
}

void UInteractionComponent::UpdateFocus()
{
	FVector Start;
	FVector Direction;
	if (!GetViewPoint(Start, Direction))
	{
		SetFocusedActor(nullptr);
		return;
	}

	const FVector End = Start + Direction * TraceDistance;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(FelarInteractionTrace), false, OwnerCharacter);
	Params.bTraceComplex = false;

	FHitResult Hit;
	const bool bHit = GetWorld()->SweepSingleByChannel(
		Hit,
		Start,
		End,
		FQuat::Identity,
		ECC_Visibility,
		FCollisionShape::MakeSphere(TraceRadius),
		Params);

	AActor* HitActor = bHit ? Hit.GetActor() : nullptr;

	// Интерфейс может быть реализован как на C++, так и в Blueprint-наследнике,
	// поэтому проверяем через ImplementsInterface, а не через Cast.
	if (!HitActor || !HitActor->GetClass()->ImplementsInterface(UFelarInteractable::StaticClass()))
	{
		SetFocusedActor(nullptr);
		return;
	}

	SetFocusedActor(HitActor);

	// Подсказка может меняться у одного и того же объекта (дверь заперта -> открыта),
	// поэтому перечитываем её каждую трассировку, а не только при смене цели.
	const FText NewPrompt = IFelarInteractable::Execute_GetInteractionPrompt(HitActor, OwnerCharacter);
	if (!NewPrompt.EqualTo(CurrentPrompt))
	{
		CurrentPrompt = NewPrompt;
		OnFocusedActorChanged.Broadcast(FocusedActor, CurrentPrompt);
	}
}

void UInteractionComponent::SetFocusedActor(AActor* NewFocus)
{
	if (FocusedActor == NewFocus)
	{
		return;
	}

	if (IsValid(FocusedActor) && FocusedActor->GetClass()->ImplementsInterface(UFelarInteractable::StaticClass()))
	{
		IFelarInteractable::Execute_OnFocusChanged(FocusedActor, false);
	}

	FocusedActor = NewFocus;

	if (FocusedActor)
	{
		IFelarInteractable::Execute_OnFocusChanged(FocusedActor, true);
	}
	else
	{
		CurrentPrompt = FText::GetEmpty();
	}

	OnFocusedActorChanged.Broadcast(FocusedActor, CurrentPrompt);
}

bool UInteractionComponent::TryInteract()
{
	if (!IsValid(FocusedActor) || !OwnerCharacter)
	{
		return false;
	}

	if (!IFelarInteractable::Execute_CanInteract(FocusedActor, OwnerCharacter))
	{
		return false;
	}

	IFelarInteractable::Execute_Interact(FocusedActor, OwnerCharacter);

	// Объект мог самоуничтожиться (подобранный предмет) — сбрасываем цель,
	// чтобы UI не держал подсказку от несуществующего актора.
	if (!IsValid(FocusedActor))
	{
		SetFocusedActor(nullptr);
	}

	return true;
}
