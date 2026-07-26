#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "NightAtmosphere.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;
class USkyAtmosphereComponent;
class UExponentialHeightFogComponent;

/**
 * Ночь целиком в одном акторе: луна, небо, ambient и объёмный туман.
 *
 * Смысл в том, чтобы не собирать освещение из пяти разрозненных актёров на сцене,
 * где половина настроек противоречит другой половине. Здесь всё связано и
 * подобрано под одну задачу: сделать темно, но не «слепо».
 *
 * Все параметры применяются и в редакторе (OnConstruction), поэтому крутить
 * плотность тумана и угол луны можно, не запуская игру.
 *
 * Важно: этот актор рассчитан на выключенную автоэкспозицию. Она отключена
 * и в Config/DefaultEngine.ini, и в UVHSCameraComponent. Если включить её
 * обратно, движок «вытянет» темноту, и ночь перестанет быть ночью.
 */
UCLASS()
class FELAR_API ANightAtmosphere : public AActor
{
	GENERATED_BODY()

public:
	ANightAtmosphere();

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;

	/** Пересобрать освещение из текущих параметров. */
	UFUNCTION(BlueprintCallable, CallInEditor, Category = "Felar|Night")
	void ApplyAtmosphere();

	/** Плавно изменить плотность тумана — для скриптовых сцен. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Night")
	void SetFogDensityImmediate(float NewDensity);

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Night")
	TObjectPtr<USceneComponent> Root;

	/** Луна. Единственный источник направленного света на всей карте. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Night")
	TObjectPtr<UDirectionalLightComponent> MoonLight;

	/** Рассеянный свет неба: без него тени становятся абсолютно чёрными. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Night")
	TObjectPtr<USkyLightComponent> SkyLight;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Night")
	TObjectPtr<USkyAtmosphereComponent> SkyAtmosphere;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Night")
	TObjectPtr<UExponentialHeightFogComponent> HeightFog;

	// --- Луна ---

	/** Высота луны над горизонтом в градусах. Низкая луна даёт длинные тени. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Moon", meta = (ClampMin = "-90.0", ClampMax = "90.0"))
	float MoonPitch = -32.f;

	/** Направление луны по горизонту в градусах. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Moon", meta = (ClampMin = "-360.0", ClampMax = "360.0"))
	float MoonYaw = 145.f;

	/**
	 * Яркость луны в люксах. Настоящее полнолуние — около 0.25 лк.
	 * Выше 1.0 ночь превращается в пасмурный день.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Moon", meta = (ClampMin = "0.0", ClampMax = "5.0"))
	float MoonIntensity = 0.35f;

	/** Холодный синий — то, как мозг ожидает увидеть лунный свет. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Moon")
	FLinearColor MoonColor = FLinearColor(0.42f, 0.55f, 0.95f, 1.f);

	/** Угловой размер источника: больше — мягче тени. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Moon", meta = (ClampMin = "0.0", ClampMax = "20.0"))
	float MoonSourceAngle = 1.2f;

	/** Насколько луна светится сквозь туман. Это и есть лучи в окнах. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Moon", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float MoonVolumetricScattering = 3.5f;

	/** Дальность динамических теней в сантиметрах. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Moon", meta = (ClampMin = "500.0"))
	float ShadowDistance = 12000.f;

	// --- Небо и ambient ---

	/** Общая подсветка теней. Ноль — абсолютно чёрные тени, играть невозможно. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Sky", meta = (ClampMin = "0.0", ClampMax = "2.0"))
	float SkyLightIntensity = 0.12f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Sky")
	FLinearColor SkyLightColor = FLinearColor(0.35f, 0.45f, 0.7f, 1.f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Sky")
	bool bEnableSkyAtmosphere = true;

	// --- Туман ---

	/** Плотность тумана. Главный рычаг дальности видимости. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog", meta = (ClampMin = "0.0", ClampMax = "0.5"))
	float FogDensity = 0.035f;

	/** Скорость спадания тумана с высотой. Больше — туман жмётся к земле. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog", meta = (ClampMin = "0.001", ClampMax = "2.0"))
	float FogHeightFalloff = 0.15f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog")
	FLinearColor FogColor = FLinearColor(0.055f, 0.075f, 0.125f, 1.f);

	/** С какого расстояния начинается туман. Ноль — туман «липнет» к камере. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog", meta = (ClampMin = "0.0"))
	float FogStartDistance = 150.f;

	/** Максимальная непрозрачность. Ниже единицы — вдали не белая стена, а дымка. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float FogMaxOpacity = 0.92f;

	/**
	 * Объёмный туман: свет фонаря становится видимым конусом в воздухе.
	 * Ради одного этого эффекта его и стоит включать — но он не бесплатный,
	 * на слабом железе первым делом выключай именно его.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog")
	bool bVolumetricFog = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float VolumetricExtinctionScale = 1.6f;

	/** Дальность просчёта объёмного тумана в сантиметрах. Дороже всего именно она. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog", meta = (ClampMin = "1000.0"))
	float VolumetricFogDistance = 8000.f;

	/** Цвет рассеяния в объёме. Почти белый — свет фонаря должен читаться. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Felar|Night|Fog")
	FColor VolumetricAlbedo = FColor(190, 200, 215, 255);
};
