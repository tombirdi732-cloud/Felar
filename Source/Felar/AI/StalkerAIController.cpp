#include "AI/StalkerAIController.h"

#include "Felar.h"
#include "AI/StalkerCharacter.h"
#include "Player/FelarCharacter.h"
#include "Player/FlashlightComponent.h"

#include "EngineUtils.h"
#include "NavigationSystem.h"
#include "Navigation/PathFollowingComponent.h"
#include "Perception/AIPerceptionComponent.h"
#include "Perception/AIPerceptionSystem.h"
#include "Perception/AISenseConfig_Sight.h"
#include "Perception/AISenseConfig_Hearing.h"
#include "Perception/AISense_Sight.h"
#include "Perception/AISense_Hearing.h"

AStalkerAIController::AStalkerAIController()
{
	PrimaryActorTick.bCanEverTick = true;

	PerceptionComp = CreateDefaultSubobject<UAIPerceptionComponent>(TEXT("Perception"));
	SightConfig = CreateDefaultSubobject<UAISenseConfig_Sight>(TEXT("SightConfig"));
	HearingConfig = CreateDefaultSubobject<UAISenseConfig_Hearing>(TEXT("HearingConfig"));

	// Значения ниже — заглушки: реальные берутся из AStalkerCharacter в OnPossess,
	// чтобы дизайнер настраивал существо в одном месте, а не в двух классах.
	SightConfig->SightRadius = 450.f;
	SightConfig->LoseSightRadius = 1050.f;
	SightConfig->PeripheralVisionAngleDegrees = 70.f;
	SightConfig->SetMaxAge(5.f);
	SightConfig->AutoSuccessRangeFromLastSeenLocation = 300.f;
	// Игрок не состоит ни в какой команде, поэтому включаем все категории:
	// иначе существо просто не будет его замечать.
	SightConfig->DetectionByAffiliation.bDetectEnemies = true;
	SightConfig->DetectionByAffiliation.bDetectNeutrals = true;
	SightConfig->DetectionByAffiliation.bDetectFriendlies = true;

	HearingConfig->HearingRange = 2200.f;
	HearingConfig->SetMaxAge(4.f);
	HearingConfig->DetectionByAffiliation.bDetectEnemies = true;
	HearingConfig->DetectionByAffiliation.bDetectNeutrals = true;
	HearingConfig->DetectionByAffiliation.bDetectFriendlies = true;

	PerceptionComp->ConfigureSense(*SightConfig);
	PerceptionComp->ConfigureSense(*HearingConfig);
	PerceptionComp->SetDominantSense(SightConfig->GetSenseImplementation());

	SetPerceptionComponent(*PerceptionComp);
}

void AStalkerAIController::BeginPlay()
{
	Super::BeginPlay();

	PerceptionComp->OnTargetPerceptionUpdated.AddDynamic(this, &AStalkerAIController::HandlePerceptionUpdated);

	// Маршрут собирается один раз: точки патрулирования по ходу игры не появляются.
	PatrolPoints.Reset();
	for (TActorIterator<AActor> It(GetWorld()); It; ++It)
	{
		if (It->ActorHasTag(PatrolPointTag))
		{
			PatrolPoints.Add(*It);
		}
	}

	if (PatrolPoints.Num() == 0)
	{
		UE_LOG(LogFelar, Log,
			TEXT("Stalker: no actors tagged '%s' found, falling back to random wandering"),
			*PatrolPointTag.ToString());
	}
	else
	{
		// Стартуем с ближайшей точки, иначе существо в начале игры бежит через
		// всю карту к точке с индексом 0.
		float BestDistSq = TNumericLimits<float>::Max();
		for (int32 i = 0; i < PatrolPoints.Num(); ++i)
		{
			const float DistSq = FVector::DistSquared(GetPawn() ? GetPawn()->GetActorLocation() : FVector::ZeroVector,
				PatrolPoints[i]->GetActorLocation());
			if (DistSq < BestDistSq)
			{
				BestDistSq = DistSq;
				PatrolIndex = i;
			}
		}
	}

	// Не через SetState: State уже равен Patrol, и SetState вышел бы сразу,
	// оставив существо стоять на месте всю партию.
	StartPatrol();
}

void AStalkerAIController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);

	StalkerPawn = Cast<AStalkerCharacter>(InPawn);
	if (!StalkerPawn)
	{
		UE_LOG(LogFelar, Warning, TEXT("StalkerAIController possessed non-Stalker pawn %s"), *GetNameSafe(InPawn));
		return;
	}

	// Переносим настройки чувств с пешки на сенсоры: один источник правды.
	SightConfig->SightRadius = StalkerPawn->SightRadiusDark;
	SightConfig->LoseSightRadius = StalkerPawn->SightRadiusDark + StalkerPawn->LoseSightPadding;
	SightConfig->PeripheralVisionAngleDegrees = StalkerPawn->VisionHalfAngle;
	HearingConfig->HearingRange = StalkerPawn->HearingRange;

	PerceptionComp->ConfigureSense(*SightConfig);
	PerceptionComp->ConfigureSense(*HearingConfig);
	PerceptionComp->RequestStimuliListenerUpdate();
}

