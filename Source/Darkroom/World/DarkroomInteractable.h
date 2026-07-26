#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "DarkroomInteractable.generated.h"

class ADarkroomCharacter;

UINTERFACE(MinimalAPI, BlueprintType)
class UDarkroomInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Всё, с чем игрок может взаимодействовать по клавише E.
 *
 * Интерфейс, а не базовый класс, специально: так дверь, шкаф и записка не обязаны
 * иметь общего предка, а игроку не нужно делать Cast к каждому типу — это главный
 * приём против "blueprint spaghetti" и лишних жёстких зависимостей.
 *
 * Все функции — BlueprintNativeEvent: есть реализация на C++ (..._Implementation),
 * но её можно переопределить в Blueprint-наследнике.
 */
class DARKROOM_API IDarkroomInteractable
{
	GENERATED_BODY()

public:
	/** Можно ли взаимодействовать прямо сейчас (дверь может быть заперта и т.п.). */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Darkroom|Interaction")
	bool CanInteract(ADarkroomCharacter* Interactor) const;
	virtual bool CanInteract_Implementation(ADarkroomCharacter* Interactor) const { return true; }

	/** Текст в прицеле: "Подобрать батарею", "Заперто", "Спрятаться". */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Darkroom|Interaction")
	FText GetInteractionPrompt(ADarkroomCharacter* Interactor) const;
	virtual FText GetInteractionPrompt_Implementation(ADarkroomCharacter* Interactor) const
	{
		return FText::GetEmpty();
	}

	/** Само действие. Вызывается только если CanInteract вернул true. */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Darkroom|Interaction")
	void Interact(ADarkroomCharacter* Interactor);
	virtual void Interact_Implementation(ADarkroomCharacter* Interactor) {}

	/** Прицел навёлся на объект / ушёл с него — для подсветки меша. */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Darkroom|Interaction")
	void OnFocusChanged(bool bFocused);
	virtual void OnFocusChanged_Implementation(bool bFocused) {}
};
