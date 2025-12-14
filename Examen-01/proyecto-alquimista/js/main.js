// Lógica principal del juego: Proyecto Alquimista
// Este módulo organiza toda la inicialización de Three.js, entradas y juego.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/RGBELoader.js';

// Referencias al DOM (UI)
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const hintEl = document.getElementById('hint');
const musicToggle = document.getElementById('musicToggle');
const musicVolume = document.getElementById('musicVolume');

// Renderizador y escena
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e13);

// Skybox HDR: carga un mapa equirectangular para ambiente y fondo
// Usamos `skybox.hdr` desde assets/textures. Mejora iluminación y ambientación.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
new RGBELoader()
  .setPath('./assets/textures/')
  .load('skybox.hdr', (hdrTexture) => {
    // Convertir HDR equirectangular a cubemap filtrado para PBR
    const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
    // Fondo: podemos usar directamente el equirectangular para mayor inmersión
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = hdrTexture; // muestra el cielo
    scene.environment = envMap;    // ilumina materiales estándar/physical
    statusEl.textContent = 'Skybox HDR cargado';
    // Liberar recursos del generador y textura si no se reutilizan
    pmremGenerator.dispose();
  }, undefined, (err) => {
    console.warn('No se pudo cargar skybox.hdr:', err);
  });

// Cámaras: tercera persona y cenital
const cameraThird = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
cameraThird.position.set(4, 3, 6);
const cameraTop = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
cameraTop.position.set(0, 10, 0);
let activeCamera = cameraThird;

// Audio de juego: fondo + efectos
const audioListener = new THREE.AudioListener();
activeCamera.add(audioListener);
const audioLoader = new THREE.AudioLoader();
const audioFondo = new THREE.Audio(audioListener);
const sfxRecoger = new THREE.Audio(audioListener);
const sfxSoltar = new THREE.Audio(audioListener);
const sfxCaminar = new THREE.Audio(audioListener);

// Carga de pistas de audio (ajusta rutas según tus recursos)
audioLoader.load('./assets/sounds/fondo.mp3', (buffer) => {
  audioFondo.setBuffer(buffer);
  audioFondo.setLoop(true);
  audioFondo.setVolume(0.35);
});
// UI de música: toggle y volumen
let musicEnabled = true;
musicToggle.addEventListener('click', () => {
  musicEnabled = !musicEnabled;
  if (musicEnabled) {
    musicToggle.textContent = '🔊 Música';
    if (audioFondo.buffer && !audioFondo.isPlaying) audioFondo.play();
  } else {
    musicToggle.textContent = '🔇 Música';
    if (audioFondo.isPlaying) audioFondo.stop();
  }
});
musicVolume.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  audioFondo.setVolume(v);
});

audioLoader.load('./assets/sounds/recoger.mp3', (buffer) => {
  sfxRecoger.setBuffer(buffer);
  sfxRecoger.setLoop(false);
  sfxRecoger.setVolume(0.8);
});
audioLoader.load('./assets/sounds/soltar.mp3', (buffer) => {
  sfxSoltar.setBuffer(buffer);
  sfxSoltar.setLoop(false);
  sfxSoltar.setVolume(0.8);
});
audioLoader.load('./assets/sounds/caminar.mp3', (buffer) => {
  sfxCaminar.setBuffer(buffer);
  sfxCaminar.setLoop(true);
  sfxCaminar.setVolume(0.6);
});

