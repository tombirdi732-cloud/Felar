--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — HUD (client)
	- Полоса Ледяного Ядра
	- Панель иконок способностей снизу:  [клавиша] / иконка / название
	- Полоса обморожения для жертв
------------------------------------------------------------------------------]]

local C = SCP2983.Config

surface.CreateFont( "SCP2983_Key", {
	font = "Roboto", size = 24, weight = 800, antialias = true,
} )
surface.CreateFont( "SCP2983_Name", {
	font = "Roboto", size = 17, weight = 600, antialias = true,
} )
surface.CreateFont( "SCP2983_Big", {
	font = "Roboto", size = 30, weight = 800, antialias = true,
} )
surface.CreateFont( "SCP2983_Small", {
	font = "Roboto", size = 15, weight = 500, antialias = true,
} )

local ICE   = Color( 150, 215, 255 )
local ICE_D = Color( 70, 120, 170 )
local WHITE = Color( 240, 250, 255 )
local DARK  = Color( 15, 25, 35, 220 )
local RED   = Color( 235, 90, 90 )

-- Кэш материалов иконок (создаются лениво; если файла нет — рисуем плейсхолдер)
local matCache = {}
local function getIcon( path )
	if matCache[ path ] == nil then
		matCache[ path ] = Material( path, "smooth mips" )
	end
	local m = matCache[ path ]
	if not m or m:IsError() then return nil end
	return m
end

--------------------------------------------------------------------------------
-- Порядок способностей для панели (по Order)
--------------------------------------------------------------------------------
local abilityOrder = {}
for id, a in pairs( C.Abilities ) do
	table.insert( abilityOrder, { id = id, data = a } )
end
table.sort( abilityOrder, function( x, y )
	return ( x.data.Order or 99 ) < ( y.data.Order or 99 )
end )

--------------------------------------------------------------------------------
-- Одна иконка способности
--------------------------------------------------------------------------------
local BOX = 68
local function drawAbility( x, y, a, core )
	-- [клавиша] сверху
	draw.SimpleText( "[" .. ( a.KeyLabel or "?" ) .. "]", "SCP2983_Key",
		x + BOX/2, y - 6, WHITE, TEXT_ALIGN_CENTER, TEXT_ALIGN_BOTTOM )

	local affordable = core >= ( a.Cost or 0 )

	-- Рамка
	draw.RoundedBox( 8, x, y, BOX, BOX, DARK )
	surface.SetDrawColor( affordable and ICE or ICE_D )
	surface.DrawOutlinedRect( x, y, BOX, BOX, 2 )

	-- Иконка или плейсхолдер
	local mat = a.Icon and getIcon( a.Icon )
	surface.SetDrawColor( affordable and 255 or 110, 255, 255, affordable and 255 or 150 )
	if mat then
		surface.SetMaterial( mat )
		surface.DrawTexturedRect( x + 8, y + 8, BOX - 16, BOX - 16 )
	else
		-- Плейсхолдер: снежинка-текст, пока не подложены иконки
		draw.SimpleText( "❄", "SCP2983_Big", x + BOX/2, y + BOX/2 - 2,
			affordable and ICE or ICE_D, TEXT_ALIGN_CENTER, TEXT_ALIGN_CENTER )
	end

	-- Стоимость ядра
	if ( a.Cost or 0 ) > 0 then
		draw.SimpleText( a.Cost, "SCP2983_Small", x + BOX - 4, y + BOX - 3,
			affordable and ICE or RED, TEXT_ALIGN_RIGHT, TEXT_ALIGN_BOTTOM )
	end

	-- Название снизу
	draw.SimpleText( a.Name, "SCP2983_Name", x + BOX/2, y + BOX + 6,
		WHITE, TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP )
end

