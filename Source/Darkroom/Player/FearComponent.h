#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FearComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnFearChanged, float, FearPercent);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPanicStateChanged, bool, bInPanic);
/** Игрок непроизвольно ахнул от страха — этот шум слышит существо. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnInvoluntaryGasp);
/** Страх дошёл до предела: существо получает точную позицию игрока. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnFearBreakdown);

/**
 * Страх — вторая половина центральной дилеммы игры.
 *
 * В темноте страх растёт, на свету падает. Выше PanicThreshold игрок начинает
 * непроизвольно ахать (шум => существо идёт на звук), а на 100% происходит срыв:
 * существо узнаёт точную позицию, после чего страх сбрасывается до BreakdownResetTo.
 *
 * Именно это не даёт "просто выключить фонарь и отсидеться в углу" — стратегии,
 * которая иначе ломает любой хоррор с фонариком.
 *
 * Сам компонент ничего не знает про существо: он только кричит делегатами,
 * а ADarkroomCharacter уже переводит это в шум для ИИ.
 */
UCLASS(ClassGroup = (Darkroom), meta = (BlueprintSpawnableComponent))
class DARKROOM_API UFearComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UFearComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/**
	 * Владелец каждый кадр сообщает, находится ли игрок в безопасности (на свету).
	 * Свет от собственного фонаря или от лампы на уровне — оба варианта считаются.
	 */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Fear")
	void SetInLight(bool bNewInLight);

	/** Существо в прямой видимости — страх растёт гораздо быстрее. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Fear")
	void SetStalkerVisible(bool bVisible);

	/** Разовый всплеск страха: скример, хлопнувшая дверь, крик в темноте. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Fear")
	void AddFear(float Amount);

	/** Успокоение: спрятался в шкафу, подобрал батарею, дошёл до чекпоинта. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|Fear")
	void RelieveFear(float Amount);

	UFUNCTION(BlueprintPure, Category = "Darkroom|Fear")
	float GetFear() const { return Fear; }

	/** 0..1 — для вкладывания в материал пост-процесса (виньетка, зерно, тремор). */
	UFUNCTION(BlueprintPure, Category = "Darkroom|Fear")
	float GetFearPercent() const { return FMath::Clamp(Fear / 100.f, 0.f, 1.f); }

	UFUNCTION(BlueprintPure, Category = "Darkroom|Fear")
	bool IsInPanic() const { return bInPanic; }

	UPROPERTY(BlueprintAssignable, Category = "Darkroom|Fear")
	FOnFearChanged OnFearChanged;

	UPROPERTY(BlueprintAssignable, Category = "Darkroom|Fear")
	FOnPanicStateChanged OnPanicStateChanged;

	UPROPERTY(BlueprintAssignable, Category = "Darkroom|Fear")
	FOnInvoluntaryGasp OnInvoluntaryGasp;

	UPROPERTY(BlueprintAssignable, Category = "Darkroom|Fear")
	FOnFearBreakdown OnFearBreakdown;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Darkroom|Fear")
	float Fear = 0.f;

	/** Прирост страха в секунду, пока игрок в темноте. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.0"))
	float DarknessFearPerSecond = 4.5f;

	/** Дополнительный прирост, пока существо в прямой видимости. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.0"))
	float StalkerVisibleFearPerSecond = 12.f;

	/** Спад страха в секунду, пока игрок на свету. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.0"))
	float LightRecoveryPerSecond = 6.f;

	/** С этого уровня начинается паника и непроизвольные вздохи. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.0", ClampMax = "100.0"))
	float PanicThreshold = 70.f;

	/** Паника отпускает чуть ниже порога — чтобы состояние не дребезжало на границе. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.0", ClampMax = "100.0"))
	float PanicReleaseThreshold = 60.f;

	/** Минимальный и максимальный интервал между непроизвольными вздохами в панике. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.5"))
	float MinGaspInterval = 3.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.5"))
	float MaxGaspInterval = 7.f;

	/** До какого уровня падает страх после срыва. Не до нуля — иначе срыв был бы наградой. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|Fear", meta = (ClampMin = "0.0", ClampMax = "100.0"))
	float BreakdownResetTo = 55.f;

private:
	void UpdatePanicState();
	void TickGasp(float DeltaTime);
	void BroadcastFearIfChanged();
	void ScheduleNextGasp();

	bool bInLight = false;
	bool bStalkerVisible = false;
	bool bInPanic = false;

	float GaspTimer = 0.f;
	float LastBroadcastFear = -1.f;
};
