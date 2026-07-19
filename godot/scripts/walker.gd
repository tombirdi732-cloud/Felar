class_name WalkerNode
extends Node2D
# Наземный враг: патруль с разворотом у стены/обрыва

var main: Node
var w := 30.0
var h := 26.0
var x := 0.0
var y := 0.0
var dir := -1
var speed := 60.0
var dead_t := -1.0
var anim: SheetAnim


func setup(p_main: Node, px: float, py: float, sheet: String) -> void:
	main = p_main
	x = px
	y = py
	speed = 45.0 if sheet == "sentry" else 60.0
	anim = SheetAnim.new()
	add_child(anim)
	anim.setup(sheet)
	anim.play("walk")


func rect() -> Rect2:
	return Rect2(x, y, w, h)


func alive() -> bool:
	return dead_t < 0


func squash() -> void:
	dead_t = 0.0
	anim.play("squash", true)
	main.sfx.play("stomp")
	main.particles.spawn(x + w / 2, y + h / 2,
		{"n": 10, "color": Color("c9d8c0"), "speed": 120.0, "life": 0.5})


func step(dt: float, level: LevelGrid) -> void:
	anim.advance(dt)
	if not alive():
		dead_t += dt
		visible = dead_t <= 0.4
		_sync()
		return
	# гравитация к земле
	y += 300.0 * dt
	var r := rect()
	var grounded := false
	for t in level.solids_near(r):
		if r.intersects(t) and r.position.y + r.size.y - t.position.y < 20:
			y = t.position.y - h
			grounded = true
	# патруль
	var step_x := speed * dt * dir
	var ahead_x := x + w + 2 if dir > 0 else x - 2
	var wall := level.solid_at(ahead_x, y + h - 8)
	var floor_ok := level.solid_at(ahead_x, y + h + 8) or level.oneway_at(ahead_x, y + h + 8)
	if grounded and (wall or not floor_ok):
		dir *= -1
	else:
		x += step_x
	_sync()


func _sync() -> void:
	position = Vector2(round(x + w / 2), round(y + h + 2))
	anim.flip_h = dir > 0
