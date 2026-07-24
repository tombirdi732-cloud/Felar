AddCSLuaFile( "shared.lua" )
AddCSLuaFile( "cl_init.lua" )
include( "shared.lua" )

function ENT:Initialize()
	self:SetModel( "models/hunter/blocks/cube025x025x025.mdl" )
	self:PhysicsInit( SOLID_VPHYSICS )
	self:SetMoveType( MOVETYPE_VPHYSICS )
	self:SetSolid( SOLID_VPHYSICS )
	self:SetColor( Color( 150, 215, 255, 180 ) )
	self:SetMaterial( "models/shiny" )

	if self:GetRadius() <= 0 then self:SetRadius( 300 ) end

	local phys = self:GetPhysicsObject()
	if IsValid( phys ) then phys:Wake() end
end
