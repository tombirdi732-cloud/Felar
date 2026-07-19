# ============================================================
# Предметы: осколок, чекпоинт-фонарь, врата, движ. платформа
# (несколько маленьких классов в одном файле нельзя в GDScript,
# поэтому это осколок; остальные — в соседних файлах)
# ============================================================
class_name ShardNode
extends Node2D

var x := 0.0
var y := 0.0
var taken := false
var anim: SheetAnim


func setup(px: float, py: float) -> void:
	x = px
	y = py
	anim = SheetAnim.new()
	add_child(anim)
	anim.setup("shard")
	anim.play("spin")
	anim.t = randf()


func rect() -> Rect2:
	return Rect2(x - 10, y - 12, 20, 24)


func take(main: Node) -> void:
	taken = true
	visible = false
	main.sfx.play("pickup")
	main.particles.spawn(x, y,
		{"n": 10, "color": Color("ffe9a3"), "speed": 110.0, "gravity": -80.0, "life": 0.6})


func step(dt: float) -> void:
	if taken:
		return
	anim.advance(dt)
	position = Vector2(round(x), round(y + 16))
