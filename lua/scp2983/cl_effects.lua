--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — экранные эффекты (client)
	- Виньетка инея у жертвы (40+ дрожь/приглушение, 70+ сужение зрения, 100 лёд)
	- ESP: Обмороженный видит хозяина сквозь стены; помеченные цели
------------------------------------------------------------------------------]]

local C = SCP2983.Config

local vig = Material( "gui/gradient_up.png" ) -- запасной; заменится frost-оверлеем если положишь свой

--------------------------------------------------------------------------------
-- Наложение инея (жертва)
--------------------------------------------------------------------------------
hook.Add( "HUDPaint", "SCP2983_FrostOverlay", function()
	local ply = LocalPlayer()
	if not IsValid( ply ) then return end

	local frost = SCP2983.GetFrost( ply )
	local frozen = SCP2983.IsFrozen( ply )
	if frost < C.Frostbite.SlowAt and not frozen then return end

	local sw, sh = ScrW(), ScrH()

	-- Сила виньетки растёт с обморожением
	local t = math.Clamp( ( frost - C.Frostbite.SlowAt ) /
		( C.Frostbite.Max - C.Frostbite.SlowAt ), 0, 1 )
	if frozen then t = 1 end

	-- Дрожь при 40+
	local shake = 0
	if frost >= C.Frostbite.SlowAt then
		shake = math.sin( CurTime() * 40 ) * ( 1 + t * 3 )
	end

	-- Голубоватый оверлей
	surface.SetDrawColor( 150, 210, 255, math.floor( 40 + t * 120 ) )
	surface.SetMaterial( vig )
	surface.DrawTexturedRect( shake, 0, sw, sh )
	surface.DrawTexturedRect( shake, 0, sw, sh )

	-- Сужение зрения инеем при 70+ (тёмно-голубые рамки по краям)
	if frost >= C.Frostbite.DamageAt or frozen then
		local narrow = math.Clamp( ( frost - C.Frostbite.DamageAt ) /
			( C.Frostbite.Max - C.Frostbite.DamageAt ), 0, 1 )
		if frozen then narrow = 1 end
		local margin = ( sw * 0.28 ) * narrow
		surface.SetDrawColor( 90, 150, 210, 200 )
		-- лево/право
		surface.DrawRect( 0, 0, margin, sh )
		surface.DrawRect( sw - margin, 0, margin, sh )
		-- верх/низ
		local vm = ( sh * 0.22 ) * narrow
		surface.DrawRect( 0, 0, sw, vm )
		surface.DrawRect( 0, sh - vm, sw, vm )
	end
end )

-- Приглушённый звук при 40+ (эффект «ваты в ушах»)
hook.Add( "Think", "SCP2983_MuffleSound", function()
	local ply = LocalPlayer()
	if not IsValid( ply ) then return end
	local frost = SCP2983.GetFrost( ply )
	-- Пример: сервер может дополнительно резать громкость; тут только визуальная часть.
end )

--------------------------------------------------------------------------------
-- ESP для Обмороженного: хозяин сквозь стены
--------------------------------------------------------------------------------
hook.Add( "HUDPaint", "SCP2983_ThrallESP", function()
	local ply = LocalPlayer()
	if not IsValid( ply ) or not SCP2983.IsThrall( ply ) then return end

	local owner = ply:GetNW2Entity( "scp2983_owner" )
	if IsValid( owner ) then
		local pos = ( owner:GetPos() + Vector( 0, 0, 80 ) ):ToScreen()
		if pos.visible then
			draw.SimpleText( "❄ ХОЗЯИН", "SCP2983_Name", pos.x, pos.y,
				Color( 150, 215, 255 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_CENTER )
		end
	end
end )

--------------------------------------------------------------------------------
-- Помеченные цели видны SCP и Обмороженным
--------------------------------------------------------------------------------
hook.Add( "HUDPaint", "SCP2983_Marked", function()
	local ply = LocalPlayer()
	if not IsValid( ply ) then return end
	if not ( SCP2983.IsSCP( ply ) or SCP2983.IsThrall( ply ) ) then return end

	for _, p in ipairs( player.GetAll() ) do
		if not IsValid( p ) or p == ply then continue end
		if p:GetNW2Float( "scp2983_marked", 0 ) > CurTime() then
			local pos = ( p:GetPos() + Vector( 0, 0, 82 ) ):ToScreen()
			if pos.visible then
				draw.SimpleText( "◈ ЦЕЛЬ", "SCP2983_Small", pos.x, pos.y,
					Color( 255, 120, 120 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_CENTER )
			end
		end
	end
end )
