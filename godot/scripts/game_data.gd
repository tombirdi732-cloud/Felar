class_name GameData
# ============================================================
# Данные игры: config + уровни + диалоги из data/game_data.json
# (экспортированы из веб-версии, единый источник правды)
# ============================================================

const TILE := 32
const ROWS := 18
const SCREEN_COLS := 24
const VIEW_W := 960
const VIEW_H := 540

# ---------- сохранение ----------
const SAVE_PATH := "user://iskra_save.json"

static var _data: Dictionary = {}

static func data() -> Dictionary:
	if _data.is_empty():
		var f := FileAccess.open("res://data/game_data.json", FileAccess.READ)
		_data = JSON.parse_string(f.get_as_text())
	return _data


static func phys() -> Dictionary:
	return data()["PHYS"]


static func sprites() -> Dictionary:
	return data()["SPRITES"]


static func chapter_meta(ch: int) -> Dictionary:
	return data()["CHAPTER_META"][str(ch)]


static func screens(ch: int) -> Array:
	return data()["CHAPTER_SCREENS"][str(ch)]


static func dialogues(ch: int) -> Dictionary:
	return data()["DIALOGUES"].get(str(ch), {})



static func load_save() -> Dictionary:
	if FileAccess.file_exists(SAVE_PATH):
		var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
		var parsed = JSON.parse_string(f.get_as_text())
		if parsed is Dictionary:
			return parsed
	return {"unlocked": 1, "best": {}}


static func write_save(save: Dictionary) -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify(save))
