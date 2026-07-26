#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "InputActionValue.h"
#include "Core/FelarTypes.h"
#include "FelarCharacter.generated.h"

class UInputAction;
class UInputMappingContext;

class UVHSCameraComponent;
class USpotLightComponent;
class UFlashlightComponent;
class UFearComponent;
class UInteractionComponent;
class AHidingSpot;
class AStalkerCharacter;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStaminaChanged, float, StaminaPercent);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnHidingStateChanged, bool, bHiding);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPlayerCaught, AActor*, Killer);

/**
 * Игрок. Держит камеру, фонарь и три компонента-системы, но сам почти не содержит логики:
 * его задача — связать системы между собой и превратить ввод в события.
 *
 * Единственное, что живёт здесь по существу — шум. Шаги, вздохи и срывы страха
 * превращаются в события UAISense_Hearing, которые слышит существо.
 * Именно поэтому шум собран в одном месте, а не размазан по компонентам.
 */
UCLASS()
class FELAR_API AFelarCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AFelarCharacter();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	/** Издать шум, который может услышать существо. Единая точка для всех источников. */
	UFUNCTION(BlueprintCallable, Category = "Felar|Noise")
	void EmitNoise(ENoiseLevel Level, FVector OverrideLocation = FVector::ZeroVector);

	/** Насколько громко игрок движется прямо сейчас. */
	UFUNCTION(BlueprintPure, Category = "Felar|Noise")
	ENoiseLevel GetCurrentMovementNoise() const;

	/** Существо поймало игрока — конец партии. */
	UFUNCTION(BlueprintCallable, Category = "Felar|State")
	void OnCaught(AActor* Killer);

	UFUNCTION(BlueprintPure, Category = "Felar|State")
	bool IsHiding() const { return CurrentHidingSpot != nullptr; }

	UFUNCTION(BlueprintPure, Category = "Felar|State")
	bool IsAlive() const { return bAlive; }

	/** Игрок на свету: горит собственный фонарь или он стоит в освещённой зоне. */
	UFUNCTION(BlueprintPure, Category = "Felar|State")
	bool IsInLight() const;

	/** Войти в укрытие / выйти из него. Вызывается из AHidingSpot. */
	UFUNCTION(BlueprintCallable, Category = "Felar|State")
	void EnterHidingSpot(AHidingSpot* Spot);

	UFUNCTION(BlueprintCallable, Category = "Felar|State")
	void LeaveHidingSpot();

	/** Счётчик освещённых зон. Вызывается из ASafeLightZone при входе/выходе. */
	UFUNCTION(BlueprintCallable, Category = "Felar|State")
	void AddLitZone(int32 Delta);

	UFUNCTION(BlueprintPure, Category = "Felar|Components")
	UFlashlightComponent* GetFlashlight() const { return Flashlight; }

	UFUNCTION(BlueprintPure, Category = "Felar|Components")
	UFearComponent* GetFear() const { return FearComponent; }

	UFUNCTION(BlueprintPure, Category = "Felar|Components")
	UInteractionComponent* GetInteraction() const { return Interaction; }

	UFUNCTION(BlueprintPure, Category = "Felar|Components")
	UVHSCameraComponent* GetVHSCamera() const { return Camera; }

	UFUNCTION(BlueprintPure, Category = "Felar|Movement")
	float GetStaminaPercent() const { return FMath::Clamp(Stamina / 100.f, 0.f, 1.f); }

	UPROPERTY(BlueprintAssignable, Category = "Felar|Movement")
	FOnStaminaChanged OnStaminaChanged;

	UPROPERTY(BlueprintAssignable, Category = "Felar|State")
	FOnHidingStateChanged OnHidingStateChanged;

	/** Существо поймало игрока. Для UI смерти и звука. */
	UPROPERTY(BlueprintAssignable, Category = "Felar|State")
	FOnPlayerCaught OnPlayerCaught;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Components")
	TObjectPtr<UVHSCameraComponent> Camera;

	/** Конус фонаря. Крепится к камере, поэтому светит туда же, куда смотрит игрок. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Components")
	TObjectPtr<USpotLightComponent> FlashlightLight;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Components")
	TObjectPtr<UFlashlightComponent> Flashlight;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Components")
	TObjectPtr<UFearComponent> FearComponent;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Components")
	TObjectPtr<UInteractionComponent> Interaction;

	// --- Скорости движения ---

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Movement", meta = (ClampMin = "1.0"))
	float WalkSpeed = 300.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Movement", meta = (ClampMin = "1.0"))
	float SprintSpeed = 600.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Movement", meta = (ClampMin = "1.0"))
	float CrouchSpeed = 150.f;

	/** Расход выносливости в секунду при беге. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Movement", meta = (ClampMin = "0.0"))
	float StaminaDrainPerSecond = 20.f;

	/** Восстановление выносливости в секунду, когда игрок не бежит. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Movement", meta = (ClampMin = "0.0"))
	float StaminaRegenPerSecond = 12.f;

	/** Пока выносливость ниже этого значения, бегать нельзя — чтобы не дёргать спринт. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Movement", meta = (ClampMin = "0.0", ClampMax = "100.0"))
	float SprintRecoveryThreshold = 20.f;

	// --- Шум ---

	/** Через сколько сантиметров пройденного пути делается "шаг" (событие шума). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Noise", meta = (ClampMin = "10.0"))
	float StepDistance = 180.f;

	/** Базовая дальность слышимости шума при Loudness = 1. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Noise", meta = (ClampMin = "100.0"))
	float NoiseMaxRange = 2500.f;

	/** Как часто проверять, видно ли существо (для страха). Секунды. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Fear", meta = (ClampMin = "0.05"))
	float StalkerVisibilityCheckInterval = 0.25f;

	/** Насколько широкий конус считается "я вижу существо". Градусы, половина угла. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Fear", meta = (ClampMin = "1.0", ClampMax = "180.0"))
	float StalkerVisionHalfAngle = 50.f;

	/** Взгляд на существо дальше этой дистанции уже не пугает. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Fear", meta = (ClampMin = "100.0"))
	float StalkerVisionRange = 3000.f;

	// --- Ввод (Enhanced Input) ---

	/**
	 * Схема управления. Создаётся целиком в конструкторе, а не загружается из
	 * ассетов: Input Action и Mapping Context — бинарные файлы, и проект,
	 * зависящий от них, не собрался бы «из коробки». Переназначить клавиши
	 * можно, переопределив BuildInputMappings в наследнике.
	 */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputMappingContext> InputMapping;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_MoveForward;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_MoveRight;

	/** Мышь. Даёт готовую дельту за кадр — домножать на DeltaTime не нужно. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_Look;

	/**
	 * Стик геймпада. Отдельным действием от мыши: стик отдаёт положение (-1..1),
	 * а не дельту, поэтому его надо умножать на время кадра. В одном действии
	 * с мышью одно из двух устройств обязательно вело бы себя неправильно.
	 */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_LookGamepad;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_Sprint;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_Crouch;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_Interact;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Felar|Input")
	TObjectPtr<UInputAction> IA_Flashlight;

	/** Приоритет схемы в подсистеме ввода. Меню поверх игры добавляют выше. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Input")
	int32 InputMappingPriority = 0;

	/** Чувствительность мыши. Множитель к сырому вводу. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Input", meta = (ClampMin = "0.01"))
	float LookSensitivity = 1.f;

	/** Скорость обзора с геймпада, градусов в секунду. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|Input", meta = (ClampMin = "1.0"))
	float GamepadLookSpeed = 130.f;

	// --- Обработчики ---

	void HandleMoveForward(const FInputActionValue& Value);
	void HandleMoveRight(const FInputActionValue& Value);
	void HandleLook(const FInputActionValue& Value);
	void HandleLookGamepad(const FInputActionValue& Value);
	void HandleSprintStarted();
	void HandleSprintCompleted();
	void HandleCrouchPressed();
	void HandleInteractPressed();
	void HandleFlashlightPressed();

	/** Игрок ахнул от страха — переводим это в шум для ИИ. */
	UFUNCTION()
	void HandleInvoluntaryGasp();

	/** Срыв: существо узнаёт точную позицию. */
	UFUNCTION()
	void HandleFearBreakdown();

	/** Собрать схему управления. Переопредели, чтобы поменять раскладку. */
	virtual void BuildInputMappings();

	/** Зарегистрировать схему в подсистеме ввода игрока. */
	void RegisterInputMapping();

private:
	void TickStamina(float DeltaTime);
	void TickFootsteps(float DeltaTime);
	void TickStalkerVisibility(float DeltaTime);
	void UpdateMaxSpeed();

	/** Найти существо на уровне (одно на карту), с ленивым кэшированием. */
	AStalkerCharacter* FindStalker();

	UPROPERTY(Transient)
	TObjectPtr<AHidingSpot> CurrentHidingSpot;

	UPROPERTY(Transient)
	TObjectPtr<AStalkerCharacter> CachedStalker;

	float Stamina = 100.f;
	float LastBroadcastStamina = -1.f;
	float DistanceSinceStep = 0.f;
	float TimeSinceVisibilityCheck = 0.f;

	FVector LastStepLocation = FVector::ZeroVector;

	/** Сколько освещённых зон сейчас накрывают игрока. */
	int32 LitZoneCount = 0;

	bool bWantsToSprint = false;
	bool bSprintBlocked = false;
	bool bAlive = true;
};
