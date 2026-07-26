#include "Camera/VHSHud.h"

#include "Felar.h"
#include "Core/FelarGameState.h"
#include "Player/FelarCharacter.h"
#include "Player/FlashlightComponent.h"
#include "Player/InteractionComponent.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"

AVHSHud::AVHSHud()
{
	PrimaryActorTick.bCanEverTick = false;
}

UFont* AVHSHud::GetOsdFont() const
{
	return GEngine ? GEngine->GetMediumFont() : nullptr;
}

void AVHSHud::DrawHUD()
{
	Super::DrawHUD();

	if (!Canvas)
	{
		return;
	}

	const AFelarCharacter* Player = Cast<AFelarCharacter>(GetOwningPawn());

	// Отступ считается от меньшей стороны: иначе на широких экранах индикация
	// уезжает в самые углы, а на вертикальных — наползает на центр кадра.
	const float Margin = FMath::Min(Canvas->SizeX, Canvas->SizeY) * MarginFraction;

	// Порядок важен: развёртка и рамки идут первыми, поверх них — текст,
	// иначе строки лягут поверх букв и сделают их нечитаемыми.
	if (bDrawScanlines)
	{
		DrawScanlines();
	}

	if (bDrawFrameCorners)
	{
		DrawFrameCorners(Margin);
	}

	if (bDrawRecIndicator)
	{
		DrawRecIndicator(Margin);
	}

	if (bDrawTimecode)
	{
		DrawTimecode(Margin);
	}

	if (bDrawBattery && Player)
	{
		DrawBattery(Margin, Player);
	}

	if (bDrawObjective)
	{
		DrawObjective(Margin);
	}

	if (bDrawInteractionPrompt && Player)
	{
		DrawInteractionPrompt(Player);
	}
}

void AVHSHud::DrawRecIndicator(float Margin)
{
	const float Time = GetWorld()->GetTimeSeconds();

	// Точка горит первую половину периода и гаснет во вторую — ровное мигание
	// камкордера, а не плавная пульсация.
	const bool bDotVisible = FMath::Fmod(Time, RecBlinkPeriod) < RecBlinkPeriod * 0.5f;

	const float DotSize = Margin * 0.28f;
	if (bDotVisible)
	{
		DrawRect(RecColor, Margin, Margin, DotSize, DotSize);
	}

	DrawText(TEXT("REC"), OsdColor, Margin + DotSize * 1.8f, Margin - DotSize * 0.15f,
		GetOsdFont(), TextScale, false);
}

void AVHSHud::DrawTimecode(float Margin)
{
	const FString Timecode = BuildTimecode();

	// Ширину текста нужно измерить, чтобы прижать его к правому краю:
	// у моноширинного шрифта движка ширина символа не фиксирована.
	float DateWidth = 0.f;
	float DateHeight = 0.f;
	GetTextSize(TapeDate, DateWidth, DateHeight, GetOsdFont(), TextScale);

	float CodeWidth = 0.f;
	float CodeHeight = 0.f;
	GetTextSize(Timecode, CodeWidth, CodeHeight, GetOsdFont(), TextScale);

	const float Right = Canvas->SizeX - Margin;

	DrawText(TapeDate, OsdColor, Right - DateWidth, Margin, GetOsdFont(), TextScale, false);
	DrawText(Timecode, OsdColor, Right - CodeWidth, Margin + DateHeight * 1.2f,
		GetOsdFont(), TextScale, false);
}

FString AVHSHud::BuildTimecode() const
{
	const float Time = GetWorld()->GetTimeSeconds();

	const int32 TotalSeconds = FMath::FloorToInt(Time);
	const int32 Hours = (TotalSeconds / 3600) % 24;
	const int32 Minutes = (TotalSeconds / 60) % 60;
	const int32 Seconds = TotalSeconds % 60;

	// Кадры считаем от дробной части при 30 к/с — как на настоящей записи,
	// независимо от реального фреймрейта игры.
	const int32 Frames = FMath::FloorToInt(FMath::Frac(Time) * 30.f);

	return FString::Printf(TEXT("%02d:%02d:%02d:%02d"), Hours, Minutes, Seconds, Frames);
}

