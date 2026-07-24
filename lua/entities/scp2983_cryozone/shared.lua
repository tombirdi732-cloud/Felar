--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — Крио-зона (энтити)
	Ставится маппером/админом. Внутри радиуса SCP быстро восстанавливает ядро.
	Спавн:  меню Q → Entities → «SCP-2983 ИНЕЙ» → Крио-зона
------------------------------------------------------------------------------]]

ENT.Type      = "anim"
ENT.Base      = "base_gmodentity"
ENT.PrintName = "Крио-зона (ИНЕЙ)"
ENT.Category  = "SCP-2983 ИНЕЙ"
ENT.Author    = "Felar"
ENT.Spawnable       = true
ENT.AdminSpawnable  = true

function ENT:GetRadius()
	return self:GetNW2Float( "cryo_radius", 300 )
end

function ENT:SetRadius( r )
	self:SetNW2Float( "cryo_radius", r )
end
