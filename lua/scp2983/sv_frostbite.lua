--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — обморожение (server)

	Шкала 0..100 на каждой жертве.
	40+  замедление / дрожь / приглушённый звук
	70+  урон 3 HP/сек + сужение зрения (иней)
	100  заморозка: обездвижен, союзники бьют лёд FreezeBreak сек, иначе смерть-осколки
------------------------------------------------------------------------------]]

local C = SCP2983.Config

--------------------------------------------------------------------------------
-- Добавить стаки цели
--------------------------------------------------------------------------------
function SCP2983.AddFrost( victim, amount, source )
	if not SCP2983.IsValidTarget( victim ) then return end
	if SCP2983.IsFrozen( victim ) then return end

	-- Термокостюм МОГ гасит первые N стаков
	local absorbed = victim.scp2983_absorbed or 0
	if hook.Run( "SCP2983_HasThermalSuit", victim ) and absorbed < C.Weakness.ThermalAbsorb then
		local canAbsorb = C.Weakness.ThermalAbsorb - absorbed
		local take = math.min( canAbsorb, amount )
		victim.scp2983_absorbed = absorbed + take
		amount = amount - take
		if amount <= 0 then victim.scp2983_lastHit = CurTime() return end
	end

	local cur = SCP2983.GetFrost( victim )
	cur = math.Clamp( cur + amount, 0, C.Frostbite.Max )
	victim:SetNW2Float( "scp2983_frost", cur )
	victim.scp2983_lastHit = CurTime()

	if cur >= C.Frostbite.FreezeAt then
		SCP2983.Freeze( victim, source )
	end
end

--------------------------------------------------------------------------------
-- Заморозка
--------------------------------------------------------------------------------
function SCP2983.Freeze( victim, source )
	if SCP2983.IsFrozen( victim ) then return end

	victim:SetNW2Bool( "scp2983_frozen", true )
	victim:SetNW2Float( "scp2983_frost", C.Frostbite.Max )
	victim:Freeze( true )
	victim:SetColor( Color( 150, 210, 255 ) )
	victim:SetMaterial( "models/shiny" )
	victim.scp2983_freezeAt = CurTime()
	victim.scp2983_breakHits = 0

	victim:EmitSound( C.Sounds.Freeze )

	-- Таймер: если не разбили — смерть-осколки
	timer.Create( "scp2983_freeze_" .. victim:EntIndex(), C.Frostbite.FreezeBreak, 1, function()
		if IsValid( victim ) and SCP2983.IsFrozen( victim ) then
			SCP2983.Shatter( victim, source )
		end
	end )

	hook.Run( "SCP2983_Frozen", victim, source )
end

-- Разморозка (лёд разбили союзники)
function SCP2983.Unfreeze( victim )
	if not IsValid( victim ) then return end
	timer.Remove( "scp2983_freeze_" .. victim:EntIndex() )

	victim:SetNW2Bool( "scp2983_frozen", false )
	victim:SetNW2Float( "scp2983_frost", C.Frostbite.SlowAt ) -- остаётся подмороженным
	victim:Freeze( false )
	victim:SetColor( Color( 255, 255, 255 ) )
	victim:SetMaterial( "" )
	victim.scp2983_absorbed = 0
end

-- Осколки (смерть)
function SCP2983.Shatter( victim, source )
	if not IsValid( victim ) then return end
	timer.Remove( "scp2983_freeze_" .. victim:EntIndex() )

	local ed = EffectData()
	ed:SetOrigin( victim:GetPos() + Vector( 0, 0, 40 ) )
	ed:SetMagnitude( 2 )
	ed:SetScale( 2 )
	util.Effect( "GlassImpact", ed )
	victim:EmitSound( C.Sounds.Shatter )

	local dmg = DamageInfo()
	dmg:SetDamage( victim:Health() + 100 )
	dmg:SetDamageType( DMG_DISSOLVE )
	dmg:SetAttacker( IsValid( source ) and source or victim )
	dmg:SetInflictor( IsValid( source ) and source or victim )
	victim:TakeDamageInfo( dmg )

	if victim:Alive() then victim:Kill() end
