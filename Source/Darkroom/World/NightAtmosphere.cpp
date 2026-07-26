#include "World/NightAtmosphere.h"

#include "Darkroom.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SceneComponent.h"

ANightAtmosphere::ANightAtmosphere()
{
	PrimaryActorTick.bCanEverTick = false;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	MoonLight = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("MoonLight"));
	MoonLight->SetupAttachment(Root);
	// Movable обязателен: со статичным светом нужен запечённый lightmap, а его
	// в проекте без ассетов взять неоткуда.
	MoonLight->SetMobility(EComponentMobility::Movable);

	SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
	SkyLight->SetupAttachment(Root);
	SkyLight->SetMobility(EComponentMobility::Movable);

	SkyAtmosphere = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("SkyAtmosphere"));
	SkyAtmosphere->SetupAttachment(Root);

	HeightFog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("HeightFog"));
	HeightFog->SetupAttachment(Root);
}

void ANightAtmosphere::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);

	// Применяем и в редакторе: плотность тумана и угол луны подбираются
	// только на глаз, и делать это через запуск игры невыносимо медленно.
	ApplyAtmosphere();
}

void ANightAtmosphere::BeginPlay()
{
	Super::BeginPlay();

	ApplyAtmosphere();
}

void ANightAtmosphere::ApplyAtmosphere()
{
	// --- Луна ---

	MoonLight->SetRelativeRotation(FRotator(MoonPitch, MoonYaw, 0.f));
	MoonLight->SetIntensity(MoonIntensity);
	MoonLight->SetLightColor(MoonColor);
	MoonLight->SetVolumetricScatteringIntensity(MoonVolumetricScattering);
	MoonLight->SetCastShadows(true);

	MoonLight->LightSourceAngle = MoonSourceAngle;
	MoonLight->DynamicShadowDistanceMovableLight = ShadowDistance;
	// Тень в объёме — то, что делает лучи в окнах «настоящими»: без неё свет
	// проходит сквозь стены, и весь эффект разваливается.
	MoonLight->bCastVolumetricShadow = true;
	MoonLight->MarkRenderStateDirty();

	// --- Небо ---

	SkyLight->SetIntensity(SkyLightIntensity);
	SkyLight->SetLightColor(SkyLightColor);
	// Захват сцены в реальном времени: небо от SkyAtmosphere само становится
	// источником ambient, и подбирать кубмапу вручную не нужно.
	SkyLight->bRealTimeCapture = true;
	SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;
	SkyLight->MarkRenderStateDirty();

	SkyAtmosphere->SetVisibility(bEnableSkyAtmosphere);

	// --- Туман ---

	HeightFog->SetFogDensity(FogDensity);
	HeightFog->SetFogHeightFalloff(FogHeightFalloff);
	HeightFog->SetFogInscatteringColor(FogColor);
	HeightFog->SetStartDistance(FogStartDistance);
	HeightFog->SetFogMaxOpacity(FogMaxOpacity);

	HeightFog->SetVolumetricFog(bVolumetricFog);
	HeightFog->SetVolumetricFogExtinctionScale(VolumetricExtinctionScale);
	HeightFog->SetVolumetricFogDistance(VolumetricFogDistance);
	HeightFog->SetVolumetricFogAlbedo(VolumetricAlbedo);

	UE_LOG(LogDarkroom, Verbose,
		TEXT("NightAtmosphere applied: moon %.2f lx, fog %.4f, volumetric %s"),
		MoonIntensity, FogDensity, bVolumetricFog ? TEXT("on") : TEXT("off"));
}

void ANightAtmosphere::SetFogDensityImmediate(float NewDensity)
{
	FogDensity = FMath::Max(0.f, NewDensity);
	HeightFog->SetFogDensity(FogDensity);
}
