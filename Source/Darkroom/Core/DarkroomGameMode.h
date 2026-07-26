#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Core/DarkroomTypes.h"
#include "DarkroomGameMode.generated.h"

class ADarkroomGameState;

/**
 * Правила партии: сколько фрагментов нужно и чем всё закончилось.
 *
 * Число фрагментов по умолчанию не задаётся вручную, а считается по уровню:
 * сколько AFragmentPickup расставил дизайнер, столько и требуется. Это убирает
 * целый класс багов вида "положил 5 фрагментов, а в настройках стоит 6, дверь
 * не открывается никогда".
 */
UCLASS()
class DARKROOM_API ADarkroomGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ADarkroomGameMode();

	virtual void BeginPlay() override;

	/** Игрок подобрал фрагмент. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Objective")
	void AddFragment();

	/** Завершить партию. Повторные вызовы игнорируются. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Objective")
	void FinishGame(EGameOutcome NewOutcome);

	UFUNCTION(BlueprintPure, Category = "Darkroom|Objective")
	int32 GetRemainingFragments() const;

	UFUNCTION(BlueprintPure, Category = "Darkroom|Objective")
	ADarkroomGameState* GetDarkroomGameState() const;

	/** Точка расширения для Blueprint: экран победы/поражения, титры, музыка. */
	UFUNCTION(BlueprintImplementableEvent, Category = "Darkroom|Objective")
	void OnGameFinishedBP(EGameOutcome Outcome);

protected:
	/**
	 * Если больше нуля — использовать это число вместо подсчёта фрагментов
	 * на уровне. Пригодится, когда часть фрагментов спавнится по ходу игры.
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Objective", meta = (ClampMin = "0"))
	int32 FragmentsRequiredOverride = 0;

	/** Через сколько секунд после конца партии перезапускать уровень. 0 — не перезапускать. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Objective", meta = (ClampMin = "0.0"))
	float RestartDelay = 4.f;

private:
	/** Посчитать AFragmentPickup, расставленные на уровне. */
	int32 CountFragmentsInLevel() const;

	void RestartLevelNow();

	FTimerHandle RestartTimerHandle;
};
