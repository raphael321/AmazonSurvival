import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { Input } from '../../game/src/engine/input.js';
import { Player } from '../../game/src/entities/player.js';
import { Capybara } from '../../game/src/entities/capybara.js';
import { drawHud } from '../../game/src/systems/hud.js';
import { Popups, drawHeart } from '../../game/src/art/fx.js';
import { World3D } from './world3d.js';
import { DEFAULTS3D } from './field.js';
import { PlayerMesh, CapybaraMesh } from './actors3d.js';
import { toon } from './toon.js';
import { loadModels } from './assets.js';
import { GameMap } from './map3d.js';

// Piloto 3D do Amazon Survival (Three.js). Reaproveita do 2D: gerador Perlin, esqueleto
// com IK, lógica do jogador e da capivara, HUD. Coordenadas do jogo -> three: (x, z, y).

const STORE = 'amazon-survival-3d:params:v1';
const loadParams = () => {
  try { return { ...DEFAULTS3D, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch (e) { return { ...DEFAULTS3D }; }
};
const saveParams = (p) => { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) { /* sem armazenamento */ } };

// ---------- renderer, cena, luz ----------
const host = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);
const hud = document.getElementById('hud');
const hctx = hud.getContext('2d');

const SKY = new THREE.Color('#aab98c');
const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 1400, 3600);

const hemi = new THREE.HemisphereLight('#e8f0d0', '#4a3a24', 1.4);
scene.add(hemi);
// sol do topo-esquerda da tela (oeste no mundo), quente de fim de tarde
const sun = new THREE.DirectionalLight('#ffe2a8', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1100, right: 1100, top: 1100, bottom: -1100, near: 50, far: 4000 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.5;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.85, 1.1, -0.15).normalize();

// água: plano que acompanha o jogador na altura 0
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
  toon('#7a5f38', { transparent: true, opacity: 0.86 }),
);
water.receiveShadow = true;
scene.add(water);

const camera = new THREE.PerspectiveCamera(32, 1, 10, 9000);

// ---------- mundo e entidades ----------
const params = loadParams();
const world = new World3D(scene, params);
const input = new Input(renderer.domElement);
const spawn = world.findSpawn(0, 0);
const player = new Player(...spawn);
const capy = new Capybara(...world.findSpawn(spawn[0] + 220, spawn[1] + 160));
player.z = world.groundZ(...spawn);
capy.z = world.groundZ(capy.x, capy.y);
// pés pisam no relevo de verdade (altura relativa à base do corpo)
player.rig.groundRel = (x, y) => world.groundAt(x, y, player.z) - player.z;
capy.rig.groundRel = (x, y) => world.groundAt(x, y, capy.z) - capy.z;
player.height = 88; // cápsula de colisão
capy.height = 52;
// modelos 3D carregam em segundo plano: o mundo abre na hora e eles aparecem ao chegar
loadModels(window.__ASSET_BASE || '').then((m) => { world.setModels(m); world.addShowcase(spawn[0], spawn[1], [0, 2, 3]); }).catch((e) => console.warn('modelos não carregaram', e));
const gameMap = new GameMap(world);
const playerMesh = new PlayerMesh(scene);
const capyMesh = new CapybaraMesh(scene);
const popups = new Popups();
const view = { distance: 1150, pitch: 38, fly: false, shadows: true };

