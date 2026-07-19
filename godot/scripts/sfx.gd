class_name Sfx
extends Node
# Пул аудиоплееров для коротких эффектов из assets/sfx

var _streams: Dictionary = {}
var _players: Array = []
var _next := 0


func _ready() -> void:
	for name in ["jump", "djump", "dash", "pickup", "hurt", "stomp",
			"check", "portal", "blip", "death", "land"]:
		_streams[name] = load("res://assets/sfx/%s.wav" % name)
	for i in range(8):
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)


func play(name: String) -> void:
	if not _streams.has(name):
		return
	var p: AudioStreamPlayer = _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = _streams[name]
	p.play()
