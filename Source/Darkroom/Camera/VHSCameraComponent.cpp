#include "Camera/VHSCameraComponent.h"

#include "Darkroom.h"
#include "GameFramework/Pawn.h"

UVHSCameraComponent::UVHSCameraComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PrePhysics;

	// Вес блендинга задаётся здесь один раз: сами настройки пересобираются
	// каждый кадр в TickGlitch, а вес меняется только при включении/выключении.
	PostProcessBlendWeight = 1.f;
}

void UVHSCameraComponent::BeginPlay()
{
	Super::BeginPlay();

	ApplyBasePostProcess();
	ScheduleNextGlitch();

	// Случайная стартовая точка шума: иначе каждая партия начинается с одного
	// и того же движения камеры, и это очень заметно.
	NoiseTime = FMath::FRandRange(0.f, 1000.f);
}

void UVHSCameraComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (!bVHSEnabled)
	{
		return;
	}

	TickSway(DeltaTime);
	TickStepSpring(DeltaTime);
	TickGlitch(DeltaTime);
}

void UVHSCameraComponent::AddStepImpulse(float Strength)
{
	if (Strength <= 0.f)
	{
		return;
	}

	// Вниз по Z и вбок по Y. Знак бокового сноса чередуется, поэтому походка
	// получается «левая-правая», а не одинаковым качком в одну сторону.
	StepVelocity.Y += StepImpulseStrength * Strength * StepLateralRatio * StepLateralSign;
	StepVelocity.X -= StepImpulseStrength * Strength;

	StepLateralSign = -StepLateralSign;
}

void UVHSCameraComponent::TickStepSpring(float DeltaTime)
{
	// Пружина с затуханием: толчок гасится сам, отдельные таймеры не нужны,
	// а наложение двух шагов подряд складывается естественно.
	const FVector2D Acceleration =
		-StepOffset * StepSpringStiffness - StepVelocity * StepSpringDamping;

	StepVelocity += Acceleration * DeltaTime;
	StepOffset += StepVelocity * DeltaTime;

	// Дребезг около нуля не виден, но продолжает считаться — обнуляем.
	if (StepOffset.IsNearlyZero(0.01f) && StepVelocity.IsNearlyZero(0.01f))
	{
		StepOffset = FVector2D::ZeroVector;
		StepVelocity = FVector2D::ZeroVector;
	}
}

void UVHSCameraComponent::GetCameraView(float DeltaTime, FMinimalViewInfo& DesiredView)
{
	Super::GetCameraView(DeltaTime, DesiredView);

	if (!bVHSEnabled)
	{
		return;
	}

	// Дрожание накладывается поверх готового вида, а не на трансформ компонента:
	// так оно не влияет ни на прицел взаимодействия, ни на логику видимости —
	// трясётся только картинка.
	DesiredView.Rotation += SwayRotation;

	// StepOffset.X — просадка по вертикали, .Y — боковой снос.
	const FVector TotalOffset = SwayOffset + FVector(0.f, StepOffset.Y, StepOffset.X);
	DesiredView.Location += DesiredView.Rotation.RotateVector(TotalOffset);
}

void UVHSCameraComponent::SetDistortionScale(float NewScale)
{
	DistortionScale = FMath::Clamp(NewScale, 0.f, 1.f);
}

void UVHSCameraComponent::SetVHSEnabled(bool bEnabled)
{
	bVHSEnabled = bEnabled;
	PostProcessBlendWeight = bEnabled ? 1.f : 0.f;

	if (!bEnabled)
	{
		SwayRotation = FRotator::ZeroRotator;
		SwayOffset = FVector::ZeroVector;
		StepOffset = FVector2D::ZeroVector;
		StepVelocity = FVector2D::ZeroVector;
		GlitchTimeLeft = 0.f;
	}
}

void UVHSCameraComponent::ApplyBasePostProcess()
{
	FPostProcessSettings& PP = PostProcessSettings;

	// Хроматические аберрации: цветовые каёмки по краям кадра — самая узнаваемая
	// черта дешёвой оптики и изношенной плёнки.
	PP.bOverride_SceneFringeIntensity = true;
	PP.SceneFringeIntensity = FringeIntensity;
	PP.bOverride_ChromaticAberrationStartOffset = true;
	PP.ChromaticAberrationStartOffset = 0.25f;

	PP.bOverride_VignetteIntensity = true;
	PP.VignetteIntensity = VignetteIntensity;

	PP.bOverride_FilmGrainIntensity = true;
	PP.FilmGrainIntensity = GrainIntensity;

	PP.bOverride_ColorSaturation = true;
	PP.ColorSaturation = FVector4(Saturation, Saturation, Saturation, 1.f);

	PP.bOverride_ColorContrast = true;
	PP.ColorContrast = FVector4(Contrast, Contrast, Contrast, 1.f);

	PP.bOverride_ColorGain = true;
	PP.ColorGain = FVector4(TapeTint.R, TapeTint.G, TapeTint.B, 1.f);

	PP.bOverride_MotionBlurAmount = true;
	PP.MotionBlurAmount = MotionBlur;

	// Фиксированная экспозиция обязательна: с автоэкспозицией движок сам
	// «вытягивает» тёмные комнаты, и никакой темноты в игре не остаётся.
	PP.bOverride_AutoExposureMethod = true;
	PP.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
	PP.bOverride_AutoExposureBias = true;
	PP.AutoExposureBias = ExposureBias;

	PP.bOverride_BloomIntensity = true;
	PP.BloomIntensity = 0.45f;
}

