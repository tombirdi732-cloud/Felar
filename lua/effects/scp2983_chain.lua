--[[ SCP-2983 «ИНЕЙ» — эффект цепи холода (ледяной гарпун) ]]
EFFECT.Mat = Material( "cable/rope" )

function EFFECT:Init( data )
	self.StartPos = data:GetStart()
	self.Target   = data:GetEntity()
	self.EndPos   = data:GetOrigin()
	self.Die      = CurTime() + 0.6
end

function EFFECT:Think()
	if IsValid( self.Target ) then
		self.EndPos = self.Target:GetPos() + Vector( 0, 0, 40 )
	end
	return CurTime() < self.Die
end

function EFFECT:Render()
	local a = math.Clamp( ( self.Die - CurTime() ) / 0.6, 0, 1 ) * 255
	render.SetMaterial( self.Mat )
	render.DrawBeam( self.StartPos, self.EndPos, 6, 0, 1,
		Color( 170, 220, 255, a ) )
end
