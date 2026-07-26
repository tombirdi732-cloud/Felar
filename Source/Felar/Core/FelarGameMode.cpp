#include "Core/FelarGameMode.h"

#include "Felar.h"
#include "Core/FelarGameState.h"
#include "Core/FelarPlayerController.h"
#include "Camera/VHSHud.h"
#include "Player/FelarCharacter.h"
#include "World/PickupActor.h"

#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"

AFelarGameMode::AFelarGameMode()
{
	GameStateClass = AFelarGameState::StaticClass();
	PlayerControllerClass = AFelarPlayerController::StaticClass();
	DefaultPawnClass = AFelarCharacter::StaticClass();
	// Экранная индикация камкордера рисуется через Canvas и работает сразу,
	// без UMG-виджета. HUDWidgetClass в контроллере остаётся для всего остального.
	HUDClass = AVHSHud::StaticClass();
}

void AFelarGameMode::BeginPlay()
{
	Super::BeginPlay();

	AFelarGameState* State = GetFelarGameState();
	if (!State)
	{
		UE_LOG(LogFelar, Error, TEXT("FelarGameMode requires AFelarGameState as GameStateClass"));
		return;
	}

	State->FragmentsRequired = FragmentsRequiredOverride > 0
		? FragmentsRequiredOverride
		: CountFragmentsInLevel();

	if (State->FragmentsRequired <= 0)
	{
		UE_LOG(LogFelar, Warning,
			TEXT("No AFragmentPickup found on the level and no override set - exit door will open immediately"));
	}

	State->OnFragmentsChanged.Broadcast(State->FragmentsCollected, State->FragmentsRequired);
}

int32 AFelarGameMode::CountFragmentsInLevel() const
{
	int32 Count = 0;
	for (TActorIterator<AFragmentPickup> It(GetWorld()); It; ++It)
	{
		++Count;
	}

	UE_LOG(LogFelar, Log, TEXT("Fragments found on level: %d"), Count);
	return Count;
}

void AFelarGameMode::AddFragment()
{
	AFelarGameState* State = GetFelarGameState();
	if (!State || State->Outcome != EGameOutcome::InProgress)
	{
		return;
	}

	State->FragmentsCollected = FMath::Min(State->FragmentsCollected + 1, State->FragmentsRequired);
	State->OnFragmentsChanged.Broadcast(State->FragmentsCollected, State->FragmentsRequired);

	UE_LOG(LogFelar, Log, TEXT("Fragment collected: %d/%d"),
		State->FragmentsCollected, State->FragmentsRequired);
}

int32 AFelarGameMode::GetRemainingFragments() const
{
	const AFelarGameState* State = GetFelarGameState();
	return State ? State->GetRemainingFragments() : 0;
}

void AFelarGameMode::FinishGame(EGameOutcome NewOutcome)
{
	AFelarGameState* State = GetFelarGameState();
	if (!State || State->Outcome != EGameOutcome::InProgress || NewOutcome == EGameOutcome::InProgress)
	{
		return;
	}

	State->Outcome = NewOutcome;
	State->OnGameFinished.Broadcast(NewOutcome);
	OnGameFinishedBP(NewOutcome);

	UE_LOG(LogFelar, Log, TEXT("Game finished with outcome %d"), (int32)NewOutcome);

	if (RestartDelay > 0.f)
	{
		GetWorldTimerManager().SetTimer(
			RestartTimerHandle, this, &AFelarGameMode::RestartLevelNow, RestartDelay, false);
	}
}

void AFelarGameMode::RestartLevelNow()
{
	UGameplayStatics::OpenLevel(this, FName(*UGameplayStatics::GetCurrentLevelName(this, true)));
}

AFelarGameState* AFelarGameMode::GetFelarGameState() const
{
	return GetWorld() ? GetWorld()->GetGameState<AFelarGameState>() : nullptr;
}
