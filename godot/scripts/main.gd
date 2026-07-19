extends Node2D
# ============================================================
# ИСКРА — главный цикл: состояния, ввод, уровень, камера.
# Порт браузерной версии (js/game.js) один в один.
# ============================================================

const KEYMAP := {
	"left": [KEY_LEFT, KEY_A],
	"right": [KEY_RIGHT, KEY_D],
	"jump": [KEY_SPACE, KEY_W, KEY_UP, KEY_Z],
	"dash": [KEY_SHIFT, KEY_X],
	"interact": [KEY_E, KEY_ENTER],
	"pause": [KEY_ESCAPE],
	"quit": [KEY_Q],
}

var state := "menu"
var chapter := 1
var level: LevelGrid
var player: PlayerNode
var moth: MothNode
var enemies: Array = []
var flyers: Array = []
var platforms: Array = []
var shards: Array = []
var checkpoints: Array = []
var triggers: Array = []
var portal: PortalGate
var respawn := Vector2.ZERO
var shards_got := 0
var shards_total := 0
var time_s := 0.0
var title_t := 0.0
var end_t := 0.0
var fade := 1.0
var fade_dir := -1
var fade_cb := Callable()
var dialogue: Dictionary = {}
var paused := false
var menu_idx := 0
var chapter_done := false
var cam := Vector2.ZERO
var cam_shake := 0.0
var save: Dictionary = {}

var bg: BgRenderer
var world: Node2D
var tiles: TilesRenderer
var entities_node: Node2D
var particles: ParticlesFX
var ui: UiScreen
var sfx: Sfx

var _held := {}
var _hit := {}
var _prev := {}


func _ready() -> void:
	save = GameData.load_save()
	bg = BgRenderer.new()
	bg.main = self
	add_child(bg)
	world = Node2D.new()
	add_child(world)
	tiles = TilesRenderer.new()
	tiles.main = self
	world.add_child(tiles)
	entities_node = Node2D.new()
	world.add_child(entities_node)
	particles = ParticlesFX.new()
	world.add_child(particles)
	sfx = Sfx.new()
	add_child(sfx)
	var layer := CanvasLayer.new()
	add_child(layer)
	ui = UiScreen.new()
	ui.main = self
	layer.add_child(ui)


# ---------- ввод ----------
func _update_input() -> void:
	for a in KEYMAP:
		var cur := false
		for key in KEYMAP[a]:
			if Input.is_physical_key_pressed(key):
				cur = true
				break
		_hit[a] = cur and not _prev.get(a, false)
		_held[a] = cur
		_prev[a] = cur


func held(a: String) -> bool:
	return _held.get(a, false)


func hit(a: String) -> bool:
	return _hit.get(a, false)


# ---------- переходы ----------
func fade_to(cb: Callable) -> void:
	fade_dir = 1
	fade_cb = cb


# ---------- запуск главы ----------
func start_chapter(ch: int) -> void:
	chapter = ch
	level = LevelGrid.new(ch)
	var meta: Dictionary = GameData.chapter_meta(ch)
	for c in entities_node.get_children():
		c.queue_free()
	enemies = []
	flyers = []
	platforms = []
	shards = []
	checkpoints = []
	triggers = []
	portal = null
	particles.clear_all()
	bg.set_chapter(ch)
	tiles.set_level(level)

	for s in level.spawns:
		var scx: float = s["x"] + GameData.TILE / 2.0
		var t: String = s["char"]
		if t == "P":
			respawn = Vector2(s["x"], s["y"])
			player = PlayerNode.new()
			entities_node.add_child(player)
			player.setup(self, s["x"], s["y"], meta["abilities"])
			moth = MothNode.new()
			entities_node.add_child(moth)
			moth.setup(scx, s["y"])
		elif t == "o":
			var sh := ShardNode.new()
			entities_node.add_child(sh)
			sh.setup(scx, s["y"] + GameData.TILE / 2.0)
			shards.append(sh)
		elif t == "K":
			var k := CheckpointNode.new()
			entities_node.add_child(k)
			k.setup(scx, s["y"] + GameData.TILE * 2.0)
			checkpoints.append(k)
		elif t == "X":
			portal = PortalGate.new()
			entities_node.add_child(portal)
			portal.setup(scx, s["y"] + GameData.TILE * 2.0)
		elif t == "E":
			_spawn_walker(s["x"] + 8.0, s["y"], meta)
		elif t == "F":
			_spawn_flyer(s["x"], s["y"], meta)
		elif t == "M" or t == "W":
			var mp := MovingPlatformNode.new()
			entities_node.add_child(mp)
			mp.setup(s["x"], s["y"] + 8.0, t == "W", ch)
			platforms.append(mp)
		elif t >= "1" and t <= "9":
			triggers.append({
				"id": t,
				"rect": Rect2(s["x"] - GameData.TILE, 0,
					GameData.TILE * 3, GameData.ROWS * GameData.TILE),
				"seen": false,
			})
	shards_got = 0
	shards_total = shards.size()
	time_s = 0.0
	title_t = 0.0
	chapter_done = false
	cam = Vector2.ZERO
	state = "play"
	paused = false
	dialogue = {}


