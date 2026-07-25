#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/FelarTypes.h"
#include "StalkerCharacter.generated.h"

class USphereComponent;
class AFelarCharacter;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnStalkerStateChanged, EStalkerState, OldState, EStalkerState, NewState);

/**
 * Существо. Тело и скорости живут здесь, вся логика поведения — в AStalkerAIController.
 *
 * Разделение не формальность: контроллер переживает смену тела и не зависит от меша,
 * а сам актор остаётся тем, что дизайнер настраивает в редакторе.
 */
UCLASS()
class FELAR_API AStalkerCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AStalkerCharacter();

	virtual void BeginPlay() override;

	/** Применить скорость, соответствующую состоянию. Вызывается контроллером. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Stalker")
	void ApplyStateMovement(EStalkerState State);

	/** Сообщить о смене состояния — для звука, анимации и отладочного UI. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Stalker")
	void NotifyStateChanged(EStalkerState OldState, EStalkerState NewState);

	UFUNCTION(BlueprintPure, Category = "Felar|Stalker")
	EStalkerState GetCurrentState() const { return CurrentState; }

	/**
	 * Событие для Blueprint-наследника: сюда удобно вешать рычание, смену
	 * материала глаз, партиклы. Реализация на C++ пустая — это точка расширения.
	 */
	UFUNCTION(BlueprintImplementableEvent, Category = "Felar|Stalker")
	void OnStateChangedBP(EStalkerState OldState, EStalkerState NewState);

	UPROPERTY(BlueprintAssignable, Category = "Felar|Stalker")
	FOnStalkerStateChanged OnStateChanged;

	// --- Настройки, которые читает контроллер ---

	/** Дальность обзора, когда фонарь игрока выключен. Существо почти слепое. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Felar|Stalker|Senses", meta = (ClampMin = "50.0"))
	float SightRadiusDark = 450.f;

	/** Дальность обзора, когда фонарь игрока горит. Свет видно издалека. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Felar|Stalker|Senses", meta = (ClampMin = "50.0"))
	float SightRadiusLit = 3000.f;

	/** Дальность, на которой цель теряется. Всегда больше текущего SightRadius. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Felar|Stalker|Senses", meta = (ClampMin = "50.0"))
	float LoseSightPadding = 600.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Felar|Stalker|Senses", meta = (ClampMin = "10.0", ClampMax = "180.0"))
	float VisionHalfAngle = 70.f;

	/** Базовая дальность слуха. Умножается на громкость конкретного шума. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Felar|Stalker|Senses", meta = (ClampMin = "100.0"))
	float HearingRange = 2200.f;

protected:
	/** Радиус, в котором существо хватает игрока. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Stalker")
	TObjectPtr<USphereComponent> CatchSphere;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Stalker|Movement", meta = (ClampMin = "1.0"))
	float PatrolSpeed = 180.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Stalker|Movement", meta = (ClampMin = "1.0"))
	float InvestigateSpeed = 320.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Stalker|Movement", meta = (ClampMin = "1.0"))
	float ChaseSpeed = 560.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Stalker|Movement", meta = (ClampMin = "1.0"))
	float SearchSpeed = 300.f;

	UFUNCTION()
	void HandleCatchOverlap(
		UPrimitiveComponent* OverlappedComponent,
		AActor* OtherActor,
		UPrimitiveComponent* OtherComp,
		int32 OtherBodyIndex,
		bool bFromSweep,
		const FHitResult& SweepResult);

private:
	EStalkerState CurrentState = EStalkerState::Patrol;
};
