#include "Core/DarkroomPlayerController.h"

#include "Darkroom.h"
#include "Blueprint/UserWidget.h"

ADarkroomPlayerController::ADarkroomPlayerController()
{
	bShowMouseCursor = false;
}

void ADarkroomPlayerController::BeginPlay()
{
	Super::BeginPlay();

	// Мышь захватывается окном: без этого курсор уезжает за пределы окна,
	// и обзор перестаёт работать при игре в оконном режиме.
	FInputModeGameOnly InputMode;
	SetInputMode(InputMode);

	if (!HUDWidgetClass)
	{
		// Не ошибка: играть можно и без HUD, просто без подсказок на экране.
		UE_LOG(LogDarkroom, Log, TEXT("HUDWidgetClass is not set - running without HUD"));
		return;
	}

	HUDWidget = CreateWidget<UUserWidget>(this, HUDWidgetClass);
	if (HUDWidget)
	{
		HUDWidget->AddToViewport();
	}
}