void AVHSHud::DrawBattery(float Margin, const AFelarCharacter* Player)
{
	const UFlashlightComponent* Flashlight = Player->GetFlashlight();
	if (!Flashlight)
	{
		return;
	}

	const float Percent = Flashlight->GetBatteryPercent();
	const bool bLow = Flashlight->IsBatteryLow();

	const float BarWidth = Margin * 2.4f;
	const float BarHeight = Margin * 0.34f;
	const float X = Margin;
	const float Y = Canvas->SizeY - Margin - BarHeight;

	// Севшая батарея мигает: это единственное предупреждение, которое игрок
	// обязан заметить, не отрывая взгляда от центра кадра.
	const bool bBlinkOff = bLow && FMath::Fmod(GetWorld()->GetTimeSeconds(), 0.8f) > 0.4f;

	const FLinearColor FillColor = bLow
		? FLinearColor(0.95f, 0.35f, 0.1f, bBlinkOff ? 0.25f : 0.95f)
		: FLinearColor(0.85f, 0.9f, 0.85f, 0.85f);

	// Корпус батареи: четыре тонкие полосы вместо рамки — Canvas не умеет
	// рисовать незаполненные прямоугольники.
	const FLinearColor FrameColor(OsdColor.R, OsdColor.G, OsdColor.B, 0.55f);
	const float Thickness = FMath::Max(1.f, BarHeight * 0.12f);

	DrawRect(FrameColor, X, Y, BarWidth, Thickness);
	DrawRect(FrameColor, X, Y + BarHeight - Thickness, BarWidth, Thickness);
	DrawRect(FrameColor, X, Y, Thickness, BarHeight);
	DrawRect(FrameColor, X + BarWidth - Thickness, Y, Thickness, BarHeight);
	// Контакт на торце.
	DrawRect(FrameColor, X + BarWidth, Y + BarHeight * 0.3f, Thickness * 2.f, BarHeight * 0.4f);

	const float Inset = Thickness * 2.f;
	const float FillWidth = FMath::Max(0.f, (BarWidth - Inset * 2.f) * Percent);
	if (FillWidth > 0.f)
	{
		DrawRect(FillColor, X + Inset, Y + Inset, FillWidth, BarHeight - Inset * 2.f);
	}

	if (bLow && !bBlinkOff)
	{
		DrawText(TEXT("LOW BATT"), FLinearColor(0.95f, 0.35f, 0.1f, 0.95f),
			X, Y - Margin * 0.5f, GetOsdFont(), TextScale * 0.85f, false);
	}
}

void AVHSHud::DrawObjective(float Margin)
{
	const AFelarGameState* State = GetWorld()->GetGameState<AFelarGameState>();
	if (!State || State->GetFragmentsRequired() <= 0)
	{
		return;
	}

	const FString Text = FString::Printf(TEXT("%d / %d"),
		State->GetFragmentsCollected(), State->GetFragmentsRequired());

	float TextWidth = 0.f;
	float TextHeight = 0.f;
	GetTextSize(Text, TextWidth, TextHeight, GetOsdFont(), TextScale);

	DrawText(Text, OsdColor,
		Canvas->SizeX - Margin - TextWidth,
		Canvas->SizeY - Margin - TextHeight,
		GetOsdFont(), TextScale, false);
}

void AVHSHud::DrawInteractionPrompt(const AFelarCharacter* Player)
{
	const UInteractionComponent* Interaction = Player->GetInteraction();
	if (!Interaction)
	{
		return;
	}

	// В укрытии прицел смотрит в дверцу шкафа, и подсказка от неё только мешает —
	// показываем вместо неё способ выбраться.
	const FString Prompt = Player->IsHiding()
		? FString(TEXT("[E]  Выйти"))
		: (Interaction->GetFocusedActor()
			? FString::Printf(TEXT("[E]  %s"), *Interaction->GetCurrentPrompt().ToString())
			: FString());

	if (Prompt.IsEmpty())
	{
		return;
	}

	float TextWidth = 0.f;
	float TextHeight = 0.f;
	GetTextSize(Prompt, TextWidth, TextHeight, GetOsdFont(), TextScale);

	// Чуть ниже центра: прямо в центре подсказка перекрывала бы то, на что смотришь.
	DrawText(Prompt, OsdColor,
		(Canvas->SizeX - TextWidth) * 0.5f,
		Canvas->SizeY * 0.58f,
		GetOsdFont(), TextScale, false);
}

void AVHSHud::DrawFrameCorners(float Margin)
{
	const float Length = Margin * 0.9f;
	const float Thickness = FMath::Max(1.f, Margin * 0.06f);
	const FLinearColor Color(OsdColor.R, OsdColor.G, OsdColor.B, 0.5f);

	const float Left = Margin * 0.6f;
	const float Top = Margin * 0.6f;
	const float Right = Canvas->SizeX - Margin * 0.6f;
	const float Bottom = Canvas->SizeY - Margin * 0.6f;

	// Уголки кадрирования как в видоискателе: по две линии на каждый угол.
	DrawLine(Left, Top, Left + Length, Top, Color, Thickness);
	DrawLine(Left, Top, Left, Top + Length, Color, Thickness);

	DrawLine(Right, Top, Right - Length, Top, Color, Thickness);
	DrawLine(Right, Top, Right, Top + Length, Color, Thickness);

	DrawLine(Left, Bottom, Left + Length, Bottom, Color, Thickness);
	DrawLine(Left, Bottom, Left, Bottom - Length, Color, Thickness);

	DrawLine(Right, Bottom, Right - Length, Bottom, Color, Thickness);
	DrawLine(Right, Bottom, Right, Bottom - Length, Color, Thickness);
}

void AVHSHud::DrawScanlines()
{
	const int32 Spacing = FMath::Max(2, ScanlineSpacing);
	const FLinearColor LineColor(0.f, 0.f, 0.f, ScanlineOpacity);

	const int32 Height = Canvas->SizeY;
	const float Width = (float)Canvas->SizeX;

	// Строки медленно ползут вверх: неподвижная сетка читается как дефект
	// монитора, а движущаяся — как развёртка живой записи.
	const int32 Offset = FMath::FloorToInt(GetWorld()->GetTimeSeconds() * 12.f) % Spacing;

	for (int32 Y = Offset; Y < Height; Y += Spacing)
	{
		DrawRect(LineColor, 0.f, (float)Y, Width, 1.f);
	}
}