// ---------- painel (Tweakpane) ----------
const pane = new Pane({ title: 'Mundo (`)', expanded: true });
pane.element.parentElement.style.zIndex = 30;
const stats = { fps: 60, chunks: 0, fila: 0, msChunk: 0, draws: 0 };
const mon = pane.addFolder({ title: 'Monitor' });
mon.addBinding(stats, 'fps', { readonly: true, view: 'graph', min: 0, max: 90 });
mon.addBinding(stats, 'chunks', { readonly: true, format: (v) => v.toFixed(0) });
mon.addBinding(stats, 'fila', { readonly: true, format: (v) => v.toFixed(0) });
mon.addBinding(stats, 'msChunk', { readonly: true, label: 'ms/chunk', format: (v) => v.toFixed(1) });
mon.addBinding(stats, 'draws', { readonly: true, label: 'draw calls', format: (v) => v.toFixed(0) });
const groups = [
  ['Terreno', [
    ['Ruído', [['frequency', 'frequência', 0.005, 0.15, 0.001], ['octaves', 'oitavas', 1, 8, 1], ['persistence', 'persistência', 0.1, 0.9, 0.01], ['lacunarity', 'lacunaridade', 1.2, 3.5, 0.05]]],
    ['Forma', [['maxHeight', 'altura máx.', 1, 20, 0.5], ['heightExponent', 'expoente', 0.4, 4, 0.05], ['waterLevel', 'nível da água', 0, 8, 0.1], ['heightScale', 'escala vertical', 0.3, 3, 0.05], ['terrace', 'degraus', 0, 1, 0.05], ['rockLine', 'linha da rocha', 0.2, 1, 0.01], ['maxSlope', 'subida máx.', 0.3, 3, 0.05]]],
    ['Rios', [['riverScale', 'tamanho das curvas', 10, 160, 1], ['riverWidth', 'largura', 0, 0.2, 0.005], ['bridges', 'pontes (chance)', 0, 1, 0.05], ['bridgeSpan', 'vão máx. da ponte', 150, 900, 10]]],
  ]],
  ['Bioma', [
    ['Mata fechada', [['forestScale', 'tamanho', 4, 80, 1], ['forestAmount', 'quantidade', 0, 0.7, 0.01]]],
    ['Objetos', [['samauma', 'samaúmas', 0, 0.03, 0.001], ['acai', 'açaizeiros', 0, 0.2, 0.005], ['bush', 'moitas', 0, 0.25, 0.005], ['camu', 'camu-camu', 0, 0.8, 0.01], ['rock', 'pedras', 0, 0.15, 0.005], ['forestTrees', 'árvores na mata', 0, 1, 0.05], ['deco', 'troncos e tocos', 0, 0.15, 0.005], ['build', 'construções', 0, 0.1, 0.002]]],
  ]],
];
let rebuildTimer;
const rebuild = () => {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    saveParams(params);
    world.setParams(params);
    // se o novo relevo enterrou alguém, procura chão firme por perto
    if (!world.isFree(player.x, player.y, 14)) [player.x, player.y] = world.findSpawn(player.x, player.y);
    if (!world.isFree(capy.x, capy.y, 22)) [capy.x, capy.y] = world.findSpawn(player.x + 150, player.y + 150);
    capy.home = [capy.x, capy.y];
    if (world.pool.models) world.addShowcase(player.x, player.y, [0, 2, 3]);
  }, 150);
};
for (const [title, subs] of groups) {
  const f = pane.addFolder({ title, expanded: title === 'Terreno' });
  for (const [st, items] of subs) {
    const s = f.addFolder({ title: st });
    for (const [key, label, min, max, step] of items) s.addBinding(params, key, { label, min, max, step }).on('change', rebuild);
  }
}
const camF = pane.addFolder({ title: 'Câmera e mundo', expanded: false });
camF.addBinding(view, 'distance', { label: 'distância', min: 400, max: 4000, step: 10 });
camF.addBinding(view, 'pitch', { label: 'inclinação', min: 15, max: 80, step: 1 });
camF.addBinding(view, 'fly', { label: 'modo voo' });
camF.addBinding(view, 'shadows', { label: 'sombras' }).on('change', () => { sun.castShadow = view.shadows; });
camF.addBinding(params, 'seed', { label: 'seed', min: 1, max: 99999, step: 1 }).on('change', rebuild);
camF.addButton({ title: 'Nova seed' }).on('click', () => { params.seed = 1 + Math.floor(Math.random() * 99998); pane.refresh(); rebuild(); });
camF.addButton({ title: 'Padrão' }).on('click', () => { Object.assign(params, DEFAULTS3D); pane.refresh(); rebuild(); });
camF.addButton({ title: 'Copiar JSON' }).on('click', () => navigator.clipboard?.writeText(JSON.stringify(params, null, 2)).catch(() => {}));
pane.hidden = true;
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote' || e.code === 'F1') { e.preventDefault(); pane.hidden = !pane.hidden; }
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.distance = Math.max(400, Math.min(4000, view.distance * (1 + Math.sign(e.deltaY) * 0.1)));
  pane.refresh();
}, { passive: false });

