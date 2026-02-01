extends CanvasLayer

func _ready():
	# 1. Al arrancar, pausamos el juego
	get_tree().paused = true

func _on_button_pressed():
	# 2. Al dar click, quitamos la pausa y ocultamos el menú
	get_tree().paused = false
	queue_free() # Destruimos el menú para que no estorbes
