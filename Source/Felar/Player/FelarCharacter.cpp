#include "Player/FelarCharacter.h"

#include "Felar.h"
#include "Player/FlashlightComponent.h"
#include "Player/FearComponent.h"
#include "Player/InteractionComponent.h"
#include "World/HidingSpot.h"
#include "AI/StalkerCharacter.h"
#include "Core/FelarGameMode.h"

#include "Camera/VHSCameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SpotLightComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Perception/AISense_Hearing.h"

AFelarCharacter::AFelarCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(34.f, 88.f);

	Camera = CreateDefaultSubobject<UVHSCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(GetCapsuleComponent());
	Camera->SetRelativeLocation(FVector(0.f, 0.f, 64.f));
	Camera->bUsePawnControlRotation = true;

	// Фонарь висит на камере: игрок светит ровно туда, куда смотрит.
	FlashlightLight = CreateDefaultSubobject<USpotLightComponent>(TEXT("FlashlightLight"));
	FlashlightLight->SetupAttachment(Camera);
	FlashlightLight->SetRelativeLocation(FVector(20.f, 10.f, -10.f));
	FlashlightLight->SetInnerConeAngle(18.f);
	FlashlightLight->SetOuterConeAngle(34.f);
	FlashlightLight->SetAttenuationRadius(2600.f);
	FlashlightLight->SetIntensityUnits(ELightUnits::Candelas);
	FlashlightLight->SetIntensity(8000.f);
	FlashlightLight->SetVisibility(false);
	FlashlightLight->SetCastShadows(true);

	Flashlight = CreateDefaultSubobject<UFlashlightComponent>(TEXT("Flashlight"));
	FearComponent = CreateDefaultSubobject<UFearComponent>(TEXT("Fear"));
	Interaction = CreateDefaultSubobject<UInteractionComponent>(TEXT("Interaction"));

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->MaxWalkSpeed = WalkSpeed;
	Movement->MaxWalkSpeedCrouched = CrouchSpeed;
	Movement->NavAgentProps.bCanCrouch = true;
	Movement->bCanWalkOffLedgesWhenCrouching = true;
	// От первого лица персонаж поворачивается вместе с камерой, а не отдельно.
	Movement->bOrientRotationToMovement = false;
	bUseControllerRotationYaw = true;
}

void AFelarCharacter::BeginPlay()
{
	Super::BeginPlay();

	Flashlight->SetLightComponent(FlashlightLight);

	// Страх сам не умеет шуметь — переводим его события в шум здесь.
	FearComponent->OnInvoluntaryGasp.AddDynamic(this, &AFelarCharacter::HandleInvoluntaryGasp);
	FearComponent->OnFearBreakdown.AddDynamic(this, &AFelarCharacter::HandleFearBreakdown);

	LastStepLocation = GetActorLocation();
	UpdateMaxSpeed();
}

void AFelarCharacter::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!bAlive)
	{
		return;
	}

	TickStamina(DeltaTime);
	TickFootsteps(DeltaTime);
	TickStalkerVisibility(DeltaTime);

	FearComponent->SetInLight(IsInLight());

	// Страх управляет камерой: руки трясутся сильнее, плёнка срывается чаще.
	// Состояние персонажа читается прямо с картинки, без единого элемента интерфейса.
	Camera->SetDistortionScale(FearComponent->GetFearPercent());
}

void AFelarCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	// Классический (legacy) ввод: имена осей и действий заданы в Config/DefaultInput.ini.
	// Это сделано намеренно — .ini является текстовым файлом, в отличие от ассетов
	// Enhanced Input, поэтому проект собирается без ручной настройки в редакторе.
	PlayerInputComponent->BindAxis("MoveForward", this, &AFelarCharacter::MoveForward);
	PlayerInputComponent->BindAxis("MoveRight", this, &AFelarCharacter::MoveRight);
	PlayerInputComponent->BindAxis("Turn", this, &AFelarCharacter::TurnAt);
	PlayerInputComponent->BindAxis("LookUp", this, &AFelarCharacter::LookUpAt);

	PlayerInputComponent->BindAction("Sprint", IE_Pressed, this, &AFelarCharacter::StartSprint);
	PlayerInputComponent->BindAction("Sprint", IE_Released, this, &AFelarCharacter::StopSprint);
	PlayerInputComponent->BindAction("Crouch", IE_Pressed, this, &AFelarCharacter::ToggleCrouch);
	PlayerInputComponent->BindAction("Interact", IE_Pressed, this, &AFelarCharacter::OnInteractPressed);
	PlayerInputComponent->BindAction("Flashlight", IE_Pressed, this, &AFelarCharacter::OnFlashlightPressed);
}

// --- Ввод ---

void AFelarCharacter::MoveForward(float Value)
{
	// В укрытии игрок не двигается: выйти можно только повторным нажатием E.
	if (Value == 0.f || !bAlive || IsHiding())
	{
		return;
	}

	AddMovementInput(FRotationMatrix(GetControlRotation()).GetScaledAxis(EAxis::X), Value);
}

void AFelarCharacter::MoveRight(float Value)
{
	if (Value == 0.f || !bAlive || IsHiding())
	{
		return;
	}

	AddMovementInput(FRotationMatrix(GetControlRotation()).GetScaledAxis(EAxis::Y), Value);
}

void AFelarCharacter::TurnAt(float Value)
{
	AddControllerYawInput(Value);
}

void AFelarCharacter::LookUpAt(float Value)
{
	AddControllerPitchInput(Value);
}

void AFelarCharacter::StartSprint()
{
	bWantsToSprint = true;
	UpdateMaxSpeed();
}

void AFelarCharacter::StopSprint()
{
	bWantsToSprint = false;
	UpdateMaxSpeed();
}

void AFelarCharacter::ToggleCrouch()
{
	if (IsHiding())
	{
		return;
	}

	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		Crouch();
		// Присед и бег взаимоисключающи.
		bWantsToSprint = false;
	}

	UpdateMaxSpeed();
}

void AFelarCharacter::OnInteractPressed()
{
	if (!bAlive)
	{
		return;
	}

	// Выход из укрытия имеет приоритет: изнутри шкафа прицел смотрит в дверцу.
	if (IsHiding())
	{
		LeaveHidingSpot();
		return;
	}

	if (Interaction->TryInteract())
	{
		// Возня с предметами слышна.
		EmitNoise(ENoiseLevel::Quiet);
	}
}

void AFelarCharacter::OnFlashlightPressed()
{
	if (!bAlive)
	{
		return;
	}

	Flashlight->ToggleLight();
}

// --- Тики систем ---

void AFelarCharacter::TickStamina(float DeltaTime)
{
	const bool bMoving = GetVelocity().SizeSquared2D() > FMath::Square(10.f);
	const bool bSprinting = bWantsToSprint && !bSprintBlocked && !bIsCrouched && bMoving;

	if (bSprinting)
	{
		Stamina = FMath::Max(0.f, Stamina - StaminaDrainPerSecond * DeltaTime);

		if (Stamina <= 0.f)
		{
			// Выдохся: спринт заблокирован, пока не отдышится до SprintRecoveryThreshold.
			bSprintBlocked = true;
			UpdateMaxSpeed();
		}
	}
	else
	{
		Stamina = FMath::Min(100.f, Stamina + StaminaRegenPerSecond * DeltaTime);

		if (bSprintBlocked && Stamina >= SprintRecoveryThreshold)
		{
			bSprintBlocked = false;
			UpdateMaxSpeed();
		}
	}

	if (FMath::Abs(Stamina - LastBroadcastStamina) >= 1.f)
	{
		LastBroadcastStamina = Stamina;
		OnStaminaChanged.Broadcast(GetStaminaPercent());
	}
}