void AStalkerAIController::OnUnPossess()
{
	StalkerPawn = nullptr;
	ChaseTarget = nullptr;

	Super::OnUnPossess();
}

void AStalkerAIController::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!StalkerPawn)
	{
		return;
	}

	TimeSinceSightRefresh += DeltaTime;
	if (TimeSinceSightRefresh >= SightRefreshInterval)
	{
		TimeSinceSightRefresh = 0.f;
		RefreshSightRadius();
	}

	if (State == EStalkerState::Chase)
	{
		TickChase(DeltaTime);
	}

	TickStateTimeout(DeltaTime);
}

// --- Смена состояний ---

void AStalkerAIController::SetState(EStalkerState NewState)
{
	if (State == NewState)
	{
		return;
	}

	const EStalkerState OldState = State;
	State = NewState;
	StateTimer = 0.f;

	if (StalkerPawn)
	{
		StalkerPawn->NotifyStateChanged(OldState, NewState);
	}

	UE_LOG(LogFelar, Verbose, TEXT("Stalker state: %d -> %d"), (int32)OldState, (int32)NewState);

	switch (NewState)
	{
	case EStalkerState::Patrol:
		ChaseTarget = nullptr;
		StartPatrol();
		break;

	case EStalkerState::Investigate:
		StateTimer = InvestigateTimeout;
		break;

	case EStalkerState::Chase:
		TimeSinceRepath = ChaseRepathInterval; // перестроить путь на первом же тике
		break;

	case EStalkerState::Search:
		StateTimer = SearchDuration;
		StartSearch();
		break;
	}
}

void AStalkerAIController::TickStateTimeout(float DeltaTime)
{
	if (StateTimer <= 0.f)
	{
		return;
	}

	StateTimer -= DeltaTime;
	if (StateTimer > 0.f)
	{
		return;
	}

	StateTimer = 0.f;

	// Не нашёл на месте шума — переходим к обыску района; не нашёл при обыске —
	// возвращаемся к обычному патрулированию.
	switch (State)
	{
	case EStalkerState::Investigate:
		SetState(EStalkerState::Search);
		break;

	case EStalkerState::Search:
		SetState(EStalkerState::Patrol);
		break;

	case EStalkerState::Patrol:
		// Либо истекла пауза на точке маршрута, либо прошлая попытка построить
		// путь провалилась (навмеш ещё не готов) — в обоих случаях идём дальше.
		StartPatrol();
		break;

	default:
		break;
	}
}

// --- Восприятие ---

void AStalkerAIController::HandlePerceptionUpdated(AActor* Actor, FAIStimulus Stimulus)
{
	AFelarCharacter* Player = Cast<AFelarCharacter>(Actor);
	if (!Player || !Player->IsAlive())
	{
		return;
	}

	const TSubclassOf<UAISense> SenseClass = UAIPerceptionSystem::GetSenseClassForStimulus(this, Stimulus);

	if (SenseClass == UAISense_Sight::StaticClass())
	{
		// Игрок в укрытии невидим, даже если технически попал в конус зрения.
		if (Stimulus.WasSuccessfullySensed() && !Player->IsHiding())
		{
			LastKnownPlayerLocation = Player->GetActorLocation();
			StartChase(Player);
		}
		else if (State == EStalkerState::Chase)
		{
			// Пропал из виду — идём к последней известной точке и обыскиваем район.
			LastKnownPlayerLocation = Stimulus.StimulusLocation;
			SetState(EStalkerState::Search);
		}
		return;
	}

	if (SenseClass == UAISense_Hearing::StaticClass())
	{
		if (!Stimulus.WasSuccessfullySensed())
		{
			return;
		}

		// В погоне шум ничего не добавляет: игрок и так на прицеле.
		if (State == EStalkerState::Chase)
		{
			return;
		}

		LastKnownPlayerLocation = Stimulus.StimulusLocation;
		StartInvestigate(Stimulus.StimulusLocation);
	}
}

void AStalkerAIController::RefreshSightRadius()
{
	if (!StalkerPawn)
	{
		return;
	}

	const AFelarCharacter* Player = Cast<AFelarCharacter>(
		GetWorld()->GetFirstPlayerController() ? GetWorld()->GetFirstPlayerController()->GetPawn() : nullptr);

	const bool bFlashlightOn = Player && Player->GetFlashlight() && Player->GetFlashlight()->IsLightOn();

	// Перенастройка сенсора не бесплатна, поэтому трогаем его только при смене
	// состояния фонаря, а не каждые SightRefreshInterval секунд.
	if (bSightRadiusInitialized && bFlashlightOn == bLastKnownFlashlightOn)
	{
		return;
	}

	bLastKnownFlashlightOn = bFlashlightOn;
	bSightRadiusInitialized = true;

	const float Radius = bFlashlightOn ? StalkerPawn->SightRadiusLit : StalkerPawn->SightRadiusDark;
	SightConfig->SightRadius = Radius;
	SightConfig->LoseSightRadius = Radius + StalkerPawn->LoseSightPadding;

	PerceptionComp->ConfigureSense(*SightConfig);
	PerceptionComp->RequestStimuliListenerUpdate();

	UE_LOG(LogFelar, Verbose, TEXT("Stalker sight radius -> %.0f (flashlight %s)"),
		Radius, bFlashlightOn ? TEXT("ON") : TEXT("OFF"));
}

