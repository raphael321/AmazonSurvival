import { Input } from './engine/input.js';
import { clamp } from './engine/math.js';
import { toView, groundFromView, sortKey } from './engine/projection.js';
import { World } from './world/world.js';
import { DebugPanel, loadParams } from './systems/debug.js';
import { setDeviceScale } from './art/sprite.js';
import { T } from './world/gen.js';
import { CHUNK } from './world/terrain.js';
import { Player } from './entities/player.js';
import { Capybara } from './entities/capybara.js';
import { paintPlayer } from './art/player-art.js';
import { paintCapybara } from './art/capybara-art.js';
import { Popups, drawHeart } from './art/fx.js';
import { drawHud } from './systems/hud.js';
import { Lighting, drawVignette } from './art/lighting.js';
import { BG } from './world/terrain.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const params = new URLSearchParams(location.search);

const world = new World(loadParams());
const spawn = world.findSpawn(0, 0);
const player = new Player(...spawn);
const capy = new Capybara(...world.findSpawn(spawn[0] + 200, spawn[1] + 200));
const lighting = new Lighting(world);
const dbgFlags = { grid: false, fly: false, light: true, tiles: false };
const debug = new DebugPanel({
  params: world.params,
  toggles: dbgFlags,
  onChange: (p) => {
    world.setParams(p);
    world.setScale(rs);
    // se o novo mundo enterrou o jogador, procura chão firme por perto
    if (!world.isFree(player.x, player.y, 14)) [player.x, player.y] = world.findSpawn(player.x, player.y);
    if (!world.isFree(capy.x, capy.y, 22)) [capy.x, capy.y] = world.findSpawn(player.x + 120, player.y + 120);
    capy.home = [capy.x, capy.y];
  },
});
let drawn = 0;
const popups = new Popups();
const camTarget = () => { const v = toView(player.x, player.y, 40); return v; };
const cam = { x: camTarget()[0], y: camTarget()[1] };

let sw = 0, sh = 0, dpr = 1, zoom = 1, rs = 0;
let showFps = params.has('debug');
let fps = 60, fpsAcc = 0, fpsFrames = 0;
let hint = '';

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  // mede o próprio canvas: dentro de um iframe a janela pode começar com tamanho 0
  sw = canvas.clientWidth || window.innerWidth;
  sh = canvas.clientHeight || window.innerHeight;
  if (!sw || !sh) return; // ainda sem tamanho: o ResizeObserver chama de novo
  canvas.width = Math.round(sw * dpr);
  canvas.height = Math.round(sh * dpr);
  // escala de renderização em degraus de 0.25, e o zoom se ajusta a ela: sprites e chunks
  // são copiados 1:1 na tela (sem reamostrar a cada quadro) e não repintam à toa
  // teto de 2: acima disso cada chunk passa de 4 MB e telas grandes estouram a memória de canvas
  const nrs = clamp(Math.round(dpr * clamp(Math.sqrt(sw * sh) / 720, 0.85, 2) * 4) / 4, 0.75, 2);
  zoom = nrs / dpr;
  if (nrs !== rs) {
    rs = nrs;
    world.setScale(rs);
  }
  setDeviceScale(rs);
}
let resizeTimer;
const onResize = () => {
  clearTimeout(resizeTimer);
  // primeira medida válida é imediata; as seguintes esperam o usuário parar de redimensionar
  if (!sw || !sh) resize();
  else resizeTimer = setTimeout(resize, 150);
};
window.addEventListener('resize', onResize);
if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);
resize();

const viewToWorld = (mx, my) => {
  const vx = (mx - sw / 2) / zoom + cam.x;
  const vy = (my - sh / 2) / zoom + cam.y;
  return groundFromView(vx, vy);
};
const headPos = (e, h) => { const v = toView(e.x, e.y); return [v[0], v[1] - h]; };

function onStrike(p) {
  const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
  world.strike(p.x, p.y, fx, fy, 60);
  const dx = capy.x - p.x, dy = capy.y - p.y, d = Math.hypot(dx, dy);
  if (d < 75 && (dx * fx + dy * fy) / (d || 1) > 0.2) {
    capy.hitBy(p);
    popups.add(...headPos(capy, 52), capy.tamed ? 'Ei!' : 'Ela perdeu a confiança', { color: '#f29a4b' });
  }
}

function interact() {
  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  if (dCapy < 85) {
    if (capy.tamed && capy.state !== 'eat') {
      popups.add(...headPos(capy, 50), '', { heart: true, life: 1 });
      return;
    }
    const res = capy.offer(player);
    const at = headPos(capy, 52);
    if (res === 'comeu') popups.add(...at, `+1 confiança (${capy.trust}/3)`, { heart: true });
    else if (res === 'domada') popups.add(...at, 'Capivara domada!', { heart: true, life: 2.2, color: '#9fd16b' });
    else if (res === 'assustou') popups.add(...at, 'Devagar... não corra', { color: '#f29a4b' });
    else if (res === 'sem-fruta') popups.add(...headPos(player, 95), 'Sem frutas — colha camu-camu', { color: '#f29a4b' });
    return;
  }
  const bush = world.nearestFruitBush(player.x, player.y, 80);
  if (bush) {
    world.pick(bush);
    player.fruits++;
    popups.add(...headPos(player, 95), '+1 camu-camu', { color: '#f29a4b' });
  }
}

