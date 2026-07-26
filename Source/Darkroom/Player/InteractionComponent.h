#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "InteractionComponent.generated.h"

class ADarkroomCharacter;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnFocusedActorChanged, AActor*, FocusedActor, const FText&, Prompt);

/**
 * Луч из камеры вперёд: ищет объект с интерфейсом IDarkroomInteractable и держит его
 * как "текущую цель". UI подписывается на OnFocusedActorChanged и рисует подсказку.
 *
 * Трассировка идёт не каждый кадр, а с интервалом TraceInterval — для UI разницы нет,
 * а нагрузка падает в разы. Это тот случай, когда Tick оправдан, но его надо дозировать.
 */
UCLASS(ClassGroup = (Darkroom), meta = (BlueprintSpawnableComponent))
class DARKROOM_API UInteractionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UInteractionComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	/** Выполнить взаимодействие с текущей целью. Возвращает true, если что-то произошло. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Interaction")
	bool TryInteract();

	UFUNCTION(BlueprintPure, Category = "Darkroom|Interaction")
	AActor* GetFocusedActor() const { return FocusedActor; }

	UFUNCTION(BlueprintPure, Category = "Darkroom|Interaction")
	FText GetCurrentPrompt() const { return CurrentPrompt; }

	UPROPERTY(BlueprintAssignable, Category = "Darkroom|Interaction")
	FOnFocusedActorChanged OnFocusedActorChanged;

protected:
	/** Дальность, с которой можно дотянуться до объекта. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Interaction", meta = (ClampMin = "10.0"))
	float TraceDistance = 300.f;

	/** Радиус сферы трассировки. Больше нуля — чтобы не приходилось целиться пиксель в пиксель. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Interaction", meta = (ClampMin = "0.0"))
	float TraceRadius = 12.f;

	/** Пауза между трассировками в секундах. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Interaction", meta = (ClampMin = "0.0"))
	float TraceInterval = 0.1f;

private:
	/** Найти объект под прицелом и обновить FocusedActor / CurrentPrompt. */
	void UpdateFocus();

	/** Откуда и куда стрелять лучом. Берётся из точки обзора контроллера. */
	bool GetViewPoint(FVector& OutLocation, FVector& OutDirection) const;

	void SetFocusedActor(AActor* NewFocus);

	UPROPERTY(Transient)
	TObjectPtr<AActor> FocusedActor;

	UPROPERTY(Transient)
	TObjectPtr<ADarkroomCharacter> OwnerCharacter;

	FText CurrentPrompt;
	float TimeSinceTrace = 0.f;
};
