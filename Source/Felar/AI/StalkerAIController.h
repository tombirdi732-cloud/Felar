#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "Core/FelarTypes.h"
#include "StalkerAIController.generated.h"

class UAIPerceptionComponent;
class UAISenseConfig_Sight;
class UAISenseConfig_Hearing;
class AStalkerCharacter;
class AFelarCharacter;

/**
 * Мозг существа: конечный автомат на четыре состояния.
 *
 *          услышал шум              увидел игрока
 *  Patrol ---------------> Investigate ---------------> Chase
 *    ^                         |                          |
 *    |     ничего не нашёл     |     потерял из виду      |
 *    +-------------------------+<-------------------------+
 *                          Search
 *
 * Behavior Tree сознательно не используется: BT и Blackboard — бинарные ассеты,
 * их нельзя положить в git как текст и нельзя нормально ревьюить. Для четырёх
 * состояний автомат на C++ короче, быстрее и полностью читаем в диффе.
 *
 * Ключевая связка с геймплеем: радиус зрения меняется в зависимости от того,
 * горит ли у игрока фонарь (SightRadiusDark против SightRadiusLit).
 */
UCLASS()
class FELAR_API AStalkerAIController : public AAIController
{
	GENERATED_BODY()

public:
	AStalkerAIController();

	virtual void BeginPlay() override;
	virtual void OnPossess(APawn* InPawn) override;
	virtual void OnUnPossess() override;
	virtual void Tick(float DeltaTime) override;

	UFUNCTION(BlueprintPure, Category = "Felar|AI")
	EStalkerState GetState() const { return State; }

	/** Принудительно направить существо в точку — для скриптовых моментов. */
	UFUNCTION(BlueprintCallable, Category = "Felar|AI")
	void ForceInvestigate(const FVector& Location);

protected:
	virtual void OnMoveCompleted(FAIRequestID RequestID, const FPathFollowingResult& Result) override;

	/** Единственная точка смены состояния — вся логика входа в состояние здесь. */
	void SetState(EStalkerState NewState);

	UFUNCTION()
	void HandlePerceptionUpdated(AActor* Actor, FAIStimulus Stimulus);

	// --- Поведение состояний ---

	void StartPatrol();
	void StartInvestigate(const FVector& Location);
	void StartChase(AFelarCharacter* Target);
	void StartSearch();

	void TickChase(float DeltaTime);
	void TickStateTimeout(float DeltaTime);

	/** Радиус зрения зависит от фонаря игрока — пересчитывается по таймеру. */
	void RefreshSightRadius();

	/** Куда идти в режиме патруля: точка с тегом PatrolPointTag или случайная. */
	bool ChoosePatrolDestination(FVector& OutLocation);

	/** Случайная достижимая точка вокруг Origin. */
	bool GetRandomPointNear(const FVector& Origin, float Radius, FVector& OutLocation) const;

	// --- Настройки ---

	/** Акторы с этим тегом используются как маршрут патрулирования. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI")
	FName PatrolPointTag = TEXT("PatrolPoint");

	/** Радиус случайного блуждания, если точек патрулирования на карте нет. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "100.0"))
	float RandomPatrolRadius = 4000.f;

	/** Пауза на месте после прихода в точку патрулирования. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "0.0"))
	float PatrolPauseTime = 2.5f;

	/** Сколько существо топчется на месте шума, прежде чем сдаться. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "0.0"))
	float InvestigateTimeout = 8.f;

	/** Сколько длится обыск района после потери игрока. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "0.0"))
	float SearchDuration = 15.f;

	/** Радиус обыска вокруг последней известной позиции игрока. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "100.0"))
	float SearchRadius = 1200.f;

	/** Как часто в погоне обновлять точку назначения. Секунды. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "0.05"))
	float ChaseRepathInterval = 0.35f;

	/** Как часто пересчитывать радиус зрения под состояние фонаря. Секунды. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "0.1"))
	float SightRefreshInterval = 0.5f;

	/** Насколько близко нужно подойти к точке, чтобы считать её достигнутой. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Felar|AI", meta = (ClampMin = "10.0"))
	float AcceptanceRadius = 90.f;

private:
	UPROPERTY(VisibleDefaultsOnly, Category = "Felar|AI")
	TObjectPtr<UAIPerceptionComponent> PerceptionComp;

	UPROPERTY(VisibleDefaultsOnly, Category = "Felar|AI")
	TObjectPtr<UAISenseConfig_Sight> SightConfig;

	UPROPERTY(VisibleDefaultsOnly, Category = "Felar|AI")
	TObjectPtr<UAISenseConfig_Hearing> HearingConfig;

	UPROPERTY(Transient)
	TObjectPtr<AStalkerCharacter> StalkerPawn;

	UPROPERTY(Transient)
	TObjectPtr<AFelarCharacter> ChaseTarget;

	/** Точки патрулирования, собранные с уровня один раз при старте. */
	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> PatrolPoints;

	EStalkerState State = EStalkerState::Patrol;

	/** Последнее место, где игрок был замечен или услышан. */
	FVector LastKnownPlayerLocation = FVector::ZeroVector;

	int32 PatrolIndex = 0;

	/** Обратный отсчёт до выхода из текущего состояния. <= 0 — таймаута нет. */
	float StateTimer = 0.f;

	float TimeSinceRepath = 0.f;
	float TimeSinceSightRefresh = 0.f;

	/** Чтобы не перенастраивать сенсор, когда состояние фонаря не изменилось. */
	bool bLastKnownFlashlightOn = false;
	bool bSightRadiusInitialized = false;
};
