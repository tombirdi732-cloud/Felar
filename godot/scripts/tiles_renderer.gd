class_name TilesRenderer
extends Node2D
# Отрисовка тайлов уровня (мировые координаты, культинг по камере)

var main: Node
var tex: Texture2D
var level: LevelGrid


func set_level(p_level: LevelGrid) -> void:
	level = p_level
	tex = load("res://assets/tiles/ch%d.png" % level.ch)


static func hash2(px: int, py: int) -> float:
	var hval := int(px * 374761393 + py * 668265263) & 0x7FFFFFFF
	hval = (hval ^ (hval >> 13)) * 1274126177 & 0x7FFFFFFF
	return float((hval ^ (hval >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


func _draw() -> void:
	if level == null:
		return
	var ts := GameData.TILE
	# ячейка тайлсета в файле (32 у плейсхолдеров, 64 у hi-res)
	var t2 := float(tex.get_height())
	var c0: int = max(0, int(main.cam.x / ts))
	var c1: int = min(level.cols - 1, int(ceil((main.cam.x + GameData.VIEW_W) / ts)))
	for r in range(level.rows):
		for c in range(c0, c1 + 1):
			var t: String = level.tile(c, r)
			var pos := Vector2(c * ts, r * ts)
			if t == "#":
				var top_open := level.tile(c, r - 1) != "#"
				var idx := 0 if top_open else 1
				draw_texture_rect_region(tex, Rect2(pos, Vector2(ts, ts)),
					Rect2(idx * t2, 0, t2, t2))
				if top_open and level.tile(c, r - 1) == " ":
					var hv := hash2(c, r * 31 + level.ch)
					if hv > 0.93:
						draw_texture_rect_region(tex,
							Rect2(pos - Vector2(0, ts), Vector2(ts, ts)), Rect2(4 * t2, 0, t2, t2))
					elif hv < 0.05:
						draw_texture_rect_region(tex,
							Rect2(pos - Vector2(0, ts), Vector2(ts, ts)), Rect2(5 * t2, 0, t2, t2))
			elif t == "=":
				draw_texture_rect_region(tex, Rect2(pos, Vector2(ts, ts)), Rect2(2 * t2, 0, t2, t2))
			elif t == "^":
				draw_texture_rect_region(tex, Rect2(pos, Vector2(ts, ts)), Rect2(3 * t2, 0, t2, t2))
			elif t == "v":
				# шипы с потолка: переворот по вертикали
				draw_set_transform(pos + Vector2(ts / 2.0, ts / 2.0), 0.0, Vector2(1, -1))
				draw_texture_rect_region(tex,
					Rect2(-ts / 2.0, -ts / 2.0, ts, ts), Rect2(3 * t2, 0, t2, t2))
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
