--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — общие хелперы (shared)
------------------------------------------------------------------------------]]

SCP2983 = SCP2983 or {}
SCP2983.Util = SCP2983.Util or {}

local U = SCP2983.Util

-- Является ли игрок самим SCP-2983
function SCP2983.IsSCP( ply )
	return IsValid( ply ) and ply:IsPlayer() and ply:GetNW2Bool( "scp2983_is", false )
end

-- Является ли игрок Обмороженным (thrall)
function SCP2983.IsThrall( ply )
	return IsValid( ply ) and ply:IsPlayer() and ply:GetNW2Bool( "scp2983_thrall", false )
end

-- Текущее ядро
function SCP2983.GetCore( ply )
	if not IsValid( ply ) then return 0 end
	return ply:GetNW2Float( "scp2983_core", 0 )
end

-- Текущее обморожение цели
function SCP2983.GetFrost( ply )
	if not IsValid( ply ) then return 0 end
	return ply:GetNW2Float( "scp2983_frost", 0 )
end

-- Заморожен ли игрок
function SCP2983.IsFrozen( ply )
	return IsValid( ply ) and ply:GetNW2Bool( "scp2983_frozen", false )
end

-- Валидная живая цель-человек (не SCP, не thrall)
function SCP2983.IsValidTarget( ply )
	if not IsValid( ply ) or not ply:IsPlayer() then return false end
	if not ply:Alive() then return false end
	if SCP2983.IsSCP( ply ) then return false end
	if SCP2983.IsThrall( ply ) then return false end
	return true
end

-- Клампим и округляем
function U.Clamp( v, lo, hi )
	return math.Clamp( v, lo, hi )
end

-- Есть ли прямая видимость между двумя точками (стены/двери блокируют)
function U.HasLOS( from, to, ignore )
	local tr = util.TraceLine( {
		start  = from,
		endpos = to,
		filter = ignore,
		mask   = MASK_SOLID_BRUSHONLY, -- только мир/брашы (двери func_door тоже сюда попадают)
	} )
	return not tr.Hit
end

return U