// Controles orbit (desactivados por defecto)
const controls = new OrbitControls(cameraThird, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.enabled = false;

// Iluminación básica
const hemi = new THREE.HemisphereLight(0xb1e1ff, 0x1b1b1b, 0.6);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(5, 10, 5);
dir.castShadow = false;
scene.add(dir);

const clock = new THREE.Clock();

// Estado del juego (movimiento, cámara, física)
const state = {
  loaded: false,
  keys: {},
  speed: 3.0,
  runMultiplier: 1.7,
  carrying: null,
  collected: { cristales: 0, setas: 0 },
  camYawOffset: 0,
  camDistance: 6,
  camHeight: 3,
  turnSmooth: 3,
  facingYaw: 0,
  velocityY: 0,
  gravity: -9.8,
  playerRadius: 0.25,
  groundSnapMax: 0.3,
  walkingSfx: false
};

// Referencias a objetos en escena
const refs = {
  sceneRoot: null,
  piso: null,
  caldero: null,
  alquimista: null,
  player: new THREE.Group(),
  handAnchor: new THREE.Group(),
  collectibles: [],
  obstacles: []
};
refs.player.name = 'PlayerRoot';
refs.handAnchor.position.set(0.25, 1.4, 0.35);
refs.handAnchor.name = 'HandAnchor';
refs.player.add(refs.handAnchor);
scene.add(refs.player);

// Utilidades de posicionamiento
const tmpVec3 = new THREE.Vector3();
const tmpBox3 = new THREE.Box3();
function worldPos(obj) { obj.getWorldPosition(tmpVec3); return tmpVec3.clone(); }
function distance(a, b) { return a.distanceTo(b); }

// Carga del GLB desde Blender
const loader = new GLTFLoader();
loader.load(
  './assets/models/esenario.glb',
  (gltf) => {
    refs.sceneRoot = gltf.scene;
    scene.add(gltf.scene);

    const byName = {};
    gltf.scene.traverse((o) => { if (o.name) byName[o.name.toLowerCase()] = o; });

    refs.piso = byName['piso'] || null;
    refs.caldero = byName['caldero'] || null;
    refs.alquimista = byName['alquimista'] || null;

    // Textura del piso
    if (refs.piso) {
      const texLoader = new THREE.TextureLoader();
      texLoader.load(
        './assets/textures/terreno.jpg',
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(4, 4);
          refs.piso.traverse((child) => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({ map: texture });
              child.material.roughness = 1.0;
              child.material.metalness = 0.0;
            }
          });
          statusEl.textContent = 'Textura de terreno aplicada al piso';
        },
        undefined,
        (err) => console.warn('No se pudo cargar la textura terreno.jpg', err)
      );
    }

    if (!refs.alquimista) {
      statusEl.textContent = 'No se encontró el objeto "alquimista" en el GLB.';
      console.warn('Objetos disponibles:', Object.keys(byName));
      return;
    }

    // Posición inicial del jugador basada en el modelo
    const startPos = worldPos(refs.alquimista);
    refs.player.position.copy(startPos);
    refs.player.attach(refs.alquimista);

    // Recolectables: por prefijo de nombre
    const isCollectible = (name) => {
      const n = name.toLowerCase();
      if (n.startsWith('cristal')) return 'cristal';
      if (n.startsWith('seta')) return 'seta';
      return null;
    };
    gltf.scene.traverse((o) => {
      if (!o.name) return;
      const kind = isCollectible(o.name);
      if (kind) refs.collectibles.push({ obj: o, kind, taken: false, deposited: false });
    });

    // Obstáculos: árboles y caldero
    const isObstacle = (name) => {
      const n = name.toLowerCase();
      if (n.startsWith('arbol')) return true;
      if (n === 'caldero') return true;
      return false;
    };
    gltf.scene.traverse((o) => {
      if (!o.name) return;
      if (isObstacle(o.name)) {
        const box = new THREE.Box3().setFromObject(o);
        box.expandByScalar(-0.05);
        refs.obstacles.push({ obj: o, box });
      }
    });

    // Ajuste de cámaras y control
    controls.target.copy(refs.player.position).add(new THREE.Vector3(0, 1.2, 0));
    cameraThird.position.copy(refs.player.position).add(new THREE.Vector3(4, 3, 6));
    cameraThird.lookAt(controls.target);
    cameraTop.position.copy(refs.player.position).add(new THREE.Vector3(0, 10, 0));
    cameraTop.lookAt(new THREE.Vector3().copy(refs.player.position));
    controls.update();

    resolveSpawnOverlap();

    state.loaded = true;
    statusEl.textContent = 'Listo: mueve al alquimista y recoge ingredientes';
  },
  (xhr) => {
    const t = xhr.total || 1;
    const pct = Math.round((xhr.loaded / t) * 100);
    statusEl.textContent = `Cargando escenario… ${pct}%`;
  },
  (err) => {
    console.error(err);
    statusEl.textContent = 'Error cargando el escenario (.glb)';
  }
);