void AFelarCharacter::TickFootsteps(float DeltaTime)
{
	if (IsHiding() || !GetCharacterMovement()->IsMovingOnGround())
	{
		LastStepLocation = GetActorLocation();
		return;
	}

	const FVector CurrentLocation = GetActorLocation();
	DistanceSinceStep += FVector::Dist2D(CurrentLocation, LastStepLocation);
	LastStepLocation = CurrentLocation;

	// Шум привязан к пройденному пути, а не к таймеру: медленный шаг шумит реже,
	// бег — чаще. Это ровно то поведение, которое игрок интуитивно ожидает.
	if (DistanceSinceStep < StepDistance)
	{
		return;
	}

	DistanceSinceStep = 0.f;
	EmitNoise(GetCurrentMovementNoise());
}

void AFelarCharacter::TickStalkerVisibility(float DeltaTime)
{
	TimeSinceVisibilityCheck += DeltaTime;
	if (TimeSinceVisibilityCheck < StalkerVisibilityCheckInterval)
	{
		return;
	}

	TimeSinceVisibilityCheck = 0.f;

	AStalkerCharacter* Stalker = FindStalker();
	if (!Stalker || IsHiding())
	{
		FearComponent->SetStalkerVisible(false);
		return;
	}

	const FVector EyeLocation = Camera->GetComponentLocation();
	const FVector ToStalker = Stalker->GetActorLocation() - EyeLocation;
	const float Distance = ToStalker.Size();

	if (Distance > StalkerVisionRange || Distance < KINDA_SMALL_NUMBER)
	{
		FearComponent->SetStalkerVisible(false);
		return;
	}

	// Существо должно быть в поле зрения игрока...
	const float CosAngle = FVector::DotProduct(Camera->GetForwardVector(), ToStalker / Distance);
	if (CosAngle < FMath::Cos(FMath::DegreesToRadians(StalkerVisionHalfAngle)))
	{
		FearComponent->SetStalkerVisible(false);
		return;
	}

	// ...и не за стеной.
	FCollisionQueryParams Params(SCENE_QUERY_STAT(FelarStalkerVisibility), false, this);
	Params.AddIgnoredActor(Stalker);

	FHitResult Hit;
	const bool bBlocked = GetWorld()->LineTraceSingleByChannel(
		Hit, EyeLocation, Stalker->GetActorLocation(), ECC_Visibility, Params);

	FearComponent->SetStalkerVisible(!bBlocked);
}

void AFelarCharacter::UpdateMaxSpeed()
{
	UCharacterMovementComponent* Movement = GetCharacterMovement();

	if (bIsCrouched)
	{
		Movement->MaxWalkSpeedCrouched = CrouchSpeed;
		return;
	}

	Movement->MaxWalkSpeed = (bWantsToSprint && !bSprintBlocked) ? SprintSpeed : WalkSpeed;
}

// --- Шум ---

ENoiseLevel AFelarCharacter::GetCurrentMovementNoise() const
{
	if (bIsCrouched)
	{
		return ENoiseLevel::Silent;
	}

	// Сравниваем с фактической скоростью, а не с флагом спринта: игрок, упирающийся
	// в стену с зажатым Shift, не должен шуметь как бегущий.
	const float Speed = GetVelocity().Size2D();
	return (Speed > (WalkSpeed + SprintSpeed) * 0.5f) ? ENoiseLevel::Loud : ENoiseLevel::Quiet;
}

void AFelarCharacter::EmitNoise(ENoiseLevel Level, FVector OverrideLocation)
{
	if (!bAlive)
	{
		return;
	}

	const float Loudness = FelarNoise::ToLoudness(Level);
	const FVector Location = OverrideLocation.IsNearlyZero() ? GetActorLocation() : OverrideLocation;

	UAISense_Hearing::ReportNoiseEvent(
		this,
		Location,
		Loudness,
		this,
		NoiseMaxRange * Loudness,
		TEXT("PlayerNoise"));
}

