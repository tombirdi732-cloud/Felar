--[[ SCP-2983 «ИНЕЙ» — эффект наледи под ногами ]]
function EFFECT:Init( data )
	self.Origin = data:GetOrigin()
	self.Radius = data:GetRadius()
	self.Die = CurTime() + ( SCP2983 and SCP2983.Config.IceTrail.Lifetime or 6 )

	local em = ParticleEmitter( self.Origin )
	for i = 1, 4 do
		local p = em:Add( "effects/blueflare1", self.Origin + VectorRand() * self.Radius * 0.5 )
		if p then
			p:SetVelocity( Vector( 0, 0, math.Rand( 5, 20 ) ) )
			p:SetDieTime( 1 )
			p:SetStartAlpha( 120 ); p:SetEndAlpha( 0 )
			p:SetStartSize( 4 ); p:SetEndSize( 0 )
			p:SetColor( 190, 230, 255 )
		end
	end
	em:Finish()
end
function EFFECT:Think() return CurTime() < self.Die end
function EFFECT:Render() end
