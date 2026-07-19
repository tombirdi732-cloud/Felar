class_name LevelGrid
extends RefCounted
# ============================================================
# Сетка уровня из ASCII-экранов (см. data/game_data.json).
# Легенда символов — как в веб-версии (js/levels.js).
# ============================================================

var ch := 1
var cols := 0
var rows := GameData.ROWS
var pw := 0.0
var ph := 0.0
var grid: Array = []    # массив строк (String)
var spawns: Array = []  # [{char, col, row, x, y}]


func _init(p_ch: int) -> void:
	ch = p_ch
	var screens: Array = GameData.screens(ch)
	cols = screens.size() * GameData.SCREEN_COLS
	pw = cols * GameData.TILE
	ph = rows * GameData.TILE
	for r in range(rows):
		var row_str := ""
		for s in screens:
			var part: String = s.get(str(r), "")
			row_str += part.rpad(GameData.SCREEN_COLS).substr(0, GameData.SCREEN_COLS)
		grid.append(row_str)
	# извлечь сущности
	for r in range(rows):
		var chars := grid[r] as String
		for c in range(cols):
			var t := chars[c]
			if t == " " or t == "#" or t == "=" or t == "^" or t == "v":
				continue
			spawns.append({
				"char": t, "col": c, "row": r,
				"x": float(c * GameData.TILE), "y": float(r * GameData.TILE),
			})
			chars = chars.substr(0, c) + " " + chars.substr(c + 1)
		grid[r] = chars


func tile(c: int, r: int) -> String:
	if c < 0 or c >= cols:
		return "#"
	if r < 0 or r >= rows:
		return " "
	return grid[r][c]


func solid_at(px: float, py: float) -> bool:
	return tile(int(floor(px / GameData.TILE)), int(floor(py / GameData.TILE))) == "#"


func oneway_at(px: float, py: float) -> bool:
	return tile(int(floor(px / GameData.TILE)), int(floor(py / GameData.TILE))) == "="


func _tiles_near(rect: Rect2, kind: String) -> Array:
	var out: Array = []
	var ts := GameData.TILE
	var c0 := int(floor(rect.position.x / ts)) - 1
	var c1 := int(floor((rect.position.x + rect.size.x) / ts)) + 1
	var r0 := int(floor(rect.position.y / ts)) - 1
	var r1 := int(floor((rect.position.y + rect.size.y) / ts)) + 1
	for r in range(r0, r1 + 1):
		for c in range(c0, c1 + 1):
			if tile(c, r) == kind:
				out.append(Rect2(c * ts, r * ts, ts, ts))
	return out


func solids_near(rect: Rect2) -> Array:
	return _tiles_near(rect, "#")


func oneways_near(rect: Rect2) -> Array:
	return _tiles_near(rect, "=")


func spikes_hit(rect: Rect2) -> bool:
	var ts := GameData.TILE
	var c0 := int(floor(rect.position.x / ts))
	var c1 := int(floor((rect.position.x + rect.size.x) / ts))
	var r0 := int(floor(rect.position.y / ts))
	var r1 := int(floor((rect.position.y + rect.size.y) / ts))
	for r in range(r0, r1 + 1):
		for c in range(c0, c1 + 1):
			var t := tile(c, r)
			var hb := Rect2()
			if t == "^":
				hb = Rect2(c * ts + 7, r * ts + 18, ts - 14, ts - 18)
			elif t == "v":
				hb = Rect2(c * ts + 7, r * ts, ts - 14, ts - 18)
			else:
				continue
			if rect.intersects(hb):
				return true
	return false
