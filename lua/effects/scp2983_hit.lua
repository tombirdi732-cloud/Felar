--[[ SCP-2983 «ИНЕЙ» — эффект ледяного удара ]]
function EFFECT:Init( data )
	local pos = data:GetOrigin()
	local em = ParticleEmitter( pos )
	for i = 1, 12 do
		local p = em:Add( "effects/blueflare1", pos )
		if p then
			p:SetVelocity( VectorRand() * math.Rand( 40, 120 ) )
			p:SetDieTime( math.Rand( 0.3, 0.6 ) )
			p:SetStartAlpha( 230 ); p:SetEndAlpha( 0 )
			p:SetStartSize( math.Rand( 3, 7 ) ); p:SetEndSize( 0 )
			p:SetColor( 180, 225, 255 )
			p:SetGravity( Vector( 0, 0, -120 ) )
		end
	end
	em:Finish()
end
function EFFECT:Think() return false end
function EFFECT:Render() end
