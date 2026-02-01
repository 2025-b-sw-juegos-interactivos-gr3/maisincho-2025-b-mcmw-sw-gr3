extends CanvasLayer

func _on_button_pressed():
	# Reinicia el nivel y quita la pausa
	get_tree().paused = false
	get_tree().reload_current_scene()
