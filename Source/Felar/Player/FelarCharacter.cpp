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

#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"

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

	BuildInputMappings();
}

void AFelarCharacter::BuildInputMappings()
{
	// Всё создаётся как default subobject, а не через NewObject: конструктор
	// исполняется в том числе для CDO, где NewObject использовать нельзя.
	IA_MoveForward = CreateDefaultSubobject<UInputAction>(TEXT("IA_MoveForward"));
	IA_MoveForward->ValueType = EInputActionValueType::Axis1D;

	IA_MoveRight = CreateDefaultSubobject<UInputAction>(TEXT("IA_MoveRight"));
	IA_MoveRight->ValueType = EInputActionValueType::Axis1D;

	IA_Look = CreateDefaultSubobject<UInputAction>(TEXT("IA_Look"));
	IA_Look->ValueType = EInputActionValueType::Axis2D;

	IA_LookGamepad = CreateDefaultSubobject<UInputAction>(TEXT("IA_LookGamepad"));
	IA_LookGamepad->ValueType = EInputActionValueType::Axis2D;

	IA_Sprint = CreateDefaultSubobject<UInputAction>(TEXT("IA_Sprint"));
	IA_Sprint->ValueType = EInputActionValueType::Boolean;

	IA_Crouch = CreateDefaultSubobject<UInputAction>(TEXT("IA_Crouch"));
	IA_Crouch->ValueType = EInputActionValueType::Boolean;

	IA_Interact = CreateDefaultSubobject<UInputAction>(TEXT("IA_Interact"));
	IA_Interact->ValueType = EInputActionValueType::Boolean;

	IA_Flashlight = CreateDefaultSubobject<UInputAction>(TEXT("IA_Flashlight"));
	IA_Flashlight->ValueType = EInputActionValueType::Boolean;

	// Клавиша сама по себе даёт только +1, поэтому «назад» и «влево» получаются
	// тем же действием с модификатором отрицания.
	UInputModifierNegate* NegateBack = CreateDefaultSubobject<UInputModifierNegate>(TEXT("NegateBack"));
	UInputModifierNegate* NegateLeft = CreateDefaultSubobject<UInputModifierNegate>(TEXT("NegateLeft"));

	InputMapping = CreateDefaultSubobject<UInputMappingContext>(TEXT("IMC_Felar"));

	InputMapping->MapKey(IA_MoveForward, EKeys::W);
	InputMapping->MapKey(IA_MoveForward, EKeys::Up);
	InputMapping->MapKey(IA_MoveForward, EKeys::S).Modifiers.Add(NegateBack);
	InputMapping->MapKey(IA_MoveForward, EKeys::Down).Modifiers.Add(NegateBack);
	InputMapping->MapKey(IA_MoveForward, EKeys::Gamepad_LeftY);

	InputMapping->MapKey(IA_MoveRight, EKeys::D);
	InputMapping->MapKey(IA_MoveRight, EKeys::A).Modifiers.Add(NegateLeft);
	InputMapping->MapKey(IA_MoveRight, EKeys::Gamepad_LeftX);

	InputMapping->MapKey(IA_Look, EKeys::Mouse2D);
	InputMapping->MapKey(IA_LookGamepad, EKeys::Gamepad_Right2D);

	InputMapping->MapKey(IA_Sprint, EKeys::LeftShift);
	InputMapping->MapKey(IA_Sprint, EKeys::Gamepad_LeftThumbstick);

	InputMapping->MapKey(IA_Crouch, EKeys::C);
	InputMapping->MapKey(IA_Crouch, EKeys::LeftControl);
	InputMapping->MapKey(IA_Crouch, EKeys::Gamepad_RightThumbstick);

	InputMapping->MapKey(IA_Interact, EKeys::E);
	InputMapping->MapKey(IA_Interact, EKeys::Gamepad_FaceButton_Bottom);

	InputMapping->MapKey(IA_Flashlight, EKeys::F);
	InputMapping->MapKey(IA_Flashlight, EKeys::Gamepad_FaceButton_Left);
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

	RegisterInputMapping();

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		UE_LOG(LogFelar, Error,
			TEXT("Expected UEnhancedInputComponent. Check DefaultInputComponentClass in DefaultInput.ini"));
		return;
	}

	// Triggered, а не Started: движение и обзор должны обновляться каждый кадр,
	// пока клавиша удерживается, а не один раз в момент нажатия.
	Input->BindAction(IA_MoveForward, ETriggerEvent::Triggered, this, &AFelarCharacter::HandleMoveForward);
	Input->BindAction(IA_MoveRight, ETriggerEvent::Triggered, this, &AFelarCharacter::HandleMoveRight);
	Input->BindAction(IA_Look, ETriggerEvent::Triggered, this, &AFelarCharacter::HandleLook);
	Input->BindAction(IA_LookGamepad, ETriggerEvent::Triggered, this, &AFelarCharacter::HandleLookGamepad);

	Input->BindAction(IA_Sprint, ETriggerEvent::Started, this, &AFelarCharacter::HandleSprintStarted);
	Input->BindAction(IA_Sprint, ETriggerEvent::Completed, this, &AFelarCharacter::HandleSprintCompleted);
	Input->BindAction(IA_Crouch, ETriggerEvent::Started, this, &AFelarCharacter::HandleCrouchPressed);
	Input->BindAction(IA_Interact, ETriggerEvent::Started, this, &AFelarCharacter::HandleInteractPressed);
	Input->BindAction(IA_Flashlight, ETriggerEvent::Started, this, &AFelarCharacter::HandleFlashlightPressed);
}

