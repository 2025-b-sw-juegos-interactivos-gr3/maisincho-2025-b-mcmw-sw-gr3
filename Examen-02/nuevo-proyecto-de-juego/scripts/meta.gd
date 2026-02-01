extends Area2D

# Referencia a la pantalla de victoria (que debes poner en el Nivel)
# Ojo: Asegúrate de añadir la escena VictoryUI a tu Nivel1 y ocultarla (ojito cerrado)
@onready var victory_screen = get_parent().get_node_or_null("VictoryUi")

func _on_body_entered(body):
	if body.name == "Player":
		print("¡GANASTE!")
		
		if victory_screen:
			victory_screen.visible = true # Mostrar pantalla
			get_tree().paused = true      # Pausar el juego para celebrar
