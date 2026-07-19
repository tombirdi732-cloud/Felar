class_name PortalGate
extends Node2D
# Врата в конце главы

var x := 0.0
var y := 0.0
var anim: SheetAnim


func setup(px: float, py: float) -> void:
	x = px
	y = py
	anim = SheetAnim.new()
	add_child(anim)
	anim.setup("portal")
	anim.play("idle")
	position = Vector2(round(x), round(y))


func rect() -> Rect2:
	return Rect2(x - 30, y - 90, 60, 90)


func step(dt: float, main: Node) -> void:
	anim.advance(dt)
	if randf() < 0.1:
		main.particles.spawn(x + (randf() - 0.5) * 50, y - 40,
			{"n": 1, "color": Color("c8b8ff"), "speed": 30.0, "gravity": -70.0, "life": 1.0})
