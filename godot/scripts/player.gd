class_name PlayerNode
extends Node2D
# ============================================================
# Игрок: порт физики веб-версии (койот, буфер прыжка,
# двойной прыжок, рывок, урон, смерть). position = левый
# верхний угол хитбокса НЕ используется: держим x/y отдельно.
# ============================================================

var main: Node
var w := 22.0
var h := 40.0
var x := 0.0
var y := 0.0
var vx := 0.0
var vy := 0.0
var facing := 1
var on_ground := false
var coyote := 0.0
var jump_buf := 0.0
var jumps := 0
var abilities: Dictionary = {}
var dash_t := 0.0
var dash_cd := 0.0
var air_dash_used := false
var hp := 3
var inv := 0.0
var dead := false
var dead_t := 0.0
var carrier: Node = null
var was_on_ground := false
var anim: SheetAnim


func setup(p_main: Node, px: float, py: float, p_abilities: Dictionary) -> void:
	main = p_main
	x = px
	y = py
	abilities = p_abilities
	anim = SheetAnim.new()
	add_child(anim)
	anim.setup("lum")
	anim.play("idle")


func rect() -> Rect2:
	return Rect2(x, y, w, h)


func cx() -> float:
	return x + w / 2.0


func bottom() -> float:
	return y + h


func hurt(knock_dir: float) -> void:
	if inv > 0 or dead:
		return
	hp -= 1
	main.sfx.play("hurt")
	main.particles.spawn(cx(), y + h / 2, {"n": 10, "color": Color("ff8f6b"), "speed": 140.0})
	if hp <= 0:
		die()
		return
	inv = 1.2
	vx = knock_dir * 240.0
	vy = -340.0
	anim.play("hurt", true)


func die() -> void:
	if dead:
		return
	dead = true
	dead_t = 0.0
	vx = 0.0
	vy = 0.0
	main.sfx.play("death")
	anim.play("death", true)
	main.particles.spawn(cx(), y + h / 2,
		{"n": 18, "color": Color("ffe9a3"), "speed": 160.0, "gravity": -60.0, "life": 0.9})


func step(dt: float, level: LevelGrid) -> void:
	if dead:
		dead_t += dt
		anim.advance(dt)
		_sync_visual()
		return
	var ph: Dictionary = GameData.phys()
	inv = max(0.0, inv - dt)
	dash_cd = max(0.0, dash_cd - dt)
	coyote = max(0.0, coyote - dt)
	jump_buf = max(0.0, jump_buf - dt)

	var dir := 0
	if main.held("left"):
		dir -= 1
	if main.held("right"):
		dir += 1
	if dir != 0:
		facing = dir

	# --- рывок ---
	if main.hit("dash") and abilities.get("dash", false) and dash_cd <= 0 \
			and (on_ground or not air_dash_used):
		dash_t = ph["dashTime"]
		dash_cd = ph["dashCooldown"]
		if not on_ground:
			air_dash_used = true
		vx = facing * ph["dashSpeed"]
		vy = 0.0
		main.sfx.play("dash")
		anim.play("dash", true)

	if dash_t > 0:
		dash_t -= dt
		main.particles.spawn(cx() - facing * 10, bottom() - 12,
			{"n": 2, "color": Color("bfeee6"), "speed": 30.0, "gravity": 0.0, "life": 0.3})
	else:
		var target := dir * float(ph["runSpeed"])
		var a: float = ph["accel"] if dir != 0 else ph["friction"]
		if vx < target:
			vx = min(target, vx + a * dt)
		elif vx > target:
			vx = max(target, vx - a * dt)
		vy = min(float(ph["maxFall"]), vy + ph["gravity"] * dt)
		if not main.held("jump") and vy < 0:
			vy *= 1.0 - (1.0 - ph["jumpCut"]) * dt * 14.0

	# --- прыжок ---
	if main.hit("jump"):
		jump_buf = ph["jumpBuffer"]
	if jump_buf > 0:
		if on_ground or coyote > 0:
			vy = ph["jumpVel"]
			jump_buf = 0.0
			coyote = 0.0
			on_ground = false
			main.sfx.play("jump")
			anim.play("jump", true)
			main.particles.spawn(cx(), bottom(),
				{"n": 5, "color": Color("9aa89a"), "speed": 60.0, "gravity": 120.0, "life": 0.35})
		elif abilities.get("doubleJump", false) and jumps < 1:
			vy = ph["jumpVel"] * 0.92
			jumps += 1
			jump_buf = 0.0
			main.sfx.play("djump")
			anim.play("doublejump", true)
			main.particles.spawn(cx(), bottom(),
				{"n": 8, "color": Color("7fd4ff"), "speed": 90.0, "gravity": 40.0, "life": 0.4})

	# --- движение и коллизии ---
	was_on_ground = on_ground
	_move_and_collide(dt, level)
	if carrier != null:
		x += carrier.dx
		y += carrier.dy

	if on_ground:
		jumps = 0
		air_dash_used = false
		coyote = ph["coyote"]
		if not was_on_ground:
			main.sfx.play("land")
			main.particles.spawn(cx(), bottom(),
				{"n": 4, "color": Color("9aa89a"), "speed": 50.0, "gravity": 100.0, "life": 0.3})

	# --- выбор анимации ---
	if dash_t > 0:
		anim.play("dash")
	elif inv > 0.85:
		anim.play("hurt")
	elif not on_ground:
		if anim.current == "doublejump" and not anim.done:
			pass
		else:
			anim.play("jump" if vy < 0 else "fall")
	elif abs(vx) > 30:
		anim.play("run")
	else:
		anim.play("idle")
	anim.advance(dt)
	_sync_visual()


func _move_and_collide(dt: float, level: LevelGrid) -> void:
	# по X
	x += vx * dt
	var r := rect()
	for t in level.solids_near(r):
		if not r.intersects(t):
			continue
		if vx > 0:
			x = t.position.x - w
		elif vx < 0:
			x = t.position.x + t.size.x
		vx = 0.0
		r = rect()
	x = clamp(x, 0.0, level.pw - w)

	# по Y
	var prev_bottom := bottom()
	y += vy * dt
	on_ground = false
	carrier = null
	r = rect()
	for t in level.solids_near(r):
		if not r.intersects(t):
			continue
		if vy > 0:
			y = t.position.y - h
			vy = 0.0
			on_ground = true
		elif vy < 0:
			y = t.position.y + t.size.y
			vy = 0.0
		r = rect()
	# one-way платформы и движущиеся платформы
	if vy >= 0:
		for t in level.oneways_near(r):
			if r.position.x < t.position.x + t.size.x and r.position.x + r.size.x > t.position.x \
					and prev_bottom <= t.position.y + 6 and bottom() >= t.position.y \
					and bottom() <= t.position.y + 20:
				y = t.position.y - h
				vy = 0.0
				on_ground = true
		for mp in main.platforms:
			if r.position.x < mp.x + mp.w and r.position.x + r.size.x > mp.x \
					and bottom() >= mp.y - 2 and bottom() <= mp.y + 16:
				y = mp.y - h
				vy = 0.0
				on_ground = true
				carrier = mp


func _sync_visual() -> void:
	position = Vector2(round(cx()), round(bottom() + 4))
	anim.flip_h = facing < 0
	var blink := inv > 0 and int(inv * 12) % 2 == 0
	anim.visible = not (blink and not dead)
