#include "Player/InteractionComponent.h"

#include "Darkroom.h"
#include "Player/DarkroomCharacter.h"
#include "World/DarkroomInteractable.h"
#include "Engine/World.h"

UInteractionComponent::UInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UInteractionComponent::BeginPlay()
{
	Super::BeginPlay();

	OwnerCharacter = Cast<ADarkroomCharacter>(GetOwner());
	if (!OwnerCharacter)
	{
		UE_LOG(LogDarkroom, Warning, TEXT("InteractionComponent expects ADarkroomCharacter as owner, got %s"),
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

	FCollisionQueryParams Params(SCENE_QUERY_STAT(DarkroomInteractionTrace), false, OwnerCharacter);
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
	if (!HitActor || !HitActor->GetClass()->ImplementsInterface(UDarkroomInteractable::StaticClass()))
	{
		SetFocusedActor(nullptr);
		return;
	}

	SetFocusedActor(HitActor);

	// Подсказка может меняться у одного и того же объекта (дверь заперта -> открыта),
	// поэтому перечитываем её каждую трассировку, а не только при смене цели.
	const FText NewPrompt = IDarkroomInteractable::Execute_GetInteractionPrompt(HitActor, OwnerCharacter);
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

	if (IsValid(FocusedActor) && FocusedActor->GetClass()->ImplementsInterface(UDarkroomInteractable::StaticClass()))
	{
		IDarkroomInteractable::Execute_OnFocusChanged(FocusedActor, false);
	}

	FocusedActor = NewFocus;

	if (FocusedActor)
	{
		IDarkroomInteractable::Execute_OnFocusChanged(FocusedActor, true);
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

	if (!IDarkroomInteractable::Execute_CanInteract(FocusedActor, OwnerCharacter))
	{
		return false;
	}

	IDarkroomInteractable::Execute_Interact(FocusedActor, OwnerCharacter);

	// Объект мог самоуничтожиться (подобранный предмет) — сбрасываем цель,
	// чтобы UI не держал подсказку от несуществующего актора.
	if (!IsValid(FocusedActor))
	{
		SetFocusedActor(nullptr);
	}

	return true;
}
