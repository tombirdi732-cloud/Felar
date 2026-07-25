#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlashlightComponent.generated.h"

class USpotLightComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnFlashlightToggled, bool, bIsOn);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnBatteryChanged, float, BatteryPercent);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnBatteryDepleted);

/**
 * Фонарь игрока: включение, разряд батареи, запасные батареи.
 *
 * Ключевой узел дизайна: включённый фонарь резко увеличивает дистанцию, с которой
 * существо замечает игрока (см. AStalkerAIController). Свет — это одновременно
 * единственный способ что-то найти и главный способ выдать себя.
 *
 * Компонент не знает ни про ИИ, ни про UI: он только меняет своё состояние и
 * рассылает события. Все подписчики (UI, звук, ИИ) читают его сами.
 */
UCLASS(ClassGroup = (Felar), meta = (BlueprintSpawnableComponent))
class FELAR_API UFlashlightComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UFlashlightComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Привязать компонент к конкретному источнику света на персонаже. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Flashlight")
	void SetLightComponent(USpotLightComponent* InLight);

	/** Включить / выключить. Не сработает, если батарея пуста. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Flashlight")
	void ToggleLight();

	UFUNCTION(BlueprintCallable, Category = "Felar|Flashlight")
	void SetLightOn(bool bNewOn);

	/** Добавить заряд (подобрана батарея). Amount в процентах: 100 = полная. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Flashlight")
	void AddBattery(float Amount);

	UFUNCTION(BlueprintPure, Category = "Felar|Flashlight")
	bool IsLightOn() const { return bIsOn; }

	UFUNCTION(BlueprintPure, Category = "Felar|Flashlight")
	float GetBattery() const { return Battery; }

	/** 0..1 — удобно для прогресс-бара в UMG. */
	UFUNCTION(BlueprintPure, Category = "Felar|Flashlight")
	float GetBatteryPercent() const { return FMath::Clamp(Battery / 100.f, 0.f, 1.f); }

	/** Батарея почти села — повод мигать светом и пищать. */
	UFUNCTION(BlueprintPure, Category = "Felar|Flashlight")
	bool IsBatteryLow() const { return Battery <= LowBatteryThreshold; }

	UPROPERTY(BlueprintAssignable, Category = "Felar|Flashlight")
	FOnFlashlightToggled OnFlashlightToggled;

	UPROPERTY(BlueprintAssignable, Category = "Felar|Flashlight")
	FOnBatteryChanged OnBatteryChanged;

	UPROPERTY(BlueprintAssignable, Category = "Felar|Flashlight")
	FOnBatteryDepleted OnBatteryDepleted;

protected:
	/** Текущий заряд, 0..100. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Flashlight")
	float Battery = 100.f;

	/** Сколько процентов заряда сгорает за секунду работы. 0.8 => ~2 минуты света. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Flashlight", meta = (ClampMin = "0.0"))
	float DrainPerSecond = 0.8f;

	/** Ниже этого значения считаем батарею "почти севшей". */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Flashlight", meta = (ClampMin = "0.0", ClampMax = "100.0"))
	float LowBatteryThreshold = 20.f;

	/** Максимальный заряд. Лишнее при подборе батареи пропадает. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Flashlight", meta = (ClampMin = "1.0"))
	float MaxBattery = 100.f;

	/** Интенсивность включённого света (candelas). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Flashlight", meta = (ClampMin = "0.0"))
	float LightIntensity = 8000.f;

	/** Свет тускнеет по мере разряда, но не ниже этой доли от LightIntensity. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Flashlight", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float MinIntensityFraction = 0.35f;

private:
	/** Обновить состояние реального USpotLightComponent под текущий заряд. */
	void ApplyLightState();

	/** Разослать OnBatteryChanged, если значение заметно изменилось. */
	void BroadcastBatteryIfChanged();

	UPROPERTY(Transient)
	TObjectPtr<USpotLightComponent> Light;

	bool bIsOn = false;

	/** Последнее разосланное значение — чтобы не спамить делегатом каждый кадр. */
	float LastBroadcastBattery = -1.f;
};
