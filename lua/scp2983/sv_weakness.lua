--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — слабость и сдерживание: ТЕПЛО (server)
	  - Термокостюмы МОГ гасят первые ThermalAbsorb стаков (см. sv_frostbite)
	  - Зажигательные патроны: x2 урон по SCP + обнуление ядра
	  - Огнемёт: оружие класса «сдерживание» (мощный урон + drain)
------------------------------------------------------------------------------]]

local C = SCP2983.Config

-- Термокостюм? (по модели или по хуку сервера)
hook.Add( "SCP2983_HasThermalSuit", "SCP2983_ThermalDefault", function( ply )
	if not IsValid( ply ) then return end
	if C.Weakness.ThermalSuitModels[ string.lower( ply:GetModel() or "" ) ] then
		return true
	end
end )

-- Зажигательное оружие?
function SCP2983_IsIncendiaryWeapon( inflictor, attacker )
	local cls
	if IsValid( inflictor ) then cls = inflictor:GetClass() end
	if ( not cls or cls == "" ) and IsValid( attacker ) and attacker.GetActiveWeapon then
		local w = attacker:GetActiveWeapon()
		if IsValid( w ) then cls = w:GetClass() end
	end
	if not cls then return false end
	return C.Weakness.IncendiaryWeapons[ cls ] or C.Weakness.FlamethrowerWeapons[ cls ]
end

hook.Add( "SCP2983_IsIncendiary", "SCP2983_IncDefault", function( inflictor, attacker )
	if SCP2983_IsIncendiaryWeapon( inflictor, attacker ) then return true end
end )

-- Урон по SCP: зажигательное x2 + обнуляет ядро; огнемёт дополнительно сливает ядро
hook.Add( "EntityTakeDamage", "SCP2983_HeatDamage", function( victim, dmg )
	if not SCP2983.IsSCP( victim ) then return end

	local inflictor = dmg:GetInflictor()
	local attacker  = dmg:GetAttacker()
	local cls = IsValid( inflictor ) and inflictor:GetClass() or ""

	-- Прямой огонь (env_fire / горение) тоже сливает ядро
	if dmg:IsDamageType( DMG_BURN ) or dmg:IsDamageType( DMG_SLOWBURN ) then
		SCP2983.AddCore( victim, -C.Core.DrainHeat )
	end

	if C.Weakness.IncendiaryWeapons[ cls ] or SCP2983_IsIncendiaryWeapon( inflictor, attacker ) then
		dmg:ScaleDamage( C.Weakness.IncendiaryDamageMul )
		victim:SetNW2Float( "scp2983_core", 0 ) -- обнуление ядра
	end

	if C.Weakness.FlamethrowerWeapons[ cls ] then
		dmg:ScaleDamage( C.Weakness.IncendiaryDamageMul )
		victim:SetNW2Float( "scp2983_core", 0 )
	end
end )
