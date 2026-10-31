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
import { Dinos } from './dinos.js';
import { loadModels } from './assets.js';
import { GameMap } from './map3d.js';
import { updateWind, windSettings } from './wind.js';
import { Grass, grassSettings } from './grass.js';
import { Water } from './water.js';
import { WindTrails, Campfire } from './fx3d.js';
import { GameCamera } from './camera3d.js';
import { Fish } from './fish.js';
import { Sky, SKY } from './sky.js';

// Piloto 3D do Amazon Survival (Three.js). Reaproveita do 2D: gerador Perlin, esqueleto
// com IK, lógica do jogador e da capivara, HUD. Coordenadas do jogo -> three: (x, z, y).

const STORE = 'amazon-survival-3d:params:v2'; // v2: novos padrões (relevo alto, mata espaçada)
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

const scene = new THREE.Scene();
// perspectiva atmosférica: o longe se funde na cor do horizonte do céu
scene.background = SKY.horizon;
scene.fog = new THREE.FogExp2(SKY.horizon, 0.00022);

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


const camera = new THREE.PerspectiveCamera(55, 1, 5, 14000);
const gameCam = new GameCamera(camera, renderer.domElement);
const sky = new Sky(scene, SUN_DIR);

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
player.swimDepth = -50; // nadando: água no peito
capy.swimDepth = -22; // capivara nada com o lombo de fora
// modelos 3D carregam em segundo plano: o mundo abre na hora e eles aparecem ao chegar
loadModels(window.__ASSET_BASE || '').then((m) => { world.setModels(m); dinos.models = m; world.addShowcase(spawn[0], spawn[1], [0, 2, 3]); }).catch((e) => console.warn('modelos não carregaram', e));
const gameMap = new GameMap(world);
// clima: água com rio correndo, gramado em volta do personagem, traços de vento e fogueira
const water = new Water(scene, world);
const grass = new Grass(scene, world);
const trails = new WindTrails(scene, world);
const fish = new Fish(scene, world);
const fireSpot = world.findSpawn(spawn[0] - 220, spawn[1] + 120);
const campfire = new Campfire(scene, world, fireSpot[0], fireSpot[1]);
const playerMesh = new PlayerMesh(scene);
const capyMesh = new CapybaraMesh(scene);
const popups = new Popups();
// dinossauros (Ecos do Cretáceo): um de cada perto do começo, depois a população se mantém em volta
const dinos = new Dinos(scene, world);
dinos.showcase(spawn[0], spawn[1]);
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
    ['Rios', [['riverScale', 'tamanho das curvas', 10, 160, 1], ['riverWidth', 'largura', 0, 0.2, 0.005], ['bridges', 'pontes (chance)', 0, 1, 0.05], ['bridgeSpan', 'vão máx. da ponte', 150, 900, 10], ['blackWater', 'rios azuis (fração)', 0, 1, 0.05]]],
  ]],
  ['Bioma', [
    ['Mata fechada', [['forestScale', 'tamanho', 4, 80, 1], ['forestAmount', 'quantidade', 0, 0.7, 0.01]]],
    ['Objetos', [['samauma', 'samaúmas', 0, 0.03, 0.001], ['acai', 'açaizeiros', 0, 0.2, 0.005], ['bush', 'moitas', 0, 0.25, 0.005], ['camu', 'camu-camu', 0, 0.8, 0.01], ['rock', 'pedras', 0, 0.15, 0.005], ['forestTrees', 'árvores na mata', 0, 1, 0.05], ['deco', 'troncos e tocos', 0, 0.15, 0.005], ['build', 'construções', 0, 0.1, 0.002], ['cliffs', 'penhascos', 0, 1, 0.05]]],
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
    grass.reset();
    water.reset();
  }, 150);
};
for (const [title, subs] of groups) {
  const f = pane.addFolder({ title, expanded: title === 'Terreno' });
  for (const [st, items] of subs) {
    const s = f.addFolder({ title: st });
    for (const [key, label, min, max, step] of items) s.addBinding(params, key, { label, min, max, step }).on('change', rebuild);
  }
}
const windF = pane.addFolder({ title: 'Vento e grama', expanded: false });
windF.addBinding(windSettings, 'strength', { label: 'força do vento', min: 0, max: 2.5, step: 0.05 });
windF.addBinding(windSettings, 'direction', { label: 'direção (°)', min: 0, max: 360, step: 1 });
windF.addBinding(windSettings, 'gust', { label: 'rajadas', min: 0, max: 1, step: 0.05 });
windF.addBinding(grassSettings, 'radius', { label: 'raio da grama', min: 250, max: 1600, step: 10 });
windF.addBinding(grassSettings, 'density', { label: 'densidade', min: 0, max: 2, step: 0.05 }).on('change', () => grass.reset());
windF.addBinding(grassSettings, 'height', { label: 'altura', min: 0.3, max: 2, step: 0.05 });
const camF = pane.addFolder({ title: 'Câmera e mundo', expanded: false });
camF.addBinding(gameCam, 'dist', { label: 'distância (3ª pessoa)', min: 160, max: 1200, step: 10 });
camF.addBinding(gameCam, 'sens', { label: 'sensibilidade do mouse', min: 0.0008, max: 0.006, step: 0.0001 });
camF.addBinding(scene.fog, 'density', { label: 'névoa', min: 0, max: 0.0008, step: 0.00001 });
camF.addBinding(dinos, 'enabled', { label: 'dinossauros' });
// cor da água fica salva junto com os outros ajustes (sem botão: grava sozinho ao mudar)
if (params.aguaReal === undefined) params.aguaReal = 1;
water.uniforms.uFiel.value = params.aguaReal;
camF.addBinding(params, 'aguaReal', { label: 'rios barrentos (0 = só azul)', min: 0, max: 1, step: 0.05 }).on('change', (e) => { water.uniforms.uFiel.value = e.value; saveParams(params); });
camF.addBinding(view, 'fly', { label: 'modo voo' });
camF.addBinding(view, 'shadows', { label: 'sombras' }).on('change', () => { sun.castShadow = view.shadows; });
camF.addBinding(params, 'seed', { label: 'seed', min: 1, max: 99999, step: 1 }).on('change', rebuild);
camF.addButton({ title: 'Nova seed' }).on('click', () => { params.seed = 1 + Math.floor(Math.random() * 99998); pane.refresh(); rebuild(); });
camF.addButton({ title: 'Padrão' }).on('click', () => { Object.assign(params, DEFAULTS3D); pane.refresh(); rebuild(); });
camF.addButton({ title: 'Copiar JSON' }).on('click', () => navigator.clipboard?.writeText(JSON.stringify(params, null, 2)).catch(() => {}));
pane.hidden = true;
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote' || e.code === 'F1') { e.preventDefault(); pane.hidden = !pane.hidden; }
  if (e.code === 'KeyV') gameCam.toggle(); // terceira pessoa <-> visão tática
});

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
  // golpe acerta o dinossauro que está à frente (perto do corpo, do quadril à boca)
  for (const d of dinos.list) {
    if (!d.pelvis || !d.mouth) continue;
    const ax = d.pelvis[0], ay = d.pelvis[1], bx = d.mouth[0], by = d.mouth[1];
    const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, dd = Math.hypot(cx - p.x, cy - p.y);
    if (dd < (d.bodyR || 40) + 70 && ((cx - p.x) * fx + (cy - p.y) * fy) / (dd || 1) > 0.1) {
      const calm = !d.sp.aggressive && !(d.angry > 0);
      d.provoke();
      const [x, y] = toScreen(cx, cy, p.z + 120);
      popups.add(x, y, calm ? `${d.sp.nome} ficou furioso!` : 'Golpe!', { color: '#e2553d' });
    }
  }
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
  // WASD relativo à câmera: W anda para onde a câmera olha. O Player converte "direção de tela"
  // pela projeção isométrica; aqui entregamos a direção já invertida dessa conversão.
  axis: () => {
    const [ax, ay] = input.axis();
    if (!ax && !ay) return [0, 0];
    const { fwd, right } = gameCam.basis();
    const wx = fwd[0] * -ay + right[0] * ax, wy = fwd[1] * -ay + right[1] * ax;
    return [(wx - wy) * 0.7071, (wx + wy) * 0.41];
  },
};

