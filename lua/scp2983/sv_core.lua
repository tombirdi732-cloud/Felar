--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — ядро (server)
	- Назначение/снятие роли SCP
	- Ледяное Ядро (ресурс) и его восстановление/убыль
	- Состояние «на нуле» (слабость)
------------------------------------------------------------------------------]]

local C = SCP2983.Config

util.AddNetworkString( "scp2983_lightlevel" ) -- клиент шлёт яркость у глаз

--------------------------------------------------------------------------------
-- Назначение / снятие роли
--------------------------------------------------------------------------------
function SCP2983.Make( ply )
	if not IsValid( ply ) or not ply:IsPlayer() then return end

	ply:SetNW2Bool( "scp2983_is", true )
	ply:SetNW2Float( "scp2983_core", C.Core.Start )
	ply.scp2983_light = 0.5

	ply:SetMaxHealth( C.MaxHealth )
	ply:SetHealth( C.MaxHealth )

	if util.IsValidModel( C.PlayerModel ) then
		ply:SetModel( C.PlayerModel )
	end

	-- Руки от первого лица
	local hands = ply:GetHands()
	if IsValid( hands ) and C.Hands and util.IsValidModel( C.Hands ) then
		hands:SetModel( C.Hands )
	end

	ply:StripWeapons()
	ply:Give( C.HandsWeapon )
	ply:SelectWeapon( C.HandsWeapon )

	ply:SetWalkSpeed( C.WalkSpeed )
	ply:SetRunSpeed( C.RunSpeed )

	hook.Run( "SCP2983_Made", ply )
	MsgC( Color(120,200,255), "[ИНЕЙ] " .. ply:Nick() .. " стал SCP-2983\n" )
end

function SCP2983.Remove( ply )
	if not IsValid( ply ) then return end

	ply:SetNW2Bool( "scp2983_is", false )
	ply:SetNW2Float( "scp2983_core", 0 )
	ply:SetNW2Bool( "scp2983_frozen", false )

	ply:SetWalkSpeed( 200 )
	ply:SetRunSpeed( 400 )

	hook.Run( "SCP2983_Removed", ply )
end

-- Руки ИНЕЯ при спавне (если игрок ресается уже будучи SCP)
hook.Add( "PlayerSetHandsModel", "SCP2983_Hands", function( ply, ent )
	if SCP2983.IsSCP( ply ) and C.Hands and util.IsValidModel( C.Hands ) then
		ent:SetModel( C.Hands )
	end
end )

--------------------------------------------------------------------------------
-- Клиент присылает уровень освещённости у своих глаз (для «тёмных зон»)
--------------------------------------------------------------------------------
net.Receive( "scp2983_lightlevel", function( _, ply )
	if not SCP2983.IsSCP( ply ) then return end
	ply.scp2983_light = math.Clamp( net.ReadFloat(), 0, 1 )
end )

--------------------------------------------------------------------------------
-- Определяем, рядом ли источник тепла
--------------------------------------------------------------------------------
local function NearHeat( ply )
	if ply:IsOnFire() then return true end

	for _, e in ipairs( ents.FindInSphere( ply:GetPos(), C.Core.HeatRadius ) ) do
		if not IsValid( e ) then continue end
		local cls = e:GetClass()
		if cls == "env_fire" or cls == "entityflame" or cls == "_firesmoke"
			or cls == "fire" or cls == "prop_thumper" then
			return true
		end
		if e ~= ply and e.IsOnFire and e:IsOnFire() then
			return true
		end
	end
	return false
end

-- Внутри крио-зоны?
local function InCryoZone( ply )
	for _, e in ipairs( ents.FindByClass( "scp2983_cryozone" ) ) do
		if IsValid( e ) and ply:GetPos():DistToSqr( e:GetPos() ) <= ( e:GetRadius() ^ 2 ) then
			return true
		end
	end
	return false
end

