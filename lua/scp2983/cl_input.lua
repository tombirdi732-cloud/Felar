--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — ввод (client)
	- Опрашивает клавиши способностей и шлёт на сервер
	- Замеряет яркость у глаз (для «тёмных зон» → регенерация ядра)
	- Обмороженный: захват на GrabKey
------------------------------------------------------------------------------]]

local C = SCP2983.Config

local down = {} -- отслеживаем фронт нажатия

-- Отправка «нажал способность»
local function fire( id )
	net.Start( "scp2983_ability" )
	net.WriteString( id )
	net.SendToServer()
end

hook.Add( "Think", "SCP2983_Input", function()
	local ply = LocalPlayer()
	if not IsValid( ply ) then return end

	------------------------------------------------ SCP
	if SCP2983.IsSCP( ply ) then
		-- Ледяной взрыв
		local kb = C.Abilities.IceBlast.Key
		if input.IsKeyDown( kb ) then
			if not down.blast then down.blast = true fire( "IceBlast" ) end
		else down.blast = false end

		-- Цепи холода
		local kc = C.Abilities.ColdChains.Key
		if input.IsKeyDown( kc ) then
			if not down.chains then down.chains = true fire( "ColdChains" ) end
		else down.chains = false end

		-- Перерождение холода (удержание)
		local kf = C.Abilities.FrostReborn.Key
		if input.IsKeyDown( kf ) then
			if not down.reborn then
				down.reborn = true
				net.Start( "scp2983_hold" ) net.WriteBool( true ) net.SendToServer()
			end
		elseif down.reborn then
			down.reborn = false
			net.Start( "scp2983_hold" ) net.WriteBool( false ) net.SendToServer()
		end
	end

	------------------------------------------------ Обмороженный
	if SCP2983.IsThrall( ply ) then
		local kg = C.Thrall.GrabKey
		if input.IsKeyDown( kg ) then
			if not down.grab then
				down.grab = true
				net.Start( "scp2983_thrall_grab" ) net.SendToServer()
			end
		else down.grab = false end
	end
end )

--------------------------------------------------------------------------------
-- Замер яркости у глаз → серверу (для тёмных зон)
--------------------------------------------------------------------------------
local nextLight = 0
hook.Add( "Think", "SCP2983_LightSample", function()
	local ply = LocalPlayer()
	if not IsValid( ply ) or not SCP2983.IsSCP( ply ) then return end
	if CurTime() < nextLight then return end
	nextLight = CurTime() + 0.5

	local col = render.GetLightColor( ply:EyePos() )
	local bright = ( col.x + col.y + col.z ) / 3

	net.Start( "scp2983_lightlevel" )
	net.WriteFloat( bright )
	net.SendToServer()
end )
