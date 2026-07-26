#include "Core/DarkroomGameMode.h"

#include "Darkroom.h"
#include "Core/DarkroomGameState.h"
#include "Core/DarkroomPlayerController.h"
#include "Camera/VHSHud.h"
#include "Player/DarkroomCharacter.h"
#include "World/PickupActor.h"

#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"

ADarkroomGameMode::ADarkroomGameMode()
{
	GameStateClass = ADarkroomGameState::StaticClass();
	PlayerControllerClass = ADarkroomPlayerController::StaticClass();
	DefaultPawnClass = ADarkroomCharacter::StaticClass();
	// Экранная индикация камкордера рисуется через Canvas и работает сразу,
	// без UMG-виджета. HUDWidgetClass в контроллере остаётся для всего остального.
	HUDClass = AVHSHud::StaticClass();
}

void ADarkroomGameMode::BeginPlay()
{
	Super::BeginPlay();

	ADarkroomGameState* State = GetDarkroomGameState();
	if (!State)
	{
		UE_LOG(LogDarkroom, Error, TEXT("DarkroomGameMode requires ADarkroomGameState as GameStateClass"));
		return;
	}

	State->FragmentsRequired = FragmentsRequiredOverride > 0
		? FragmentsRequiredOverride
		: CountFragmentsInLevel();

	if (State->FragmentsRequired <= 0)
	{
		UE_LOG(LogDarkroom, Warning,
			TEXT("No AFragmentPickup found on the level and no override set - exit door will open immediately"));
	}

	State->OnFragmentsChanged.Broadcast(State->FragmentsCollected, State->FragmentsRequired);
}

int32 ADarkroomGameMode::CountFragmentsInLevel() const
{
	int32 Count = 0;
	for (TActorIterator<AFragmentPickup> It(GetWorld()); It; ++It)
	{
		++Count;
	}

	UE_LOG(LogDarkroom, Log, TEXT("Fragments found on level: %d"), Count);
	return Count;
}

void ADarkroomGameMode::AddFragment()
{
	ADarkroomGameState* State = GetDarkroomGameState();
	if (!State || State->Outcome != EGameOutcome::InProgress)
	{
		return;
	}

	State->FragmentsCollected = FMath::Min(State->FragmentsCollected + 1, State->FragmentsRequired);
	State->OnFragmentsChanged.Broadcast(State->FragmentsCollected, State->FragmentsRequired);

	UE_LOG(LogDarkroom, Log, TEXT("Fragment collected: %d/%d"),
		State->FragmentsCollected, State->FragmentsRequired);
}

int32 ADarkroomGameMode::GetRemainingFragments() const
{
	const ADarkroomGameState* State = GetDarkroomGameState();
	return State ? State->GetRemainingFragments() : 0;
}

void ADarkroomGameMode::FinishGame(EGameOutcome NewOutcome)
{
	ADarkroomGameState* State = GetDarkroomGameState();
	if (!State || State->Outcome != EGameOutcome::InProgress || NewOutcome == EGameOutcome::InProgress)
	{
		return;
	}

	State->Outcome = NewOutcome;
	State->OnGameFinished.Broadcast(NewOutcome);
	OnGameFinishedBP(NewOutcome);

	UE_LOG(LogDarkroom, Log, TEXT("Game finished with outcome %d"), (int32)NewOutcome);

	if (RestartDelay > 0.f)
	{
		GetWorldTimerManager().SetTimer(
			RestartTimerHandle, this, &ADarkroomGameMode::RestartLevelNow, RestartDelay, false);
	}
}

void ADarkroomGameMode::RestartLevelNow()
{
	UGameplayStatics::OpenLevel(this, FName(*UGameplayStatics::GetCurrentLevelName(this, true)));
}

ADarkroomGameState* ADarkroomGameMode::GetDarkroomGameState() const
{
	return GetWorld() ? GetWorld()->GetGameState<ADarkroomGameState>() : nullptr;
}
