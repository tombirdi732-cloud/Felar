--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — способности (server)
	Приём ввода от клиента + реализация:
	  2) Ледяной взрыв
	  3) Цепи холода
	  4) Перерождение холода
	(1 — Ледяной удар — в SWEP scp2983_hands)
------------------------------------------------------------------------------]]

local C = SCP2983.Config

util.AddNetworkString( "scp2983_ability" )     -- клиент: нажал клавишу способности
util.AddNetworkString( "scp2983_hold" )        -- клиент: удержание (перерождение)

SCP2983._cooldowns = SCP2983._cooldowns or {}

local function onCooldown( ply, key, cd )
	SCP2983._cooldowns[ ply ] = SCP2983._cooldowns[ ply ] or {}
	local t = SCP2983._cooldowns[ ply ][ key ] or 0
	if CurTime() < t then return true end
	SCP2983._cooldowns[ ply ][ key ] = CurTime() + cd
	return false
end

--------------------------------------------------------------------------------
-- 2) ЛЕДЯНОЙ ВЗРЫВ — 5 м, +45 стаков, стан 1.5 сек, тушит огонь, снимает эффекты
--------------------------------------------------------------------------------
local function IceBlast( ply )
	local a = C.Abilities.IceBlast
	if onCooldown( ply, "IceBlast", a.Cooldown ) then return end
	if not SCP2983.SpendCore( ply, a.Cost ) then return end

	local origin = ply:GetPos() + Vector( 0, 0, 40 )

	-- Тушим самого SCP и снимаем чужие эффекты с него
	ply:Extinguish()

	local ed = EffectData()
	ed:SetOrigin( origin )
	ed:SetMagnitude( a.Radius / 52.5 )
	ed:SetScale( a.Radius )
	util.Effect( "scp2983_iceblast", ed )
	ply:EmitSound( C.Sounds.IceBlast )

	for _, v in ipairs( ents.FindInSphere( origin, a.Radius ) ) do
		if not SCP2983.IsValidTarget( v ) then continue end
		-- стены и двери блокируют
		if not SCP2983.Util.HasLOS( origin, v:EyePos(), { ply, v } ) then continue end

		SCP2983.AddFrost( v, a.Stacks, ply )
		v:Extinguish() -- гасит горящих

		-- Стан: обездвижить на Stun секунд (но не заморозка)
		if not SCP2983.IsFrozen( v ) then
			v.scp2983_stunUntil = CurTime() + a.Stun
		end
	end
end

-- Стан обрабатываем в движении
hook.Add( "SetupMove", "SCP2983_Stun", function( ply, mv )
	if ( ply.scp2983_stunUntil or 0 ) > CurTime() and not SCP2983.IsFrozen( ply ) then
		mv:SetForwardSpeed( 0 ); mv:SetSideSpeed( 0 )
		mv:SetMaxSpeed( 0 ); mv:SetMaxClientSpeed( 0 )
	end
end )

--------------------------------------------------------------------------------
-- 3) ЦЕПИ ХОЛОДА — гарпун тянет цель к SCP, +10 стаков/сек, рвётся за укрытием/15 м
--------------------------------------------------------------------------------
local function ColdChains( ply )
	local a = C.Abilities.ColdChains
	if onCooldown( ply, "ColdChains", a.Cooldown ) then return end
	if not SCP2983.SpendCore( ply, a.Cost ) then return end

	local tr = util.TraceLine( {
		start  = ply:EyePos(),
		endpos = ply:EyePos() + ply:GetAimVector() * a.Range,
		filter = ply,
		mask   = MASK_SHOT,
	} )

	ply:EmitSound( C.Sounds.ColdChains )

	local target = tr.Entity
	if not SCP2983.IsValidTarget( target ) then return end

	-- Эффект цепи
	local ed = EffectData()
	ed:SetStart( ply:GetPos() + Vector(0,0,40) )
	ed:SetOrigin( target:GetPos() + Vector(0,0,40) )
	ed:SetEntity( target )
	util.Effect( "scp2983_chain", ed )

	ply.scp2983_chainTarget = target
	ply.scp2983_chainUntil = CurTime() + 5 -- максимум держится 5 сек
	target.scp2983_chainedBy = ply
	target.scp2983_chainTick = 0