func _spawn_walker(px: float, py: float, meta: Dictionary) -> void:
	var e := WalkerNode.new()
	entities_node.add_child(e)
	e.setup(self, px, py, meta["enemies"]["E"])
	enemies.append(e)


func _spawn_flyer(px: float, py: float, meta: Dictionary) -> void:
	var f := FlyerNode.new()
	entities_node.add_child(f)
	f.setup(self, px, py, meta["enemies"]["F"])
	flyers.append(f)


# ---------- диалоги ----------
func open_dialogue(lines: Array) -> void:
	dialogue = {"lines": lines, "idx": 0, "chars": 0.0}
	sfx.play("blip")


func _update_dialogue(dt: float) -> void:
	var line: Dictionary = dialogue["lines"][dialogue["idx"]]
	var text := str(line["text"])
	if dialogue["chars"] < text.length():
		dialogue["chars"] = min(float(text.length()), dialogue["chars"] + dt * 40.0)
		if randf() < dt * 18.0:
			sfx.play("blip")
	if hit("interact") or hit("jump"):
		if dialogue["chars"] < text.length():
			dialogue["chars"] = float(text.length())
		else:
			dialogue["idx"] += 1
			if dialogue["idx"] >= (dialogue["lines"] as Array).size():
				dialogue = {}
			else:
				dialogue["chars"] = 0.0


# ---------- игровой апдейт ----------
func _update_play(dt: float) -> void:
	title_t += dt
	if hit("pause"):
		paused = not paused
	if paused:
		if hit("quit"):
			fade_to(func() -> void: state = "chapters")
		if hit("interact"):
			paused = false
		return
	if not dialogue.is_empty():
		_update_dialogue(dt)
		moth.step(dt, player, true)
		return

	time_s += dt
	for mp in platforms:
		mp.step(dt)
	player.step(dt, level)
	moth.step(dt, player, false)
	for e in enemies:
		e.step(dt, level)
	for f in flyers:
		f.step(dt)
	for s in shards:
		s.step(dt)
	for c in checkpoints:
		c.step(dt)
	if portal != null:
		portal.step(dt, self)
	particles.step(dt)

	if not player.dead:
		if level.spikes_hit(player.rect()):
			player.hurt(-player.facing)
		if player.y > level.ph + 60:
			player.die()
		for e in enemies:
			_hit_enemy(e)
		for f in flyers:
			_hit_enemy(f)
		# осколки: магнит + подбор
		for s in shards:
			if s.taken:
				continue
			var dx: float = player.cx() - s.x
			var dy: float = player.y + player.h / 2 - s.y
			var d := sqrt(dx * dx + dy * dy)
			if d > 0 and d < 80:
				s.x += dx / d * 380.0 * dt
				s.y += dy / d * 380.0 * dt
			if player.rect().intersects(s.rect()):
				s.take(self)
				shards_got += 1
		for c in checkpoints:
			if not c.lit and player.rect().intersects(c.rect()):
				c.light(self)
				respawn = Vector2(c.x - player.w / 2, c.y - 70)
		for trg in triggers:
			if not trg["seen"] and player.rect().intersects(trg["rect"]):
				trg["seen"] = true
				var lines = GameData.dialogues(chapter).get(str(trg["id"]))
				if lines != null:
					open_dialogue(lines)
		if portal != null and player.rect().intersects(portal.rect()) and not chapter_done:
			_finish_chapter()
	elif player.dead_t > 1.1:
		player.dead_t = -99.0
		fade_to(_respawn_player)

	_camera_follow(dt)


