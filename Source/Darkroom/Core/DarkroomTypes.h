#pragma once

#include "CoreMinimal.h"
#include "DarkroomTypes.generated.h"

/**
 * Громкость шума, который издаёт игрок. Значение = Loudness для системы слуха ИИ.
 * Существо слышит шум в радиусе HearingRange * Loudness.
 */
UENUM(BlueprintType)
enum class ENoiseLevel : uint8
{
	/** Присед — почти неслышно. */
	Silent		UMETA(DisplayName = "Silent"),
	/** Обычная ходьба. */
	Quiet		UMETA(DisplayName = "Quiet"),
	/** Бег, взаимодействие с предметами. */
	Loud		UMETA(DisplayName = "Loud"),
	/** Паника, крик, падение — существо услышит почти с любого места. */
	Scream		UMETA(DisplayName = "Scream")
};

/** Текущее состояние ИИ существа. Для UI, отладки и звукового оформления. */
UENUM(BlueprintType)
enum class EStalkerState : uint8
{
	/** Бродит по уровню, ничего не подозревает. */
	Patrol		UMETA(DisplayName = "Patrol"),
	/** Услышал шум, идёт проверить место. */
	Investigate	UMETA(DisplayName = "Investigate"),
	/** Видит игрока, преследует. */
	Chase		UMETA(DisplayName = "Chase"),
	/** Потерял игрока, обыскивает район последней позиции. */
	Search		UMETA(DisplayName = "Search")
};

/** Чем закончилась партия. */
UENUM(BlueprintType)
enum class EGameOutcome : uint8
{
	InProgress	UMETA(DisplayName = "In Progress"),
	Escaped		UMETA(DisplayName = "Escaped"),
	Caught		UMETA(DisplayName = "Caught")
};

/** Утилита: перевод ENoiseLevel в множитель громкости для UAISense_Hearing. */
namespace DarkroomNoise
{
	inline float ToLoudness(ENoiseLevel Level)
	{
		switch (Level)
		{
		case ENoiseLevel::Silent:	return 0.15f;
		case ENoiseLevel::Quiet:	return 0.5f;
		case ENoiseLevel::Loud:		return 1.0f;
		case ENoiseLevel::Scream:	return 3.0f;
		default:					return 1.0f;
		}
	}
}
