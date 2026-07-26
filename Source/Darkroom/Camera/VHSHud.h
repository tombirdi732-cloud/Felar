#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "VHSHud.generated.h"

class ADarkroomCharacter;

/**
 * Экранная индикация камкордера: REC, таймкод, заряд, рамки кадра и строки развёртки.
 *
 * Сделано на AHUD, а не на UMG, сознательно: Canvas рисуется прямо из C++ и не
 * требует ни одного ассета, поэтому интерфейс работает сразу после сборки проекта.
 * Когда дойдёшь до красивого меню и инвентаря — там UMG удобнее, но эта «наклейка
 * поверх кадра» останется здесь.
 *
 * Отдельный приём: заряд фонаря показан как батарея камеры. Игрок читает его как
 * часть найденной записи, а не как игровой интерфейс, и погружение не ломается.
 */
UCLASS()
class DARKROOM_API AVHSHud : public AHUD
{
	GENERATED_BODY()

public:
	AVHSHud();

	virtual void DrawHUD() override;

protected:
	// --- Что рисовать ---

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	bool bDrawRecIndicator = true;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	bool bDrawTimecode = true;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	bool bDrawBattery = true;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	bool bDrawFrameCorners = true;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	bool bDrawScanlines = true;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	bool bDrawObjective = true;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	bool bDrawInteractionPrompt = true;

	// --- Внешний вид ---

	/** Дата на записи. Чисто декоративная — задаёт эпоху кассеты. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	FString TapeDate = TEXT("14 OCT 1997");

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	FLinearColor OsdColor = FLinearColor(0.92f, 0.94f, 0.9f, 0.85f);

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD")
	FLinearColor RecColor = FLinearColor(0.95f, 0.15f, 0.12f, 1.f);

	/** Отступ от краёв экрана в долях его размера. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD", meta = (ClampMin = "0.0", ClampMax = "0.3"))
	float MarginFraction = 0.06f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD", meta = (ClampMin = "0.5", ClampMax = "4.0"))
	float TextScale = 1.15f;

	/** Период мигания точки REC в секундах. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD", meta = (ClampMin = "0.1"))
	float RecBlinkPeriod = 1.4f;

	/**
	 * Шаг строк развёртки в пикселях. Каждая строка — отдельный вызов отрисовки,
	 * поэтому шаг меньше 3 заметно грузит кадр без выигрыша в картинке.
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD", meta = (ClampMin = "2", ClampMax = "16"))
	int32 ScanlineSpacing = 4;

	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Darkroom|VHS HUD", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float ScanlineOpacity = 0.12f;

private:
	void DrawRecIndicator(float Margin);
	void DrawTimecode(float Margin);
	void DrawBattery(float Margin, const ADarkroomCharacter* Player);
	void DrawObjective(float Margin);
	void DrawInteractionPrompt(const ADarkroomCharacter* Player);
	void DrawFrameCorners(float Margin);
	void DrawScanlines();

	/** Таймкод формата HH:MM:SS:FF от времени, прошедшего с начала партии. */
	FString BuildTimecode() const;

	/** Шрифт для экранной индикации. Берётся из движка, ассет не нужен. */
	UFont* GetOsdFont() const;
};