void AFelarCharacter::RegisterInputMapping()
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC || !InputMapping)
	{
		return;
	}

	UEnhancedInputLocalPlayerSubsystem* Subsystem =
		ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer());

	if (!Subsystem)
	{
		UE_LOG(LogFelar, Error, TEXT("EnhancedInput subsystem not available"));
		return;
	}

	Subsystem->AddMappingContext(InputMapping, InputMappingPriority);
}

// --- Ввод ---

void AFelarCharacter::HandleMoveForward(const FInputActionValue& Value)
{
	// В укрытии игрок не двигается: выйти можно только повторным нажатием E.
	const float Scale = Value.Get<float>();
	if (Scale == 0.f || !bAlive || IsHiding())
	{
		return;
	}

	AddMovementInput(FRotationMatrix(GetControlRotation()).GetScaledAxis(EAxis::X), Scale);
}

void AFelarCharacter::HandleMoveRight(const FInputActionValue& Value)
{
	const float Scale = Value.Get<float>();
	if (Scale == 0.f || !bAlive || IsHiding())
	{
		return;
	}

	AddMovementInput(FRotationMatrix(GetControlRotation()).GetScaledAxis(EAxis::Y), Scale);
}

void AFelarCharacter::HandleLook(const FInputActionValue& Value)
{
	const FVector2D Look = Value.Get<FVector2D>();

	AddControllerYawInput(Look.X * LookSensitivity);
	// Мышь вверх даёт положительный Y, а положительный pitch наклоняет взгляд
	// вниз — отсюда минус.
	AddControllerPitchInput(-Look.Y * LookSensitivity);
}

void AFelarCharacter::HandleLookGamepad(const FInputActionValue& Value)
{
	const FVector2D Look = Value.Get<FVector2D>();
	const float Delta = GetWorld()->GetDeltaSeconds() * GamepadLookSpeed;

	AddControllerYawInput(Look.X * Delta);
	AddControllerPitchInput(-Look.Y * Delta);
}

void AFelarCharacter::HandleSprintStarted()
{
	bWantsToSprint = true;
	UpdateMaxSpeed();
}

void AFelarCharacter::HandleSprintCompleted()
{
	bWantsToSprint = false;
	UpdateMaxSpeed();
}

void AFelarCharacter::HandleCrouchPressed()
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

void AFelarCharacter::HandleInteractPressed()
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

void AFelarCharacter::HandleFlashlightPressed()
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

	const ENoiseLevel Noise = GetCurrentMovementNoise();
	EmitNoise(Noise);

	// Толчок камеры в тот же момент, что и шум: игрок видит и слышит один шаг,
	// а не два несинхронных события.
	float ImpulseStrength = 1.f;
	switch (Noise)
	{
	case ENoiseLevel::Silent:	ImpulseStrength = 0.4f;	break;
	case ENoiseLevel::Quiet:	ImpulseStrength = 1.f;	break;
	default:					ImpulseStrength = 1.6f;	break;
	}

	Camera->AddStepImpulse(ImpulseStrength);
}

void AFelarCharacter::Landed(const FHitResult& Hit)
{
	Super::Landed(Hit);

	if (!bAlive)
	{
		return;
	}

	// Сила приземления берётся из скорости падения: спрыгнуть со ступеньки
	// и рухнуть с высоты должны ощущаться и звучать по-разному.
	const float FallSpeed = FMath::Abs(GetVelocity().Z);
	const float Alpha = FMath::Clamp(FallSpeed / 900.f, 0.f, 1.f);

	Camera->AddStepImpulse(FMath::Lerp(1.2f, 4.f, Alpha));

	// Тихое приземление слышно как обычный шаг, тяжёлое — на всю комнату.
	EmitNoise(Alpha > 0.5f ? ENoiseLevel::Loud : ENoiseLevel::Quiet);

	// Сбрасываем накопленный путь, иначе сразу после посадки сработает
	// лишний шаг от расстояния, пройденного в полёте.
	DistanceSinceStep = 0.f;
	LastStepLocation = GetActorLocation();
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
