#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "World/DarkroomInteractable.h"
#include "PickupActor.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;

/**
 * База для всего, что можно подобрать.
 *
 * Подсветку, звук и уничтожение делает базовый класс; наследнику остаётся только
 * переопределить OnCollected. Blueprint-наследник может переопределить и его.
 */
UCLASS(Abstract)
class DARKROOM_API APickupActor : public AActor, public IDarkroomInteractable
{
	GENERATED_BODY()

public:
	APickupActor();

	// IDarkroomInteractable
	virtual FText GetInteractionPrompt_Implementation(ADarkroomCharacter* Interactor) const override;
	virtual void Interact_Implementation(ADarkroomCharacter* Interactor) override;
	virtual void OnFocusChanged_Implementation(bool bFocused) override;

protected:
	virtual void BeginPlay() override;

	/** Что именно делает этот предмет. Реализуется наследниками. */
	virtual void OnCollected(ADarkroomCharacter* Collector);

	/** Точка расширения для Blueprint: звук, партиклы, запись в дневник. */
	UFUNCTION(BlueprintImplementableEvent, Category = "Darkroom|Pickup")
	void OnCollectedBP(ADarkroomCharacter* Collector);

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Pickup")
	TObjectPtr<UStaticMeshComponent> Mesh;

	/** Слабый огонёк, чтобы предмет можно было заметить в темноте. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Pickup")
	TObjectPtr<UPointLightComponent> Glow;

	/** Текст подсказки в прицеле. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Darkroom|Pickup")
	FText PickupPrompt;

	/** Насколько подбор предмета успокаивает игрока. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Darkroom|Pickup", meta = (ClampMin = "0.0"))
	float FearRelief = 8.f;

	/** Во сколько раз ярче светится предмет под прицелом. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Pickup", meta = (ClampMin = "1.0"))
	float FocusGlowMultiplier = 3.f;

private:
	float BaseGlowIntensity = 0.f;
};

/**
 * Фрагмент — то, ради чего игрок вообще выходит в темноту.
 * Собери все — откроется выход.
 */
UCLASS()
class DARKROOM_API AFragmentPickup : public APickupActor
{
	GENERATED_BODY()

public:
	AFragmentPickup();

protected:
	virtual void OnCollected(ADarkroomCharacter* Collector) override;
};

/** Батарея: продлевает время работы фонаря. */
UCLASS()
class DARKROOM_API ABatteryPickup : public APickupActor
{
	GENERATED_BODY()

public:
	ABatteryPickup();

protected:
	virtual void OnCollected(ADarkroomCharacter* Collector) override;

	/** Сколько процентов заряда даёт. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Darkroom|Pickup", meta = (ClampMin = "1.0", ClampMax = "100.0"))
	float ChargeAmount = 45.f;
};