// ---------- tamanho ----------
let sw = 0, sh = 0;
function resize() {
  sw = host.clientWidth || innerWidth;
  sh = host.clientHeight || innerHeight;
  if (!sw || !sh) return;
  renderer.setSize(sw, sh, false);
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  hud.width = Math.round(sw * dpr);
  hud.height = Math.round(sh * dpr);
  camera.aspect = sw / sh;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
addEventListener('resize', resize);
resize();

// ---------- jogo ----------
const target = new THREE.Vector3();
const toScreen = (x, y, z) => {
  const v = new THREE.Vector3(x, z, y).project(camera);
  return [(v.x * 0.5 + 0.5) * sw, (-v.y * 0.5 + 0.5) * sh, v.z < 1];
};
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function aimAtMouse() {
  aimPlane.constant = -(player.z + 20);
  raycaster.setFromCamera(new THREE.Vector2((input.mouse.x / sw) * 2 - 1, -(input.mouse.y / sh) * 2 + 1), camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(aimPlane, hit) ? [hit.x, hit.z] : [player.x + 1, player.y];
}

function onStrike(p) {
  const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
  const dx = capy.x - p.x, dy = capy.y - p.y, d = Math.hypot(dx, dy);
  if (d < 75 && (dx * fx + dy * fy) / (d || 1) > 0.2) {
    capy.hitBy(p);
    const [x, y] = toScreen(capy.x, capy.y, capy.z + 55);
    popups.add(x, y, capy.tamed ? 'Ei!' : 'Ela perdeu a confiança', { color: '#f29a4b' });
  }
}

function interact() {
  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  const at = toScreen(capy.x, capy.y, capy.z + 55);
  if (dCapy < 85) {
    if (capy.tamed && capy.state !== 'eat') { popups.add(at[0], at[1], '', { heart: true, life: 1 }); return; }
    const res = capy.offer(player);
    if (res === 'comeu') popups.add(at[0], at[1], `+1 confiança (${capy.trust}/3)`, { heart: true });
    else if (res === 'domada') popups.add(at[0], at[1], 'Capivara domada!', { heart: true, life: 2.2, color: '#9fd16b' });
    else if (res === 'assustou') popups.add(at[0], at[1], 'Devagar... não corra', { color: '#f29a4b' });
    else if (res === 'sem-fruta') { const s = toScreen(player.x, player.y, player.z + 95); popups.add(s[0], s[1], 'Sem frutas — colha camu-camu', { color: '#f29a4b' }); }
    return;
  }
  const bush = world.nearestFruitBush(player.x, player.y, 80);
  if (bush) {
    world.pick(bush);
    player.fruits++;
    const s = toScreen(player.x, player.y, player.z + 95);
    popups.add(s[0], s[1], '+1 camu-camu', { color: '#f29a4b' });
  }
}

let hint = '', fps = 60, fpsAcc = 0, fpsN = 0, last = performance.now(), reported = false;

// a entrada é relativa à tela: com a câmera em 45° vale a mesma conversão do isométrico
const wrapInput = {
  get mouse() { return input.mouse; },
  get clicked() { return input.clicked; },
  down: (...c) => input.down(...c),
  hit: (...c) => input.hit(...c),
  axis: () => input.axis(),
};

function update(dt) {
  player.noclip = view.fly;
  player.speedMul = view.fly ? 4 : 1;
  world.update(dt, player.x, player.y);
  player.update(dt, wrapInput, world, aimAtMouse(), onStrike);
  capy.update(dt, world, player);
  if (input.hit('KeyE')) interact();
  popups.update(dt);

  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  hint = '';
  if (dCapy < 85 && capy.state !== 'flee') hint = capy.tamed ? 'E — fazer carinho' : player.fruits > 0 ? 'E — oferecer camu-camu' : 'Você precisa de camu-camu (moitas com frutinhas vermelhas)';
  else if (world.nearestFruitBush(player.x, player.y, 80)) hint = 'E — colher camu-camu';

  // câmera 3/4 a 45° (sudeste olhando para noroeste), segue suave
  target.lerp(new THREE.Vector3(player.x, player.z + 40, player.y), 1 - Math.exp(-dt * 6));
  const p = THREE.MathUtils.degToRad(view.pitch), D = view.distance;
  camera.position.set(target.x + Math.cos(p) * D * 0.7071, target.y + Math.sin(p) * D, target.z + Math.cos(p) * D * 0.7071);
  camera.lookAt(target);
  scene.fog.near = D * 1.1;
  scene.fog.far = D * 3.2;
  sun.position.copy(target).addScaledVector(SUN_DIR, 1800);
  sun.target.position.copy(target);
  water.position.set(Math.round(target.x / 500) * 500, 0, Math.round(target.z / 500) * 500);
  playerMesh.update(player);
  capyMesh.update(capy);
  gameMap.update(dt, player);
}

function drawOverlay() {
  const dpr = hud.width / sw;
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hctx.clearRect(0, 0, sw, sh);
  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  if (!capy.tamed && dCapy < 240) {
    const [x, y, ok] = toScreen(capy.x, capy.y, capy.z + 62);
    if (ok) for (let i = 0; i < 3; i++) drawHeart(hctx, x - 16 + i * 16, y, 0.75, i < capy.trust);
  }
  popups.draw(hctx);
  drawHud(hctx, sw, sh, { player, capy, hint, fps, showFps: true });
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!sw || !sh) { last = now; return; }
  try {
    const dt = Math.min(0.05, (now - last) / 1000);
    fpsAcc += now - last;
    fpsN++;
    last = now;
    if (fpsAcc > 500) { fps = (fpsN * 1000) / fpsAcc; fpsAcc = 0; fpsN = 0; }
    update(dt);
    renderer.render(scene, camera);
    drawOverlay();
    input.endFrame();
    Object.assign(stats, { fps, chunks: world.streamer.chunks.size, fila: world.streamer.stats.queue, msChunk: world.streamer.stats.ms, draws: renderer.info.render.calls });
  } catch (err) {
    if (!reported) { reported = true; console.error(err); window.__showError?.(String(err.stack || err)); }
  }
}
requestAnimationFrame(frame);

window.__game = { gameMap, world, player, capy, camera, renderer, scene, view, params, get fps() { return fps; } };
