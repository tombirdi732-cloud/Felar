#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "Core/FelarTypes.h"
#include "FelarGameState.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnFragmentsChanged, int32, Collected, int32, Required);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGameFinished, EGameOutcome, Outcome);

/**
 * Наблюдаемое состояние партии: счётчик фрагментов и исход.
 *
 * Правила живут в AFelarGameMode, здесь только данные и события. Виджеты подписываются
 * сюда, а не на GameMode: GameMode существует только на сервере, а GameState доступен
 * всем — так UI не придётся переписывать, если игра когда-нибудь станет кооперативной.
 */
UCLASS()
class FELAR_API AFelarGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintPure, Category = "Felar|Objective")
	int32 GetFragmentsCollected() const { return FragmentsCollected; }

	UFUNCTION(BlueprintPure, Category = "Felar|Objective")
	int32 GetFragmentsRequired() const { return FragmentsRequired; }

	UFUNCTION(BlueprintPure, Category = "Felar|Objective")
	int32 GetRemainingFragments() const { return FMath::Max(0, FragmentsRequired - FragmentsCollected); }

	/** 0..1 — для полоски прогресса. */
	UFUNCTION(BlueprintPure, Category = "Felar|Objective")
	float GetObjectiveProgress() const
	{
		return FragmentsRequired > 0 ? FMath::Clamp((float)FragmentsCollected / FragmentsRequired, 0.f, 1.f) : 0.f;
	}

	UFUNCTION(BlueprintPure, Category = "Felar|Objective")
	EGameOutcome GetOutcome() const { return Outcome; }

	UPROPERTY(BlueprintAssignable, Category = "Felar|Objective")
	FOnFragmentsChanged OnFragmentsChanged;

	UPROPERTY(BlueprintAssignable, Category = "Felar|Objective")
	FOnGameFinished OnGameFinished;

	/** Менять состояние имеет право только GameMode. */
	friend class AFelarGameMode;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Objective")
	int32 FragmentsCollected = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Objective")
	int32 FragmentsRequired = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Objective")
	EGameOutcome Outcome = EGameOutcome::InProgress;
};
