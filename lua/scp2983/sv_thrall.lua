--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — Обмороженный / thrall (server)

	Из замороженного игрока получается «Обмороженный»:
	  - урона не наносит, но хватает и держит живых (GrabTime сек)
	  - видит хозяина сквозь стены, помечает ему цели
	  - максимум Max, живёт Lifetime сек или до смерти SCP
	  - оружие снято, Health HP, повышенная скорость
------------------------------------------------------------------------------]]

local C = SCP2983.Config

util.AddNetworkString( "scp2983_thrall_grab" )

SCP2983._thralls = SCP2983._thralls or {}

local function CountThralls( owner )
	local n = 0
	for ply, o in pairs( SCP2983._thralls ) do
		if IsValid( ply ) and o == owner then n = n + 1 end
	end
	return n
end

function SCP2983.MakeThrall( victim, owner )
	if not IsValid( victim ) or not victim:IsPlayer() then return end
	if CountThralls( owner ) >= C.Thrall.Max then return end

	-- Снимаем заморозку без осколков
	SCP2983.Unfreeze( victim )
	victim:SetNW2Float( "scp2983_frost", 0 )

	victim:SetNW2Bool( "scp2983_thrall", true )
	victim:SetNW2Bool( "scp2983_frozen", false )
	SCP2983._thralls[ victim ] = owner

	victim:StripWeapons()
	victim:SetMaxHealth( C.Thrall.Health )
	victim:SetHealth( C.Thrall.Health )

	if util.IsValidModel( C.Thrall.Model ) then
		victim:SetModel( C.Thrall.Model )
	end
	victim:SetColor( Color( 170, 220, 255 ) )
	victim:SetWalkSpeed( C.WalkSpeed * C.Thrall.SpeedMul )
	victim:SetRunSpeed( C.RunSpeed * C.Thrall.SpeedMul )
	victim:SetNW2Entity( "scp2983_owner", owner )

	victim:EmitSound( C.Sounds.FrostReborn )

	-- Жизнь Lifetime секунд
	timer.Create( "scp2983_thrall_" .. victim:EntIndex(), C.Thrall.Lifetime, 1, function()
		if IsValid( victim ) then SCP2983.KillThrall( victim ) end
	end )

	hook.Run( "SCP2983_ThrallMade", victim, owner )
end

function SCP2983.KillThrall( victim )
	if not IsValid( victim ) then return end
	timer.Remove( "scp2983_thrall_" .. victim:EntIndex() )
	SCP2983._thralls[ victim ] = nil

	victim:SetNW2Bool( "scp2983_thrall", false )
	victim:SetColor( Color( 255, 255, 255 ) )
	victim:SetMaterial( "" )
	victim:SetWalkSpeed( 200 )
	victim:SetRunSpeed( 400 )

	if victim:Alive() then victim:Kill() end
end

-- Захват: Обмороженный хватает живого игрока и держит GrabTime сек
net.Receive( "scp2983_thrall_grab", function( _, ply )
	if not SCP2983.IsThrall( ply ) or not ply:Alive() then return end

	local tr = util.TraceLine( {
		start  = ply:EyePos(),
		endpos = ply:EyePos() + ply:GetAimVector() * 90,
		filter = ply,
	} )
	local tgt = tr.Entity
	if not SCP2983.IsValidTarget( tgt ) then return end

	tgt.scp2983_grabbedUntil = CurTime() + C.Thrall.GrabTime
	tgt:EmitSound( "physics/body/body_medium_impact_soft1.wav" )
end )

-- Держим захваченного на месте
hook.Add( "SetupMove", "SCP2983_Grabbed", function( ply, mv )
	if ( ply.scp2983_grabbedUntil or 0 ) > CurTime() then
		mv:SetForwardSpeed( 0 ); mv:SetSideSpeed( 0 )
		mv:SetMaxSpeed( 40 ); mv:SetMaxClientSpeed( 40 )
	end
end )

-- Обмороженный не наносит урона оружием/руками
hook.Add( "EntityTakeDamage", "SCP2983_ThrallNoDamage", function( victim, dmg )
	local att = dmg:GetAttacker()
	if IsValid( att ) and att:IsPlayer() and SCP2983.IsThrall( att ) then
		dmg:SetDamage( 0 )
		return true
	end
end )

-- Метка цели хозяину: смотрит на живого → помечаем
local nextMark = 0
hook.Add( "Think", "SCP2983_ThrallMark", function()
	if CurTime() < nextMark then return end
	nextMark = CurTime() + 0.5

	for victim, owner in pairs( SCP2983._thralls ) do
		if not IsValid( victim ) or not victim:Alive() then continue end
		local tr = util.TraceLine( {
			start  = victim:EyePos(),
			endpos = victim:EyePos() + victim:GetAimVector() * 1500,
			filter = victim,
		} )
		if SCP2983.IsValidTarget( tr.Entity ) then
			tr.Entity:SetNW2Float( "scp2983_marked", CurTime() + 2 )
		end
	end
end )

-- Смерть SCP → все его Обмороженные умирают
hook.Add( "SCP2983_Died", "SCP2983_KillThralls", function( owner )
	for victim, o in pairs( SCP2983._thralls ) do
		if o == owner and IsValid( victim ) then SCP2983.KillThrall( victim ) end
	end
end )

hook.Add( "PlayerDeath", "SCP2983_ThrallDeath", function( ply )
	if SCP2983.IsThrall( ply ) then SCP2983.KillThrall( ply ) end
end )
