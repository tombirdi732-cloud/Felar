include( "shared.lua" )

function ENT:Draw()
	self:DrawModel()
end

-- Голубое свечение-сфера радиуса зоны
function ENT:DrawTranslucent()
	local r = self:GetRadius()
	render.SetColorMaterial()
	render.DrawSphere( self:GetPos(), r, 20, 20, Color( 120, 200, 255, 12 ) )
	render.DrawWireframeSphere( self:GetPos(), r, 16, 16, Color( 150, 215, 255, 40 ) )
end