end

--------------------------------------------------------------------------------
-- Союзники бьют лёд, чтобы разбить (спасти)
-- Ловим обычный урон по замороженному игроку от другого человека.
--------------------------------------------------------------------------------
hook.Add( "PlayerHurt", "SCP2983_BreakIce", function( victim, attacker )
	if not SCP2983.IsFrozen( victim ) then return end
	if not IsValid( attacker ) or not attacker:IsPlayer() then return end
	if SCP2983.IsSCP( attacker ) or SCP2983.IsThrall( attacker ) then return end

	victim.scp2983_breakHits = ( victim.scp2983_breakHits or 0 ) + 1
	if victim.scp2983_breakHits >= C.Frostbite.FreezeHitsToBreak then
		SCP2983.Unfreeze( victim )
		victim:EmitSound( "physics/glass/glass_bottle_break2.wav" )
	end
end )

-- Не даём урону «пробивать» здоровье замороженного (лёд надо ломать, а не убивать пулями)
hook.Add( "EntityTakeDamage", "SCP2983_FrozenShield", function( victim, dmg )
	if SCP2983.IsFrozen( victim ) then
		-- зажигательное разбивает мгновенно
		if hook.Run( "SCP2983_IsIncendiary", dmg:GetInflictor(), dmg:GetAttacker() ) then
			SCP2983.Unfreeze( victim )
			return
		end
		dmg:SetDamage( 0 ) -- физический урон только копит breakHits (см. PlayerHurt)
		dmg:ScaleDamage( 0 )
	end
end )

--------------------------------------------------------------------------------
-- Тик обморожения: таяние, урон при 70+, замедление/дрожь
--------------------------------------------------------------------------------
local nextTick = 0
hook.Add( "Think", "SCP2983_FrostThink", function()
	if CurTime() < nextTick then return end
	local dt = CurTime() - ( SCP2983._lastFrost or CurTime() )
	SCP2983._lastFrost = CurTime()
	nextTick = CurTime() + 0.25

	for _, ply in ipairs( player.GetAll() ) do
		local frost = SCP2983.GetFrost( ply )
		if frost <= 0 or SCP2983.IsFrozen( ply ) then continue end
		if not ply:Alive() then ply:SetNW2Float( "scp2983_frost", 0 ) continue end

		-- Таяние после DecayDelay без ударов
		if CurTime() - ( ply.scp2983_lastHit or 0 ) >= C.Frostbite.DecayDelay then
			frost = math.max( 0, frost - C.Frostbite.DecayRate * dt )
			ply:SetNW2Float( "scp2983_frost", frost )
			if frost <= 0 then
				ply.scp2983_absorbed = 0
			end
		end

		-- Урон при 70+
		if frost >= C.Frostbite.DamageAt then
			local d = DamageInfo()
			d:SetDamage( C.Frostbite.DamagePerSec * dt )
			d:SetDamageType( DMG_SLASH )
			d:SetAttacker( game.GetWorld() )
			ply:TakeDamageInfo( d )
		end
	end
end )

-- Замедление и «дрожь» при 40+ (движение)
hook.Add( "SetupMove", "SCP2983_FrostSlow", function( ply, mv )
	local frost = SCP2983.GetFrost( ply )
	if SCP2983.IsFrozen( ply ) then
		mv:SetForwardSpeed( 0 ); mv:SetSideSpeed( 0 ); mv:SetMaxSpeed( 0 ); mv:SetMaxClientSpeed( 0 )
		return
	end
	if frost >= C.Frostbite.SlowAt then
		local mul = C.Frostbite.SlowMul
		mv:SetMaxSpeed( mv:GetMaxSpeed() * mul )
		mv:SetMaxClientSpeed( mv:GetMaxClientSpeed() * mul )
	end
end )
