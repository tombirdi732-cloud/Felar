#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "World/FelarInteractable.h"
#include "HidingSpot.generated.h"

class UStaticMeshComponent;
class USceneComponent;
class AFelarCharacter;

/**
 * Шкаф. Игрок прячется внутри: существо перестаёт его видеть, страх медленно спадает.
 *
 * Укрытие не абсолютно — в панике игрок всё равно ахает, и этот шум существо слышит.
 * Иначе шкаф стал бы кнопкой "выиграть", и всё напряжение исчезло бы.
 */
UCLASS()
class FELAR_API AHidingSpot : public AActor, public IFelarInteractable
{
	GENERATED_BODY()

public:
	AHidingSpot();

	virtual void Tick(float DeltaTime) override;

	// IFelarInteractable
	virtual bool CanInteract_Implementation(AFelarCharacter* Interactor) const override;
	virtual FText GetInteractionPrompt_Implementation(AFelarCharacter* Interactor) const override;
	virtual void Interact_Implementation(AFelarCharacter* Interactor) override;

	/** Игрок вышел сам (нажал E изнутри) — освобождаем место. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Hiding")
	void NotifyPlayerLeft(AFelarCharacter* Player);

	UFUNCTION(BlueprintPure, Category = "Felar|Hiding")
	bool IsOccupied() const { return Occupant != nullptr; }

	UFUNCTION(BlueprintImplementableEvent, Category = "Felar|Hiding")
	void OnOccupiedChangedBP(bool bOccupied);

protected:
	/**
	 * Корень, к которому крепится всё остальное. Нужен именно отдельный:
	 * если сделать корнем меш, его масштаб растянет и точки входа/выхода,
	 * и игрок при выходе окажется в случайном месте.
	 */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Hiding")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Hiding")
	TObjectPtr<UStaticMeshComponent> Mesh;

	/** Куда телепортируется игрок внутри шкафа. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Hiding")
	TObjectPtr<USceneComponent> HidePoint;

	/** Куда игрок выходит. Должна быть вне меша, иначе он застрянет. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Hiding")
	TObjectPtr<USceneComponent> ExitPoint;

	/** Сколько страха снимается за секунду сидения внутри. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Hiding", meta = (ClampMin = "0.0"))
	float FearReliefPerSecond = 5.f;

private:
	UPROPERTY(Transient)
	TObjectPtr<AFelarCharacter> Occupant;
};