float UVHSCameraComponent::GetMovementSwayFactor() const
{
	const APawn* OwnerPawn = Cast<APawn>(GetOwner());
	if (!OwnerPawn)
	{
		return 1.f;
	}

	const float Speed = OwnerPawn->GetVelocity().Size2D();
	const float SpeedAlpha = FMath::Clamp(Speed / FullSwaySpeedThreshold, 0.f, 1.f);

	// На бегу камера болтается заметно сильнее — это и читаемая обратная связь
	// по скорости, и лишний повод не бегать без нужды.
	return FMath::Lerp(1.f, MovementSwayMultiplier, SpeedAlpha);
}

void UVHSCameraComponent::TickSway(float DeltaTime)
{
	const float MovementFactor = GetMovementSwayFactor();

	// В панике время шума течёт быстрее — дрожь становится не только сильнее,
	// но и мельче по частоте. Одной амплитуды для ощущения паники не хватает.
	NoiseTime += DeltaTime * SwaySpeed * FMath::Lerp(1.f, 2.4f, DistortionScale);

	const float Amplitude = FMath::Lerp(BaseSwayAngle, PanicSwayAngle, DistortionScale) * MovementFactor;

	// Разные смещения по осям дают некоррелированный шум: без них камера
	// качалась бы строго по диагонали, и это выглядит механически.
	const float Pitch = FMath::PerlinNoise1D(NoiseTime) * Amplitude;
	const float Yaw = FMath::PerlinNoise1D(NoiseTime + 137.5f) * Amplitude;
	const float Roll = FMath::PerlinNoise1D(NoiseTime + 311.7f) * Amplitude * 0.6f;

	SwayRotation = FRotator(Pitch, Yaw, Roll);

	const float OffsetAmount = SwayOffsetAmount * MovementFactor * FMath::Lerp(1.f, 1.8f, DistortionScale);
	SwayOffset = FVector(
		FMath::PerlinNoise1D(NoiseTime + 57.3f) * OffsetAmount * 0.5f,
		FMath::PerlinNoise1D(NoiseTime + 211.9f) * OffsetAmount,
		FMath::PerlinNoise1D(NoiseTime + 419.1f) * OffsetAmount);

	if (GlitchTimeLeft > 0.f)
	{
		// Во время сбоя кадр резко «ведёт» — наклон гасится к концу сбоя,
		// иначе возврат в норму выглядит как рывок.
		const float GlitchAlpha = GlitchTimeLeft / FMath::Max(GlitchTotalTime, KINDA_SMALL_NUMBER);
		SwayRotation.Roll += GlitchRollAngle * GlitchAlpha * FMath::Sin(NoiseTime * 40.f);
	}
}

void UVHSCameraComponent::TickGlitch(float DeltaTime)
{
	if (GlitchTimeLeft > 0.f)
	{
		GlitchTimeLeft = FMath::Max(0.f, GlitchTimeLeft - DeltaTime);

		const float GlitchAlpha = GlitchTimeLeft / FMath::Max(GlitchTotalTime, KINDA_SMALL_NUMBER);
		PostProcessSettings.SceneFringeIntensity =
			FMath::Lerp(FringeIntensity, GlitchFringeIntensity, GlitchAlpha);

		if (GlitchTimeLeft <= 0.f)
		{
			PostProcessSettings.SceneFringeIntensity = FringeIntensity;
			ScheduleNextGlitch();
		}
		return;
	}

	TimeToNextGlitch -= DeltaTime;
	if (TimeToNextGlitch <= 0.f)
	{
		TriggerGlitch(GlitchDuration);
	}
}

void UVHSCameraComponent::TriggerGlitch(float Duration)
{
	GlitchTotalTime = FMath::Max(Duration, KINDA_SMALL_NUMBER);
	GlitchTimeLeft = GlitchTotalTime;
}

void UVHSCameraComponent::ScheduleNextGlitch()
{
	const float MaxInterval = FMath::Max(MinGlitchInterval, MaxGlitchInterval);

	// Чем выше страх, тем короче паузы между сбоями: плёнка «нервничает» вместе
	// с персонажем. Делитель, а не множитель — интервал должен сокращаться.
	const float RateDivisor = FMath::Lerp(1.f, PanicGlitchRateMultiplier, DistortionScale);

	TimeToNextGlitch = FMath::FRandRange(MinGlitchInterval, MaxInterval) / RateDivisor;
}