// Entrada de teclado y cámara
window.addEventListener('keydown', (e) => {
  state.keys[e.code] = true;
  if (["KeyW","KeyA","KeyS","KeyD","Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'KeyE') tryPickup();
  if (e.code === 'KeyF') tryDrop();
  if (e.code === 'KeyC') toggleCamera();
  if (!audioFondo.isPlaying && audioFondo.buffer) audioFondo.play();
  if (e.code === 'KeyJ') state.camYawOffset -= 0.1;
  if (e.code === 'KeyK') state.camYawOffset += 0.1;
  if (e.code === 'KeyU') state.camDistance = Math.min(12, Math.max(2, state.camDistance + 0.5));
  if (e.code === 'KeyI') state.camDistance = Math.min(12, Math.max(2, state.camDistance - 0.5));
});
window.addEventListener('keyup', (e) => { state.keys[e.code] = false; });

function updateCameras() {
  if (activeCamera === cameraThird) {
    const target = new THREE.Vector3().copy(refs.player.position).add(new THREE.Vector3(0, 1.2, 0));
    controls.target.copy(target);
    const yaw = (refs.alquimista ? refs.alquimista.rotation.y : 0) + state.camYawOffset;
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-state.camDistance);
    const camPos = new THREE.Vector3().copy(refs.player.position).add(back).add(new THREE.Vector3(0, state.camHeight, 0));
    cameraThird.position.lerp(camPos, 0.25);
    cameraThird.lookAt(target);
  }
  if (activeCamera === cameraTop) {
    cameraTop.position.copy(refs.player.position).add(new THREE.Vector3(0, 10, 0));
    cameraTop.lookAt(new THREE.Vector3().copy(refs.player.position));
  }
}

function toggleCamera() {
  activeCamera = (activeCamera === cameraThird) ? cameraTop : cameraThird;
  const useControls = (activeCamera === cameraThird);
  controls.enabled = useControls;
  cameraThird.remove(audioListener);
  cameraTop.remove(audioListener);
  activeCamera.add(audioListener);
  hint(useControls ? 'Cámara tercera persona' : 'Cámara cenital');
}

// Movimiento del jugador + colisiones simples
function movePlayer(dt) {
  if (!state.loaded) return;
  const speed = state.speed * (state.keys['ShiftLeft'] || state.keys['ShiftRight'] ? state.runMultiplier : 1.0);

  const camForward = new THREE.Vector3();
  activeCamera.getWorldDirection(camForward);
  camForward.y = 0; camForward.normalize();
  const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0,1,0)).negate();

  const yaw = state.facingYaw;
  const chrForward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const chrRight = new THREE.Vector3().crossVectors(chrForward, new THREE.Vector3(0,1,0));

  const dir = new THREE.Vector3();
  if (state.keys['KeyW']) dir.add(camForward);
  if (state.keys['KeyS']) dir.sub(camForward);
  if (state.keys['KeyA']) dir.sub(camRight);
  if (state.keys['KeyD']) dir.add(camRight);
  if (state.keys['ArrowUp']) dir.add(chrForward);
  if (state.keys['ArrowDown']) dir.sub(chrForward);
  if (state.keys['ArrowLeft']) dir.sub(chrRight);
  if (state.keys['ArrowRight']) dir.add(chrRight);
  const movingWithArrows = state.keys['ArrowUp'] || state.keys['ArrowDown'] || state.keys['ArrowLeft'] || state.keys['ArrowRight'];

  if (dir.lengthSq() > 0) {
    dir.normalize().multiplyScalar(speed * dt);
    const nextPos = new THREE.Vector3().copy(refs.player.position).add(dir);
    if (!collides(nextPos)) {
      refs.player.position.copy(nextPos);
    } else {
      const tryX = new THREE.Vector3(refs.player.position.x + dir.x, refs.player.position.y, refs.player.position.z);
      if (!collides(tryX)) refs.player.position.copy(tryX);
      const tryZ = new THREE.Vector3(refs.player.position.x, refs.player.position.y, refs.player.position.z + dir.z);
      if (!collides(tryZ)) refs.player.position.copy(tryZ);
    }
    const targetYaw = Math.atan2(dir.x, dir.z);
    const angleDelta = ((targetYaw - state.facingYaw + Math.PI) % (2 * Math.PI)) - Math.PI;
    state.facingYaw += angleDelta * Math.min(1, state.turnSmooth * dt);
    refs.alquimista.rotation.y = state.facingYaw;

    if (movingWithArrows && sfxCaminar.buffer && !state.walkingSfx) {
      sfxCaminar.play();
      state.walkingSfx = true;
    }
  } else {
    if (state.walkingSfx && sfxCaminar.isPlaying) sfxCaminar.stop();
    state.walkingSfx = false;
  }

  applyGravityAndGround(dt);
  const target = new THREE.Vector3().copy(refs.player.position).add(new THREE.Vector3(0, 1.2, 0));
  controls.target.copy(target);
}

const raycaster = new THREE.Raycaster();
function applyGravityAndGround(dt) {
  if (!refs.piso) return;
  raycaster.set(new THREE.Vector3(refs.player.position.x, refs.player.position.y + 1, refs.player.position.z), new THREE.Vector3(0, -1, 0));
  const intersects = raycaster.intersectObject(refs.piso, true);
  if (intersects.length > 0) {
    const hitY = intersects[0].point.y;
    const deltaY = refs.player.position.y - hitY;
    if (deltaY <= state.groundSnapMax) {
      refs.player.position.y = hitY;
      state.velocityY = 0;
      return;
    }
  }
  state.velocityY += state.gravity * dt;
  refs.player.position.y += state.velocityY * dt;
}