void AFelarCharacter::HandleInvoluntaryGasp()
{
	// Спрятавшийся игрок всё равно ахает — укрытие не делает его бесшумным.
	EmitNoise(ENoiseLevel::Quiet);
	UE_LOG(LogFelar, Verbose, TEXT("Player gasped from fear"));
}

void AFelarCharacter::HandleFearBreakdown()
{
	// Срыв слышно отовсюду: это и есть цена сидения в темноте.
	EmitNoise(ENoiseLevel::Scream);

	// Плёнку ведёт вместе с персонажем — игрок видит срыв, а не только слышит.
	Camera->TriggerGlitch(1.2f);

	UE_LOG(LogFelar, Log, TEXT("Player fear breakdown - position revealed"));
}

// --- Состояния ---

bool AFelarCharacter::IsInLight() const
{
	return Flashlight->IsLightOn() || LitZoneCount > 0;
}

void AFelarCharacter::AddLitZone(int32 Delta)
{
	LitZoneCount = FMath::Max(0, LitZoneCount + Delta);
}

void AFelarCharacter::EnterHidingSpot(AHidingSpot* Spot)
{
	if (!Spot || IsHiding() || !bAlive)
	{
		return;
	}

	CurrentHidingSpot = Spot;

	// Персонаж физически убирается со сцены: ни столкновений, ни видимости для ИИ.
	GetCharacterMovement()->StopMovementImmediately();
	GetCharacterMovement()->DisableMovement();
	SetActorEnableCollision(false);

	OnHidingStateChanged.Broadcast(true);
}

void AFelarCharacter::LeaveHidingSpot()
{
	if (!IsHiding())
	{
		return;
	}

	AHidingSpot* Spot = CurrentHidingSpot;
	// Сбрасываем ссылку до вызова укрытия, иначе получим взаимный вызов
	// Leave/NotifyPlayerLeft по кругу.
	CurrentHidingSpot = nullptr;

	// Укрытие ставит игрока в ExitPoint. Делать это нужно, пока коллизия
	// выключена, — иначе капсула застрянет в меше шкафа при выходе.
	if (IsValid(Spot))
	{
		Spot->NotifyPlayerLeft(this);
	}

	SetActorEnableCollision(true);
	GetCharacterMovement()->SetMovementMode(MOVE_Walking);

	OnHidingStateChanged.Broadcast(false);
}

void AFelarCharacter::OnCaught(AActor* Killer)
{
	if (!bAlive)
	{
		return;
	}

	bAlive = false;

	GetCharacterMovement()->DisableMovement();
	Flashlight->SetLightOn(false);

	// Длинный сбой записи вместо экрана смерти: камера «умирает» вместе с игроком.
	Camera->SetDistortionScale(1.f);
	Camera->TriggerGlitch(3.f);

	if (APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		DisableInput(PC);
	}

	UE_LOG(LogFelar, Log, TEXT("Player caught by %s"), *GetNameSafe(Killer));

	OnPlayerCaught.Broadcast(Killer);

	if (AFelarGameMode* GameMode = GetWorld()->GetAuthGameMode<AFelarGameMode>())
	{
		GameMode->FinishGame(EGameOutcome::Caught);
	}
}

AStalkerCharacter* AFelarCharacter::FindStalker()
{
	if (IsValid(CachedStalker))
	{
		return CachedStalker;
	}

	// Существо на карте одно, поэтому разовый поиск с кэшированием дешевле,
	// чем держать ссылку через GameMode и синхронизировать её.
	TArray<AActor*> Found;
	UGameplayStatics::GetAllActorsOfClass(this, AStalkerCharacter::StaticClass(), Found);

	CachedStalker = Found.Num() > 0 ? Cast<AStalkerCharacter>(Found[0]) : nullptr;
	return CachedStalker;
}