func _hit_enemy(e) -> void:
	if not e.alive():
		return
	var r := player.rect()
	var er: Rect2 = e.rect()
	if not r.intersects(er):
		return
	if player.vy > 60 and player.bottom() - er.position.y < 18:
		e.squash()
		player.vy = GameData.phys()["stompBounce"]
		player.jumps = 0
		cam_shake = 4.0
	else:
		var knock := -1 if player.cx() < er.position.x + er.size.x / 2 else 1
		player.hurt(knock)


func _finish_chapter() -> void:
	chapter_done = true
	sfx.play("portal")
	var key := str(chapter)
	var best: Dictionary = save["best"].get(key, {})
	save["best"][key] = {
		"shards": max(int(best.get("shards", 0)), shards_got),
		"total": shards_total,
		"time": min(float(best.get("time", 999999.0)), time_s),
	}
	save["unlocked"] = max(int(save["unlocked"]), min(3, chapter + 1))
	GameData.write_save(save)
	fade_to(func() -> void:
		state = "end"
		end_t = 0.0)


func _respawn_player() -> void:
	var keep := shards_got
	var meta: Dictionary = GameData.chapter_meta(chapter)
	player.queue_free()
	player = PlayerNode.new()
	entities_node.add_child(player)
	player.setup(self, respawn.x, respawn.y, meta["abilities"])
	shards_got = keep
	for e in enemies:
		e.queue_free()
	for f in flyers:
		f.queue_free()
	enemies = []
	flyers = []
	for s in level.spawns:
		if s["char"] == "E":
			_spawn_walker(s["x"] + 8.0, s["y"], meta)
		elif s["char"] == "F":
			_spawn_flyer(s["x"], s["y"], meta)


func _camera_follow(dt: float) -> void:
	var k: float = min(1.0, dt * 6.0)
	var target := Vector2(player.cx() - GameData.VIEW_W / 2.0,
		player.y + player.h / 2.0 - GameData.VIEW_H * 0.58)
	cam = cam.lerp(target, k)
	cam.x = clamp(cam.x, 0.0, max(0.0, level.pw - GameData.VIEW_W))
	cam.y = clamp(cam.y, -GameData.TILE * 2.0, max(0.0, level.ph - GameData.VIEW_H))
	if cam_shake > 0:
		cam_shake = max(0.0, cam_shake - dt * 18.0)


# ---------- меню ----------
func _update_menu(dt: float) -> void:
	title_t += dt
	if hit("interact") or hit("jump"):
		sfx.play("pickup")
		fade_to(func() -> void:
			state = "chapters"
			menu_idx = 0)


func _update_chapters(_dt: float) -> void:
	title_t += _dt
	if hit("left"):
		menu_idx = (menu_idx + 2) % 3
		sfx.play("blip")
	if hit("right"):
		menu_idx = (menu_idx + 1) % 3
		sfx.play("blip")
	if hit("interact") or hit("jump"):
		var ch := menu_idx + 1
		if ch <= int(save["unlocked"]):
			sfx.play("portal")
			fade_to(func() -> void: start_chapter(ch))
		else:
			sfx.play("hurt")
	if hit("pause"):
		fade_to(func() -> void: state = "menu")


func _update_end(dt: float) -> void:
	end_t += dt
	if end_t > 1.0 and (hit("interact") or hit("jump")):
		if chapter < 3:
			fade_to(func() -> void: start_chapter(chapter + 1))
		else:
			fade_to(func() -> void:
				state = "chapters"
				menu_idx = 0)


# ---------- главный цикл ----------
func _process(dt: float) -> void:
	dt = min(dt, 0.033)
	_update_input()

	match state:
		"menu":
			_update_menu(dt)
		"chapters":
			_update_chapters(dt)
		"play":
			_update_play(dt)
		"end":
			_update_end(dt)

	# фейды
	if fade_dir > 0:
		fade = min(1.0, fade + dt * 3.0)
		if fade >= 1.0:
			fade_dir = -1
			if fade_cb.is_valid():
				var cb := fade_cb
				fade_cb = Callable()
				cb.call()
	elif fade > 0:
		fade = max(0.0, fade - dt * 2.0)

	# камера: мир двигается вместо камеры (как в веб-версии)
	var shake := Vector2.ZERO
	if cam_shake > 0:
		shake = Vector2(randf() - 0.5, randf() - 0.5) * cam_shake
	world.position = -(cam + shake).round()
	world.visible = state == "play"
	bg.visible = state == "play"
	bg.queue_redraw()
	tiles.queue_redraw()
	ui.queue_redraw()