// --- Поведение ---

void AStalkerAIController::StartPatrol()
{
	FVector Destination;
	if (!ChoosePatrolDestination(Destination))
	{
		// Навмеша нет или он не достроен — пробуем ещё раз чуть позже,
		// вместо того чтобы навсегда застрять на месте.
		StateTimer = PatrolPauseTime;
		return;
	}

	MoveToLocation(Destination, AcceptanceRadius);
}

void AStalkerAIController::StartInvestigate(const FVector& Location)
{
	SetState(EStalkerState::Investigate);

	// Явно, а не полагаясь на SetState: если существо уже в Investigate, SetState
	// выйдет сразу, а новый шум обязан продлить проверку и перенаправить маршрут.
	StateTimer = InvestigateTimeout;

	MoveToLocation(Location, AcceptanceRadius);
}

void AStalkerAIController::ForceInvestigate(const FVector& Location)
{
	LastKnownPlayerLocation = Location;
	StartInvestigate(Location);
}

void AStalkerAIController::StartChase(AFelarCharacter* Target)
{
	ChaseTarget = Target;
	SetState(EStalkerState::Chase);
}

void AStalkerAIController::TickChase(float DeltaTime)
{
	if (!IsValid(ChaseTarget) || !ChaseTarget->IsAlive() || ChaseTarget->IsHiding())
	{
		SetState(EStalkerState::Search);
		return;
	}

	LastKnownPlayerLocation = ChaseTarget->GetActorLocation();

	// Путь пересчитывается с интервалом, а не каждый кадр: разница в поведении
	// незаметна, а стоимость поиска пути падает в разы.
	TimeSinceRepath += DeltaTime;
	if (TimeSinceRepath < ChaseRepathInterval)
	{
		return;
	}

	TimeSinceRepath = 0.f;
	MoveToActor(ChaseTarget, AcceptanceRadius * 0.5f);
}

void AStalkerAIController::StartSearch()
{
	FVector Destination;
	if (GetRandomPointNear(LastKnownPlayerLocation, SearchRadius, Destination))
	{
		MoveToLocation(Destination, AcceptanceRadius);
	}
	else
	{
		MoveToLocation(LastKnownPlayerLocation, AcceptanceRadius);
	}
}

void AStalkerAIController::OnMoveCompleted(FAIRequestID RequestID, const FPathFollowingResult& Result)
{
	Super::OnMoveCompleted(RequestID, Result);

	switch (State)
	{
	case EStalkerState::Patrol:
		// Пауза на точке: существо не должно носиться без остановки.
		// Через StateTimer, а не через отдельный FTimerHandle — так пауза
		// автоматически отменяется при переходе в любое другое состояние.
		StateTimer = FMath::Max(PatrolPauseTime, KINDA_SMALL_NUMBER);
		break;

	case EStalkerState::Investigate:
		// Дошёл до места шума — переходим к обыску, не дожидаясь таймаута.
		SetState(EStalkerState::Search);
		break;

	case EStalkerState::Search:
		// Продолжаем обшаривать район, пока не выйдет SearchDuration.
		StartSearch();
		break;

	case EStalkerState::Chase:
		// Догнал: если игрок ещё жив, CatchSphere сработает сам на следующем кадре.
		break;
	}
}

// --- Навигация ---

bool AStalkerAIController::ChoosePatrolDestination(FVector& OutLocation)
{
	if (PatrolPoints.Num() > 0)
	{
		// Точки могли быть удалены по ходу игры — пропускаем невалидные.
		for (int32 Attempt = 0; Attempt < PatrolPoints.Num(); ++Attempt)
		{
			PatrolIndex = (PatrolIndex + 1) % PatrolPoints.Num();
			if (IsValid(PatrolPoints[PatrolIndex]))
			{
				OutLocation = PatrolPoints[PatrolIndex]->GetActorLocation();
				return true;
			}
		}
	}

	const APawn* Pawn = GetPawn();
	if (!Pawn)
	{
		return false;
	}

	return GetRandomPointNear(Pawn->GetActorLocation(), RandomPatrolRadius, OutLocation);
}

bool AStalkerAIController::GetRandomPointNear(const FVector& Origin, float Radius, FVector& OutLocation) const
{
	UNavigationSystemV1* NavSystem = UNavigationSystemV1::GetCurrent(GetWorld());
	if (!NavSystem)
	{
		return false;
	}

	FNavLocation Result;
	if (!NavSystem->GetRandomReachablePointInRadius(Origin, Radius, Result))
	{
		return false;
	}

	OutLocation = Result.Location;
	return true;
}
