#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SafeLightZone.generated.h"

class UBoxComponent;

/**
 * Освещённый участок уровня: рабочая лампа, окно с луной, костёр.
 *
 * Пока игрок внутри, страх спадает даже с выключенным фонарём. Такие зоны —
 * единственные передышки на карте, и расставлять их надо скупо: чем их больше,
 * тем слабее давление темноты.
 *
 * Зона отвечает только за игровое правило и никак не связана с реальным светом —
 * лампу рядом всё равно нужно поставить руками, иначе игрок не поймёт логику.
 */
UCLASS()
class DARKROOM_API ASafeLightZone : public AActor
{
	GENERATED_BODY()

public:
	ASafeLightZone();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Light")
	TObjectPtr<UBoxComponent> Volume;

	UFUNCTION()
	void HandleBeginOverlap(
		UPrimitiveComponent* OverlappedComponent,
		AActor* OtherActor,
		UPrimitiveComponent* OtherComp,
		int32 OtherBodyIndex,
		bool bFromSweep,
		const FHitResult& SweepResult);

	UFUNCTION()
	void HandleEndOverlap(
		UPrimitiveComponent* OverlappedComponent,
		AActor* OtherActor,
		UPrimitiveComponent* OtherComp,
		int32 OtherBodyIndex);
};
