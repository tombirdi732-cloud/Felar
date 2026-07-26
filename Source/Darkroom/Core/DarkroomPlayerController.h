#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "DarkroomPlayerController.generated.h"

class UUserWidget;

/**
 * Контроллер игрока. Отвечает только за окружение игры: курсор, режим ввода и HUD.
 *
 * Класс виджета намеренно не задан в C++: UMG-виджеты — это ассеты, их нельзя
 * создать из кода репозитория. Сделай Blueprint-наследника этого контроллера
 * и укажи HUDWidgetClass в его настройках.
 */
UCLASS()
class DARKROOM_API ADarkroomPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	ADarkroomPlayerController();

	virtual void BeginPlay() override;

	UFUNCTION(BlueprintPure, Category = "Darkroom|UI")
	UUserWidget* GetHUDWidget() const { return HUDWidget; }

protected:
	/** Виджет HUD: фонарь, страх, счётчик фрагментов, подсказка взаимодействия. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|UI")
	TSubclassOf<UUserWidget> HUDWidgetClass;

private:
	UPROPERTY(Transient)
	TObjectPtr<UUserWidget> HUDWidget;
};
