#pragma once

#include "CoreMinimal.h"
#include "Camera/CameraComponent.h"
#include "VHSCameraComponent.generated.h"

/**
 * Камера в стиле found footage: старая видеокассета вместо «чистой» игровой картинки.
 *
 * Эффект собран из трёх слоёв:
 *  1. Пост-обработка — хроматические аберрации, виньетка, зерно, сдвиг цвета.
 *     Всё это штатные поля FPostProcessSettings, поэтому не требует ни одного ассета.
 *  2. Дрожание рук — многослойный шум Перлина на поворот, смещение и FOV.
 *     Именно оно превращает камеру из «дрона» в «человека, который держит камкордер».
 *  3. Сбои плёнки — редкие короткие всплески искажений, имитирующие потерю трекинга.
 *
 * Всё это масштабируется страхом игрока: чем страшнее, тем сильнее трясутся руки
 * и тем чаще срывается плёнка. Картинка становится индикатором состояния
 * персонажа, и для этого не нужно ни одного элемента интерфейса.
 *
 * Чего здесь принципиально нет: разверток, изгиба строк и «уползающего» кадра —
 * это делается только материалом пост-процесса, а материал является бинарным
 * ассетом. Рецепт материала расписан в README.
 */
UCLASS(ClassGroup = (Darkroom), meta = (BlueprintSpawnableComponent))
class DARKROOM_API UVHSCameraComponent : public UCameraComponent
{
	GENERATED_BODY()

public:
	UVHSCameraComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
	virtual void GetCameraView(float DeltaTime, FMinimalViewInfo& DesiredView) override;

	/**
	 * Насколько «расшатана» камера, 0..1. Обычно сюда подаётся уровень страха.
	 * 0 — ровная съёмка, 1 — трясущиеся руки и постоянные сбои плёнки.
	 */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|VHS")
	void SetDistortionScale(float NewScale);

	UFUNCTION(BlueprintPure, Category = "Darkroom|VHS")
	float GetDistortionScale() const { return DistortionScale; }

	/** Запустить сбой плёнки прямо сейчас — для скримеров и скриптовых моментов. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|VHS")
	void TriggerGlitch(float Duration = 0.25f);

	/**
	 * Толчок камеры от шага или приземления.
	 * Strength = 1 соответствует обычному шагу, приземление даёт 2.5–4.
	 *
	 * Именно этот короткий провал вниз в момент контакта с полом читается как
	 * «человек идёт». Плавного шума для этого недостаточно: он ощущается как
	 * камера на штативе в чужих руках, а не как походка.
	 */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|VHS")
	void AddStepImpulse(float Strength = 1.f);

	UFUNCTION(BlueprintPure, Category = "Darkroom|VHS")
	bool IsGlitching() const { return GlitchTimeLeft > 0.f; }

	/** Полностью отключить эффект — удобно для отладки геометрии и освещения. */
	UFUNCTION(BlueprintCallable, Category = "Darkroom|VHS")
	void SetVHSEnabled(bool bEnabled);

protected:
	/** Собрать «плёночный» набор настроек пост-обработки и записать в PostProcessSettings. */
	void ApplyBasePostProcess();

