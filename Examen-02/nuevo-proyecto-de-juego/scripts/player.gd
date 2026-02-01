extends CharacterBody2D

const SPEED = 160.0
const JUMP_VELOCITY = -320.0
const GRAVITY = 980.0
# VARIABLES DE VIDA (Según GDD)
var health: int = 3
var is_hurt: bool = false # ¿Está herido y perdiendo el control?
var is_invulnerable: bool = false

@onready var anim = $AnimatedSprite2D

# 1. REFERENCIAS A LOS NODOS DE AUDIO
@onready var sfx_jump = $SFX_Jump
@onready var sfx_walk = $SFX_Walk

@onready var sfx_hurt = $SFX_Hurt
# Referencias a los corazones (asegúrate de que la ruta sea correcta)
@onready var hearts = [
	$HUD/HBoxContainer/Heart1,
	$HUD/HBoxContainer/Heart2,
	$HUD/HBoxContainer/Heart3
]
func _ready():
	# Al iniciar, nos aseguramos de que se vean los corazones correctos
	print("Vida inicial: ", health) # Debería decir 3
	print("Corazones encontrados: ", hearts.size()) # Debería decir 3
	update_hearts_display()
	
func _physics_process(delta):
	# Gravedad
	if not is_on_floor():
		velocity.y += GRAVITY * delta

	# 2. LOGICA DE SALTO + SONIDO
	# 2. CONTROLES (Solo funcionan si NO estás herido)
	if not is_hurt:
		# Salto
		if Input.is_action_just_pressed("jump") and is_on_floor():
			velocity.y = JUMP_VELOCITY
			$SFX_Jump.play() # Si tienes el sonido

		# Movimiento Horizontal
		var direction = Input.get_axis("move_left", "move_right")
		
		if direction:
			velocity.x = direction * SPEED
			anim.flip_h = (direction < 0)
			# Aquí iría tu lógica de sonido de caminar
		else:
			velocity.x = move_toward(velocity.x, 0, SPEED)
			
		# Actualizar animaciones normales
		update_animations(direction)
			# 3. LÓGICA DE SONIDO AL CAMINAR
		check_walking_sound(direction)
	move_and_slide()


func update_animations(direction):
	if not is_on_floor():
		anim.play("jump")
	elif direction != 0:
		anim.play("run")
	else:
		anim.play("idle")

# Nueva función para controlar el audio de pasos
func check_walking_sound(direction):
	# Solo queremos que suene si:
	# A. Nos estamos moviendo (direction != 0)
	# B. Estamos en el suelo (no saltando)
	if direction != 0 and is_on_floor():
		# Truco importante: Solo le damos Play si NO está sonando ya.
		# Si no ponemos este "if", el sonido se reiniciaría 60 veces por segundo y sonaría como una metralleta.
		if not sfx_walk.playing:
			sfx_walk.play()
	else:
		# Si paramos o saltamos, silenciamos los pasos
		sfx_walk.stop()
func take_damage(source_position_x: float):
	# 1. Si ya somos invulnerables, no hacemos nada (evita morir instantáneamente)
	if is_invulnerable:
		return

	# 2. Restar vida
	health -= 1
	print("¡Auch! Vida restante: ", health)
	# 2. SONIDO DE DOLOR (Nuevo)
	sfx_hurt.play()
	# 3. ACTUALIZAR CORAZONES (Nuevo)
	update_hearts_display()

	# 3. Verificar Muerte
	if health <= 0:
		die()
	else:
		# 4. Iniciar Invulnerabilidad y Retroceso
		start_invulnerability()
		apply_knockback(source_position_x)
# FUNCION NUEVA PARA MANEJAR LA UI
func update_hearts_display():
	# Recorremos los 3 corazones
	for i in range(3):
		# Si la vida es mayor que el índice 'i', mostramos el corazón.
		# Ejemplo: Si vida es 2:
		# i=0 (Corazón 1) -> 2 > 0 -> Visible
		# i=1 (Corazón 2) -> 2 > 1 -> Visible
		# i=2 (Corazón 3) -> 2 > 2 -> Falso -> Invisible
		hearts[i].visible = (health > i)		

func die():
	print("¡Has muerto!")
	var game_over_screen = get_parent().get_node_or_null("GameOverUi")
	if game_over_screen:
		game_over_screen.visible = true # Lo hacemos visible
		get_tree().paused = true        # Pausamos el juego
	else:
		# SOLUCIÓN: Le pedimos a Godot que lo haga "en cuanto termine este frame"
		get_tree().call_deferred("reload_current_scene")

func start_invulnerability():
	is_invulnerable = true
	# Hacemos que el personaje parpadee (feedback visual)
	$AnimatedSprite2D.modulate.a = 0.5 # Hacerlo medio transparente
	
	# Creamos un temporizador "al vuelo" para esperar 1 segundo
	await get_tree().create_timer(1.0).timeout
	
	# Termina la invulnerabilidad
	is_invulnerable = false
	$AnimatedSprite2D.modulate.a = 1.0 # Volver a opacidad normal

func apply_knockback(source_x):
	# 1. Activamos el "modo dolor" para bloquear las teclas
	is_hurt = true
	
	# 2. Cambiamos la animación a "saltar" o una de "daño" si tuvieras
	anim.play("jump") 
	
	# 3. Calculamos el empujón
	# Si la trampa está a mi derecha, voy a la izquierda (-1), y viceversa
	var knockback_direction = -1 if source_x > global_position.x else 1
	
	# EMPUJE FUERTE HACIA ATRÁS Y ARRIBA
	velocity.x = knockback_direction * 250 # Fuerza horizontal
	velocity.y = -300 # Fuerza vertical (casi como un salto)
	
	# 4. Esperamos 0.5 segundos antes de devolver el control
	await get_tree().create_timer(0.5).timeout
	
	# 5. Volvemos a la normalidad
	is_hurt = false
	
	
