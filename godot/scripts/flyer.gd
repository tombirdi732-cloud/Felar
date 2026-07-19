class_name FlyerNode
extends Node2D
# Летающий враг: синусоидальный патруль вокруг точки спавна

var main: Node
var w := 24.0
var h := 20.0
var x0 := 0.0
var y0 := 0.0
var x := 0.0
var y := 0.0
var t := 0.0
var prev_x := 0.0
var vy := 0.0
var dead_t := -1.0
var anim: SheetAnim


func setup(p_main: Node, px: float, py: float, sheet: String) -> void:
	main = p_main
	x0 = px
	y0 = py
	x = px
	y = py
	t = randf() * 6.0
	anim = SheetAnim.new()
	add_child(anim)
	anim.setup(sheet)
	anim.play("fly")


func rect() -> Rect2:
	return Rect2(x, y, w, h)


func alive() -> bool:
	return dead_t < 0


func squash() -> void:
	dead_t = 0.0
	anim.play("squash", true)
	main.sfx.play("stomp")
	main.particles.spawn(x + w / 2, y + h / 2,
		{"n": 10, "color": Color("b8a8e0"), "speed": 120.0, "life": 0.5})


func step(dt: float) -> void:
	anim.advance(dt)
	if not alive():
		dead_t += dt
		vy += 900.0 * dt
		y += vy * dt
		visible = dead_t <= 0.5
		_sync()
		return
	t += dt
	prev_x = x
	x = x0 + sin(t * 1.4) * GameData.TILE * 3.0
	y = y0 + sin(t * 3.1) * GameData.TILE * 0.6
	_sync()


func _sync() -> void:
	position = Vector2(round(x + w / 2), round(y + h + 4))
	anim.flip_h = x < prev_x
