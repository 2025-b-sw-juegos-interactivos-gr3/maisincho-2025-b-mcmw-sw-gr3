extends CanvasLayer

func _on_button_pressed():
	# 1. Quitar la pausa
	get_tree().paused = false
	# 2. Reiniciar el juego desde el principio
	get_tree().reload_current_scene()
