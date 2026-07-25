--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — Огнемёт (SWEP) : оружие класса «сдерживание»

	Заготовка-«копирка»: рабочий огонь на базе weapon_base.
	МОДЕЛЬ — плейсхолдер (SMG). Просто замени ViewModel/WorldModel ниже на
	модель огнемёта из воркшопа — механика трогать не нужно.

	Против ИНЕЯ: жжёт → сливает Ледяное Ядро, а т.к. класс прописан в
	Config.Weakness.FlamethrowerWeapons — наносит x2 урона и обнуляет ядро.
------------------------------------------------------------------------------]]

AddCSLuaFile()

SWEP.PrintName       = "Огнемёт (Сдерживание)"
SWEP.Author          = "Felar"
SWEP.Category        = "SCP-2983 ИНЕЙ"
SWEP.Purpose         = "Сдерживание SCP-2983. Тепло сливает Ледяное Ядро."
SWEP.Spawnable       = true
SWEP.AdminSpawnable  = true

SWEP.Slot            = 3
SWEP.SlotPos         = 1

-- >>> ПЛЕЙСХОЛДЕР-МОДЕЛЬ: замени на модель огнемёта <<<
SWEP.ViewModel       = "models/weapons/c_smg1.mdl"
SWEP.WorldModel      = "models/weapons/w_smg1.mdl"
SWEP.UseHands        = true
SWEP.HoldType        = "smg"

SWEP.Primary.ClipSize     = -1
SWEP.Primary.DefaultClip  = -1
SWEP.Primary.Automatic    = true
SWEP.Primary.Ammo         = "none"

SWEP.Secondary.ClipSize    = -1
SWEP.Secondary.DefaultClip = -1
SWEP.Secondary.Automatic   = false
SWEP.Secondary.Ammo        = "none"

-- Параметры пламени
local RANGE      = 320       -- дальность струи
local CONE       = 55        -- радиус захвата на конце струи
local TICK       = 0.06      -- частота «выстрелов» огня
local DMG        = 6         -- урон за тик (по времени)
local IGNITE     = 2.5       -- сек горения цели

function SWEP:Initialize()
	self:SetHoldType( self.HoldType )
end

function SWEP:PrimaryAttack()
	self:SetNextPrimaryFire( CurTime() + TICK )
	if not IsValid( self:GetOwner() ) then return end

	local owner = self:GetOwner()
	local src   = owner:GetShootPos()
	local dir   = owner:GetAimVector()

	-- Луч струи
	local tr = util.TraceLine( {
		start  = src,
		endpos = src + dir * RANGE,
		filter = owner,
		mask   = MASK_SHOT,
	} )
	local hitPos = tr.HitPos

	-- Визуал пламени + звук (клиент)
	self:FlameFX( src, dir, tr )

	if not SERVER then return end

	-- Урон: прямая цель + всё в конусе на конце струи
	local hurt = {}
	if IsValid( tr.Entity ) then hurt[ tr.Entity ] = true end
	for _, e in ipairs( ents.FindInSphere( hitPos, CONE ) ) do
		hurt[ e ] = true
	end

	for e in pairs( hurt ) do
		if not IsValid( e ) then continue end
		if e == owner then continue end
		if not ( e:IsPlayer() or e:IsNPC() or e:GetClass() == "prop_physics" ) then continue end

		-- Поджиг (даёт урон по времени и топит лёд ИНЕЯ)
		if e.Ignite then e:Ignite( IGNITE ) end

		local dmg = DamageInfo()
		dmg:SetDamage( DMG )
		dmg:SetDamageType( DMG_BURN )
		dmg:SetAttacker( owner )
		dmg:SetInflictor( self )
		dmg:SetDamagePosition( hitPos )
		e:TakeDamageInfo( dmg )
	end
end

function SWEP:SecondaryAttack() end

--------------------------------------------------------------------------------
-- Визуал: струя огня + петля звука
--------------------------------------------------------------------------------
function SWEP:FlameFX( src, dir, tr )
	if CLIENT then
		local em = ParticleEmitter( src )
		if em then
			local steps = 6
			for i = 1, steps do
				local frac = i / steps
				local pos = LerpVector( frac, src, tr.HitPos )
				local p = em:Add( "effects/fire_cloud" .. math.random( 1, 2 ), pos )
				if p then
					p:SetVelocity( dir * math.Rand( 200, 500 ) + VectorRand() * 40 )
					p:SetDieTime( math.Rand( 0.2, 0.45 ) )
					p:SetStartAlpha( 200 ); p:SetEndAlpha( 0 )
					p:SetStartSize( 6 + frac * 18 ); p:SetEndSize( 40 )
					p:SetRoll( math.Rand( 0, 360 ) ); p:SetRollDelta( math.Rand( -2, 2 ) )
					p:SetColor( 255, math.random( 120, 200 ), 60 )
					p:SetGravity( Vector( 0, 0, 60 ) )
					p:SetAirResistance( 120 )
				end
			end
			em:Finish()
		end

		local dl = DynamicLight( self:EntIndex() )
		if dl then
			dl.pos = tr.HitPos; dl.r = 255; dl.g = 140; dl.b = 40
			dl.brightness = 2; dl.Decay = 900; dl.Size = 160; dl.DieTime = CurTime() + 0.1
		end
	end

	-- Петля звука
	if not self.FireLoop then
		self.FireLoop = CreateSound( self, "ambient/fire/mtov_flame2.wav" )
	end
	if self.FireLoop and not self.Firing then
		self.FireLoop:PlayEx( 0.6, 100 )
		self.Firing = true
	end
end

-- Останавливаем звук, когда отпустили ЛКМ
function SWEP:Think()
	local owner = self:GetOwner()
	if self.Firing and ( not IsValid( owner ) or not owner:KeyDown( IN_ATTACK ) ) then
		if self.FireLoop then self.FireLoop:Stop() end
		self.Firing = false
	end
end

function SWEP:OnRemove()
	if self.FireLoop then self.FireLoop:Stop() end
end

function SWEP:Holster()
	if self.FireLoop then self.FireLoop:Stop() end
	self.Firing = false
	return true
end

function SWEP:Deploy()
	self:SendWeaponAnim( ACT_VM_DRAW )
	return true
end
