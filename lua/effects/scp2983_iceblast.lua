--[[ SCP-2983 «ИНЕЙ» — эффект Ледяного взрыва ]]
EFFECT.Mat = Material( "effects/spark" )

function EFFECT:Init( data )
	local origin = data:GetOrigin()
	local radius = data:GetScale()
	self.Origin = origin

	local em = ParticleEmitter( origin )
	-- Волна ледяных осколков
	for i = 1, 60 do
		local dir = VectorRand(); dir.z = math.abs( dir.z ) * 0.5
		local p = em:Add( "effects/blueflare1", origin )
		if p then
			p:SetVelocity( dir:GetNormalized() * math.Rand( 200, radius * 4 ) )
			p:SetDieTime( math.Rand( 0.4, 0.8 ) )
			p:SetStartAlpha( 255 ); p:SetEndAlpha( 0 )
			p:SetStartSize( math.Rand( 6, 14 ) ); p:SetEndSize( 0 )
			p:SetColor( 160, 215, 255 )
			p:SetGravity( Vector( 0, 0, -180 ) )
			p:SetAirResistance( 60 )
		end
	end
	em:Finish()

	local dl = DynamicLight( self:EntIndex() )
	if dl then
		dl.pos = origin; dl.r = 140; dl.g = 200; dl.b = 255
		dl.brightness = 4; dl.Decay = 1200; dl.Size = radius * 2; dl.DieTime = CurTime() + 0.4
	end
end

function EFFECT:Think() return false end
function EFFECT:Render() end
