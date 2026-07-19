class_name MovingPlatformNode
extends Node2D
# Движущаяся платформа (пинг-понг), рисуется 3 тайлами платформы

var w := 96.0
var h := 14.0
var x0 := 0.0
var y0 := 0.0
var x := 0.0
var y := 0.0
var vertical := false
var range_px := 0.0
var t := 0.0
var dx := 0.0
var dy := 0.0
var _tex: Texture2D


func setup(px: float, py: float, p_vertical: bool, ch: int) -> void:
	x0 = px
	y0 = py
	x = px
	y = py
	vertical = p_vertical
	range_px = GameData.TILE * (3.5 if p_vertical else 5.0)
	_tex = load("res://assets/tiles/ch%d.png" % ch)


func step(dt: float) -> void:
	t += dt
	var k := sin(t * 1.1) * range_px
	var nx := x0 if vertical else x0 + k
	var ny := y0 + k if vertical else y0
	dx = nx - x
	dy = ny - y
	x = nx
	y = ny
	position = Vector2(round(x), round(y - 2))
	queue_redraw()


func _draw() -> void:
	var ts := GameData.TILE
	for i in range(3):
		draw_texture_rect_region(_tex, Rect2(i * ts, 0, ts, ts), Rect2(2 * ts, 0, ts, ts))
