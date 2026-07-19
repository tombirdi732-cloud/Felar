class_name UiScreen
extends Control
# ============================================================
# Весь UI рисуется здесь: меню, выбор глав, HUD, диалоги,
# пауза, экран конца главы, фейды. Состояние — в main.
# ============================================================

var main: Node
var font: Font


func _ready() -> void:
	font = ThemeDB.fallback_font
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _center(text: String, y: float, size: int, color: Color) -> void:
	draw_string(font, Vector2(0, y), text,
		HORIZONTAL_ALIGNMENT_CENTER, GameData.VIEW_W, size, color)


func _draw() -> void:
	match main.state:
		"menu":
			_draw_menu()
		"chapters":
			_draw_chapters()
		"play":
			_draw_hud()
			_draw_dialogue()
			if main.paused:
				_draw_pause()
		"end":
			_draw_end()
	if main.fade > 0:
		draw_rect(Rect2(0, 0, GameData.VIEW_W, GameData.VIEW_H),
			Color(0.016, 0.024, 0.047, main.fade))


func _draw_menu() -> void:
	draw_rect(Rect2(0, 0, GameData.VIEW_W, GameData.VIEW_H), Color("10141f"))
	for i in range(60):
		var x := TilesRenderer.hash2(i, 3) * GameData.VIEW_W
		var y := fmod(TilesRenderer.hash2(i, 7) * GameData.VIEW_H
			+ main.title_t * (4.0 + TilesRenderer.hash2(i, 9) * 10.0), float(GameData.VIEW_H))
		var col := Color("ffe9a3")
		col.a = 0.2 + TilesRenderer.hash2(i, 5) * 0.5
		draw_rect(Rect2(x, y, 2, 2), col)
	_center("ИСКРА", GameData.VIEW_H * 0.42, 84, Color("ffeec2"))
	_center("сказка об угасшем свете", GameData.VIEW_H * 0.42 + 42, 18, Color(1, 1, 1, 0.65))
	var blink := Color("ffe9a3")
	blink.a = 0.5 + sin(main.title_t * 3.0) * 0.35
	_center("нажми Enter", GameData.VIEW_H * 0.72, 17, blink)
	_center("← → / A D — движение   Пробел — прыжок   Shift / X — рывок   E — далее",
		GameData.VIEW_H * 0.92, 13, Color(1, 1, 1, 0.35))


func _draw_chapters() -> void:
	draw_rect(Rect2(0, 0, GameData.VIEW_W, GameData.VIEW_H), Color("141a26"))
	_center("Выбор главы", 84, 32, Color("ffeec2"))
	for i in range(3):
		var ch := i + 1
		var meta: Dictionary = GameData.chapter_meta(ch)
		var locked: bool = ch > int(main.save["unlocked"])
		var sel: bool = i == main.menu_idx
		var cw := 240.0
		var chh := 260.0
		var x := GameData.VIEW_W / 2.0 + (i - 1) * 290.0 - cw / 2.0
		var y := 150.0 + (-10.0 if sel else 0.0)
		var card := Rect2(x, y, cw, chh)
		draw_rect(card, Color(1, 0.91, 0.64, 0.12) if sel else Color(1, 1, 1, 0.05))
		draw_rect(card, Color("ffe9a3") if sel else Color(1, 1, 1, 0.2), false, 3.0 if sel else 1.5)
		var pal: Dictionary = meta["pal"]
		draw_rect(Rect2(x + 20, y + 20, cw - 40, 100), Color(pal["skyBot"]))
		draw_rect(Rect2(x + 20, y + 100, cw - 40, 20), Color(pal["groundTop"]))
		if locked:
			draw_rect(Rect2(x + 20, y + 20, cw - 40, 100), Color(0.04, 0.05, 0.08, 0.65))
			draw_string(font, Vector2(x, y + 84), "×",
				HORIZONTAL_ALIGNMENT_CENTER, cw, 34, Color(1, 1, 1, 0.8))
		var name_col := Color(1, 1, 1, 0.4) if locked else Color("ffeec2")
		draw_string(font, Vector2(x, y + 150), str(meta["sub"]),
			HORIZONTAL_ALIGNMENT_CENTER, cw, 15, name_col)
		draw_string(font, Vector2(x, y + 176), str(meta["name"]),
			HORIZONTAL_ALIGNMENT_CENTER, cw, 18, name_col)
		var best: Dictionary = main.save["best"].get(str(ch), {})
		var info := "не пройдена" if not locked else ""
		if not best.is_empty():
			var m := int(best["time"] / 60.0)
			var s := int(best["time"]) % 60
			info = "%d/%d   %d:%02d" % [int(best["shards"]), int(best["total"]), m, s]
		draw_string(font, Vector2(x, y + 210), info,
			HORIZONTAL_ALIGNMENT_CENTER, cw, 13, Color(1, 1, 1, 0.5))
	_center("← → — выбрать    Enter — играть    Esc — назад",
		GameData.VIEW_H - 40, 14, Color(1, 1, 1, 0.4))


