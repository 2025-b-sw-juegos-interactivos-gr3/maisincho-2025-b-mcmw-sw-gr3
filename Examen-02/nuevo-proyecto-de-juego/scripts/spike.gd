extends Area2D

func _on_body_entered(body):
	# 1. IMPRIMIR TODO LO QUE ENTRA (Para ver si detecta algo)
	print("¡Algo tocó la trampa! Se llama: ", body.name)

	# 2. VERIFICAR SI TIENE VIDA (Más seguro que chequear el nombre)
	if body.has_method("take_damage"):
		print("¡Es el jugador! Aplicando daño...")
		body.take_damage(global_position.x)