--------------------------------------------------------------------------------
-- Тик восстановления ядра + слабость на нуле
--------------------------------------------------------------------------------
local nextTick = 0
hook.Add( "Think", "SCP2983_CoreThink", function()
	if CurTime() < nextTick then return end
	local dt = CurTime() - ( SCP2983._lastCore or CurTime() )
	SCP2983._lastCore = CurTime()
	nextTick = CurTime() + 0.1

	for _, ply in ipairs( player.GetAll() ) do
		if not SCP2983.IsSCP( ply ) or not ply:Alive() then continue end

		local core = SCP2983.GetCore( ply )
		local rate

		if NearHeat( ply ) then
			rate = -C.Core.DrainHeat
		elseif InCryoZone( ply ) then
			rate = C.Core.CryoRegen
		elseif ( ply.scp2983_light or 1 ) <= C.Core.DarkThreshold then
			rate = C.Core.RegenDark
		else
			rate = C.Core.RegenNormal
		end

		core = math.Clamp( core + rate * dt, 0, C.Core.Max )
		ply:SetNW2Float( "scp2983_core", core )

		-- Слабость на нуле
		local zero = core <= 0
		if zero ~= ply.scp2983_wasZero then
			ply.scp2983_wasZero = zero
			ply:SetWalkSpeed( zero and C.Core.ZeroWalkSpeed or C.WalkSpeed )
			ply:SetRunSpeed( zero and C.Core.ZeroRunSpeed or C.RunSpeed )
			ply:SetNW2Bool( "scp2983_weak", zero )
		end
	end
end )

--------------------------------------------------------------------------------
-- Списание ядра (используется способностями)
--------------------------------------------------------------------------------
function SCP2983.SpendCore( ply, amount )
	local core = SCP2983.GetCore( ply )
	if core < amount then return false end
	ply:SetNW2Float( "scp2983_core", core - amount )
	return true
end

function SCP2983.AddCore( ply, amount )
	ply:SetNW2Float( "scp2983_core",
		math.Clamp( SCP2983.GetCore( ply ) + amount, 0, C.Core.Max ) )
end

--------------------------------------------------------------------------------
-- Чистим состояние при смерти/выходе
--------------------------------------------------------------------------------
hook.Add( "PlayerDeath", "SCP2983_Death", function( ply )
	if SCP2983.IsSCP( ply ) then
		SCP2983.Remove( ply )
		hook.Run( "SCP2983_Died", ply )
	end
end )

hook.Add( "PlayerDisconnected", "SCP2983_DC", function( ply )
	if SCP2983.IsSCP( ply ) then hook.Run( "SCP2983_Died", ply ) end
end )

--------------------------------------------------------------------------------
-- Команды
--------------------------------------------------------------------------------
local function canUse( ply )
	if not C.AdminOnly then return true end
	return not IsValid( ply ) or ply:IsAdmin()
end

-- Консоль: scp2983_make <часть_ника|self>
concommand.Add( "scp2983_make", function( ply, _, args )
	if not canUse( ply ) then return end
	local target = ply

	if args[1] and args[1] ~= "self" then
		local q = string.lower( args[1] )
		for _, p in ipairs( player.GetAll() ) do
			if string.find( string.lower( p:Nick() ), q, 1, true ) then target = p break end
		end
	end

	if IsValid( target ) then SCP2983.Make( target ) end
end )

concommand.Add( "scp2983_remove", function( ply, _, args )
	if not canUse( ply ) then return end
	local target = ply
	if args[1] and args[1] ~= "self" then
		local q = string.lower( args[1] )
		for _, p in ipairs( player.GetAll() ) do
			if string.find( string.lower( p:Nick() ), q, 1, true ) then target = p break end
		end
	end
	if IsValid( target ) then SCP2983.Remove( target ) end
end )

-- Чат: !iney  /  !unmey
hook.Add( "PlayerSay", "SCP2983_Chat", function( ply, text )
	local t = string.lower( string.Trim( text ) )
	if t == "!iney" and canUse( ply ) then
		SCP2983.Make( ply )
		return ""
	elseif t == "!uniney" and canUse( ply ) then
		SCP2983.Remove( ply )
		return ""
	end
end )
