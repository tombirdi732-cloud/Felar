class_name MothNode
extends Node2D
# Мотылёк-спутник: пружиной следует за игроком

var x := 0.0
var y := 0.0
var vx := 0.0
var vy := 0.0
var t := 0.0
var anim: SheetAnim


func setup(px: float, py: float) -> void:
	x = px
	y = py
	anim = SheetAnim.new()
	add_child(anim)
	anim.setup("moth")
	anim.play("fly")


func step(dt: float, player: PlayerNode, talking: bool) -> void:
	t += dt
	var tx := player.cx() - player.facing * 30.0
	var ty := player.y - 26.0 + sin(t * 2.2) * 6.0
	vx = lerp(vx, (tx - x) * 4.0, dt * 6.0)
	vy = lerp(vy, (ty - y) * 4.0, dt * 6.0)
	x += vx * dt
	y += vy * dt
	anim.play("talk" if talking else "fly")
	anim.advance(dt)
	position = Vector2(round(x), round(y + 16))
	anim.flip_h = vx < -10
