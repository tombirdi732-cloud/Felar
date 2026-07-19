class_name ParticlesFX
extends Node2D
# Простые частицы (мировые координаты), рисуются кружками

var list: Array = []


func spawn(x: float, y: float, opts: Dictionary = {}) -> void:
	var n: int = opts.get("n", 6)
	for i in range(n):
		var ang := randf() * TAU
		if opts.has("angle"):
			ang = opts["angle"] + (randf() - 0.5) * opts.get("spread", 1.0)
		var sp: float = opts.get("speed", 80.0) * (0.4 + randf() * 0.8)
		list.append({
			"x": x, "y": y,
			"vx": cos(ang) * sp, "vy": sin(ang) * sp,
			"g": opts.get("gravity", 300.0),
			"life": opts.get("life", 0.5) * (0.6 + randf() * 0.7),
			"t": 0.0,
			"size": opts.get("size", 4.0) * (0.6 + randf() * 0.8),
			"color": opts.get("color", Color.WHITE),
		})


func step(dt: float) -> void:
	var alive: Array = []
	for p in list:
		p["t"] += dt
		if p["t"] >= p["life"]:
			continue
		p["vy"] += p["g"] * dt
		p["x"] += p["vx"] * dt
		p["y"] += p["vy"] * dt
		alive.append(p)
	list = alive
	queue_redraw()


func clear_all() -> void:
	list = []
	queue_redraw()


func _draw() -> void:
	for p in list:
		var k: float = 1.0 - p["t"] / p["life"]
		var col: Color = p["color"]
		col.a = k
		draw_circle(Vector2(p["x"], p["y"]), p["size"] * k, col)
