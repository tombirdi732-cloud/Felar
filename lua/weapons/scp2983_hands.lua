--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — руки (SWEP)
	Ледяной удар: +18 стаков в лицо, +30 в спину.
	ЛКМ — удар. На нуле ядра — «кулаки без эффекта» (стаки не добавляются).
------------------------------------------------------------------------------]]

AddCSLuaFile()

SWEP.PrintName        = "Ледяной удар"
SWEP.Author           = "Felar"
SWEP.Category         = "SCP-2983 ИНЕЙ"
SWEP.Spawnable        = false
SWEP.AdminSpawnable   = false

SWEP.Slot             = 0
SWEP.DrawAmmo         = false
SWEP.DrawCrosshair    = true

SWEP.ViewModel        = "models/weapons/c_arms.mdl"
SWEP.WorldModel       = ""
SWEP.UseHands         = true

SWEP.Primary.ClipSize    = -1
SWEP.Primary.DefaultClip = -1
SWEP.Primary.Automatic   = true
SWEP.Primary.Ammo        = "none"

SWEP.Secondary.ClipSize    = -1
SWEP.Secondary.DefaultClip = -1
SWEP.Secondary.Automatic   = false
SWEP.Secondary.Ammo        = "none"

SWEP.HoldType = "fists"

local REACH = 80
local ATTACK_DELAY = 0.55

function SWEP:Initialize()
	self:SetHoldType( self.HoldType )
end

function SWEP:PrimaryAttack()
	if not IsValid( self.Owner ) then return end
	self:SetNextPrimaryFire( CurTime() + ATTACK_DELAY )

	self.Owner:SetAnimation( PLAYER_ATTACK1 )
	self:SendWeaponAnim( ACT_VM_HITCENTER )
	self.Owner:EmitSound( "npc/vort/claw_swing1.wav" )

	local tr = util.TraceLine( {
		start  = self.Owner:EyePos(),
		endpos = self.Owner:EyePos() + self.Owner:GetAimVector() * REACH,
		filter = self.Owner,
		mask   = MASK_SHOT_HULL,
	} )

	if not tr.Hit then return end

	if SERVER then
		local C = SCP2983.Config
		local ent = tr.Entity

		-- Физудар по пропам
		if IsValid( ent ) and ent:GetPhysicsObject():IsValid() then
			ent:GetPhysicsObject():ApplyForceOffset(
				self.Owner:GetAimVector() * 8000, tr.HitPos )
		end

		if SCP2983.IsValidTarget( ent ) then
			-- «кулаки без эффекта» если ядро на нуле
			if SCP2983.GetCore( self.Owner ) <= 0 then
				ent:TakeDamage( 2, self.Owner, self )
				self.Owner:EmitSound( C.Sounds.IceStrike )
				return
			end

			-- В спину?  (SCP находится позади цели)
			local toAtt = ( self.Owner:GetPos() - ent:GetPos() ):GetNormalized()
			local back  = ent:GetForward():Dot( toAtt ) < -0.2
			local amount = back and C.Frostbite.HitBack or C.Frostbite.HitFront

			SCP2983.AddFrost( ent, amount, self.Owner )
			ent:TakeDamage( 3, self.Owner, self )
			self.Owner:EmitSound( C.Sounds.IceStrike )

			-- Иней-эффект на месте удара
			local ed = EffectData()
			ed:SetOrigin( tr.HitPos )
			ed:SetNormal( tr.HitNormal )
			util.Effect( "scp2983_hit", ed )
		end
	end
end

function SWEP:SecondaryAttack()
	-- ПКМ свободна (способности на клавишах E/R/F — см. cl_input)
end

function SWEP:Deploy()
	self:SendWeaponAnim( ACT_VM_DRAW )
	return true
end

-- Нельзя выкинуть/убрать
function SWEP:CanBeDropped() return false end
function SWEP:ShouldDropOnDie() return false end
