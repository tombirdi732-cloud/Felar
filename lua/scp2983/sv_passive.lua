--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — пассивка «Ледяная тропа» (server)
	Под ногами SCP появляется наледь. SCP по ней скользит быстрее, люди — скользят.
------------------------------------------------------------------------------]]

local C = SCP2983.Config

SCP2983._iceSpots = SCP2983._iceSpots or {}

local function AddSpot( pos )
	table.insert( SCP2983._iceSpots, { pos = pos, die = CurTime() + C.IceTrail.Lifetime } )

	-- Декаль/эффект льда на полу
	local ed = EffectData()
	ed:SetOrigin( pos )
	ed:SetRadius( C.IceTrail.Radius )
	util.Effect( "scp2983_icetrail", ed )
end

local function OnIce( pos )
	for _, s in ipairs( SCP2983._iceSpots ) do
		if pos:DistToSqr( s.pos ) <= ( C.IceTrail.Radius ^ 2 ) then return true end
	end
	return false
end
SCP2983.OnIce = OnIce

-- Оставляем наледь под SCP
local nextTrail = 0
hook.Add( "Think", "SCP2983_TrailThink", function()
	if not C.IceTrail.Enabled then return end

	-- Чистим протухшие пятна
	for i = #SCP2983._iceSpots, 1, -1 do
		if CurTime() > SCP2983._iceSpots[ i ].die then
			table.remove( SCP2983._iceSpots, i )
		end
	end

	if CurTime() < nextTrail then return end
	nextTrail = CurTime() + C.IceTrail.Interval

	for _, ply in ipairs( player.GetAll() ) do
		if not SCP2983.IsSCP( ply ) or not ply:Alive() then continue end
		if not ply:OnGround() then continue end
		AddSpot( ply:GetPos() )
	end
end )

-- Скольжение: SCP быстрее, люди теряют сцепление
hook.Add( "SetupMove", "SCP2983_TrailMove", function( ply, mv )
	if not C.IceTrail.Enabled then return end
	if not ply:OnGround() then return end
	if not OnIce( ply:GetPos() ) then return end

	if SCP2983.IsSCP( ply ) then
		mv:SetMaxSpeed( mv:GetMaxSpeed() * C.IceTrail.SCPSpeedBonus )
		mv:SetMaxClientSpeed( mv:GetMaxClientSpeed() * C.IceTrail.SCPSpeedBonus )
	elseif SCP2983.IsValidTarget( ply ) then
		-- Люди поскальзываются: добавляем боковой снос по текущей скорости
		local vel = mv:GetVelocity()
		if vel:Length2D() > 50 then
			local slide = vel * C.IceTrail.HumanSlip
			slide.z = 0
			mv:SetVelocity( vel + slide )
		end
	end
end )