function collides(testPos) {
  const r = state.playerRadius;
  for (const ob of refs.obstacles) {
    const minX = ob.box.min.x - r;
    const maxX = ob.box.max.x + r;
    const minZ = ob.box.min.z - r;
    const maxZ = ob.box.max.z + r;
    if (testPos.x >= minX && testPos.x <= maxX && testPos.z >= minZ && testPos.z <= maxZ) return true;
  }
  return false;
}

function resolveSpawnOverlap() {
  if (!refs.obstacles.length) return;
  const pos = refs.player.position.clone();
  for (const ob of refs.obstacles) {
    const minX = ob.box.min.x - state.playerRadius;
    const maxX = ob.box.max.x + state.playerRadius;
    const minZ = ob.box.min.z - state.playerRadius;
    const maxZ = ob.box.max.z + state.playerRadius;
    if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
      const center = new THREE.Vector3((ob.box.min.x + ob.box.max.x) * 0.5, 0, (ob.box.min.z + ob.box.max.z) * 0.5);
      const dir = new THREE.Vector3().subVectors(pos, center);
      if (dir.lengthSq() === 0) dir.set(1, 0, 0);
      dir.normalize().multiplyScalar(state.playerRadius + 0.3);
      refs.player.position.add(dir);
    }
  }
}

// Interacciones: recoger y soltar
function nearestCollectible(maxDist = 1.5) {
  if (!refs.collectibles.length) return null;
  const p = worldPos(refs.player);
  let best = null; let bestD = Infinity;
  for (const c of refs.collectibles) {
    if (c.taken || c.deposited) continue;
    const d = distance(worldPos(c.obj), p);
    if (d < bestD && d <= maxDist) { bestD = d; best = c; }
  }
  return best;
}

function tryPickup() {
  if (!state.loaded || state.carrying) return;
  const c = nearestCollectible();
  if (!c) { hint('No hay objetos cercanos'); return; }
  refs.handAnchor.attach(c.obj);
  c.taken = true;
  state.carrying = c;
  if (sfxRecoger.buffer) sfxRecoger.play();
  hint(`Recogido ${c.kind}`);
}

function tryDrop() {
  if (!state.loaded || !state.carrying) { hint('No llevas nada'); return; }
  if (!refs.caldero) { hint('No hay caldero en la escena'); return; }
  const pPlayer = worldPos(refs.player);
  const pCaldero = worldPos(refs.caldero);
  const d = distance(pPlayer, pCaldero);
  if (d > 2.2) { hint('Acércate al caldero para soltar'); return; }

  const obj = state.carrying.obj;
  scene.attach(obj);
  tmpBox3.setFromObject(refs.caldero);
  const dropX = pCaldero.x + (Math.random() - 0.5) * 0.4;
  const dropZ = pCaldero.z + (Math.random() - 0.5) * 0.4;
  const dropY = tmpBox3.max.y + 0.15;
  obj.position.set(dropX, dropY, dropZ);
  state.carrying.deposited = true;
  if (state.carrying.kind === 'cristal') state.collected.cristales += 1;
  if (state.carrying.kind === 'seta') state.collected.setas += 1;
  scoreEl.textContent = `Cristales: ${state.collected.cristales} · Setas: ${state.collected.setas}`;
  if (sfxSoltar.buffer) sfxSoltar.play();
  hint(`Depositado ${state.carrying.kind} en el caldero`);
  state.carrying = null;
}

// Mensajes de ayuda temporales
let hintTimeout = null;
function hint(msg) {
  clearTimeout(hintTimeout);
  hintEl.textContent = msg;
  hintEl.style.opacity = '1';
  hintTimeout = setTimeout(() => { hintEl.style.opacity = '0.85'; }, 1500);
}

// Bucle principal
function animate() {
  const dt = clock.getDelta();
  movePlayer(dt);
  updateCameras();
  controls.update();
  renderer.render(scene, activeCamera);
  requestAnimationFrame(animate);
}
animate();

// Resize del lienzo
window.addEventListener('resize', () => {
  cameraThird.aspect = window.innerWidth / window.innerHeight;
  cameraThird.updateProjectionMatrix();
  cameraTop.aspect = window.innerWidth / window.innerHeight;
  cameraTop.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