	// --- Пост-обработка ---

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "0.0", ClampMax = "5.0"))
	float FringeIntensity = 1.6f;

	/** Аберрации в момент сбоя. Резкий скачок читается как «плёнку повело». */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "0.0", ClampMax = "5.0"))
	float GlitchFringeIntensity = 4.5f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "0.0", ClampMax = "2.0"))
	float VignetteIntensity = 0.8f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "0.0", ClampMax = "5.0"))
	float GrainIntensity = 0.55f;

	/** Ниже единицы — выцветшая плёнка. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "0.0", ClampMax = "2.0"))
	float Saturation = 0.82f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "0.5", ClampMax = "2.0"))
	float Contrast = 1.08f;

	/** Оттенок плёнки. Лёгкий уход в холодную зелень читается как дешёвая кассета. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look")
	FLinearColor TapeTint = FLinearColor(0.94f, 1.02f, 0.98f, 1.f);

	/** Ручная экспозиция: автоэкспозиция «подсвечивает» темноту и убивает хоррор. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "-8.0", ClampMax = "8.0"))
	float ExposureBias = 0.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Look", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float MotionBlur = 0.35f;

	// --- Дрожание рук ---

	/** Амплитуда покачивания в градусах при DistortionScale = 0. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Handheld", meta = (ClampMin = "0.0"))
	float BaseSwayAngle = 0.45f;

	/** Дополнительная амплитуда при DistortionScale = 1. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Handheld", meta = (ClampMin = "0.0"))
	float PanicSwayAngle = 2.2f;

	/** Скорость дрожания. Выше — нервнее. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Handheld", meta = (ClampMin = "0.01"))
	float SwaySpeed = 1.4f;

	/** Смещение камеры в сантиметрах — «дыхание» оператора. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Handheld", meta = (ClampMin = "0.0"))
	float SwayOffsetAmount = 1.6f;

	/** Насколько сильнее трясёт камеру при движении игрока. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Handheld", meta = (ClampMin = "0.0"))
	float MovementSwayMultiplier = 2.0f;

	/** Скорость владельца, при которой MovementSwayMultiplier достигается полностью. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Handheld", meta = (ClampMin = "1.0"))
	float FullSwaySpeedThreshold = 550.f;

	// --- Шаги ---

	/** На сколько сантиметров проседает камера на обычном шаге. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Step", meta = (ClampMin = "0.0"))
	float StepImpulseStrength = 22.f;

	/** Боковой снос шага. Ноги ставятся поочерёдно, поэтому знак чередуется. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Step", meta = (ClampMin = "0.0"))
	float StepLateralRatio = 0.45f;

	/** Жёсткость пружины возврата. Выше — камера отскакивает резче. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Step", meta = (ClampMin = "1.0"))
	float StepSpringStiffness = 190.f;

	/** Затухание. Слишком мало — камера начнёт болтаться как на пружине. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Step", meta = (ClampMin = "0.1"))
	float StepSpringDamping = 14.f;

	// --- Сбои плёнки ---

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Glitch", meta = (ClampMin = "1.0"))
	float MinGlitchInterval = 9.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Glitch", meta = (ClampMin = "1.0"))
	float MaxGlitchInterval = 28.f;

	/** Во сколько раз чаще случаются сбои при DistortionScale = 1. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Glitch", meta = (ClampMin = "1.0"))
	float PanicGlitchRateMultiplier = 5.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Glitch", meta = (ClampMin = "0.02"))
	float GlitchDuration = 0.22f;

	/** Наклон кадра во время сбоя, градусы. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS|Glitch", meta = (ClampMin = "0.0"))
	float GlitchRollAngle = 1.8f;

private:
	void TickSway(float DeltaTime);
	void TickGlitch(float DeltaTime);
	void TickStepSpring(float DeltaTime);
	void ScheduleNextGlitch();

	/** Множитель тряски от скорости движения владельца. */
	float GetMovementSwayFactor() const;

	/** Накопленное «время шума». Растёт быстрее в панике — руки трясутся чаще. */
	float NoiseTime = 0.f;

	float DistortionScale = 0.f;
	float GlitchTimeLeft = 0.f;
	float GlitchTotalTime = 0.f;
	float TimeToNextGlitch = 0.f;

	FRotator SwayRotation = FRotator::ZeroRotator;
	FVector SwayOffset = FVector::ZeroVector;

	/** Смещение и скорость пружины шага: Y — боковой снос, Z — просадка. */
	FVector2D StepOffset = FVector2D::ZeroVector;
	FVector2D StepVelocity = FVector2D::ZeroVector;

	/** Знак бокового сноса. Меняется на каждом шаге — левая нога, правая нога. */
	float StepLateralSign = 1.f;

	bool bVHSEnabled = true;
};