function update(dt) {
  player.noclip = view.fly;
  player.speedMul = view.fly ? 4 : player.swimming ? 0.55 : 1;
  world.update(dt, player.x, player.y);
  // golpe: na 3ª pessoa vai para onde a câmera olha; na tática, para o mouse
  player.update(dt, wrapInput, world, gameCam.mode === 'terceira' ? gameCam.aim(player.x, player.y) : aimAtMouse(), onStrike);
  capy.update(dt, world, player);
  const dinoEvents = [];
  dinos.update(dt, player, dinoEvents);
  for (const ev of dinoEvents) {
    // mordida: dano e empurrão; sem vida, acorda de volta no acampamento
    const d = ev.dino, s = toScreen(player.x, player.y, player.z + 95);
    player.hp = Math.max(0, player.hp - d.sp.bite);
    const kx = player.x - d.x, ky = player.y - d.y, kl = Math.hypot(kx, ky) || 1;
    for (let k = 0; k < 6; k++) { const px = player.x, py = player.y; player.x += (kx / kl) * 14; player.y += (ky / kl) * 14; world.resolve(player, 14, px, py); }
    popups.add(s[0], s[1], `-${d.sp.bite} ${d.sp.nome}!`, { color: '#e2553d' });
    if (player.hp <= 0) {
      [player.x, player.y] = world.findSpawn(fireSpot[0] + 80, fireSpot[1]);
      player.z = world.groundZ(player.x, player.y);
      player.hp = player.maxHp;
      const t = toScreen(player.x, player.y, player.z + 95);
      popups.add(t[0], t[1], 'Você desmaiou e acordou no acampamento', { color: '#f29a4b', life: 3 });
    }
  }
  // vida volta devagar
  player.hp = Math.min(player.maxHp, player.hp + dt * 1.5);
  if (input.hit('KeyE')) interact();
  popups.update(dt);

  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  hint = '';
  if (dCapy < 85 && capy.state !== 'flee') hint = capy.tamed ? 'E — fazer carinho' : player.fruits > 0 ? 'E — oferecer camu-camu' : 'Você precisa de camu-camu (moitas com frutinhas vermelhas)';
  else if (world.nearestFruitBush(player.x, player.y, 80)) hint = 'E — colher camu-camu';
  else {
    const d = dinos.nearest(player.x, player.y, 700);
    if (d) hint = d.state === 'chase' ? `${d.sp.nome} está atacando — corra!` : d.sp.aggressive ? `${d.sp.nome} — carnívoro, fique longe.` : d.angry > 0 ? `${d.sp.nome} está furioso!` : `${d.sp.nome} — herbívoro, só ataca se for atacado.`;
  }

  // câmera 3/4 a 45° (sudeste olhando para noroeste), segue suave
  const fov = gameCam.mode === 'terceira' ? 55 : 32;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  gameCam.update(dt, player.x, player.y, player.z, (x, y) => world.groundZ(x, y));
  // árvore entre a câmera e o personagem some (a colisão física continua valendo)
  if (gameCam.mode === 'terceira') {
    const ax = camera.position.x, ay = camera.position.z, bx = player.x, by = player.y;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const hide = new Set();
    for (const p of world.streamer.propsNear((ax + bx) / 2, (ay + by) / 2, len / 2 + 120)) {
      if (p.kind !== 'samauma' && p.kind !== 'acai' && p.kind !== 'forest' && p.kind !== 'cliff') continue;
      const u = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / (len * len)));
      if (u > 0.92) continue; // atrás do personagem não atrapalha
      const dd = Math.hypot(p.x - (ax + (bx - ax) * u), p.y - (ay + (by - ay) * u));
      if (dd < (p.kind === 'samauma' ? 150 : p.kind === 'forest' ? 70 : p.kind === 'cliff' ? p.foot * 0.8 : 30)) hide.add(p.id);
    }
    world.pool.setHidden(hide);
  } else world.pool.setHidden(new Set());
  target.copy(gameCam.target);
  sky.update(world.time, camera);
  sun.position.copy(target).addScaledVector(SUN_DIR, 1800);
  sun.target.position.copy(target);
  updateWind(world.time);
  water.update(player.x, player.y);
  grass.update(player.x, player.y, player.z);
  trails.update(dt, world.time, player.x, player.y);
  fish.update(dt, world.time, player.x, player.y);
  campfire.update(dt, world.time, camera, sh);
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

window.__game = { dinos, fish, gameCam, sky, grass, grassSettings, windSettings, water, trails, campfire, gameMap, world, player, capy, camera, renderer, scene, view, params, get fps() { return fps; } };
