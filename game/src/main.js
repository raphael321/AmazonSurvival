import { Input } from './engine/input.js';
import { clamp } from './engine/math.js';
import { GROUND_K } from './engine/projection.js';
import { World } from './world/clearing.js';
import { Player } from './entities/player.js';
import { Capybara } from './entities/capybara.js';
import { paintPlayer } from './art/player-art.js';
import { paintCapybara } from './art/capybara-art.js';
import { Popups, drawHeart } from './art/fx.js';
import { drawHud } from './systems/hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const params = new URLSearchParams(location.search);

const world = new World(2026);
const player = new Player(1300, 1120);
const capy = new Capybara(1560, 1420);
const popups = new Popups();
const cam = { x: player.x, y: player.y * GROUND_K - 40 };

let sw = 0, sh = 0, dpr = 1, zoom = 1, rs = 0;
let showFps = params.has('debug');
let fps = 60, fpsAcc = 0, fpsFrames = 0;
let hint = '';

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  sw = window.innerWidth;
  sh = window.innerHeight;
  canvas.width = Math.round(sw * dpr);
  canvas.height = Math.round(sh * dpr);
  zoom = clamp(Math.sqrt(sw * sh) / 640, 0.9, 2.2);
  const nrs = Math.round(dpr * zoom * 4) / 4; // degraus de 0.25 evitam repintar à toa
  if (nrs !== rs) {
    rs = nrs;
    world.buildCaches(rs);
    world.warmChunks();
  }
}
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 150);
});
resize();

const viewToWorld = (mx, my) => {
  const vx = (mx - sw / 2) / zoom + cam.x;
  const vy = (my - sh / 2) / zoom + cam.y;
  return [vx, vy / GROUND_K];
};
const headPos = (e, h) => [e.x, e.y * GROUND_K - h];

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
    bush.hasFruit = false;
    bush.regrow = 25;
    bush.shake = 0.6;
    player.fruits++;
    popups.add(...headPos(player, 95), '+1 camu-camu', { color: '#f29a4b' });
  }
}

function update(dt) {
  const aim = viewToWorld(input.mouse.x, input.mouse.y);
  world.update(dt);
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
  const tx = player.x, ty = player.y * GROUND_K - 40;
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const hw = sw / 2 / zoom, hh = sh / 2 / zoom;
  const VW = world.W, VH = world.H * GROUND_K;
  cam.x = hw * 2 >= VW ? VW / 2 : clamp(cam.x, hw, VW - hw);
  cam.y = hh * 2 >= VH ? VH / 2 : clamp(cam.y, hh, VH - hh);
}

function render() {
  const ox = Math.round(canvas.width / 2 - cam.x * dpr * zoom);
  const oy = Math.round(canvas.height / 2 - cam.y * dpr * zoom);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, ox, oy);
  const view = {
    x0: cam.x - sw / 2 / zoom, x1: cam.x + sw / 2 / zoom,
    y0: cam.y - sh / 2 / zoom, y1: cam.y + sh / 2 / zoom,
  };
  world.drawGround(ctx, view);

  const list = world.drawables(view, player);
  list.push({ y: player.y, draw: (g) => paintPlayer(g, player.pose, player.trail) });
  list.push({ y: capy.y, draw: (g) => paintCapybara(g, capy.pose) });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw(ctx);

  // corações de confiança sobre a capivara quando o jogador está perto
  const dCapy = Math.hypot(capy.x - player.x, capy.y - player.y);
  if (!capy.tamed && dCapy < 240) {
    const [hx, hy] = headPos(capy, 58);
    for (let i = 0; i < 3; i++) drawHeart(ctx, hx - 16 + i * 16, hy, 0.75, i < capy.trust);
  }
  popups.draw(ctx);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHud(ctx, sw, sh, { player, capy, hint, fps, showFps });
}

let last = performance.now();
function frame(now) {
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// gancho para testes automatizados (playwright)
window.__game = { world, player, capy, cam, get fps() { return fps; } };
