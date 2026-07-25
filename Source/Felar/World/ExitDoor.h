#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "World/FelarInteractable.h"
#include "ExitDoor.generated.h"

class UStaticMeshComponent;
class AFelarCharacter;

/**
 * Выход. Заперт, пока не собраны все фрагменты; открыт — конец игры с победой.
 *
 * Дверь не хранит счётчик сама, а спрашивает его у AFelarGameMode. Так правило
 * "сколько нужно фрагментов" остаётся ровно в одном месте, даже если дверей на
 * карте окажется несколько.
 */
UCLASS()
class FELAR_API AExitDoor : public AActor, public IFelarInteractable
{
	GENERATED_BODY()

public:
	AExitDoor();

	// IFelarInteractable
	virtual bool CanInteract_Implementation(AFelarCharacter* Interactor) const override;
	virtual FText GetInteractionPrompt_Implementation(AFelarCharacter* Interactor) const override;
	virtual void Interact_Implementation(AFelarCharacter* Interactor) override;

	/** Точка расширения: анимация открытия, звук засова, вспышка света. */
	UFUNCTION(BlueprintImplementableEvent, Category = "Felar|Exit")
	void OnDoorOpenedBP();

	/** Игрок дёрнул запертую дверь — повод для громкого лязга. */
	UFUNCTION(BlueprintImplementableEvent, Category = "Felar|Exit")
	void OnLockedRattleBP();

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Exit")
	TObjectPtr<UStaticMeshComponent> Mesh;

private:
	/** Сколько фрагментов осталось собрать. -1, если GameMode недоступен. */
	int32 GetRemainingFragments() const;
};