--------------------------------------------------------------------------------
-- Панель SCP: ядро + иконки
--------------------------------------------------------------------------------
local function drawSCPHud( ply )
	local sw, sh = ScrW(), ScrH()
	local core = SCP2983.GetCore( ply )

	-- Панель способностей снизу по центру
	local n = #abilityOrder
	local gap = 22
	local totalW = n * BOX + ( n - 1 ) * gap
	local startX = ( sw - totalW ) / 2
	local y = sh - 130

	for i, e in ipairs( abilityOrder ) do
		local x = startX + ( i - 1 ) * ( BOX + gap )
		drawAbility( x, y, e.data, core )
	end

	-- Полоса Ледяного Ядра над иконками
	local barW, barH = totalW, 20
	local bx, by = startX, y - 54
	draw.RoundedBox( 6, bx, by, barW, barH, DARK )
	local frac = core / C.Core.Max
	draw.RoundedBox( 6, bx, by, barW * frac, barH,
		SCP2983.IsFrozen( ply ) and ICE_D or ICE )
	surface.SetDrawColor( ICE )
	surface.DrawOutlinedRect( bx, by, barW, barH, 1 )
	draw.SimpleText( "ЛЕДЯНОЕ ЯДРО  " .. math.Round( core ) .. " / " .. C.Core.Max,
		"SCP2983_Small", bx + barW/2, by + barH/2, WHITE,
		TEXT_ALIGN_CENTER, TEXT_ALIGN_CENTER )

	-- Индикатор слабости
	if ply:GetNW2Bool( "scp2983_weak", false ) then
		draw.SimpleText( "ЯДРО ИСТОЩЕНО — ты слаб, ищи холод и тьму",
			"SCP2983_Name", sw/2, by - 20, RED, TEXT_ALIGN_CENTER, TEXT_ALIGN_BOTTOM )
	end

	-- Прогресс «Перерождения холода»
	local prog = ply:GetNW2Float( "scp2983_rebornProg", 0 )
	if prog > 0 then
		local pw = 260
		local px = ( sw - pw ) / 2
		local py = sh * 0.6
		draw.RoundedBox( 6, px, py, pw, 16, DARK )
		draw.RoundedBox( 6, px, py, pw * prog, 16, ICE )
		draw.SimpleText( "Перерождение холода...", "SCP2983_Small",
			sw/2, py - 6, WHITE, TEXT_ALIGN_CENTER, TEXT_ALIGN_BOTTOM )
	end
end

--------------------------------------------------------------------------------
-- Панель Обмороженного
--------------------------------------------------------------------------------
local function drawThrallHud( ply )
	local sw, sh = ScrW(), ScrH()
	draw.SimpleText( "ОБМОРОЖЕННЫЙ", "SCP2983_Big", sw/2, sh - 96,
		ICE, TEXT_ALIGN_CENTER, TEXT_ALIGN_CENTER )
	draw.SimpleText( "[" .. input.GetKeyName( C.Thrall.GrabKey ):upper() ..
		"] — схватить живого   •   ты видишь хозяина и метишь ему цели",
		"SCP2983_Name", sw/2, sh - 74, WHITE, TEXT_ALIGN_CENTER, TEXT_ALIGN_CENTER )
end

--------------------------------------------------------------------------------
-- Полоса обморожения для жертв
--------------------------------------------------------------------------------
local function drawFrostHud( ply )
	local frost = SCP2983.GetFrost( ply )
	if frost <= 0 and not SCP2983.IsFrozen( ply ) then return end

	local sw, sh = ScrW(), ScrH()
	local barW, barH = 260, 18
	local bx = ( sw - barW ) / 2
	local by = sh - 150

	draw.RoundedBox( 6, bx, by, barW, barH, DARK )
	local frac = frost / C.Frostbite.Max
	local col = frost >= C.Frostbite.FreezeAt and ICE_D
		or ( frost >= C.Frostbite.DamageAt and Color( 120, 180, 255 ) or ICE )
	draw.RoundedBox( 6, bx, by, barW * frac, barH, col )
	surface.SetDrawColor( ICE )
	surface.DrawOutlinedRect( bx, by, barW, barH, 1 )

	local label = "ОБМОРОЖЕНИЕ " .. math.Round( frost )
	if SCP2983.IsFrozen( ply ) then label = "ЗАМОРОЖЕН — держись, союзники разобьют лёд!" end
	draw.SimpleText( label, "SCP2983_Small", sw/2, by - 4,
		WHITE, TEXT_ALIGN_CENTER, TEXT_ALIGN_BOTTOM )
end

--------------------------------------------------------------------------------
hook.Add( "HUDPaint", "SCP2983_HUD", function()
	local ply = LocalPlayer()
	if not IsValid( ply ) then return end

	if SCP2983.IsSCP( ply ) then
		drawSCPHud( ply )
	elseif SCP2983.IsThrall( ply ) then
		drawThrallHud( ply )
	else
		drawFrostHud( ply )
	end
end )

-- Прячем стандартный худ у SCP (по желанию)
hook.Add( "HUDShouldDraw", "SCP2983_HideHud", function( name )
	local ply = LocalPlayer()
	if IsValid( ply ) and SCP2983.IsSCP( ply ) then
		if name == "CHudHealth" or name == "CHudBattery" then return false end
	end
end )
