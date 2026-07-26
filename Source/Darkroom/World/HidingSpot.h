#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "World/DarkroomInteractable.h"
#include "HidingSpot.generated.h"

class UStaticMeshComponent;
class USceneComponent;
class ADarkroomCharacter;

/**
 * Шкаф. Игрок прячется внутри: существо перестаёт его видеть, страх медленно спадает.
 *
 * Укрытие не абсолютно — в панике игрок всё равно ахает, и этот шум существо слышит.
 * Иначе шкаф стал бы кнопкой "выиграть", и всё напряжение исчезло бы.
 */
UCLASS()
class DARKROOM_API AHidingSpot : public AActor, public IDarkroomInteractable
{
	GENERATED_BODY()

public:
	AHidingSpot();

	virtual void Tick(float DeltaTime) override;

	// IDarkroomInteractable
	virtual bool CanInteract_Implementation(ADarkroomCharacter* Interactor) const override;
	virtual FText GetInteractionPrompt_Implementation(ADarkroomCharacter* Interactor) const override;
	virtual void Interact_Implementation(ADarkroomCharacter* Interactor) override;

	/** Игрок вышел сам (нажал E изнутри) — освобождаем место. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Hiding")
	void NotifyPlayerLeft(ADarkroomCharacter* Player);

	UFUNCTION(BlueprintPure, Category = "Darkroom|Hiding")
	bool IsOccupied() const { return Occupant != nullptr; }

	UFUNCTION(BlueprintImplementableEvent, Category = "Darkroom|Hiding")
	void OnOccupiedChangedBP(bool bOccupied);

protected:
	/**
	 * Корень, к которому крепится всё остальное. Нужен именно отдельный:
	 * если сделать корнем меш, его масштаб растянет и точки входа/выхода,
	 * и игрок при выходе окажется в случайном месте.
	 */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Hiding")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Hiding")
	TObjectPtr<UStaticMeshComponent> Mesh;

	/** Куда телепортируется игрок внутри шкафа. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Hiding")
	TObjectPtr<USceneComponent> HidePoint;

	/** Куда игрок выходит. Должна быть вне меша, иначе он застрянет. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Hiding")
	TObjectPtr<USceneComponent> ExitPoint;

	/** Сколько страха снимается за секунду сидения внутри. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Darkroom|Hiding", meta = (ClampMin = "0.0"))
	float FearReliefPerSecond = 5.f;

private:
	UPROPERTY(Transient)
	TObjectPtr<ADarkroomCharacter> Occupant;
};