end

-- Тянущая логика цепей
hook.Add( "Think", "SCP2983_ChainThink", function()
	for _, ply in ipairs( player.GetAll() ) do
		if not SCP2983.IsSCP( ply ) then continue end
		local tgt = ply.scp2983_chainTarget
		if not IsValid( tgt ) then continue end

		local a = C.Abilities.ColdChains
		local dist = ply:GetPos():Distance( tgt:GetPos() )
		local los = SCP2983.Util.HasLOS( ply:EyePos(), tgt:EyePos(), { ply, tgt } )

		-- Условия разрыва
		if not SCP2983.IsValidTarget( tgt ) or dist > a.Range or not los
			or CurTime() > ( ply.scp2983_chainUntil or 0 ) then
			ply.scp2983_chainTarget = nil
			if IsValid( tgt ) then tgt.scp2983_chainedBy = nil end
			continue
		end

		-- Тянем
		local dir = ( ply:GetPos() - tgt:GetPos() ):GetNormalized()
		tgt:SetVelocity( dir * a.PullForce * FrameTime() )

		-- +стаки/сек
		if CurTime() >= ( tgt.scp2983_chainTick or 0 ) then
			tgt.scp2983_chainTick = CurTime() + 1
			SCP2983.AddFrost( tgt, a.StacksPerSec, ply )
		end
	end
end )

--------------------------------------------------------------------------------
-- 4) ПЕРЕРОЖДЕНИЕ ХОЛОДА — удержание HoldTime сек на замороженном → Обмороженный
--------------------------------------------------------------------------------
local function FrostRebornStart( ply )
	local a = C.Abilities.FrostReborn

	local tr = util.TraceLine( {
		start  = ply:EyePos(),
		endpos = ply:EyePos() + ply:GetAimVector() * 120,
		filter = ply,
	} )
	local tgt = tr.Entity
	if not IsValid( tgt ) or not tgt:IsPlayer() or not SCP2983.IsFrozen( tgt ) then return end
	if SCP2983.GetCore( ply ) < a.Cost then return end

	ply.scp2983_reborn = { target = tgt, start = CurTime() }
	ply:SetNW2Float( "scp2983_rebornProg", 0 )
end

local function FrostRebornStop( ply, completed )
	ply.scp2983_reborn = nil
	ply:SetNW2Float( "scp2983_rebornProg", 0 )
end

hook.Add( "Think", "SCP2983_RebornThink", function()
	for _, ply in ipairs( player.GetAll() ) do
		local r = ply.scp2983_reborn
		if not r then continue end

		local a = C.Abilities.FrostReborn
		local tgt = r.target
		if not IsValid( tgt ) or not SCP2983.IsFrozen( tgt )
			or ply:EyePos():Distance( tgt:GetPos() ) > 160 then
			FrostRebornStop( ply )
			continue
		end

		local prog = ( CurTime() - r.start ) / a.HoldTime
		ply:SetNW2Float( "scp2983_rebornProg", math.Clamp( prog, 0, 1 ) )

		if prog >= 1 then
			if SCP2983.SpendCore( ply, a.Cost ) then
				SCP2983.MakeThrall( tgt, ply ) -- см. sv_thrall.lua
			end
			FrostRebornStop( ply, true )
		end
	end
end )

--------------------------------------------------------------------------------
-- Роутер ввода
--------------------------------------------------------------------------------
local router = {
	IceBlast   = IceBlast,
	ColdChains = ColdChains,
}

net.Receive( "scp2983_ability", function( _, ply )
	if not SCP2983.IsSCP( ply ) or not ply:Alive() then return end
	local id = net.ReadString()
	local fn = router[ id ]
	if fn then fn( ply ) end
end )

-- Удержание перерождения: down=true старт, down=false стоп
net.Receive( "scp2983_hold", function( _, ply )
	if not SCP2983.IsSCP( ply ) or not ply:Alive() then return end
	local down = net.ReadBool()
	if down then FrostRebornStart( ply ) else FrostRebornStop( ply ) end
end )