function update(dt) {
  const aim = viewToWorld(input.mouse.x, input.mouse.y);
  world.update(dt);
  player.noclip = dbgFlags.fly;
  player.speedMul = dbgFlags.fly ? 4 : 1;
  lighting.on.shafts = lighting.on.dust = dbgFlags.light;
  player.update(dt, input, world, aim, onStrike);
  capy.update(dt, world, player);
  if (input.hit('KeyE')) interact();
  if (input.hit('F3')) showFps = !showFps;
  popups.update(dt);

  // dica de contexto
  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  hint = '';
  if (dCapy < 85 && capy.state !== 'flee') {
    if (capy.tamed) hint = 'E — fazer carinho';
    else if (player.fruits > 0) hint = 'E — oferecer camu-camu';
    else hint = 'Você precisa de camu-camu (arbustos na beira do rio)';
  } else if (world.nearestFruitBush(player.x, player.y, 80)) hint = 'E — colher camu-camu';
  else if (!capy.tamed && dCapy < 260 && player.running) hint = 'Correndo assusta a capivara. Ande devagar.';

  // câmera segue o jogador com suavização
  const [tx, ty] = camTarget();
  const k = 1 - Math.exp(-dt * (dbgFlags.fly ? 12 : 6));
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  debug.update(dt, { fps, drawn }, world, player);
}

function render() {
  const ox = Math.round(canvas.width / 2 - cam.x * dpr * zoom);
  const oy = Math.round(canvas.height / 2 - cam.y * dpr * zoom);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, ox, oy);
  const view = {
    x0: cam.x - sw / 2 / zoom, x1: cam.x + sw / 2 / zoom,
    y0: cam.y - sh / 2 / zoom, y1: cam.y + sh / 2 / zoom,
  };
  ctx.fillStyle = BG;
  ctx.fillRect(view.x0 - 2, view.y0 - 2, view.x1 - view.x0 + 4, view.y1 - view.y0 + 4);
  // streaming: só existe o que está perto da câmera
  world.stream(view, 6);
  world.drawGround(ctx, view);
  if (dbgFlags.tiles) drawTileGrid(view);

  const list = world.drawables(view, player);
  drawn = list.length;
  list.push({ key: sortKey(player.x, player.y), draw: (g) => paintPlayer(g, player.pose, player.trail) });
  list.push({ key: sortKey(capy.x, capy.y), draw: (g) => paintCapybara(g, capy.pose) });
  list.sort((a, b) => a.key - b.key);
  for (const d of list) d.draw(ctx);
  const rect = world.viewToGroundRect(view, 400);
  lighting.apply(ctx, view, world.time, rect);
  if (dbgFlags.grid) drawChunkGrid(view);

  // corações de confiança sobre a capivara quando o jogador está perto
  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  if (!capy.tamed && dCapy < 240) {
    const [hx, hy] = headPos(capy, 58);
    for (let i = 0; i < 3; i++) drawHeart(ctx, hx - 16 + i * 16, hy, 0.75, i < capy.trust);
  }
  popups.draw(ctx);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawVignette(ctx, sw, sh);
  drawHud(ctx, sw, sh, { player, capy, hint, fps, showFps });
}

// ---------- sobreposições do debugger ----------
function drawChunkGrid(view) {
  ctx.save();
  ctx.lineWidth = 2 / zoom;
  ctx.font = `${12 / zoom}px ui-monospace, monospace`;
  for (let iy = Math.floor(view.y0 / CHUNK); iy <= Math.floor(view.y1 / CHUNK); iy++)
    for (let ix = Math.floor(view.x0 / CHUNK); ix <= Math.floor(view.x1 / CHUNK); ix++) {
      const c = world.chunks.get(ix + ',' + iy);
      const fresh = c && world.frame - c.born < 30;
      ctx.strokeStyle = fresh ? 'rgba(242,196,107,0.95)' : 'rgba(244,234,210,0.55)';
      ctx.strokeRect(ix * CHUNK, iy * CHUNK, CHUNK, CHUNK);
      ctx.fillStyle = 'rgba(244,234,210,0.85)';
      ctx.fillText(`chunk ${ix},${iy}`, ix * CHUNK + 8 / zoom, iy * CHUNK + 18 / zoom);
    }
  ctx.restore();
}

function drawTileGrid(view) {
  const [x0, y0, x1, y1] = world.viewToGroundRect(view, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(244,234,210,0.18)';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (let i = Math.floor(x0 / T); i <= Math.ceil(x1 / T); i++) {
    const a = toView(i * T, y0), b = toView(i * T, y1);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  for (let j = Math.floor(y0 / T); j <= Math.ceil(y1 / T); j++) {
    const a = toView(x0, j * T), b = toView(x1, j * T);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.restore();
}

let last = performance.now();
let reported = false;
function frame(now) {
  // agenda o próximo quadro antes de tudo: um erro isolado não pode parar o jogo
  requestAnimationFrame(frame);
  if (!sw || !sh || !rs) { last = now; return; }
  try {
    step(now);
  } catch (err) {
    if (!reported) {
      reported = true;
      console.error(err);
      if (window.__showError) window.__showError(String(err.stack || err));
    }
  }
}

function step(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += now - (frame.prev || now);
  frame.prev = now;
  fpsFrames++;
  if (fpsAcc > 500) {
    fps = (fpsFrames * 1000) / fpsAcc;
    fpsAcc = 0;
    fpsFrames = 0;
  }
  update(dt);
  render();
  input.endFrame();
}
requestAnimationFrame(frame);

// gancho para testes automatizados (playwright)
window.__game = { world, player, capy, cam, lighting, debug, dbgFlags, get fps() { return fps; } };
