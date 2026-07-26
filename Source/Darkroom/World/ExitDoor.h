#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "World/DarkroomInteractable.h"
#include "ExitDoor.generated.h"

class UStaticMeshComponent;
class ADarkroomCharacter;

/**
 * Выход. Заперт, пока не собраны все фрагменты; открыт — конец игры с победой.
 *
 * Дверь не хранит счётчик сама, а спрашивает его у ADarkroomGameMode. Так правило
 * "сколько нужно фрагментов" остаётся ровно в одном месте, даже если дверей на
 * карте окажется несколько.
 */
UCLASS()
class DARKROOM_API AExitDoor : public AActor, public IDarkroomInteractable
{
	GENERATED_BODY()

public:
	AExitDoor();

	// IDarkroomInteractable
	virtual bool CanInteract_Implementation(ADarkroomCharacter* Interactor) const override;
	virtual FText GetInteractionPrompt_Implementation(ADarkroomCharacter* Interactor) const override;
	virtual void Interact_Implementation(ADarkroomCharacter* Interactor) override;

	/** Точка расширения: анимация открытия, звук засова, вспышка света. */
	UFUNCTION(BlueprintImplementableEvent, Category = "Darkroom|Exit")
	void OnDoorOpenedBP();

	/** Игрок дёрнул запертую дверь — повод для громкого лязга. */
	UFUNCTION(BlueprintImplementableEvent, Category = "Darkroom|Exit")
	void OnLockedRattleBP();

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Exit")
	TObjectPtr<UStaticMeshComponent> Mesh;

private:
	/** Сколько фрагментов осталось собрать. -1, если GameMode недоступен. */
	int32 GetRemainingFragments() const;
};
