class_name BgRenderer
extends Node2D
# Параллакс-фон: небо + два слоя силуэтов (экранные координаты).
# Вертикальный параллакс — слои сдвигаются медленнее камеры.

var main: Node
var sky: Texture2D
var far_tex: Texture2D
var near_tex: Texture2D


func set_chapter(ch: int) -> void:
	sky = load("res://assets/bg/ch%d_sky.webp" % ch)
	far_tex = load("res://assets/bg/ch%d_far.webp" % ch)
	near_tex = load("res://assets/bg/ch%d_near.webp" % ch)


func _draw() -> void:
	if sky == null:
		return
	var w := float(GameData.VIEW_W)
	var h := float(GameData.VIEW_H)
	var cy: float = main.cam.y
	var sky_pad := 18.0
	draw_texture_rect(sky, Rect2(0, -cy * 0.12 - sky_pad, w, h + sky_pad * 2), false)
	for layer in [[far_tex, 0.2, 0.25], [near_tex, 0.5, 0.45]]:
		var tex: Texture2D = layer[0]
		var k: float = layer[1]
		var kv: float = layer[2]
		var pad: float = ceilf(70.0 * kv) + 4.0
		var y: float = -cy * kv - pad
		var lh: float = h + pad * 2.0
		# текстуры слоёв в 2x-разрешении, рисуются вдвое меньше
		var tw := float(tex.get_width()) / 2.0
		var off := fmod(-main.cam.x * k, tw)
		var x := off - tw
		while x < w:
			draw_texture_rect(tex, Rect2(round(x), y, tw, lh), false)
			x += tw