func _draw_heart(x: float, y: float, filled: bool) -> void:
	var col := Color("ff6b81") if filled else Color(1, 1, 1, 0.18)
	var pts := PackedVector2Array()
	for i in range(16):
		var a := float(i) / 16.0 * TAU
		var hx := 16.0 * pow(sin(a), 3)
		var hy := -(13.0 * cos(a) - 5.0 * cos(2 * a) - 2.0 * cos(3 * a) - cos(4 * a))
		pts.append(Vector2(x + hx * 0.55, y + hy * 0.55))
	draw_colored_polygon(pts, col)


func _draw_hud() -> void:
	for i in range(3):
		_draw_heart(28 + i * 26, 30, i < main.player.hp)
	# осколки: иконка из листа
	var sh: Texture2D = load("res://assets/sprites/shard.png")
	var fr := int(Time.get_ticks_msec() / 90.0) % 8
	draw_texture_rect_region(sh, Rect2(16, 44, 26, 26), Rect2(fr * 32, 0, 32, 32))
	draw_string(font, Vector2(48, 64), "%d / %d" % [main.shards_got, main.shards_total],
		HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color("ffe9a3"))
	var m := int(main.time_s / 60.0)
	var s := int(main.time_s) % 60
	draw_string(font, Vector2(GameData.VIEW_W - 120, 30), "%d:%02d" % [m, s],
		HORIZONTAL_ALIGNMENT_RIGHT, 100, 14, Color(1, 1, 1, 0.5))
	# титул главы
	if main.title_t < 3.2:
		var a := 1.0
		if main.title_t < 0.5:
			a = main.title_t / 0.5
		elif main.title_t > 2.5:
			a = (3.2 - main.title_t) / 0.7
		a = clamp(a, 0.0, 1.0)
		var meta: Dictionary = GameData.chapter_meta(main.chapter)
		_center(str(meta["sub"]), GameData.VIEW_H * 0.3, 17, Color(1, 1, 1, 0.75 * a))
		_center(str(meta["name"]), GameData.VIEW_H * 0.3 + 44, 36, Color(1, 0.91, 0.64, a))


func _draw_dialogue() -> void:
	var d: Dictionary = main.dialogue
	if d.is_empty():
		return
	var line: Dictionary = d["lines"][d["idx"]]
	var bx := 90.0
	var bw := GameData.VIEW_W - 180.0
	var bh := 110.0
	var by := GameData.VIEW_H - bh - 26.0
	draw_rect(Rect2(bx, by, bw, bh), Color(0.04, 0.05, 0.09, 0.88))
	draw_rect(Rect2(bx, by, bw, bh), Color(1, 0.91, 0.64, 0.5), false, 2.0)
	draw_string(font, Vector2(bx + 22, by + 30), str(line["who"]),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("ffd76b"))
	var shown: String = str(line["text"]).substr(0, int(d["chars"]))
	# перенос строк
	var words := shown.split(" ")
	var cur := ""
	var yy := by + 58.0
	for wd in words:
		var test := cur + " " + wd if cur != "" else wd
		if font.get_string_size(test, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x > bw - 44:
			draw_string(font, Vector2(bx + 22, yy), cur,
				HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("f0eee6"))
			yy += 24
			cur = wd
		else:
			cur = test
	draw_string(font, Vector2(bx + 22, yy), cur,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("f0eee6"))
	if d["chars"] >= str(line["text"]).length():
		draw_string(font, Vector2(bx + bw - 110, by + bh - 14), "E / Enter >",
			HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.6))


func _draw_pause() -> void:
	draw_rect(Rect2(0, 0, GameData.VIEW_W, GameData.VIEW_H), Color(0.02, 0.03, 0.06, 0.7))
	_center("Пауза", GameData.VIEW_H / 2.0 - 20, 32, Color("ffe9a3"))
	_center("E / Enter — продолжить    Q — выйти в меню",
		GameData.VIEW_H / 2.0 + 24, 15, Color(1, 1, 1, 0.7))


func _draw_end() -> void:
	var meta: Dictionary = GameData.chapter_meta(main.chapter)
	var pal: Dictionary = meta["pal"]
	draw_rect(Rect2(0, 0, GameData.VIEW_W, GameData.VIEW_H), Color(pal["skyTop"]))
	var title := "Глава пройдена!" if main.chapter < 3 else "Свет вернулся…"
	_center(title, GameData.VIEW_H * 0.32, 40, Color("ffeec2"))
	if main.chapter == 3:
		_center("Люм вернул осколки Сердцу Небес, и над лесом снова встала заря.",
			GameData.VIEW_H * 0.42, 17, Color(1, 1, 1, 0.75))
		_center("Спасибо за игру! (демо трёх глав)",
			GameData.VIEW_H * 0.42 + 28, 17, Color(1, 1, 1, 0.75))
	var m := int(main.time_s / 60.0)
	var s := int(main.time_s) % 60
	_center("Осколки: %d / %d     Время: %d:%02d" %
		[main.shards_got, main.shards_total, m, s],
		GameData.VIEW_H * 0.58, 19, Color("ffe9a3"))
	var hint := "Enter — следующая глава" if main.chapter < 3 else "Enter — в меню"
	var col := Color(1, 1, 1, 0.5 + sin(main.end_t * 3.0) * 0.35)
	_center(hint, GameData.VIEW_H * 0.75, 15, col)
