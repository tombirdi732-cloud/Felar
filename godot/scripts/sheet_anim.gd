class_name SheetAnim
extends Sprite2D
# ============================================================
# Аниматор спрайт-листов: строка = анимация, столбец = кадр.
# Раскладка берётся из GameData.sprites()[sheet_name].
# Точка привязки — низ кадра (position узла = ноги).
# ============================================================

var sheet_name := ""
var anims: Dictionary = {}
var current := ""
var t := 0.0
var frame_i := 0
var done := false
var _cols := 1


func setup(p_sheet: String) -> void:
	sheet_name = p_sheet
	var spec: Dictionary = GameData.sprites()[p_sheet]
	texture = load("res://assets/sprites/%s.png" % p_sheet)
	var fw := int(spec["fw"])
	var fh := int(spec["fh"])
	_cols = int(texture.get_width() / fw)
	hframes = _cols
	vframes = int(texture.get_height() / fh)
	# порядок ключей = порядок строк листа
	anims = {}
	var row := 0
	for an in spec["anims"].keys():
		var a: Dictionary = spec["anims"][an].duplicate()
		a["row"] = row
		anims[an] = a
		row += 1
	offset = Vector2(0, -fh / 2.0)
	play(anims.keys()[0])


func play(name: String, restart := false) -> void:
	if current == name and not restart:
		return
	current = name
	t = 0.0
	frame_i = 0
	done = false
	_apply()


func advance(dt: float) -> void:
	if current == "":
		return
	var a: Dictionary = anims[current]
	t += dt
	var f := int(t * float(a["fps"]))
	if bool(a["loop"]):
		f = f % int(a["frames"])
	elif f >= int(a["frames"]):
		f = int(a["frames"]) - 1
		done = true
	frame_i = f
	_apply()


func _apply() -> void:
	var a: Dictionary = anims[current]
	var col := int(a.get("start", 0)) + frame_i
	frame = int(a["row"]) * _cols + col
