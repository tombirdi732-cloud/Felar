--[[----------------------------------------------------------------------------
	SCP-2983 «ИНЕЙ» — загрузчик аддона.
	Подключает все файлы в правильном реалме (shared / server / client).
------------------------------------------------------------------------------]]

SCP2983 = SCP2983 or {}
SCP2983.Version = "1.0.0"

local PATH = "scp2983/"

-- Список файлов и их реалм
local files = {
	{ "sh_config.lua",   "shared" },
	{ "sh_util.lua",     "shared" },

	{ "sv_core.lua",     "server" },
	{ "sv_frostbite.lua","server" },
	{ "sv_abilities.lua","server" },
	{ "sv_thrall.lua",   "server" },
	{ "sv_passive.lua",  "server" },
	{ "sv_weakness.lua", "server" },

	{ "cl_input.lua",    "client" },
	{ "cl_hud.lua",      "client" },
	{ "cl_effects.lua",  "client" },
}

for _, f in ipairs( files ) do
	local file, realm = f[1], f[2]
	local full = PATH .. file

	if realm == "shared" then
		if SERVER then AddCSLuaFile( full ) end
		include( full )
	elseif realm == "server" then
		if SERVER then include( full ) end
	elseif realm == "client" then
		if SERVER then
			AddCSLuaFile( full )
		else
			include( full )
		end
	end
end

if SERVER then
	MsgC( Color( 120, 200, 255 ), "[SCP-2983 ИНЕЙ] Загружен, версия " .. SCP2983.Version .. "\n" )
end
