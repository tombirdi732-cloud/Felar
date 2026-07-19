class_name CheckpointNode
extends Node2D
# Чекпоинт-фонарь: off -> ignite -> on

var x := 0.0
var y := 0.0
var lit := false
var anim: SheetAnim


func setup(px: float, py: float) -> void:
	x = px
	y = py
	anim = SheetAnim.new()
	add_child(anim)
	anim.setup("lantern")
	anim.play("off")
	position = Vector2(round(x), round(y))


func rect() -> Rect2:
	return Rect2(x - 15, y - 60, 30, 60)


func light(main: Node) -> void:
	if lit:
		return
	lit = true
	main.sfx.play("check")
	anim.play("ignite", true)
	main.particles.spawn(x, y - 46,
		{"n": 14, "color": Color("ffe9a3"), "speed": 100.0, "gravity": -60.0, "life": 0.8})


func step(dt: float) -> void:
	anim.advance(dt)
	if lit and anim.current == "ignite" and anim.done:
		anim.play("on")
